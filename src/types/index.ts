import { z } from 'zod';

// ─── Core document types ──────────────────────────────────────────────────

export interface GramoBaseDocument {
  _id: string;
  _collection: string;
  _msgId: number;
  _createdAt: string;
  _updatedAt: string;
  [key: string]: unknown;
}

export type WithId<T> = T & GramoBaseDocument;

// ─── Collection config ────────────────────────────────────────────────────

export interface CollectionConfig<T extends z.ZodType> {
  schema: T;
  /** Channel override — uses the default if omitted */
  channelId?: string | undefined;
  /** Bloom-filter field list for fast-miss short-circuit */
  indexes?: string[] | undefined;
  /** Encrypt all documents in this collection with AES-256 */
  encrypt?: boolean | undefined;
  /** TTL seconds — documents are automatically expired after this many seconds */
  ttl?: number | undefined;
}

// ─── Filter / query types ─────────────────────────────────────────────────

type ElemOf<T> = T extends (infer U)[] ? U : T;

export type ComparisonOperator<T> = {
  $eq?: T | ElemOf<T> | undefined;
  $ne?: T | ElemOf<T> | undefined;
  $gt?: T | ElemOf<T> | number | undefined;
  $gte?: T | ElemOf<T> | number | undefined;
  $lt?: T | ElemOf<T> | number | undefined;
  $lte?: T | ElemOf<T> | number | undefined;
  $in?: (T | ElemOf<T>)[] | undefined;
  $nin?: (T | ElemOf<T>)[] | undefined;
  $exists?: boolean | undefined;
  $regex?: RegExp | string | undefined;
};

export type Filter<T> =
  | {
      [K in keyof T]?: T[K] | ElemOf<T[K]> | ComparisonOperator<T[K]> | undefined;
    }
  | {
      $and?: Filter<T>[] | undefined;
      $or?: Filter<T>[] | undefined;
      $not?: Filter<T> | undefined;
    };

export interface FindOptions<T> {
  filter?: Filter<T> | undefined;
  sort?: Partial<Record<keyof T | string, 1 | -1>> | undefined;
  limit?: number | undefined;
  skip?: number | undefined;
  projection?: Partial<Record<keyof T | string, 1 | 0>> | undefined;
  useCache?: boolean | undefined;
}

// ─── Update operators ─────────────────────────────────────────────────────

export interface UpdateOperators<T> {
  $set?: (Partial<T> & Record<string, unknown>) | undefined;
  $unset?: Partial<Record<keyof T | string, '' | true>> | undefined;
  $inc?: Partial<Record<keyof T | string, number>> | undefined;
  $push?: Partial<Record<keyof T | string, unknown>> | undefined;
}

// ─── WAL types ────────────────────────────────────────────────────────────

export type WalOpType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface WalEntry {
  seq: number;
  op: WalOpType;
  collection: string;
  id: string;
  data?: unknown;
  timestamp: string;
  checksum: string;
}

// ─── Registry lease ───────────────────────────────────────────────────────

export interface Lease {
  instanceId: string;
  acquiredAt: number;
  expiresAt: number;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
}

// ─── Auth types ───────────────────────────────────────────────────────────

export interface User {
  _id: string;
  email: string;
  passwordHash: string;
  roles: string[];
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  userId: string;
  roles: string[];
  expiresAt: number;
  token: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn?: string | undefined;
  bcryptRounds?: number | undefined;
  onSignIn?: ((user: User) => Promise<void>) | undefined;
  onSignOut?: ((userId: string) => Promise<void>) | undefined;
}

// ─── File types ───────────────────────────────────────────────────────────

export interface UploadOptions {
  fileName?: string | undefined;
  mimeType?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface FileRecord {
  _id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string | undefined;
  uploadedAt: string;
  metadata?: Record<string, unknown> | undefined;
}

// ─── Realtime events ──────────────────────────────────────────────────────

export type GramoBaseEvent =
  | { type: 'insert'; collection: string; doc: unknown }
  | { type: 'update'; collection: string; id: string; changes: unknown; doc: unknown }
  | { type: 'delete'; collection: string; id: string }
  | { type: 'worker:rotate'; tokenIndex: number }
  | { type: 'wal:flush'; entries: number };

// ─── Migration type ───────────────────────────────────────────────────────

export interface Migration {
  version: number;
  name: string;
  up(db: unknown): Promise<void>;
  down(db: unknown): Promise<void>;
}

// ─── Top-level config ─────────────────────────────────────────────────────

export interface GramoBaseConfig {
  /** Bot token or array of tokens for pool rotation */
  botToken: string | string[];
  /** Primary storage channel ID */
  channelId: string;
  /** Optional separate channel for WAL entries */
  walChannelId?: string | undefined;
  /** Optional separate channel for collection indexes */
  indexChannelId?: string | undefined;
  /** AES-256 encryption key for data at rest */
  encryptionKey?: string | undefined;
  /** LRU cache byte limit (default: 64MB) */
  cacheMaxBytes?: number | undefined;
  /** LRU cache TTL in milliseconds (default: 60s) */
  cacheTtlMs?: number | undefined;
  /** Max concurrent requests per bot token (default: 25) */
  concurrency?: number | undefined;
  /** Webhook URL for realtime events (optional — falls back to polling) */
  webhookUrl?: string | undefined;
  /** Enable verbose debug logging */
  debug?: boolean | undefined;
  /** Auto-cache client globally on globalThis in dev mode to prevent lease collisions in serverless/hot-reloading environments */
  global?: boolean | undefined;
}
