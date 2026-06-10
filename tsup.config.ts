import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'auth/index': 'src/auth/GramoBaseAuth.ts',
    'migrations/index': 'src/migrations/MigrationRunner.ts',
    'bin/gramobase': 'bin/gramobase.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'node18',
  external: [
    'node-telegram-bot-api',
    'zod',
    'jsonwebtoken',
    'bcryptjs',
    'lru-cache',
    'eventemitter3',
    'p-queue',
    'p-retry',
    'commander',
    'chalk',
    'ora',
    'inquirer',
    'dotenv',
  ],
  banner: {
    js: '// gramobase — Telegram as your free, infinite backend',
  },
});
