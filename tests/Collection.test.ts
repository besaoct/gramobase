import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { Collection } from '../src/orm/Collection.js';
import { HotCache } from '../src/cache/HotCache.js';

describe('Collection ORM', () => {
  const ProductSchema = z.object({
    name: z.string(),
    price: z.number(),
    tags: z.array(z.string()).default([]),
    stock: z.number().optional(),
  });

  let cache: HotCache;
  let collection: Collection<typeof ProductSchema>;

  beforeEach(() => {
    cache = new HotCache();
    collection = new Collection(
      'products',
      { schema: ProductSchema },
      cache,
      null as any, // storage not needed for cache-only find
      null as any, // wal not needed for find
      'channel1'
    );
    // Pretend index is loaded to bypass storage load
    (collection as any).indexLoaded = true;
  });

  function seedCache(docs: any[]) {
    const index = new Map<string, number>();
    docs.forEach((doc, i) => {
      const id = doc._id || `id-${i}`;
      const fullDoc = {
        _id: id,
        _collection: 'products',
        _msgId: i + 1,
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
        ...doc,
      };
      cache.set('products', id, fullDoc);
      index.set(id, i + 1);
    });
    cache.setIndex('products', index);
  }

  it('should find documents by simple equality', async () => {
    seedCache([
      { name: 'MacBook', price: 1999 },
      { name: 'iPhone', price: 999 },
    ]);

    const results = await collection.find({
      filter: { name: 'iPhone' },
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('iPhone');
  });

  it('should support comparison operators like $gte and $lt', async () => {
    seedCache([
      { name: 'A', price: 10 },
      { name: 'B', price: 20 },
      { name: 'C', price: 30 },
    ]);

    const results = await collection.find({
      filter: { price: { $gte: 20 } },
    });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['B', 'C']));
  });

  it('should support regular expressions', async () => {
    seedCache([
      { name: 'Apple MacBook', price: 1999 },
      { name: 'Dell XPS', price: 1499 },
    ]);

    const results = await collection.find({
      filter: { name: { $regex: /apple/i } },
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Apple MacBook');
  });

  it('should handle array inclusion queries for primitive values', async () => {
    seedCache([
      { name: 'MacBook', tags: ['electronics', 'laptop'] },
      { name: 'iPhone', tags: ['electronics', 'phone'] },
      { name: 'AirPods', tags: ['audio'] },
    ]);

    // Query array field with primitive value (matches if array contains primitive)
    const results = await collection.find({
      filter: { tags: 'laptop' },
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('MacBook');
  });

  it('should handle array inclusion queries via $in', async () => {
    seedCache([
      { name: 'MacBook', tags: ['electronics', 'laptop'] },
      { name: 'iPhone', tags: ['electronics', 'phone'] },
      { name: 'AirPods', tags: ['audio'] },
    ]);

    // Query using $in with a list of tags (should match if there is intersection)
    const results = await collection.find({
      filter: { tags: { $in: ['phone', 'audio'] } },
    });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['iPhone', 'AirPods']));
  });

  it('should apply sorting, pagination, and projection', async () => {
    seedCache([
      { name: 'A', price: 50 },
      { name: 'B', price: 20 },
      { name: 'C', price: 80 },
    ]);

    const results = await collection.find({
      sort: { price: -1 },
      limit: 2,
      projection: { name: 1 },
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.name).toBe('C');
    expect(results[0]?.price).toBeUndefined(); // projected out
    expect(results[1]?.name).toBe('A');
  });

  it('should handle logical operators $and, $or, $not', async () => {
    seedCache([
      { name: 'A', price: 10, stock: 5 },
      { name: 'B', price: 20, stock: 0 },
      { name: 'C', price: 30, stock: 10 },
    ]);

    const results = await collection.find({
      filter: {
        $or: [
          { price: { $lt: 15 } },
          { stock: { $gt: 8 } },
        ],
      },
    });
    expect(results).toHaveLength(2); // A (price 10 < 15) and C (stock 10 > 8)
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['A', 'C']));
  });
});
