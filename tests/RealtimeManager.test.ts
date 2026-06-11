import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeManager } from '../src/realtime/RealtimeManager.js';

describe('RealtimeManager', () => {
  let mockPool: any;
  let manager: RealtimeManager;

  beforeEach(() => {
    mockPool = {
      getBot: vi.fn(),
      execute: vi.fn(),
    };
    manager = new RealtimeManager(mockPool as any, undefined, false);
  });

  it('should subscribe and trigger callback on inserts', () => {
    const callback = vi.fn();
    const unsub = manager.onInsert('products', callback);

    manager.dispatch({ type: 'insert', collection: 'products', doc: { id: '123' } });
    expect(callback).toHaveBeenCalledWith({ id: '123' });

    unsub();
    manager.dispatch({ type: 'insert', collection: 'products', doc: { id: '456' } });
    expect(callback).toHaveBeenCalledTimes(1); // not called again after unsub
  });

  it('should subscribe and trigger callback on updates', () => {
    const callback = vi.fn();
    const unsub = manager.onUpdate('products', callback);

    manager.dispatch({
      type: 'update',
      collection: 'products',
      id: 'p-1',
      changes: { price: 99 },
      doc: { _id: 'p-1', price: 99 },
    });
    expect(callback).toHaveBeenCalledWith('p-1', { price: 99 }, { _id: 'p-1', price: 99 });

    unsub();
  });

  it('should subscribe and trigger callback on deletes', () => {
    const callback = vi.fn();
    const unsub = manager.onDelete('products', callback);

    manager.dispatch({ type: 'delete', collection: 'products', id: 'p-1' });
    expect(callback).toHaveBeenCalledWith('p-1');

    unsub();
  });

  it('should stream Server-Sent Events (SSE) correctly', () => {
    const handler = manager.sseHandler('products');
    const req = { on: vi.fn() };
    const res = {
      setHeader: vi.fn(),
      write: vi.fn(),
      flushHeaders: vi.fn(),
    };

    handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store');

    // Dispatch a matching event
    manager.dispatch({ type: 'insert', collection: 'products', doc: { id: 'p-1' } });
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"insert"'));

    // Dispatch a non-matching event (should not be written to res)
    manager.dispatch({ type: 'insert', collection: 'orders', doc: { id: 'o-1' } });
    expect(res.write).toHaveBeenCalledTimes(1); // still only 1 write
  });
});
