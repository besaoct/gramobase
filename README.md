# gramobase

[![npm version](https://img.shields.io/npm/v/gramobase?style=flat-square&logo=npm&label=gramobase&color=blue)](https://www.npmjs.com/package/gramobase)
[![CI/CD Status](https://github.com/besaoct/gramobase/actions/workflows/build.yml/badge.svg)](https://github.com/besaoct/gramobase/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](https://github.com/besaoct/gramobase/blob/main/LICENSE)
[![Tests Passed](https://img.shields.io/badge/Tests-40%2F40%20Passed-brightgreen.svg)](https://github.com/besaoct/gramobase/actions)
[![Coverage](https://codecov.io/gh/besaoct/gramobase/branch/main/graph/badge.svg)](https://codecov.io/gh/besaoct/gramobase)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/besaoct/gramobase/pulls)

**Telegram as a free, infinite, production-grade backend database.**

Every Telegram channel is a collection. Every message is a document. Zero infrastructure needed. All you need a free Telegram account.

---

## Quick Start

### 1. Installation

```bash
npm install gramobase
```

### 2. Setup

Initialize your project with the auto-detect wizard:

```bash
npx gramobase init
```

This interactive wizard walks you through setting up your backend. It features **Auto-Detect** technology and **Anti-Flood** scaling: it will ask you how many Bot Tokens you want to configure (for 30 req/s scaling per bot). Provide your tokens, and leave the Channel ID blank! By sending a message in your channel, `gramobase` will automatically fetch your hidden Telegram Channel ID for you and generate your `.env` and `gramobase.config.ts`.

**Prerequisites:**
1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram — takes 30 seconds
2. Create a private Telegram channel
3. Add your bot as an **Administrator** with full permissions to the channel

### 3. Usage

```ts
import { createClient } from 'gramobase';
import { z } from 'zod';

const db = await createClient({
  botToken: process.env.GRAMOBASE_BOT_TOKEN_1!,
  channelId: process.env.GRAMOBASE_CHANNEL_ID!,
}).connect();

const users = db.collection('users', {
  schema: z.object({ name: z.string(), email: z.string().email() }),
});

await users.insertOne({ name: 'Aarav', email: 'aarav@example.com' });
const user = await users.findOne({ name: { $eq: 'Aarav' } });
```

> [!IMPORTANT]
> **Next.js & Hot-Reloading Environments:**
> In development environments that support hot-reloading (like Next.js), the module cache is frequently cleared, which can instantiate multiple database clients and trigger write lease lock collisions. To prevent this, choose one of the following methods to cache your client:
> 
> **Option A: Built-in `global` config option (Recommended)**
> Pass `global: true` in your client config to automatically handle global caching inside the package:
> 
> ```ts
> import { createClient } from 'gramobase';
> 
> const client = createClient({
>   botToken: process.env.GRAMOBASE_BOT_TOKEN_1!,
>   channelId: process.env.GRAMOBASE_CHANNEL_ID!,
>   global: true, // Automatically caches the client instance globally
> });
> const db = await client.connect();
> ```
> 
> **Option B: Manual `globalThis` caching**
> Alternatively, you can manage caching manually on the global scope:
> 
> ```ts
> import { createClient } from 'gramobase';
> 
> const globalForDb = globalThis as unknown as { dbClient: any };
> 
> export async function getDb() {
>   if (!globalForDb.dbClient) {
>     const client = createClient({
>       botToken: process.env.GRAMOBASE_BOT_TOKEN_1!,
>       channelId: process.env.GRAMOBASE_CHANNEL_ID!,
>     });
>     globalForDb.dbClient = await client.connect();
>   }
>   return globalForDb.dbClient;
> }
> ```

---

## Why gramobase?

| Feature | gramobase | Firebase free | Supabase free |
|---|---|---|---|
| Storage | **Unlimited** | 1GB | 500MB |
| Reads/writes | 30/s per bot, scales with bot count | 50K/day | 500MB bandwidth |
| Auth | ✓ built-in | ✓ | ✓ |
| File storage | **2GB per file** | 1GB total | 1GB total |
| Realtime | ✓ SSE/webhook | ✓ | ✓ |
| Frontend UX | ✓ React Optimistic UI Hooks | ✓ | ✓ |
| Infra needed | **None** | Firebase project | Supabase project |
| Cost | **$0 forever** | Free tier | Free tier |

---

### Running Tests

To run the suite of 40 unit tests checking the ORM, caching, queue/worker pooling, and authentication:

```bash
npm run test
```

---

## Core API

### Collections (MongoDB-like ORM)

```ts
const PostSchema = z.object({
  title: z.string(),
  body: z.string(),
  views: z.number().default(0),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(false),
});

const posts = db.collection('posts', {
  schema: PostSchema,
  indexes: ['title'],   // bloom filter index
  encrypt: true,        // AES-256 field-level encryption
});

// Insert
const post = await posts.insertOne({ title: 'Hello', body: 'World' });
await posts.insertMany([...]);

// Find
const all = await posts.find();
const published = await posts.find({ filter: { published: { $eq: true } } });
const recent = await posts.find({
  filter: { views: { $gte: 100 } },
  sort: { views: -1 },
  limit: 10,
  skip: 0,
});

// Operators: $eq $ne $gt $gte $lt $lte $in $nin $regex $exists $and $or $not

// Update
await posts.findByIdAndUpdate(post._id, {
  $set: { published: true },
  $inc: { views: 1 },
  $push: { tags: 'featured' },
});
await posts.updateMany({ published: { $eq: false } }, { $set: { published: true } });

// Delete
await posts.deleteById(post._id);
await posts.deleteMany({ views: { $eq: 0 } });
await posts.count({ published: { $eq: true } });
```

### Authentication

```ts
const auth = db.createAuth({
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: '7d',
  bcryptRounds: 12,
});

const { user, session } = await auth.register('user@example.com', 'password', ['user']);
const { session: s2 } = await auth.login('user@example.com', 'password');

const verified = auth.verifyToken(s2.token);
auth.requireRole(verified, 'admin');         // throws if not admin
auth.requireAnyRole(verified, ['mod', 'admin']);

await auth.changePassword(user._id, 'old', 'new');
await auth.updateRoles(user._id, ['user', 'pro']);

// Express middleware
app.use('/api', auth.middleware());
app.post('/admin', auth.middleware(), auth.requireRoleMiddleware('admin'), handler);
```

### File Storage

```ts
// Upload any file — images, PDFs, videos up to 2GB (via MTProto)
const file = await db.uploadFile(buffer, {
  fileName: 'profile.jpg',
  mimeType: 'image/jpeg',
  metadata: { userId: '123' },
});

console.log(file.fileId); // stable Telegram file reference
console.log(file.url);    // CDN-served download URL
```

### Realtime

```ts
// Subscribe to collection events
const unsub = db.realtime.onInsert('orders', (order) => {
  console.log('New order:', order);
});

db.realtime.onUpdate('products', (id, changes, doc) => {
  console.log('Updated:', id, changes);
});

db.realtime.onDelete('posts', (id) => {
  console.log('Deleted:', id);
});

// Server-Sent Events for browser clients
app.get('/stream', db.realtime.sseHandler('orders'));

// Frontend:
const es = new EventSource('/stream');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

### React Hooks (Frontend Optimistic UI)

`gramobase` provides a built-in, zero-dependency React module to power your frontends with instantaneous, production-grade Optimistic UI and per-action loading states.

```tsx
import { useGramoQuery, useGramoMutation } from 'gramobase/react';

// Automatically manages data, loading, and error states!
const { data: todos, isLoading } = useGramoQuery('/api/todos');

// Automatically handles Optimistic UI rollbacks on failure!
const toggleTodo = useGramoMutation('/api/todos', 'PATCH', {
  onMutate: (variables) => {
    // Instantly update UI (Optimistic Update)
  },
  onError: () => {
    // Automatically rolls back if Telegram API fails
  }
});

return (
  <button onClick={() => toggleTodo.mutate({ id: 1 })} disabled={toggleTodo.isLoading}>
    {toggleTodo.isLoading ? 'Saving...' : 'Complete Task'}
  </button>
)
```

### Migrations

```ts
const migrations = [
  {
    version: 1,
    name: 'add-slug-field',
    async up(db) {
      const posts = db.collection('posts', { schema: PostSchema });
      const all = await posts.find();
      for (const post of all) {
        await posts.findByIdAndUpdate(post._id, {
          $set: { slug: post.title.toLowerCase().replace(/ /g, '-') },
        });
      }
    },
    async down(db) {
      await db.collection('posts', { schema: PostSchema })
        .updateMany({}, { $unset: { slug: '' } });
    },
  },
];

await db.migrate(migrations);
```

### Anti-flood bot pool

```ts
// Pass multiple bot tokens — gramobase round-robins and backs off per token
const db = await createClient({
  botToken: [
    process.env.GRAMOBASE_BOT_TOKEN_1!,
    process.env.GRAMOBASE_BOT_TOKEN_2!,
    process.env.GRAMOBASE_BOT_TOKEN_3!,
  ],
  channelId: process.env.GRAMOBASE_CHANNEL_ID!,
}).connect();

// 3 tokens × 30 req/s = effectively 90 writes/s sustained
```

---

## Architecture

```
Developer API (ORM, Auth, Files, Realtime)
         │
    Hot Cache (LRU, 64MB+, O(1) reads)
         │
    State Manager (reactive, optimistic writes)
         │
   Write-Ahead Log (crash recovery, sequence IDs)
         │
 Registry (distributed lease, heartbeat, single writer)
         │
  Bot Worker Pool (round-robin, 429 backoff, retry)
         │
  Telegram Bot API ─────────────────────────────────┐
         │                                          │
   Private Channel              File Storage      Realtime
   (messages = docs,        (sendDocument,       (webhook +
    pinned = registry)       file_id refs)       SSE bridge)
```

### Storage model

- Each collection maps to a private Telegram channel (or shares one via namespaced message tags)
- A **pinned registry message** acts as a distributed write lock across processes and stores the master index mapping of collection names to their respective index message IDs (`{ collectionName → indexMsgId }`)
- Individual **index messages** (unpinned) store `{ id → msgId }` for O(1) document lookups
- The **Write-Ahead Log** channel stores operation logs for crash recovery

### Limits

| Limit | Value |
|---|---|
| Telegram rate limit | 30 req/s per bot token (scales with pool size) |
| Message size | 4096 bytes per message (large docs auto-chunked) |
| File size (Bot API) | 50MB send, 20MB receive |
| File size (MTProto/TDLib) | 2GB |
| Channel message history | Unlimited |
| Cost | $0 |

---

## CLI

```bash
npx gramobase init                   # interactive setup wizard
npx gramobase status                 # check bot + channel connectivity
npx gramobase migrate                # run pending migrations
npx gramobase migrate --rollback 1   # rollback last migration
npx gramobase migrate --status       # show migration history
npx gramobase generate post --fields "title:string,views:number"
npx gramobase studio                 # open browser UI (see below)
npx gramobase studio --port 9000     # custom port
```

---

## gramobase Studio

`npx gramobase studio` spins up a local browser admin panel at **http://localhost:4242**. Zero extra dependencies — it reads your `.env` and starts a Node HTTP server backed by a real live `GramoBase` client.

**Features:**
- 🔍 **Collection Browser** — Paginated table view of every document in any collection
- 📋 **Sortable Columns** — Click any column header to sort ASC/DESC
- 🔎 **Filter Bar** — Filter with `field:value` syntax or free-text regex search
- 📄 **JSON Inspector** — Click any row to open a full syntax-highlighted document drawer
- 📡 **Realtime Feed** — Live SSE stream of all insert/update/delete/WAL events
- ⚡ **Stats Dashboard** — Cache hit rate, bytes used, worker pool status, token count
- 🤖 **Bot Info Panel** — Bot username, channel ID, token pool capacity

---

## Configuration

```ts
const db = createClient({
  botToken: string | string[],  // single token or pool
  channelId: string,            // main storage channel
  walChannelId?: string,        // separate WAL channel (optional)
  indexChannelId?: string,      // separate index channel (optional)
  encryptionKey?: string,       // AES-256 key for encryption at rest
  cacheMaxBytes?: number,       // default 64MB
  cacheTtlMs?: number,          // default 60s
  concurrency?: number,         // max concurrent requests per token, default 25
  webhookUrl?: string,          // enables webhook mode for realtime
  debug?: boolean,
  global?: boolean,             // auto-cache client globally (default: false)
});
```

---

## Disclaimer

gramobase is designed for prototypes, hobby projects, and small-to-medium applications. It is not a replacement for PostgreSQL or MongoDB in high-traffic production systems. Data lives on Telegram's infrastructure — do not store sensitive PII without encryption.

---

## License

MIT
