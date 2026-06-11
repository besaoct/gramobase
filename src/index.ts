import { z } from 'zod';
import { GramoBaseConfig, CollectionConfig, AuthConfig, UploadOptions, FileRecord, Migration, SchemaLike } from './types/index.js';
import { BotWorkerPool } from './workers/BotWorkerPool.js';
import { HotCache } from './cache/HotCache.js';
import { TelegramStorage } from './storage/TelegramStorage.js';
import { WriteAheadLog } from './wal/WriteAheadLog.js';
import { Registry } from './registry/Registry.js';
import { Collection } from './orm/Collection.js';
import { GramoBaseAuth } from './auth/GramoBaseAuth.js';
import { RealtimeManager } from './realtime/RealtimeManager.js';
import { MigrationRunner } from './migrations/MigrationRunner.js';
import { randomUUID } from 'crypto';

export class GramoBase {
  private pool: BotWorkerPool;
  private cache: HotCache;
  private storage: TelegramStorage;
  private wal: WriteAheadLog;
  readonly registry: Registry;
  readonly realtime: RealtimeManager;
  private migrations: MigrationRunner;
  private collections: Map<string, Collection<any>> = new Map();
  private initialized = false;
  private config: GramoBaseConfig;

  constructor(config: GramoBaseConfig) {
    this.config = config;
    const tokens = Array.isArray(config.botToken)
      ? config.botToken
      : [config.botToken];

    this.pool = new BotWorkerPool(tokens, config.concurrency ?? 25, config.debug ?? false);
    this.cache = new HotCache(config.cacheMaxBytes, config.cacheTtlMs);
    this.registry = new Registry(
      this.pool,
      config.indexChannelId ?? config.channelId,
      config.debug ?? false
    );
    this.storage = new TelegramStorage(
      this.pool,
      config.channelId,
      this.registry,
      config.encryptionKey,
      config.debug ?? false
    );
    this.wal = new WriteAheadLog(
      this.pool,
      config.walChannelId ?? config.channelId,
      config.debug ?? false
    );
    this.realtime = new RealtimeManager(
      this.pool,
      config.webhookUrl,
      config.debug ?? false
    );
    this.migrations = new MigrationRunner(
      this.pool,
      config.channelId,
      config.debug ?? false
    );

    // Bubble worker events
    this.pool.on('worker:rotate', (idx) => {
      this.realtime.dispatch({ type: 'worker:rotate', tokenIndex: idx });
    });
    this.pool.on('wal:flush', (count) => {
      this.realtime.dispatch({ type: 'wal:flush', entries: count });
    });
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  async connect(): Promise<this> {
    if (this.initialized) return this;

    await this.wal.init();
    await this.registry.acquireWriteLease();
    await this.realtime.start();

    // WAL replay — recover any uncommitted writes
    const walEntries = await this.wal.replay();
    if (walEntries.length > 0 && this.config.debug) {
      console.log(`[gramobase] Replaying ${walEntries.length} WAL entries`);
    }

    this.initialized = true;
    if (this.config.debug) console.log('[gramobase] Connected ✓');
    return this;
  }

  async disconnect(): Promise<void> {
    await this.wal.flush();
    await this.registry.releaseWriteLease();
    await this.realtime.stop();
    await this.pool.destroy();
    this.initialized = false;
  }

  // ─── Collection factory ───────────────────────────────────────────────

  collection<T extends SchemaLike>(
    name: string,
    config: CollectionConfig<T>
  ): Collection<T> {
    if (this.collections.has(name)) {
      return this.collections.get(name) as Collection<T>;
    }
    const col = new Collection(
      name,
      config,
      this.cache,
      this.storage,
      this.wal,
      this.config.channelId
    );
    this.collections.set(name, col as Collection<any>);
    return col;
  }

  // ─── Auth factory ─────────────────────────────────────────────────────

  createAuth(config: AuthConfig): GramoBaseAuth {
    const UserSchema = z.object({
      email: z.string().email(),
      passwordHash: z.string(),
      roles: z.array(z.string()).default(['user']),
      metadata: z.record(z.unknown()).optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    });

    const users = this.collection('__gramobase_users__', { schema: UserSchema });
    return new GramoBaseAuth(users as any, config);
  }

  // ─── File storage ─────────────────────────────────────────────────────

  async uploadFile(
    data: Buffer,
    options: UploadOptions = {}
  ): Promise<FileRecord> {
    const { fileName = 'file', mimeType = 'application/octet-stream', metadata } = options;
    const channelId = this.config.channelId;

    const { fileId, msgId } = await this.storage.uploadFile(data, fileName, mimeType, channelId);
    const url = await this.storage.getFileUrl(fileId);

    const record: FileRecord = {
      _id: randomUUID(),
      fileId,
      fileName,
      mimeType,
      sizeBytes: data.length,
      uploadedAt: new Date().toISOString(),
      ...(url !== undefined ? { url } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };

    // Store file record in a dedicated files collection
    const files = this.collection('__gramobase_files__', {
      schema: z.object({
        _id: z.string(),
        fileId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
        url: z.string().optional(),
        uploadedAt: z.string(),
        metadata: z.record(z.unknown()).optional(),
      }),
    });

    await (files as any).insertOne(record);
    return record;
  }

  async getFileUrl(fileId: string): Promise<string> {
    return this.storage.getFileUrl(fileId);
  }

  // ─── Migrations ───────────────────────────────────────────────────────

  async migrate(migrations: Migration[]): Promise<void> {
    await this.migrations.run(migrations, this);
  }

  async rollback(migrations: Migration[], steps = 1): Promise<void> {
    await this.migrations.rollback(migrations, this, steps);
  }

  async migrationStatus(migrations: Migration[]): Promise<void> {
    await this.migrations.status(migrations);
  }

  // ─── State helpers ────────────────────────────────────────────────────

  getCacheStats() {
    return this.cache.getStats();
  }

  getWorkerStats() {
    return this.pool.getStats();
  }

  getRegistryInstanceId(): string {
    return this.registry.getInstanceId();
  }

  /**
   * Warm up the cache by pre-loading all collection indexes.
   */
  async warmCache(): Promise<void> {
    for (const col of this.collections.values()) {
      await (col as any).ensureIndexLoaded();
    }
  }
}

const globalForGramo = globalThis as unknown as { __gramobase_clients__?: Map<string, GramoBase> };

export function createClient(config: GramoBaseConfig): GramoBase {
  if (config.global) {
    if (!globalForGramo.__gramobase_clients__) {
      globalForGramo.__gramobase_clients__ = new Map();
    }
    const cacheKey = Array.isArray(config.botToken)
      ? `${config.channelId}:${config.botToken.join(',')}`
      : `${config.channelId}:${config.botToken}`;
    
    if (globalForGramo.__gramobase_clients__.has(cacheKey)) {
      return globalForGramo.__gramobase_clients__.get(cacheKey)!;
    }
    const client = new GramoBase(config);
    globalForGramo.__gramobase_clients__.set(cacheKey, client);
    return client;
  }
  return new GramoBase(config);
}

// Re-exports
export { GramoBaseAuth } from './auth/GramoBaseAuth.js';
export { Collection } from './orm/Collection.js';
export { RealtimeManager } from './realtime/RealtimeManager.js';
export type * from './types/index.js';
