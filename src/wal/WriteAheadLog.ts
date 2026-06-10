import { createHash } from 'crypto';
import { WalEntry, WalOpType } from '../types/index.js';
import { BotWorkerPool } from '../workers/BotWorkerPool.js';

const WAL_HEADER = '__WAL__';
const WAL_SEQ_TAG = '__WAL_SEQ__';

/**
 * Write-Ahead Log backed by a Telegram channel.
 *
 * Every mutation is written to the WAL channel as a message BEFORE it is
 * applied to the main index. On startup, the WAL is replayed to recover
 * any operations that didn't complete during a crash.
 *
 * Format of each WAL message:
 *   { "__wal": true, seq: N, op: "INSERT"|..., collection, id, data, ts, checksum }
 */
export class WriteAheadLog {
  private seq = 0;
  private buffer: WalEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 2000;
  private readonly BUFFER_LIMIT = 50;

  constructor(
    private pool: BotWorkerPool,
    private walChannelId: string,
    private debug: boolean = false
  ) {}

  async init(): Promise<void> {
    // Find the last WAL sequence number to resume from
    try {
      const msgs = await this.pool.execute((bot) =>
        (bot as any).getChatHistory(this.walChannelId, { limit: 10 })
      );
      for (const msg of (msgs as any[]).reverse()) {
        if (msg.text?.includes(WAL_SEQ_TAG)) {
          const match = msg.text.match(/__WAL_SEQ__:(\d+)/);
          if (match) {
            this.seq = parseInt(match[1]!, 10);
            break;
          }
        }
      }
    } catch {
      // Channel may be empty on first run
    }
    if (this.debug) console.log(`[WAL] Initialized at seq=${this.seq}`);
  }

  /**
   * Append an entry to the WAL buffer. Flushes immediately if buffer is full.
   */
  async append(
    op: WalOpType,
    collection: string,
    id: string,
    data?: unknown
  ): Promise<WalEntry> {
    this.seq++;
    const entry: WalEntry = {
      seq: this.seq,
      op,
      collection,
      id,
      data,
      timestamp: new Date().toISOString(),
      checksum: '',
    };
    entry.checksum = this.checksum(entry);
    this.buffer.push(entry);

    if (this.buffer.length >= this.BUFFER_LIMIT) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }

    return entry;
  }

  /**
   * Flush buffered WAL entries to Telegram.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = [...this.buffer];
    this.buffer = [];

    const payload = JSON.stringify({
      __wal: true,
      [WAL_SEQ_TAG]: batch[batch.length - 1]!.seq,
      entries: batch,
    });

    // Split if > 4096 bytes (Telegram message limit)
    const chunks = this.chunk(payload, 4000);
    for (const chunk of chunks) {
      await this.pool.execute((bot) =>
        bot.sendMessage(this.walChannelId, `${WAL_HEADER}\n${chunk}`, {
          disable_notification: true,
        })
      );
    }

    if (this.debug) console.log(`[WAL] Flushed ${batch.length} entries`);
    this.pool.emit('wal:flush', batch.length);
  }

  /**
   * Replay all WAL entries since a given sequence number.
   * Returns entries in order — the caller applies them to restore state.
   */
  async replay(sinceSeq = 0): Promise<WalEntry[]> {
    const entries: WalEntry[] = [];

    // Fetch messages from WAL channel, parse WAL entries
    try {
      const msgs = await this.pool.execute((bot) =>
        (bot as any).getChatHistory(this.walChannelId, { limit: 100 })
      );

      for (const msg of msgs as any[]) {
        if (!msg.text?.startsWith(WAL_HEADER)) continue;
        const jsonStr = msg.text.replace(WAL_HEADER + '\n', '');
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.__wal && Array.isArray(parsed.entries)) {
            for (const e of parsed.entries as WalEntry[]) {
              if (e.seq > sinceSeq && this.verifyChecksum(e)) {
                entries.push(e);
              }
            }
          }
        } catch {
          // Corrupted WAL entry — skip
        }
      }
    } catch {
      // Empty or inaccessible WAL
    }

    return entries.sort((a, b) => a.seq - b.seq);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
  }

  private checksum(entry: Omit<WalEntry, 'checksum'>): string {
    const str = `${entry.seq}:${entry.op}:${entry.collection}:${entry.id}:${JSON.stringify(entry.data)}`;
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  private verifyChecksum(entry: WalEntry): boolean {
    const { checksum, ...rest } = entry;
    return checksum === this.checksum(rest);
  }

  private chunk(str: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }

  getCurrentSeq(): number {
    return this.seq;
  }
}
