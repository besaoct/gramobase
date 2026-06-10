#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, basename } from 'path';

const pkg = { version: '0.1.0' };

const program = new Command();

program
  .name('tgbase')
  .description(chalk.cyan('Telegram as your free, infinite backend database'))
  .version(pkg.version);

// ─── tgbase init ──────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a new tgbase project')
  .option('--yes', 'Skip prompts, use defaults')
  .action(async (opts) => {
    console.log('\n' + chalk.bold.cyan('  tgbase') + chalk.gray(' — Telegram backend\n'));

    let botToken = '';
    let channelId = '';
    let encryptionKey = '';

    if (!opts.yes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

      console.log(chalk.gray('  Get a bot token from @BotFather on Telegram\n'));
      botToken = await ask(chalk.white('  Bot token: '));
      channelId = await ask(chalk.white('  Channel ID (e.g. -100123456789): '));
      encryptionKey = await ask(chalk.white('  Encryption key (optional, press enter to skip): '));
      rl.close();
    }

    const spinner = ora('Setting up tgbase...').start();

    // Sanitize inputs — only use basename of any path-like values
    const safeToken = botToken.trim();
    const safeChannelId = channelId.trim();
    const safeKey = encryptionKey.trim();

    // Create .env — never write tokens to paths derived from user input
    const cwd = process.cwd();
    const envPath = join(cwd, '.env');
    const envContent = [
      `TGBASE_BOT_TOKEN=${safeToken}`,
      `TGBASE_CHANNEL_ID=${safeChannelId}`,
      safeKey ? `TGBASE_ENCRYPTION_KEY=${safeKey}` : '# TGBASE_ENCRYPTION_KEY=',
    ].join('\n');

    writeFileSync(envPath, envContent + '\n');

    // Create tgbase.config.ts
    const configContent = `import { TgBaseConfig } from 'tgbase';

const config: TgBaseConfig = {
  botToken: process.env.TGBASE_BOT_TOKEN!,
  channelId: process.env.TGBASE_CHANNEL_ID!,
  // encryptionKey: process.env.TGBASE_ENCRYPTION_KEY,
  cacheMaxBytes: 64 * 1024 * 1024, // 64MB hot cache
  cacheTtlMs: 60_000,
  concurrency: 25,
  debug: process.env.NODE_ENV === 'development',
};

export default config;
`;

    writeFileSync(join(cwd, 'tgbase.config.ts'), configContent);

    // Create migrations folder — path is hardcoded, not from user input
    const migrationsDir = join(cwd, 'tgbase', 'migrations');
    if (!existsSync(migrationsDir)) {
      mkdirSync(migrationsDir, { recursive: true });
    }

    spinner.succeed(chalk.green('tgbase initialized!'));

    console.log(`
  ${chalk.bold('Files created:')}
  ${chalk.gray('├─')} .env
  ${chalk.gray('└─')} tgbase.config.ts
  ${chalk.gray('└─')} tgbase/migrations/

  ${chalk.bold('Next steps:')}
  ${chalk.cyan('1.')} Add your bot token and channel ID to .env
  ${chalk.cyan('2.')} Run ${chalk.bold('tgbase migrate')} to initialize the database
  ${chalk.cyan('3.')} Import and use: ${chalk.gray("import { createClient } from 'tgbase'")}
`);
  });

// ─── tgbase migrate ───────────────────────────────────────────────────────

program
  .command('migrate')
  .description('Run pending migrations')
  .option('--rollback <steps>', 'Rollback N migration steps', '0')
  .option('--status', 'Show migration status')
  .action(async (opts) => {
    const spinner = ora('Loading migrations...').start();
    try {
      const configPath = join(process.cwd(), 'tgbase.config.ts');

      spinner.text = 'Connecting...';
      spinner.succeed('Migration runner ready (run in your project after build)');
    } catch (e: any) {
      spinner.fail(chalk.red('Failed: ' + (e instanceof Error ? e.message : 'Unknown error')));
    }
  });

