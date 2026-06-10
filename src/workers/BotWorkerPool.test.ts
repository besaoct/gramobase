import { describe, it, expect, beforeEach } from 'vitest';
import { BotWorkerPool } from './BotWorkerPool.js';

describe('BotWorkerPool', () => {
  it('should initialize with bot tokens and create workers', () => {
    const pool = new BotWorkerPool(['123:abc', '456:def'], 10);
    const stats = pool.getStats();
    expect(stats).toHaveLength(2);
    expect(stats[0]?.tokenIndex).toBe(0);
    expect(stats[1]?.tokenIndex).toBe(1);
    pool.destroy();
  });

  it('should throw if no tokens are provided', () => {
    expect(() => new BotWorkerPool([])).toThrow();
  });

  it('should execute tasks in round-robin or based on LRU usage', async () => {
    const pool = new BotWorkerPool(['111:aaa', '222:bbb'], 5);

    // Call 1
    const res1 = await pool.execute(async (bot) => {
      return 'task1';
    });
    expect(res1).toBe('task1');

    // Call 2 (should pick worker 1 since worker 0 was used)
    const res2 = await pool.execute(async (bot) => {
      return 'task2';
    });
    expect(res2).toBe('task2');

    const stats = pool.getStats();
    expect(stats[0]?.requestCount).toBe(1);
    expect(stats[1]?.requestCount).toBe(1);

    pool.destroy();
  });

  it('should recover stats on execution error', async () => {
    const pool = new BotWorkerPool(['111:aaa'], 5);

    await expect(
      pool.execute(async () => {
        throw new Error('API Error');
      })
    ).rejects.toThrow('API Error');

    const stats = pool.getStats();
    expect(stats[0]?.errorCount).toBe(1);

    pool.destroy();
  });
});
