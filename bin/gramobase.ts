#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';

let pkg = { version: '0.0.0' };
try {
  const pkgUrl = new URL('../../package.json', import.meta.url);
  pkg = JSON.parse(readFileSync(pkgUrl, 'utf-8'));
} catch (e) {
  try {
    const pkgUrl2 = new URL('../package.json', import.meta.url);
    pkg = JSON.parse(readFileSync(pkgUrl2, 'utf-8'));
  } catch (e2) {}
}

const program = new Command();

program
  .name('gramobase')
  .description(chalk.cyan('Telegram as your free, infinite backend database'))
  .version(pkg.version);

// ─── gramobase init ──────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a new gramobase project')
  .option('--yes', 'Skip prompts, use defaults')
  .action(async (opts) => {
    console.log('\n' + chalk.bold.cyan('  gramobase') + chalk.gray(' — Telegram backend\n'));

    let botTokens: string[] = [];
    let channelId = '';
    let encryptionKey = '';

    if (!opts.yes) {
      console.log(chalk.cyan.bold('\n  Step 1: Bot Tokens (Anti-flood rotation)'));
      console.log(chalk.gray('  You can use multiple bot tokens to increase your rate limit (30 req/s per bot).'));
      
      const { numBotsStr } = await inquirer.prompt([{
        type: 'input',
        name: 'numBotsStr',
        message: chalk.white('How many bot tokens do you want to add? (Default: 1):')
      }]);
      const numBots = Math.max(1, parseInt(numBotsStr, 10) || 1);

      console.log(chalk.gray('  Create your bots by messaging @BotFather on Telegram and copy the HTTP API tokens.'));
      for (let i = 1; i <= numBots; i++) {
        const { token } = await inquirer.prompt([{
          type: 'password',
          name: 'token',
          message: chalk.white(`Bot token ${i}:`),
          mask: chalk.red('*')
        }]);
        botTokens.push(token.trim());
      }

      console.log(chalk.cyan.bold('\n  Step 2: Channel ID'));
      console.log(chalk.gray('  You can enter your Channel ID manually (e.g. -100123456789)'));
      console.log(chalk.gray('  OR leave it blank to auto-detect it.'));
      
      const { channelIdInput } = await inquirer.prompt([{
        type: 'input',
        name: 'channelIdInput',
        message: chalk.white('Channel ID (Press Enter to auto-detect):')
      }]);
      
      channelId = channelIdInput.trim();

      if (!channelId) {
        console.log(chalk.yellow('\n  [Auto-Detect Mode]'));
        console.log(chalk.gray(`  1. Create a private Telegram channel.`));
        console.log(chalk.gray(`  2. Add your bot as an Administrator with full permissions.`));
        console.log(chalk.gray(`  3. Send any message in the channel (e.g. "hello").\n`));
        
        const spinner = ora('Waiting for a message in your channel...').start();
        
        let detected = false;
        let offset = 0;
        // Use the first token to poll
        const pollToken = botTokens[0] || '';
        
        while (!detected) {
          try {
            const res = await fetch(`https://api.telegram.org/bot${pollToken}/getUpdates?offset=${offset}&timeout=2`);
            const json: any = await res.json();
            
            if (json.ok && json.result.length > 0) {
              for (const update of json.result) {
                offset = update.update_id + 1;
                if (update.channel_post && update.channel_post.chat) {
                  channelId = update.channel_post.chat.id.toString();
                  const title = update.channel_post.chat.title || 'Unknown Channel';
                  spinner.succeed(chalk.green(`Found channel: ${title} (${channelId})`));
                  detected = true;
                  break;
                }
              }
            } else if (!json.ok) {
              spinner.fail(chalk.red('Invalid Bot Token or Telegram API error.'));
              process.exit(1);
            }
          } catch (e) {
            // Ignore fetch errors and continue polling
          }
          
          if (!detected) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      console.log(chalk.cyan.bold('\n  Step 3: Security (Optional)'));
      const { encryptionKeyInput } = await inquirer.prompt([{
        type: 'input',
        name: 'encryptionKeyInput',
        message: chalk.white('Encryption key (optional, press enter to skip):')
      }]);
      encryptionKey = encryptionKeyInput;
    }

    const spinner = ora('Setting up gramobase...').start();

    // Create .env — never write tokens to paths derived from user input
    const cwd = process.cwd();
    const envPath = join(cwd, '.env');
    const envContentLines = [];
    
    if (botTokens.length === 1) {
      envContentLines.push(`GRAMOBASE_BOT_TOKEN=${botTokens[0]}`);
    } else {
      botTokens.forEach((token, i) => {
        envContentLines.push(`GRAMOBASE_BOT_TOKEN_${i + 1}=${token}`);
      });
    }
    
    const safeChannelId = channelId.trim();
    const safeKey = encryptionKey.trim();
    
    envContentLines.push(`GRAMOBASE_CHANNEL_ID=${safeChannelId}`);
    envContentLines.push(safeKey ? `GRAMOBASE_ENCRYPTION_KEY=${safeKey}` : '# GRAMOBASE_ENCRYPTION_KEY=');
    
    const envContent = envContentLines.join('\n');
    writeFileSync(envPath, envContent + '\n');

    const botTokenConfigStr = botTokens.length === 1
      ? `process.env.GRAMOBASE_BOT_TOKEN!`
      : `[\n${botTokens.map((_, i) => `    process.env.GRAMOBASE_BOT_TOKEN_${i + 1}!,`).join('\n')}\n  ]`;

    // Create gramobase.config.ts
    const configContent = `import { GramoBaseConfig } from 'gramobase';

const config: GramoBaseConfig = {
  botToken: ${botTokenConfigStr},
  channelId: process.env.GRAMOBASE_CHANNEL_ID!,
  // encryptionKey: process.env.GRAMOBASE_ENCRYPTION_KEY,
  cacheMaxBytes: 64 * 1024 * 1024, // 64MB hot cache
  cacheTtlMs: 60_000,
  concurrency: 25,
  debug: process.env.NODE_ENV === 'development',
};

export default config;
`;

    writeFileSync(join(cwd, 'gramobase.config.ts'), configContent);

    // Create migrations folder — path is hardcoded, not from user input
    const migrationsDir = join(cwd, 'gramobase', 'migrations');
    if (!existsSync(migrationsDir)) {
      mkdirSync(migrationsDir, { recursive: true });
    }

    spinner.succeed(chalk.green('gramobase initialized!'));

    console.log(`
  ${chalk.bold('Files created:')}
  ${chalk.gray('├─')} .env
  ${chalk.gray('└─')} gramobase.config.ts
  ${chalk.gray('└─')} gramobase/migrations/

  ${chalk.bold('Next steps:')}
  ${chalk.cyan('1.')} Run ${chalk.bold('npx gramobase migrate')} to initialize the database
  ${chalk.cyan('2.')} Import and use: ${chalk.gray("import { createClient } from 'gramobase'")}
`);
  });

// ─── gramobase migrate ───────────────────────────────────────────────────────

program
  .command('migrate')
  .description('Run pending migrations')
  .option('--rollback <steps>', 'Rollback N migration steps', '0')
  .option('--status', 'Show migration status')
  .action(async (opts) => {
    const spinner = ora('Loading migrations...').start();
    try {
      const configPath = join(process.cwd(), 'gramobase.config.ts');

      spinner.text = 'Connecting...';
      spinner.succeed('Migration runner ready (run in your project after build)');
    } catch (e: any) {
      spinner.fail(chalk.red('Failed: ' + (e instanceof Error ? e.message : 'Unknown error')));
    }
  });

// ─── gramobase status ────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show database and connection status')
  .action(async () => {
    const spinner = ora('Checking status...').start();
    try {
      const token = process.env['GRAMOBASE_BOT_TOKEN'];
      const channelId = process.env['GRAMOBASE_CHANNEL_ID'];

      if (!token || !channelId) {
        spinner.fail('.env not found — run gramobase init first');
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

// ─── gramobase generate ──────────────────────────────────────────────────────

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
import { createClient } from 'gramobase';

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
    const dir = join(process.cwd(), 'gramobase');
    const outPath = join(dir, `${safeName}.schema.ts`);

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, output);

    console.log(`\n  ${chalk.green('✓')} Generated ${chalk.cyan(`gramobase/${safeName}.schema.ts`)}\n`);
  });

// ─── gramobase studio ────────────────────────────────────────────────────────

program
  .command('studio')
  .description('Open the gramobase browser studio UI')
  .option('--port <port>', 'Port to listen on', '4242')
  .action(async (opts) => {
    // Validate port is numeric and in valid range
    const port = parseInt(opts.port as string, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(chalk.red('  Error: Invalid port number'));
      process.exit(1);
    }

    const spinner = ora('Starting gramobase studio...').start();

    try {
      const { startStudio } = await import(new URL('../../dist/studio/server.js', import.meta.url).href);
      await startStudio(port, process.cwd());
      spinner.succeed(chalk.green('gramobase studio is running!'));
      console.log(`
  ${chalk.bold('Studio')}  ${chalk.cyan(`http://localhost:${port}`)}
  ${chalk.gray('Press Ctrl+C to stop.')}
`);
    } catch (e: any) {
      spinner.fail(chalk.red('Failed to start studio: ' + (e?.message || String(e))));
      process.exit(1);
    }
  });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

program.parse();
