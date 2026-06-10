import EventEmitter from 'eventemitter3';
import { GramoBaseEvent } from '../types/index.js';
import { BotWorkerPool } from '../workers/BotWorkerPool.js';

type Unsubscribe = () => void;

/**
 * RealtimeManager bridges Telegram bot webhook / long-polling events
 * into a local EventEmitter that client code can subscribe to.
 *
 * Server-Sent Events (SSE) adapter included for HTTP streaming to browsers.
 */
export class RealtimeManager extends EventEmitter {
  private pollingActive = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastUpdateId = 0;

  constructor(
    private pool: BotWorkerPool,
    private webhookUrl?: string,
    private debug = false
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.webhookUrl) {
      await this.setupWebhook();
    } else {
      this.startPolling();
    }
  }

  async stop(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.pollingActive = false;
  }

  // ─── Subscribe helpers ────────────────────────────────────────────────

  onInsert<T>(collection: string, cb: (doc: T) => void): Unsubscribe {
    const handler = (ev: GramoBaseEvent) => {
      if (ev.type === 'insert' && ev.collection === collection) {
        cb(ev.doc as T);
      }
    };
    this.on('event', handler);
    return () => this.off('event', handler);
  }

  onUpdate<T>(collection: string, cb: (id: string, changes: Partial<T>, doc: T) => void): Unsubscribe {
    const handler = (ev: GramoBaseEvent) => {
      if (ev.type === 'update' && ev.collection === collection) {
        cb(ev.id, ev.changes as Partial<T>, ev.doc as T);
      }
    };
    this.on('event', handler);
    return () => this.off('event', handler);
  }

  onDelete(collection: string, cb: (id: string) => void): Unsubscribe {
    const handler = (ev: GramoBaseEvent) => {
      if (ev.type === 'delete' && ev.collection === collection) {
        cb(ev.id);
      }
    };
    this.on('event', handler);
    return () => this.off('event', handler);
  }

  onAny(cb: (ev: GramoBaseEvent) => void): Unsubscribe {
    const handler = (ev: GramoBaseEvent) => cb(ev);
    this.on('event', handler);
    return () => this.off('event', handler);
  }

  // ─── SSE adapter ──────────────────────────────────────────────────────
  // Usage: app.get('/events', db.realtime.sseHandler())

  sseHandler(collection?: string) {
    return (req: any, res: any) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.flushHeaders?.();

      const send = (ev: GramoBaseEvent) => {
        if (!collection || ('collection' in ev && ev.collection === collection)) {
          // JSON.stringify ensures proper output encoding — no raw user data in stream
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        }
      };

      this.on('event', send);
      const keepalive = setInterval(() => res.write(': ping\n\n'), 25_000);

      req.on('close', () => {
        this.off('event', send);
        clearInterval(keepalive);
      });
    };
  }

  // ─── Internal event dispatch ──────────────────────────────────────────

  dispatch(event: GramoBaseEvent): void {
    this.emit('event', event);
    if (this.debug) {
      // Only log event type — do NOT log event payload to avoid leaking sensitive data
      console.log('[Realtime]', event.type, 'collection' in event ? event.collection : '');
    }
  }

  // ─── Webhook setup ────────────────────────────────────────────────────

  private async setupWebhook(): Promise<void> {
    const bot = this.pool.getBot();
    await bot.setWebHook(this.webhookUrl!);
    if (this.debug) console.log('[Realtime] Webhook set');
  }

  // ─── Long polling fallback ────────────────────────────────────────────

  private startPolling(): void {
    this.pollingActive = true;
    const POLL_INTERVAL = 2000;

    this.pollingInterval = setInterval(async () => {
      try {
        const updates = await this.pool.execute((bot) =>
          bot.getUpdates({ offset: this.lastUpdateId + 1, limit: 100, timeout: 0 })
        ) as any[];

        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          this.processUpdate(update);
        }
      } catch {
        // Polling error — continue
      }
    }, POLL_INTERVAL);
  }

  private processUpdate(update: any): void {
    // Parse channel_post messages that are gramobase records
    const msg = update.channel_post ?? update.message;
    if (!msg?.text?.includes('"__gramobase"')) return;

    try {
      const payload = JSON.parse(msg.text);
      if (payload.__event) {
        this.dispatch(payload.__event as GramoBaseEvent);
      }
    } catch {
      // Not a gramobase event message
    }
  }
}
