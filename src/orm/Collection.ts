import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import {
  Filter,
  FindOptions,
  UpdateOperators,
  TgBaseDocument,
  CollectionConfig,
  WithId,
} from '../types/index.js';
import { HotCache } from '../cache/HotCache.js';
import { TelegramStorage } from '../storage/TelegramStorage.js';
import { WriteAheadLog } from '../wal/WriteAheadLog.js';

type DocOf<T extends z.ZodType> = WithId<z.infer<T>>;

/**
 * Collection<T> is the main ORM interface.
 *
 * It provides a MongoDB-like API and handles:
 *   - Schema validation via Zod
 *   - Hot-cache reads (LRU in-memory)
 *   - WAL writes before Telegram flush
 *   - Index management (id → msgId map, stored as a pinned message)
 *   - Filter/sort/skip/limit in memory after cache warm-up
 */
export class Collection<T extends z.ZodType> {
  private name: string;
  private config: CollectionConfig<T>;
  private cache: HotCache;
  private storage: TelegramStorage;
  private wal: WriteAheadLog;
  private channelId: string;
  private indexLoaded = false;

  constructor(
    name: string,
    config: CollectionConfig<T>,
    cache: HotCache,
    storage: TelegramStorage,
    wal: WriteAheadLog,
    defaultChannelId: string
  ) {
    this.name = name;
    this.config = config;
    this.cache = cache;
    this.storage = storage;
    this.wal = wal;
    this.channelId = config.channelId ?? defaultChannelId;
  }

  // ─── Init ──────────────────────────────────────────────────────────────

  async ensureIndexLoaded(): Promise<void> {
    if (this.indexLoaded) return;
    const idx = await this.storage.loadIndex(this.name, this.channelId);
    this.cache.setIndex(this.name, new Map(Object.entries(idx.entries).map(([k, v]) => [k, v])));
    this.indexLoaded = true;
  }

  // ─── Insert ────────────────────────────────────────────────────────────

  async insertOne(data: z.infer<T>): Promise<DocOf<T>> {
    const validated = this.config.schema.parse(data) as z.infer<T>;
    const doc: TgBaseDocument = {
      ...validated,
      _id: randomUUID(),
      _collection: this.name,
      _msgId: 0,
      _createdAt: new Date().toISOString(),
      _updatedAt: new Date().toISOString(),
    };

    // WAL before write
    await this.wal.append('INSERT', this.name, doc._id, doc);

    const msgId = await this.storage.writeDocument(doc, this.channelId);
    doc._msgId = msgId;

    // Update cache + index
    this.cache.set(this.name, doc._id, doc);
    this.cache.updateIndexEntry(this.name, doc._id, msgId);
    this.cache.invalidateQuery(this.name);

    // Persist index
    await this.flushIndex();

    return doc as DocOf<T>;
  }

  async insertMany(items: z.infer<T>[]): Promise<DocOf<T>[]> {
    return Promise.all(items.map((item) => this.insertOne(item)));
  }

  // ─── Find ──────────────────────────────────────────────────────────────

  async findById(id: string): Promise<DocOf<T> | null> {
    // Cache hit
    const cached = this.cache.get<DocOf<T>>(this.name, id);
    if (cached) return cached;

    await this.ensureIndexLoaded();
    const msgId = this.cache.getMsgId(this.name, id);
    if (!msgId) return null;

    const doc = await this.storage.readDocument(msgId, this.channelId);
    if (!doc) return null;

    this.cache.set(this.name, id, doc);
    return doc as DocOf<T>;
  }

  async findOne(filter: Filter<z.infer<T>> = {}): Promise<DocOf<T> | null> {
    const results = await this.find({ filter, limit: 1 });
    return results[0] ?? null;
  }

  async find(options: FindOptions<z.infer<T>> = {}): Promise<DocOf<T>[]> {
    const { filter = {}, sort, limit, skip = 0, projection, useCache = true } = options;

    // Check query cache
    const queryHash = this.hashQuery(filter, sort, limit, skip);
    if (useCache) {
      const cached = this.cache.getQuery<DocOf<T>>(queryHash);
      if (cached) return cached;
    }

    // Load all documents from index
    await this.ensureIndexLoaded();
    const index = this.cache.getIndex(this.name);
    if (!index) return [];

    const docs: DocOf<T>[] = [];
    const ids = [...index.keys()];

    // Batch read with cache
    const uncachedIds: string[] = [];
    for (const id of ids) {
      const cached = this.cache.get<DocOf<T>>(this.name, id);
      if (cached) {
        docs.push(cached);
      } else {
        uncachedIds.push(id);
      }
    }

    // Fetch uncached from Telegram
    await Promise.all(
      uncachedIds.map(async (id) => {
        const doc = await this.findById(id);
        if (doc) docs.push(doc);
      })
    );

    // Apply filter
    let results = docs.filter((doc) => this.matchesFilter(doc, filter));

    // Apply sort
    if (sort) {
      results = this.applySort(results, sort as Record<string, 1 | -1>);
    }

    // Apply pagination
    results = results.slice(skip, limit ? skip + limit : undefined);

    // Apply projection
    if (projection) {
      results = results.map((doc) => this.applyProjection(doc, projection as Record<string, 1 | 0>));
    }

    // Cache query result
    if (useCache) {
      this.cache.setQuery(queryHash, results);
    }

    return results;
  }

