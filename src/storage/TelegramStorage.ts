import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { BotWorkerPool } from '../workers/BotWorkerPool.js';
import { GramoBaseDocument } from '../types/index.js';
import { Registry } from '../registry/Registry.js';

const INDEX_TAG = '__GRAMOBASE_INDEX__';
const DOC_TAG = '__GRAMOBASE_DOC__';
const MAX_MSG_BYTES = 4000;

export interface IndexMessage {
  collection: string;
  // id → msgId map
  entries: Record<string, number>;
  walSeq: number;
  updatedAt: string;
  msgId?: number;
}

/**
 * TelegramStorage handles the raw read/write operations against Telegram channels.
 *
 * Each collection gets a "collection index message" (pinned or findable by tag)
 * that maps document IDs to their Telegram message IDs.
 *
 * Documents are stored as JSON message text, optionally AES-256 encrypted.
 * Files are stored via sendDocument/sendPhoto and referenced by Telegram file_id.
 */
export class TelegramStorage {
  private encryptionKey: Buffer | null = null;
  // collection → pinned index message ID
  private indexMsgIds: Map<string, number> = new Map();

  constructor(
    private pool: BotWorkerPool,
    private defaultChannelId: string,
    private registry: Registry,
    encryptionKey?: string,
    private debug = false
  ) {
    if (encryptionKey) {
      this.encryptionKey = createHash('sha256').update(encryptionKey).digest();
    }
  }

  // ─── Index management ─────────────────────────────────────────────────────

  private async readRawMessageText(msgId: number, channel: string): Promise<string | null> {
    try {
      const msg = await this.pool.execute((bot) =>
        bot.forwardMessage(channel, channel, msgId)
      ) as any;

      if (!msg?.text) return null;

      let text = msg.text as string;
      if (this.encryptionKey && text.startsWith('ENC:')) {
        text = this.decrypt(text);
      }
      return text;
    } catch {
      return null;
    }
  }

