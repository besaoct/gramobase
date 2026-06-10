import { LRUCache } from 'lru-cache';
import EventEmitter from 'eventemitter3';

interface CacheEntry<T> {
  data: T;
  collection: string;
  cachedAt: number;
}

/**
 * HotCache is an in-memory LRU cache that sits in front of Telegram storage.
 *
 * All reads hit the cache first. On a miss, the caller fetches from Telegram
 * and stores the result here. All writes invalidate or update the relevant key.
 *
 * The cache also stores the "collection index" — the full key→msgId map for
 * each collection — so that single-document lookups are O(1) without scanning
 * all messages.
 */
export class HotCache extends EventEmitter {
  private cache: LRUCache<string, CacheEntry<unknown>>;
  private collectionIndexes: Map<string, Map<string, number>> = new Map();
  private stats = { hits: 0, misses: 0, evictions: 0 };

  constructor(maxBytes = 64 * 1024 * 1024, ttlMs = 60_000) {
    super();
    this.cache = new LRUCache({
      maxSize: maxBytes,
      sizeCalculation: (val) =>
        JSON.stringify(val).length * 2, // rough UTF-16 byte estimate
      ttl: ttlMs,
      dispose: () => {
        this.stats.evictions++;
      },
    });
  }

  // ─── Document cache ──────────────────────────────────────────────────────

  get<T>(collection: string, id: string): T | undefined {
    const key = this.docKey(collection, id);
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (entry) {
      this.stats.hits++;
      this.emit('cache:hit', { collection, key: id });
      return entry.data;
    }
    this.stats.misses++;
    this.emit('cache:miss', { collection, key: id });
    return undefined;
  }

  set<T>(collection: string, id: string, data: T): void {
    const key = this.docKey(collection, id);
    this.cache.set(key, { data, collection, cachedAt: Date.now() });
  }

  delete(collection: string, id: string): void {
    this.cache.delete(this.docKey(collection, id));
  }

  invalidateCollection(collection: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`doc:${collection}:`)) {
        this.cache.delete(key);
      }
    }
    this.collectionIndexes.delete(collection);
  }

  // ─── Query cache ─────────────────────────────────────────────────────────

  getQuery<T>(queryHash: string): T[] | undefined {
    const entry = this.cache.get(`query:${queryHash}`) as CacheEntry<T[]> | undefined;
    return entry?.data;
  }

  setQuery<T>(queryHash: string, results: T[]): void {
    this.cache.set(`query:${queryHash}`, {
      data: results,
      collection: '__query__',
      cachedAt: Date.now(),
    });
  }

  invalidateQuery(collection: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`query:${collection}:`)) {
        this.cache.delete(key);
      }
    }
  }

  // ─── Collection index ─────────────────────────────────────────────────────
  // Maps document _id → Telegram message ID for O(1) lookup

  getIndex(collection: string): Map<string, number> | undefined {
    return this.collectionIndexes.get(collection);
  }

  setIndex(collection: string, index: Map<string, number>): void {
    this.collectionIndexes.set(collection, index);
  }

  updateIndexEntry(collection: string, id: string, msgId: number): void {
    const idx = this.collectionIndexes.get(collection);
    if (idx) {
      idx.set(id, msgId);
    } else {
      this.collectionIndexes.set(collection, new Map([[id, msgId]]));
    }
  }

  deleteIndexEntry(collection: string, id: string): void {
    this.collectionIndexes.get(collection)?.delete(id);
  }

  getMsgId(collection: string, id: string): number | undefined {
    return this.collectionIndexes.get(collection)?.get(id);
  }

  // ─── Bulk read ────────────────────────────────────────────────────────────

  getMany<T>(collection: string, ids: string[]): Map<string, T> {
    const result = new Map<string, T>();
    for (const id of ids) {
      const val = this.get<T>(collection, id);
      if (val !== undefined) result.set(id, val);
    }
    return result;
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0,
    };
  }

  clear(): void {
    this.cache.clear();
    this.collectionIndexes.clear();
  }

  private docKey(collection: string, id: string): string {
    return `doc:${collection}:${id}`;
  }
}
