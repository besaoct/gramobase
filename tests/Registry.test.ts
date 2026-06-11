import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Registry } from '../src/registry/Registry.js';

describe('Registry Distributed Leases', () => {
  let mockPool: any;
  let registry: Registry;
  let chatState: any;

  beforeEach(() => {
    vi.useFakeTimers();
    chatState = {
      pinned_message: null,
    };
    mockPool = {
      execute: vi.fn(async (fn: any) => {
        const fakeBot = {
          getChat: async () => chatState,
          sendMessage: async (channelId: string, text: string) => {
            const msg = { message_id: 999, text };
            chatState.pinned_message = msg;
            return msg;
          },
          pinChatMessage: async () => {},
          editMessageText: async (text: string) => {
            if (chatState.pinned_message) {
              chatState.pinned_message.text = text;
            }
          },
        };
        return fn(fakeBot);
      }),
    };
    registry = new Registry(mockPool as any, 'registry-channel', false);
  });

  afterEach(async () => {
    await registry.releaseWriteLease();
    vi.useRealTimers();
  });

  it('should acquire lease when no existing lease is held', async () => {
    const lease = await registry.acquireWriteLease();
    expect(lease.instanceId).toBe(registry.getInstanceId());
    expect(await registry.isWriteLeaseHeld()).toBe(true);
  });

  it('should renew lease via heartbeat interval', async () => {
    const lease = await registry.acquireWriteLease();
    const expiresFirst = lease.expiresAt;

    // Advance time by HEARTBEAT_MS = 10,000 ms
    await vi.advanceTimersByTimeAsync(10_000);

    const renewedLease = registry.getCurrentLease();
    expect(renewedLease?.expiresAt).toBeGreaterThan(expiresFirst);
  });

  it('should block lease acquisition if held by another active instance', async () => {
    // Simulate another instance holding the lease
    const anotherInstanceId = 'other-uuid';
    chatState.pinned_message = {
      message_id: 999,
      text: `__GRAMOBASE_REGISTRY__\n${JSON.stringify({
        activeLease: {
          instanceId: anotherInstanceId,
          acquiredAt: Date.now(),
          expiresAt: Date.now() + 20_000,
        },
      })}`,
    };

    await expect(registry.acquireWriteLease({ wait: false })).rejects.toThrow('Another instance');
  });

  it('should allow force releasing a lease', async () => {
    await registry.acquireWriteLease();
    expect(await registry.isWriteLeaseHeld()).toBe(true);

    await registry.forceRelease();
    expect(await registry.isWriteLeaseHeld()).toBe(false);
  });
});
