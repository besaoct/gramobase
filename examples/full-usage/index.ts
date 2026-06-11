/**
 * gramobase — Full usage example
 * Demonstrates: ORM, auth, file uploads, realtime, migrations
 */

import { createClient } from 'gramobase';
import { z } from 'zod';
import { readFileSync } from 'fs';
import type { Migration } from 'gramobase';

// ─── 1. Connect ────────────────────────────────────────────────────────────

const db = await createClient({
  // Pass an array of tokens for anti-flood rotation (30 req/s × N tokens)
  botToken: [
    process.env['GRAMOBASE_BOT_TOKEN_1']!,
    process.env['GRAMOBASE_BOT_TOKEN_2']!,  // optional extra tokens
  ],
  channelId: process.env['GRAMOBASE_CHANNEL_ID']!,
  encryptionKey: process.env['GRAMOBASE_ENCRYPTION_KEY'], // AES-256 at rest
  global: true,                                 // Auto-caches client globally to prevent lease collisions (e.g. in Next.js HMR)
  cacheMaxBytes: 128 * 1024 * 1024,             // 128MB hot cache
  cacheTtlMs: 120_000,
  debug: true,
}).connect();

console.log('Connected. Registry instance:', db.getRegistryInstanceId());

// ─── 2. Define schemas ─────────────────────────────────────────────────────

const ProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  stock: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
});

const OrderSchema = z.object({
  userId: z.string(),
  productIds: z.array(z.string()),
  total: z.number(),
  status: z.enum(['pending', 'paid', 'shipped', 'delivered']),
  createdAt: z.string(),
});

// ─── 3. Create collections ─────────────────────────────────────────────────

const products = db.collection('products', {
  schema: ProductSchema,
  indexes: ['name', 'price'],    // bloom filter for fast-miss
  encrypt: true,                  // encrypt this collection
});

const orders = db.collection('orders', {
  schema: OrderSchema,
  ttl: 60 * 60 * 24 * 365,       // auto-expire after 1 year
});

// ─── 4. CRUD ────────────────────────────────────────────────────────────────

// Insert
const laptop = await products.insertOne({
  name: 'MacBook Pro',
  price: 1999.99,
  stock: 50,
  tags: ['electronics', 'laptop'],
  createdAt: new Date().toISOString(),
});
console.log('Inserted:', laptop._id);

// Insert many
await products.insertMany([
  { name: 'iPhone 15', price: 999.99, stock: 200, tags: ['phone'] },
  { name: 'AirPods Pro', price: 249.99, stock: 100, tags: ['audio'] },
]);

// Find with full filter API
const expensiveElectronics = await products.find({
  filter: {
    price: { $gte: 500 },
    tags: { $in: ['electronics', 'laptop', 'phone'] },
  },
  sort: { price: -1 },
  limit: 10,
});
console.log('Expensive products:', expensiveElectronics.length);

// findOne
const airpods = await products.findOne({ name: { $regex: /^AirPods/i } });

// Update operators
await products.findByIdAndUpdate(laptop._id, {
  $set: { price: 1899.99 },
  $inc: { stock: -1 },
  $push: { tags: 'sale' },
});

// Count
const totalProducts = await products.count();
console.log('Total products:', totalProducts);

// Delete
await products.deleteOne({ stock: { $eq: 0 } });

// ─── 5. Auth ────────────────────────────────────────────────────────────────

const auth = db.createAuth({
  jwtSecret: process.env['GRAMOBASE_JWT_SECRET']! || 'secret', // loaded from env, not hardcoded
  jwtExpiresIn: '7d',
  bcryptRounds: 12,
  onSignIn: async (user) => {
    // Log user ID only — never log email or sensitive fields
    console.log('[Auth] User signed in:', user._id);
  },
});

// Register (password must be >= 8 chars)
const { user, session } = await auth.register(
  'hello@example.com',
  'secure_password_123',
  ['user', 'seller'],
  { plan: 'free' }
);
console.log('Registered:', user.email, '| Token (truncated):', session.token.slice(0, 20) + '...');

// Login
const loginResult = await auth.login('hello@example.com', 'secure_password_123');

// Verify token (middleware)
const verified = auth.verifyToken(loginResult.session.token);
auth.requireRole(verified, 'seller'); // throws if not authorized

// Express middleware usage:
// app.use('/api/products', auth.middleware(), auth.requireRoleMiddleware('seller'));

// ─── 6. File uploads ────────────────────────────────────────────────────────

const imageBuffer = readFileSync('./example-image.jpg');
const fileRecord = await db.uploadFile(imageBuffer, {
  fileName: 'product-photo.jpg',
  mimeType: 'image/jpeg',
  metadata: { productId: laptop._id, alt: 'MacBook Pro front view' },
});
console.log('Uploaded file:', fileRecord.fileId);
console.log('CDN URL:', fileRecord.url);

// ─── 7. Realtime subscriptions ───────────────────────────────────────────────

const unsubscribe = db.realtime.onInsert('orders', (order: any) => {
  console.log('[Realtime] New order:', order._id, 'total:', order.total);
});

db.realtime.onUpdate('products', (id, changes) => {
  console.log('[Realtime] Product updated:', id);
});

// SSE route for frontend (Express):
// app.get('/events', db.realtime.sseHandler('orders'));

// ─── 8. Migrations ─────────────────────────────────────────────────────────

const migrations: Migration[] = [
  {
    version: 1,
    name: 'add-currency-field',
    async up(db: any) {
      const col = db.collection('products', { schema: ProductSchema });
      const all = await col.find();
      for (const product of all) {
        await col.findByIdAndUpdate(product._id, {
          $set: { currency: 'USD' },
        });
      }
    },
    async down(db: any) {
      const col = db.collection('products', { schema: ProductSchema });
      await col.updateMany({}, { $unset: { currency: '' } });
    },
  },
];

await db.migrate(migrations);
await db.migrationStatus(migrations);

// ─── 9. Cache stats ────────────────────────────────────────────────────────

const cacheStats = db.getCacheStats();
console.log('Cache hit rate:', (cacheStats.hitRate * 100).toFixed(1) + '%');
console.log('Worker stats:', db.getWorkerStats());

// ─── 10. Cleanup ───────────────────────────────────────────────────────────

unsubscribe();
await db.disconnect();
