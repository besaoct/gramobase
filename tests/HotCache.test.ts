import { describe, it, expect, beforeEach } from 'vitest';
import { HotCache } from '../src/cache/HotCache.js';

describe('HotCache', () => {
  let cache: HotCache;

  beforeEach(() => {
    cache = new HotCache(1024 * 1024, 60_000);
  });

  it('should get and set cache entries', () => {
    const doc = { name: 'MacBook', price: 1999 };
    cache.set('products', '1', doc);

    const hit = cache.get<{ name: string; price: number }>('products', '1');
    expect(hit).toEqual(doc);
  });

  it('should return undefined on missing keys', () => {
    const hit = cache.get('products', 'nonexistent');
    expect(hit).toBeUndefined();
  });

  it('should delete keys successfully', () => {
    cache.set('products', '1', { name: 'laptop' });
    expect(cache.get('products', '1')).toBeDefined();

    cache.delete('products', '1');
    expect(cache.get('products', '1')).toBeUndefined();
  });

  it('should track hits and misses correctly', () => {
    cache.set('products', '1', { name: 'laptop' });
    cache.get('products', '1'); // hit
    cache.get('products', '2'); // miss
    cache.get('products', '1'); // hit

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('should store and invalidate query cache entries', () => {
    const results = [{ name: 'laptop' }, { name: 'phone' }];
    cache.setQuery('products:q1', results);

    const hit = cache.getQuery<{ name: string }>('products:q1');
    expect(hit).toEqual(results);

    cache.invalidateQuery('products');
    const hitAfterInvalidation = cache.getQuery('products:q1');
    expect(hitAfterInvalidation).toBeUndefined();
  });

  it('should manage collection indexes', () => {
    cache.updateIndexEntry('products', 'p1', 123);
    cache.updateIndexEntry('products', 'p2', 124);

    expect(cache.getMsgId('products', 'p1')).toBe(123);
    expect(cache.getMsgId('products', 'p2')).toBe(124);

    const index = cache.getIndex('products');
    expect(index).toBeDefined();
    expect(index?.get('p1')).toBe(123);

    cache.deleteIndexEntry('products', 'p1');
    expect(cache.getMsgId('products', 'p1')).toBeUndefined();
  });
});
