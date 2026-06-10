import { Migration } from '../types/index.js';
import { BotWorkerPool } from '../workers/BotWorkerPool.js';

const MIGRATION_TAG = '__TGBASE_MIGRATIONS__';

interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: string;
}

/**
 * MigrationRunner stores a migration history message in the Telegram channel
 * and applies pending up() migrations in order.
 */
export class MigrationRunner {
  private historyMsgId: number | null = null;

  constructor(
    private pool: BotWorkerPool,
    private channelId: string,
    private debug = false
  ) {}

  async run(migrations: Migration[], db: unknown): Promise<void> {
    const applied = await this.loadHistory();
    const appliedVersions = new Set(applied.map((m) => m.version));

    const pending = migrations
      .filter((m) => !appliedVersions.has(m.version))
      .sort((a, b) => a.version - b.version);

    if (pending.length === 0) {
      if (this.debug) console.log('[Migrations] Nothing to run');
      return;
    }

    for (const migration of pending) {
      console.log(`[Migrations] Running: v${migration.version} — ${migration.name}`);
      await migration.up(db);
      applied.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date().toISOString(),
      });
      await this.saveHistory(applied);
      console.log(`[Migrations] ✓ v${migration.version}`);
    }
  }

  async rollback(migrations: Migration[], db: unknown, steps = 1): Promise<void> {
    const applied = await this.loadHistory();
    const toRollback = applied
      .sort((a, b) => b.version - a.version)
      .slice(0, steps);

    for (const record of toRollback) {
      const migration = migrations.find((m) => m.version === record.version);
      if (!migration) throw new Error(`Migration v${record.version} not found`);

      console.log(`[Migrations] Rolling back: v${record.version} — ${record.name}`);
      await migration.down(db);
      applied.splice(applied.indexOf(record), 1);
      await this.saveHistory(applied);
      console.log(`[Migrations] ✓ Rolled back v${record.version}`);
    }
  }

  async status(migrations: Migration[]): Promise<void> {
    const applied = await this.loadHistory();
    const appliedVersions = new Set(applied.map((m) => m.version));

    console.log('\n  tgbase migration status\n');
    for (const m of migrations.sort((a, b) => a.version - b.version)) {
      const status = appliedVersions.has(m.version) ? '✓' : '○';
      const appliedAt = applied.find((a) => a.version === m.version)?.appliedAt ?? '';
      console.log(`  ${status} v${m.version}  ${m.name.padEnd(40)} ${appliedAt}`);
    }
    console.log();
  }

  private async loadHistory(): Promise<MigrationRecord[]> {
    try {
      const chat = await this.pool.execute((bot) => bot.getChat(this.channelId)) as any;
      for (const msg of (chat.pinned_messages ?? [])) {
        if (msg.text?.startsWith(MIGRATION_TAG)) {
          this.historyMsgId = msg.message_id;
          return JSON.parse(msg.text.replace(MIGRATION_TAG + '\n', ''));
        }
      }
    } catch {
      // No history yet
    }
    return [];
  }

  private async saveHistory(records: MigrationRecord[]): Promise<void> {
    const text = `${MIGRATION_TAG}\n${JSON.stringify(records)}`;

    if (this.historyMsgId) {
      try {
        await this.pool.execute((bot) =>
          bot.editMessageText(text, {
            chat_id: this.channelId,
            message_id: this.historyMsgId!,
          })
        );
        return;
      } catch {}
    }

    const msg = await this.pool.execute((bot) =>
      bot.sendMessage(this.channelId, text, { disable_notification: true })
    ) as any;
    this.historyMsgId = msg.message_id;
  }
}