  async loadIndex(collection: string, channelId?: string): Promise<IndexMessage> {
    const channel = channelId ?? this.defaultChannelId;

    try {
      const msgId = await this.registry.getCollectionIndexMsgId(collection);
      if (msgId) {
        const text = await this.readRawMessageText(msgId, channel);
        if (text && text.startsWith(INDEX_TAG)) {
          const json = text.replace(INDEX_TAG + '\n', '');
          const parsed = JSON.parse(json) as IndexMessage;
          this.indexMsgIds.set(collection, msgId);
          return parsed;
        }
      }
    } catch {
      // Fallback
    }

    try {
      const chat = await this.pool.execute((bot) => bot.getChat(channel)) as any;

      // Check pinned message first
      if (chat.pinned_message?.text?.startsWith(INDEX_TAG)) {
        const json = chat.pinned_message.text.replace(INDEX_TAG + '\n', '');
        const parsed = JSON.parse(json) as IndexMessage;
        if (parsed.collection === collection) {
          this.indexMsgIds.set(collection, chat.pinned_message.message_id);
          await this.registry.setCollectionIndexMsgId(collection, chat.pinned_message.message_id);
          return parsed;
        }
      }
    } catch {
      // No pinned message or channel is empty
    }

    // Return an empty index
    return {
      collection,
      entries: {},
      walSeq: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  async saveIndex(index: IndexMessage, channelId?: string): Promise<void> {
    const channel = channelId ?? this.defaultChannelId;
    const text = `${INDEX_TAG}\n${JSON.stringify(index)}`;

    const existingMsgId = this.indexMsgIds.get(index.collection) ||
                          await this.registry.getCollectionIndexMsgId(index.collection);

    if (existingMsgId) {
      try {
        await this.pool.execute((bot) =>
          bot.editMessageText(text, {
            chat_id: channel,
            message_id: existingMsgId,
          })
        );
        return;
      } catch {
        // Message deleted or uneditable; create fresh
      }
    }

    const msg = await this.pool.execute((bot) =>
      bot.sendMessage(channel, text, { disable_notification: true })
    ) as any;

    const newMsgId = msg.message_id;
    this.indexMsgIds.set(index.collection, newMsgId);
    await this.registry.setCollectionIndexMsgId(index.collection, newMsgId);
  }

  // ─── Document CRUD ────────────────────────────────────────────────────────

  async writeDocument(
    doc: GramoBaseDocument,
    channelId?: string
  ): Promise<number> {
    const channel = channelId ?? this.defaultChannelId;
    let text = JSON.stringify({ [DOC_TAG]: true, ...doc });

    if (this.encryptionKey) {
      text = this.encrypt(text);
    }

    // Split large documents across multiple messages
    if (Buffer.byteLength(text, 'utf8') > MAX_MSG_BYTES) {
      return this.writeChunked(text, channel);
    }

    const msg = await this.pool.execute((bot) =>
      bot.sendMessage(channel, text, { disable_notification: true })
    ) as any;

    return msg.message_id as number;
  }

  async readDocument(
    msgId: number,
    channelId?: string
  ): Promise<GramoBaseDocument | null> {
    const channel = channelId ?? this.defaultChannelId;

    try {
      const msg = await this.pool.execute((bot) =>
        bot.forwardMessage(channel, channel, msgId)
      ) as any;

      if (!msg?.text) return null;

      let text = msg.text as string;
      if (this.encryptionKey && text.startsWith('ENC:')) {
        text = this.decrypt(text);
      }

      // Reassemble chunked messages if needed
      if (text.startsWith('CHUNK:')) {
        text = await this.readChunked(text, channel);
      }

      const parsed = JSON.parse(text);
      delete parsed[DOC_TAG];
      parsed._msgId = msgId;
      return parsed as GramoBaseDocument;
    } catch {
      return null;
    }
  }

  async deleteDocument(msgId: number, channelId?: string): Promise<void> {
    const channel = channelId ?? this.defaultChannelId;
    await this.pool.execute((bot) =>
      (bot as any).deleteMessage(channel, msgId)
    );
  }

  async updateDocument(
    msgId: number,
    doc: GramoBaseDocument,
    channelId?: string
  ): Promise<number> {
    // Telegram doesn't support editing beyond 48h — delete + re-insert
    await this.deleteDocument(msgId, channelId);
    return this.writeDocument(doc, channelId);
  }

  // ─── Chunked large documents ──────────────────────────────────────────────

  private async writeChunked(text: string, channel: string): Promise<number> {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += MAX_MSG_BYTES) {
      chunks.push(text.slice(i, i + MAX_MSG_BYTES));
    }

    const msgIds: number[] = [];
    for (const chunk of chunks) {
      const msg = await this.pool.execute((bot) =>
        bot.sendMessage(channel, chunk, { disable_notification: true })
      ) as any;
      msgIds.push(msg.message_id as number);
    }

    // Header message with chunk references
    const header = `CHUNK:${JSON.stringify(msgIds)}`;
    const headerMsg = await this.pool.execute((bot) =>
      bot.sendMessage(channel, header, { disable_notification: true })
    ) as any;

    return headerMsg.message_id as number;
  }

  private async readChunked(headerText: string, channel: string): Promise<string> {
    const msgIds: number[] = JSON.parse(headerText.replace('CHUNK:', ''));
    const parts: string[] = [];

    for (const id of msgIds) {
      const msg = await this.pool.execute((bot) =>
        bot.forwardMessage(channel, channel, id)
      ) as any;
      if (msg?.text) parts.push(msg.text as string);
    }

    return parts.join('');
  }

  // ─── File storage ─────────────────────────────────────────────────────────

  async uploadFile(
    data: Buffer,
    fileName: string,
    mimeType: string,
    channelId?: string
  ): Promise<{ fileId: string; msgId: number }> {
    const channel = channelId ?? this.defaultChannelId;
    const isImage = mimeType.startsWith('image/');

    let msg: any;
    if (isImage) {
      msg = await this.pool.execute((bot) =>
        bot.sendPhoto(channel, data, {
          caption: fileName,
          disable_notification: true,
        })
      );
    } else {
      msg = await this.pool.execute((bot) =>
        bot.sendDocument(channel, data, {
          caption: fileName,
          disable_notification: true,
        })
      );
    }

    const fileId = isImage
      ? (msg as any).photo?.[(msg as any).photo.length - 1]?.file_id
      : (msg as any).document?.file_id;

    return { fileId, msgId: msg.message_id };
  }

  async getFileUrl(fileId: string): Promise<string> {
    return this.pool.execute((bot) => bot.getFileLink(fileId));
  }

  // ─── Encryption ───────────────────────────────────────────────────────────

  private encrypt(text: string): string {
    if (!this.encryptionKey) return text;
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return `ENC:${iv.toString('hex')}:${encrypted.toString('base64')}`;
  }

  private decrypt(text: string): string {
    if (!this.encryptionKey) return text;
    const [, ivHex, encB64] = text.split(':');
    if (!ivHex || !encB64) throw new Error('Invalid encrypted payload');
    const iv = Buffer.from(ivHex, 'hex');
    const encBuf = Buffer.from(encB64, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    return Buffer.concat([decipher.update(encBuf), decipher.final()]).toString('utf8');
  }
}
