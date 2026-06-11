import { createClient } from 'gramobase';
import { z } from 'zod';

const globalForDb = globalThis as unknown as { dbClient: any };

export const TodoSchema = z.object({
  text: z.string(),
  completed: z.boolean().default(false),
  createdAt: z.number().default(() => Date.now()),
});

export async function getDb() {
  if (!globalForDb.dbClient) {
    if (!process.env.GRAMOBASE_BOT_TOKEN_1 || !process.env.GRAMOBASE_CHANNEL_ID) {
      throw new Error('Missing GRAMOBASE_BOT_TOKEN_1 or GRAMOBASE_CHANNEL_ID in environment variables');
    }

    const client = createClient({
      botToken: process.env.GRAMOBASE_BOT_TOKEN_1,
      channelId: process.env.GRAMOBASE_CHANNEL_ID,
    });

    try {
      globalForDb.dbClient = await client.connect();
    } catch (err) {
      globalForDb.dbClient = null; // reset so next request retries
      throw err;
    }
  }
  return globalForDb.dbClient;
}

export async function getTodosCollection() {
  const db = await getDb();
  return db.collection('todos', {
    schema: TodoSchema,
    indexes: ['createdAt'],
  });
}
