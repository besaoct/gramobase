import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WriteAheadLog } from '../src/wal/WriteAheadLog.js';

describe('WriteAheadLog', () => {
  let mockPool: any;
  let wal: WriteAheadLog;
  let sentMessages: string[] = [];

  beforeEach(() => {
    sentMessages = [];
    mockPool = {
      execute: vi.fn(async (fn: any) => {
        const fakeBot = {
          sendMessage: async (chatId: string, text: string) => {
            sentMessages.push(text);
            return { message_id: 123 };
          },
          getChatHistory: async () => [],
        };
        return fn(fakeBot);
      }),
      emit: vi.fn(),
    };
    wal = new WriteAheadLog(mockPool as any, 'wal-channel-1', false);
  });

  it('should append entries and flush when limits are reached', async () => {
    // We append 50 items to hit BUFFER_LIMIT = 50
    for (let i = 0; i < 50; i++) {
      await wal.append('INSERT', 'products', `id-${i}`, { name: `p-${i}` });
    }
    // Flush should have triggered automatically.
    // Due to the size of 50 entries, it chunks the payload into 2 messages.
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[0]).toContain('__WAL__');
    expect(sentMessages[0]).toContain('id-2');
  });

  it('should manually flush successfully', async () => {
    await wal.append('INSERT', 'products', 'id-1', { name: 'p-1' });
    expect(sentMessages).toHaveLength(0); // not auto-flushed yet (buffered)

    await wal.flush();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toContain('id-1');
  });

  it('should calculate valid sequence numbers', async () => {
    const entry1 = await wal.append('INSERT', 'products', 'id-1');
    const entry2 = await wal.append('UPDATE', 'products', 'id-1');

    expect(entry1.seq).toBe(1);
    expect(entry2.seq).toBe(2);
  });
});
