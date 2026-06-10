import { createClient } from 'gramobase';
import { z } from 'zod';

let dbClient: any = null;

export const TodoSchema = z.object({
  text: z.string(),
  completed: z.boolean().default(false),
  createdAt: z.number().default(() => Date.now()),
});

export async function getDb() {
  if (!dbClient) {
    if (!process.env.GRAMOBASE_BOT_TOKEN_1 || !process.env.GRAMOBASE_CHANNEL_ID) {
      throw new Error('Missing GRAMOBASE_BOT_TOKEN_1 or GRAMOBASE_CHANNEL_ID in environment variables');
    }
    
    const client = createClient({
      botToken: process.env.GRAMOBASE_BOT_TOKEN_1,
      channelId: process.env.GRAMOBASE_CHANNEL_ID,
    });
    dbClient = await client.connect();
  }
  return dbClient;
}

export async function getTodosCollection() {
  const db = await getDb();
  return db.collection('todos', {
    schema: TodoSchema,
    indexes: ['createdAt'],
  });
}