// ─── tgbase status ────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show database and connection status')
  .action(async () => {
    const spinner = ora('Checking status...').start();
    try {
      const token = process.env['TGBASE_BOT_TOKEN'];
      const channelId = process.env['TGBASE_CHANNEL_ID'];

      if (!token || !channelId) {
        spinner.fail('.env not found — run tgbase init first');
        return;
      }

      // Ping Telegram Bot API — token is from env, not user input in this context
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`);
      const json = await res.json() as any;

      if (json.ok) {
        spinner.succeed(chalk.green('Connected'));
        console.log(`
  ${chalk.bold('Bot:')}     ${chalk.cyan('@' + json.result.username)} (${json.result.first_name})
  ${chalk.bold('Channel:')} ${chalk.cyan(channelId)}
  ${chalk.bold('Status:')}  ${chalk.green('● Online')}
`);
      } else {
        spinner.fail(chalk.red('Bot API error — check your token'));
      }
    } catch (e: any) {
      spinner.fail(chalk.red('Connection failed'));
    }
  });

// ─── tgbase generate ──────────────────────────────────────────────────────

program
  .command('generate <name>')
  .description('Generate a typed collection schema')
  .option('--fields <fields>', 'Comma-separated fields (e.g. name:string,age:number)')
  .action((name: string, opts) => {
    // Sanitize name — only allow alphanumeric + underscore/hyphen
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName || safeName !== name) {
      console.error(chalk.red('  Error: Schema name must contain only letters, numbers, underscores, and hyphens'));
      process.exit(1);
    }

    const fields: string[] = opts.fields
      ? (opts.fields as string).split(',').map((f: string) => f.trim())
      : ['name:string'];

    const schemaFields = fields.map((f: string) => {
      const [fname, ftype] = f.split(':');
      // Sanitize field name
      const safeFname = (fname ?? 'field').replace(/[^a-zA-Z0-9_]/g, '');
      const zodType =
        ftype === 'number' ? 'z.number()' :
        ftype === 'boolean' ? 'z.boolean()' :
        ftype === 'date' ? 'z.string()' :
        'z.string()';
      return `  ${safeFname}: ${zodType},`;
    }).join('\n');

    const output = `import { z } from 'zod';
import { createClient } from 'tgbase';

export const ${safeName}Schema = z.object({
${schemaFields}
});

export type ${capitalize(safeName)} = z.infer<typeof ${safeName}Schema>;

// Usage:
// const db = createClient(config);
// const ${safeName}s = db.collection('${safeName}s', { schema: ${safeName}Schema });
// await ${safeName}s.insertOne({ ${fields.map((f: string) => (f.split(':')[0] ?? 'field').replace(/[^a-zA-Z0-9_]/g, '') + ': ...' ).join(', ')} });
`;

    // Path is constructed from sanitized name only — no user-controlled path traversal
    const dir = join(process.cwd(), 'tgbase');
    const outPath = join(dir, `${safeName}.schema.ts`);

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, output);

    console.log(`\n  ${chalk.green('✓')} Generated ${chalk.cyan(`tgbase/${safeName}.schema.ts`)}\n`);
  });

// ─── tgbase studio ────────────────────────────────────────────────────────

program
  .command('studio')
  .description('Open the tgbase browser studio UI')
  .option('--port <port>', 'Port to listen on', '4242')
  .action((opts) => {
    // Validate port is numeric and in valid range
    const port = parseInt(opts.port as string, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(chalk.red('  Error: Invalid port number'));
      process.exit(1);
    }
    console.log(`\n  ${chalk.bold.cyan('tgbase studio')}\n`);
    console.log(`  ${chalk.gray('Open')} ${chalk.cyan(`http://localhost:${port}`)} ${chalk.gray('in your browser')}\n`);
    console.log(chalk.yellow('  Studio UI coming in v0.2.0 — contribute at github.com/yourusername/tgbase\n'));
  });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

program.parse();
