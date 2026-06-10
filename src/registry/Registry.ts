import { randomUUID } from 'crypto';
import { Lease } from '../types/index.js';
import { BotWorkerPool } from '../workers/BotWorkerPool.js';

const REGISTRY_TAG = '__GRAMOBASE_REGISTRY__';
const LEASE_TTL_MS = 30_000;
const HEARTBEAT_MS = 10_000;

interface RegistryState {
  activeLease: Lease | null;
  instanceId: string;
  registryMsgId: number | null;
}

/**
 * Registry uses a pinned Telegram message as a distributed lock.
 *
 * When a gramobase instance starts up, it reads the registry message.
 * If no lease exists or the existing lease is expired, it writes a new
 * lease with its own instanceId and begins sending heartbeats.
 *
 * This prevents multiple writer processes from corrupting the index
 * (last-write-wins races on the pinned index message).
 *
 * Read-only operations are always permitted. Only index mutations
 * require holding the write lease.
 */
export class Registry {
  private state: RegistryState;
  private readonly instanceId: string;

  constructor(
    private pool: BotWorkerPool,
    private channelId: string,
    private debug: boolean = false
  ) {
    this.instanceId = randomUUID();
    this.state = {
      activeLease: null,
      instanceId: this.instanceId,
      registryMsgId: null,
    };
  }

  async acquireWriteLease(): Promise<Lease> {
    const existing = await this.readRegistryMessage();

    if (existing?.activeLease) {
      const lease = existing.activeLease;
      if (lease.instanceId !== this.instanceId && Date.now() < lease.expiresAt) {
        throw new Error(
          `[gramobase Registry] Another instance (${lease.instanceId}) holds the write lease until ${new Date(lease.expiresAt).toISOString()}. ` +
            `Use Registry.forceRelease() to break a stale lease.`
        );
      }
    }

    const lease: Lease = {
      instanceId: this.instanceId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + LEASE_TTL_MS,
      heartbeatInterval: null,
    };

    await this.writeRegistryMessage({ activeLease: lease });
    this.state.activeLease = lease;

    // Start heartbeat to renew lease while process is alive
    lease.heartbeatInterval = setInterval(
      () => this.heartbeat(),
      HEARTBEAT_MS
    );

    if (this.debug) console.log(`[Registry] Acquired write lease: ${this.instanceId}`);
    return lease;
  }

  async releaseWriteLease(): Promise<void> {
    if (!this.state.activeLease) return;

    if (this.state.activeLease.heartbeatInterval) {
      clearInterval(this.state.activeLease.heartbeatInterval);
    }

    await this.writeRegistryMessage({ activeLease: null });
    this.state.activeLease = null;

    if (this.debug) console.log(`[Registry] Released write lease: ${this.instanceId}`);
  }

  async forceRelease(): Promise<void> {
    await this.writeRegistryMessage({ activeLease: null });
    this.state.activeLease = null;
    if (this.debug) console.log('[Registry] Forced lease release');
  }

  async isWriteLeaseHeld(): Promise<boolean> {
    const state = await this.readRegistryMessage();
    if (!state?.activeLease) return false;
    const { activeLease } = state;
    return activeLease.instanceId === this.instanceId && Date.now() < activeLease.expiresAt;
  }

  private async heartbeat(): Promise<void> {
    if (!this.state.activeLease) return;
    this.state.activeLease.expiresAt = Date.now() + LEASE_TTL_MS;
    await this.writeRegistryMessage({ activeLease: this.state.activeLease });
    if (this.debug) console.log('[Registry] Heartbeat sent');
  }

  private async readRegistryMessage(): Promise<{ activeLease: Lease | null } | null> {
    try {
      const chat = await this.pool.execute((bot) =>
        bot.getChat(this.channelId)
      ) as any;

      if (chat.pinned_message?.text?.startsWith(REGISTRY_TAG)) {
        this.state.registryMsgId = chat.pinned_message.message_id;
        const json = chat.pinned_message.text.replace(REGISTRY_TAG + '\n', '');
        return JSON.parse(json);
      }
    } catch {
      // No registry message yet
    }
    return null;
  }

  private async writeRegistryMessage(
    data: { activeLease: Lease | null }
  ): Promise<void> {
    const text = `${REGISTRY_TAG}\n${JSON.stringify(data, null, 0)}`;

    if (this.state.registryMsgId) {
      // Try to update existing pinned message
      try {
        await this.pool.execute((bot) =>
          bot.editMessageText(text, {
            chat_id: this.channelId,
            message_id: this.state.registryMsgId!,
          })
        );
        return;
      } catch {
        // Message may have been deleted; fall through to create new
      }
    }

    const msg = await this.pool.execute((bot) =>
      bot.sendMessage(this.channelId, text, { disable_notification: true })
    ) as any;

    this.state.registryMsgId = msg.message_id;
    await this.pool.execute((bot) =>
      bot.pinChatMessage(this.channelId, msg.message_id, {
        disable_notification: true,
      })
    );
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getCurrentLease(): Lease | null {
    return this.state.activeLease;
  }
}
