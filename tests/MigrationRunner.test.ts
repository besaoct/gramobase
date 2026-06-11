import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationRunner } from '../src/migrations/MigrationRunner.js';
import { Migration } from '../src/types/index.js';

describe('MigrationRunner', () => {
  let mockPool: any;
  let runner: MigrationRunner;
  let chatState: any;
  let sentMessages: string[] = [];

  beforeEach(() => {
    sentMessages = [];
    chatState = {
      pinned_messages: [],
    };
    mockPool = {
      execute: vi.fn(async (fn: any) => {
        const fakeBot = {
          getChat: async () => chatState,
          sendMessage: async (chatId: string, text: string) => {
            sentMessages.push(text);
            const msg = { message_id: 123, text };
            // Simulate adding pinned migration message
            chatState.pinned_messages.push(msg);
            return msg;
          },
          editMessageText: async (text: string, options: any) => {
            sentMessages.push(text);
            const msg = chatState.pinned_messages.find((m: any) => m.message_id === options.message_id);
            if (msg) msg.text = text;
            return msg;
          },
        };
        return fn(fakeBot);
      }),
    };
    runner = new MigrationRunner(mockPool as any, 'migrations-channel', false);
  });

  it('should run up migrations and save history', async () => {
    const dbMock = {};
    const upMigration1 = vi.fn();
    const upMigration2 = vi.fn();

    const migrations: Migration[] = [
      { version: 1, name: 'm1', up: upMigration1, down: vi.fn() },
      { version: 2, name: 'm2', up: upMigration2, down: vi.fn() },
    ];

    await runner.run(migrations, dbMock);

    expect(upMigration1).toHaveBeenCalledWith(dbMock);
    expect(upMigration2).toHaveBeenCalledWith(dbMock);
    expect(sentMessages).toHaveLength(2); // two history checkpoints
    expect(sentMessages[1]).toContain('__GRAMOBASE_MIGRATIONS__');
    expect(sentMessages[1]).toContain('m2');
  });

  it('should skip already applied migrations', async () => {
    // Populate chat state with migration 1 already applied
    chatState.pinned_messages = [
      {
        message_id: 123,
        text: `__GRAMOBASE_MIGRATIONS__\n${JSON.stringify([
          { version: 1, name: 'm1', appliedAt: new Date().toISOString() },
        ])}`,
      },
    ];

    const dbMock = {};
    const upMigration1 = vi.fn();
    const upMigration2 = vi.fn();

    const migrations: Migration[] = [
      { version: 1, name: 'm1', up: upMigration1, down: vi.fn() },
      { version: 2, name: 'm2', up: upMigration2, down: vi.fn() },
    ];

    await runner.run(migrations, dbMock);

    expect(upMigration1).not.toHaveBeenCalled();
    expect(upMigration2).toHaveBeenCalledWith(dbMock);
  });

  it('should support rollback down executions', async () => {
    chatState.pinned_messages = [
      {
        message_id: 123,
        text: `__GRAMOBASE_MIGRATIONS__\n${JSON.stringify([
          { version: 1, name: 'm1', appliedAt: new Date().toISOString() },
          { version: 2, name: 'm2', appliedAt: new Date().toISOString() },
        ])}`,
      },
    ];

    const dbMock = {};
    const downMigration1 = vi.fn();
    const downMigration2 = vi.fn();

    const migrations: Migration[] = [
      { version: 1, name: 'm1', up: vi.fn(), down: downMigration1 },
      { version: 2, name: 'm2', up: vi.fn(), down: downMigration2 },
    ];

    await runner.rollback(migrations, dbMock, 1);

    expect(downMigration2).toHaveBeenCalledWith(dbMock);
    expect(downMigration1).not.toHaveBeenCalled(); // rolled back 1 step only
  });
});