  async count(filter: Filter<z.infer<T>> = {}): Promise<number> {
    const results = await this.find({ filter, useCache: true });
    return results.length;
  }

  // ─── Update ────────────────────────────────────────────────────────────

  async updateOne(
    filter: Filter<z.infer<T>>,
    update: UpdateOperators<z.infer<T>>
  ): Promise<DocOf<T> | null> {
    const doc = await this.findOne(filter);
    if (!doc) return null;
    return this.applyUpdate(doc, update);
  }

  async updateMany(
    filter: Filter<z.infer<T>>,
    update: UpdateOperators<z.infer<T>>
  ): Promise<DocOf<T>[]> {
    const docs = await this.find({ filter });
    return Promise.all(docs.map((doc) => this.applyUpdate(doc, update)));
  }

  async findByIdAndUpdate(
    id: string,
    update: UpdateOperators<z.infer<T>>
  ): Promise<DocOf<T> | null> {
    const doc = await this.findById(id);
    if (!doc) return null;
    return this.applyUpdate(doc, update);
  }

  private async applyUpdate(
    doc: TgBaseDocument,
    update: UpdateOperators<unknown>
  ): Promise<DocOf<T>> {
    const updated = { ...doc, _updatedAt: new Date().toISOString() };

    if (update.$set) Object.assign(updated, update.$set);
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        delete (updated as Record<string, unknown>)[key];
      }
    }
    if (update.$inc) {
      for (const [key, val] of Object.entries(update.$inc)) {
        (updated as Record<string, unknown>)[key] =
          (((updated as Record<string, unknown>)[key] as number) ?? 0) + (val as number);
      }
    }
    if (update.$push) {
      for (const [key, val] of Object.entries(update.$push)) {
        const arr = (updated as Record<string, unknown>)[key];
        (updated as Record<string, unknown>)[key] = Array.isArray(arr)
          ? [...arr, val]
          : [val];
      }
    }

    // Validate updated doc
    this.config.schema.parse(updated);

    await this.wal.append('UPDATE', this.name, updated._id, updated);

    const newMsgId = await this.storage.updateDocument(
      updated._msgId,
      updated as TgBaseDocument,
      this.channelId
    );
    updated._msgId = newMsgId;

    this.cache.set(this.name, updated._id, updated);
    this.cache.updateIndexEntry(this.name, updated._id, newMsgId);
    this.cache.invalidateQuery(this.name);

    await this.flushIndex();

    return updated as DocOf<T>;
  }

  // ─── Delete ────────────────────────────────────────────────────────────

  async deleteOne(filter: Filter<z.infer<T>>): Promise<boolean> {
    const doc = await this.findOne(filter);
    if (!doc) return false;
    return this.deleteById(doc._id);
  }

  async deleteMany(filter: Filter<z.infer<T>>): Promise<number> {
    const docs = await this.find({ filter });
    await Promise.all(docs.map((doc) => this.deleteById(doc._id)));
    return docs.length;
  }

  async deleteById(id: string): Promise<boolean> {
    const msgId = this.cache.getMsgId(this.name, id);
    if (!msgId) return false;

    await this.wal.append('DELETE', this.name, id);
    await this.storage.deleteDocument(msgId, this.channelId);

    this.cache.delete(this.name, id);
    this.cache.deleteIndexEntry(this.name, id);
    this.cache.invalidateQuery(this.name);

    await this.flushIndex();
    return true;
  }

  // ─── Index flush ──────────────────────────────────────────────────────

  private async flushIndex(): Promise<void> {
    const index = this.cache.getIndex(this.name);
    if (!index) return;

    await this.storage.saveIndex(
      {
        collection: this.name,
        entries: Object.fromEntries(index.entries()),
        walSeq: this.wal.getCurrentSeq(),
        updatedAt: new Date().toISOString(),
      },
      this.channelId
    );
  }

  // ─── Filter engine ─────────────────────────────────────────────────────

  private matchesFilter(doc: unknown, filter: Filter<unknown>): boolean {
    for (const [key, condition] of Object.entries(filter)) {
      if (key === '$and') {
        if (!(condition as Filter<unknown>[]).every((f) => this.matchesFilter(doc, f)))
          return false;
        continue;
      }
      if (key === '$or') {
        if (!(condition as Filter<unknown>[]).some((f) => this.matchesFilter(doc, f)))
          return false;
        continue;
      }
      if (key === '$not') {
        if (this.matchesFilter(doc, condition as Filter<unknown>)) return false;
        continue;
      }

      const val = (doc as Record<string, unknown>)[key];
      if (condition === null || typeof condition !== 'object' || condition instanceof RegExp) {
        if (Array.isArray(val)) {
          if (condition instanceof RegExp) {
            if (!val.some((item) => condition.test(String(item)))) return false;
          } else {
            if (!val.includes(condition)) return false;
          }
        } else {
          if (condition instanceof RegExp) {
            if (!condition.test(String(val))) return false;
          } else {
            if (val !== condition) return false;
          }
        }
        continue;
      }

      const ops = condition as Record<string, unknown>;
      if ('$eq' in ops) {
        const eqVal = ops['$eq'];
        if (Array.isArray(val)) {
          if (Array.isArray(eqVal)) {
            if (val.length !== eqVal.length || !val.every((v, i) => v === eqVal[i])) return false;
          } else {
            if (!val.includes(eqVal)) return false;
          }
        } else {
          if (val !== eqVal) return false;
        }
      }
      if ('$ne' in ops) {
        const neVal = ops['$ne'];
        if (Array.isArray(val)) {
          if (Array.isArray(neVal)) {
            if (val.length === neVal.length && val.every((v, i) => v === neVal[i])) return false;
          } else {
            if (val.includes(neVal)) return false;
          }
        } else {
          if (val === neVal) return false;
        }
      }
      if ('$gt' in ops && !((val as number) > (ops['$gt'] as number))) return false;
      if ('$gte' in ops && !((val as number) >= (ops['$gte'] as number))) return false;
      if ('$lt' in ops && !((val as number) < (ops['$lt'] as number))) return false;
      if ('$lte' in ops && !((val as number) <= (ops['$lte'] as number))) return false;
      if ('$in' in ops) {
        const inList = ops['$in'] as unknown[];
        if (Array.isArray(val)) {
          const hasIntersection = val.some((v) => inList.includes(v));
          const hasExactArray = inList.some(
            (item) => Array.isArray(item) && item.length === val.length && item.every((v, i) => v === val[i])
          );
          if (!hasIntersection && !hasExactArray) return false;
        } else {
          if (!inList.includes(val)) return false;
        }
      }
      if ('$nin' in ops) {
        const ninList = ops['$nin'] as unknown[];
        if (Array.isArray(val)) {
          const hasIntersection = val.some((v) => ninList.includes(v));
          const hasExactArray = ninList.some(
            (item) => Array.isArray(item) && item.length === val.length && item.every((v, i) => v === val[i])
          );
          if (hasIntersection || hasExactArray) return false;
        } else {
          if (ninList.includes(val)) return false;
        }
      }
      if ('$exists' in ops) {
        const exists = val !== undefined && val !== null;
        if (exists !== ops['$exists']) return false;
      }
      if ('$regex' in ops) {
        const re =
          ops['$regex'] instanceof RegExp
            ? ops['$regex']
            : new RegExp(ops['$regex'] as string);
        if (Array.isArray(val)) {
          if (!val.some((item) => re.test(String(item)))) return false;
        } else {
          if (!re.test(String(val))) return false;
        }
      }
    }
    return true;
  }

  private applySort<D>(docs: D[], sort: Record<string, 1 | -1>): D[] {
    return [...docs].sort((a, b) => {
      for (const [key, dir] of Object.entries(sort)) {
        const av = (a as Record<string, unknown>)[key];
        const bv = (b as Record<string, unknown>)[key];
        if (av === bv) continue;
        if (av == null) return dir;
        if (bv == null) return -dir;
        return av < bv ? -dir : dir;
      }
      return 0;
    });
  }

  private applyProjection<D>(doc: D, projection: Record<string, 1 | 0>): D {
    const result: Record<string, unknown> = {};
    const isInclusive = Object.values(projection).some((v) => v === 1);
    for (const [key, val] of Object.entries(doc as Record<string, unknown>)) {
      if (isInclusive) {
        if (projection[key] === 1 || key.startsWith('_')) result[key] = val;
      } else {
        if (projection[key] !== 0) result[key] = val;
      }
    }
    return result as D;
  }

  private hashQuery(...args: unknown[]): string {
    return `${this.name}:` + createHash('md5').update(JSON.stringify(args)).digest('hex');
  }

  getName(): string {
    return this.name;
  }
}
