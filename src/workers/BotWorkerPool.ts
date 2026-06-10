import TelegramBot from 'node-telegram-bot-api';
import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import EventEmitter from 'eventemitter3';

export interface WorkerStats {
  tokenIndex: number;
  requestCount: number;
  errorCount: number;
  lastUsed: number;
  rateLimitHits: number;
}

/**
 * BotWorkerPool manages a round-robin pool of Telegram bot tokens.
 * Each token gets its own PQueue limited to 25 concurrent requests
 * (safe under Telegram's 30 req/s flood limit with headroom).
 * On 429 responses, the worker is cooled down and the next token takes over.
 */
export class BotWorkerPool extends EventEmitter {
  private bots: TelegramBot[] = [];
  private queues: PQueue[] = [];
  private stats: WorkerStats[] = [];
  private currentIndex = 0;
  private debug: boolean;

  constructor(tokens: string[], concurrency = 25, debug = false) {
    super();
    this.debug = debug;

    if (tokens.length === 0) throw new Error('[gramobase] At least one bot token required');

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      this.bots.push(new TelegramBot(token, { polling: false }));
      this.queues.push(new PQueue({ concurrency, intervalCap: 25, interval: 1000 }));
      this.stats.push({
        tokenIndex: i,
        requestCount: 0,
        errorCount: 0,
        lastUsed: 0,
        rateLimitHits: 0,
      });
    }
  }

  /**
   * Execute a Telegram API call through the pool with automatic retry
   * and token rotation on rate limits.
   */
  async execute<T>(
    fn: (bot: TelegramBot) => Promise<T>,
    priority = 5
  ): Promise<T> {
    const idx = this.pickWorker();
    const queue = this.queues[idx]!;
    const bot = this.bots[idx]!;
    const stat = this.stats[idx]!;

    return queue.add(
      () =>
        pRetry(
          async () => {
            stat.requestCount++;
            stat.lastUsed = Date.now();
            try {
              const result = await fn(bot);
              return result;
            } catch (err: unknown) {
              stat.errorCount++;
              if (this.isFloodError(err)) {
                stat.rateLimitHits++;
                this.emit('worker:rotate', idx);
                const retryAfter = this.extractRetryAfter(err) * 1000;
                if (this.debug) {
                  console.warn(`[gramobase] Worker ${idx} flood limited, retrying after ${retryAfter}ms`);
                }
                await this.sleep(retryAfter);
                throw err;
              }
              if (this.isRetryableError(err)) {
                throw err;
              }
              throw new AbortError(err instanceof Error ? err : new Error(String(err)));
            }
          },
          {
            retries: 5,
            factor: 2,
            minTimeout: 1000,
            maxTimeout: 30_000,
            onFailedAttempt: (error) => {
              if (this.debug) {
                console.warn(`[gramobase] Attempt ${error.attemptNumber} failed:`, error.message);
              }
            },
          }
        ),
      { priority }
    ) as Promise<T>;
  }

  /**
   * Round-robin with recency bias — prefer the worker that was least recently used.
   */
  private pickWorker(): number {
    if (this.bots.length === 1) return 0;

    let bestIdx = 0;
    let oldestTime = Infinity;

    for (let i = 0; i < this.stats.length; i++) {
      const stat = this.stats[i]!;
      if (stat.lastUsed < oldestTime) {
        oldestTime = stat.lastUsed;
        bestIdx = i;
      }
    }

    this.currentIndex = bestIdx;
    return bestIdx;
  }

  private isFloodError(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const e = err as { code?: string; response?: { statusCode?: number } };
      return e.code === 'ETELEGRAM' && e.response?.statusCode === 429;
    }
    return false;
  }

  private isRetryableError(err: unknown): boolean {
    if (!err) return false;
    if (err instanceof Error) {
      if (err.name === 'TypeError' || err.name === 'ReferenceError' || err.name === 'ValidationError') {
        return false;
      }
    }
    if (typeof err === 'object') {
      const e = err as { code?: string; response?: { statusCode?: number } };
      if (e.code === 'ETELEGRAM' && e.response?.statusCode === 429) {
        return true;
      }
      if (e.response?.statusCode && e.response.statusCode >= 500) {
        return true;
      }
      const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
      if (e.code && retryableCodes.includes(e.code)) {
        return true;
      }
    }
    return false;
  }

  private extractRetryAfter(err: unknown): number {
    if (err && typeof err === 'object') {
      const e = err as { response?: { body?: { parameters?: { retry_after?: number } } } };
      return e.response?.body?.parameters?.retry_after ?? 5;
    }
    return 5;
  }

  getBot(index = 0): TelegramBot {
    return this.bots[index] ?? this.bots[0]!;
  }

  getStats(): WorkerStats[] {
    return [...this.stats];
  }

  getQueueSizes(): number[] {
    return this.queues.map((q) => q.size);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async destroy(): Promise<void> {
    await Promise.all(this.queues.map((q) => q.onIdle()));
    for (const bot of this.bots) {
      await bot.stopPolling();
    }
  }
}
