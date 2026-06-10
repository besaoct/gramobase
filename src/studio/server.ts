import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { getStudioHTML } from './ui.js';
import { createClient, GramoBase } from '../index.js';
import type { GramoBaseConfig } from '../types/index.js';

// ─── Config Loader ────────────────────────────────────────────────────────────

function loadEnvFile(cwd: string): Record<string, string> {
  const envPath = path.join(cwd, '.env');
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

function resolveConfig(cwd: string): GramoBaseConfig | null {
  const env = loadEnvFile(cwd);

  // Merge with process.env (process.env takes precedence)
  const get = (k: string): string | undefined => process.env[k] || env[k];

  // Collect tokens
  const tokens: string[] = [];
  // First try single token
  const single = get('GRAMOBASE_BOT_TOKEN');
  if (single) tokens.push(single);
  // Then try indexed tokens
  let i = 1;
  while (true) {
    const t = get(`GRAMOBASE_BOT_TOKEN_${i}`);
    if (!t) break;
    if (!tokens.includes(t)) tokens.push(t);
    i++;
  }

  const channelId = get('GRAMOBASE_CHANNEL_ID');
  if (tokens.length === 0 || !channelId) return null;

  const encKey = get('GRAMOBASE_ENCRYPTION_KEY');
  return {
    botToken: tokens.length === 1 ? tokens[0]! : tokens,
    channelId,
    ...(encKey !== undefined ? { encryptionKey: encKey } : {}),
    cacheMaxBytes: 64 * 1024 * 1024,
    cacheTtlMs: 60_000,
    concurrency: 25,
    debug: false,
  };
}

// ─── JSON Response Helper ─────────────────────────────────────────────────────

function jsonRes(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

// ─── Route Parser ─────────────────────────────────────────────────────────────

function parseUrl(rawUrl: string): { pathname: string; query: URLSearchParams } {
  const base = 'http://localhost';
  const url = new URL(rawUrl, base);
  return { pathname: url.pathname, query: url.searchParams };
}

// ─── Studio Server ────────────────────────────────────────────────────────────

export async function startStudio(port: number, cwd: string = process.cwd()) {
  const config = resolveConfig(cwd);
  let db: GramoBase | null = null;
  let botInfo: { username: string; firstName: string } | null = null;

  if (config) {
    try {
      db = await createClient(config).connect();
      // Fetch bot info from Telegram
      const token = Array.isArray(config.botToken) ? config.botToken[0] : config.botToken;
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const j = await r.json() as any;
        if (j.ok) botInfo = { username: j.result.username, firstName: j.result.first_name };
      } catch (_) {}
    } catch (e) {
      db = null;
    }
  }

  // Graceful shutdown handling
  const cleanShutdown = async () => {
    if (db) {
      try {
        await db.disconnect();
      } catch (_) {}
      db = null;
    }
    server.close(() => {
      process.exit(0);
    });
    // Fallback if close takes too long
    setTimeout(() => process.exit(0), 1000);
  };

  process.once('SIGINT', cleanShutdown);
  process.once('SIGTERM', cleanShutdown);

  // SSE client set
  const sseClients = new Set<http.ServerResponse>();

  // Listen to db realtime events and forward to SSE clients
  if (db) {
    const forward = (ev: unknown) => {
      const data = JSON.stringify(ev);
      sseClients.forEach(client => {
        try { client.write(`data: ${data}\n\n`); } catch (_) { sseClients.delete(client); }
      });
    };
    db.realtime.onInsert('*' as any, (doc: any) => forward({ type: 'insert', collection: doc._collection, doc }));
    db.realtime.onUpdate('*' as any, (id: any, changes: any, doc: any) => forward({ type: 'update', collection: doc?._collection, id, changes, doc }));
    db.realtime.onDelete('*' as any, (id: any) => forward({ type: 'delete', id }));
  }

  const server = http.createServer(async (req, res) => {
    const { pathname, query } = parseUrl(req.url || '/');

    // ── Serve UI ───────────────────────────────────────────────
    if (pathname === '/' || pathname === '/index.html') {
      const html = getStudioHTML();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // ── SSE events stream ──────────────────────────────────────
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(':\n\n'); // comment to establish connection
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // ── Status ─────────────────────────────────────────────────
    if (pathname === '/api/status') {
      if (!db || !config) {
        return jsonRes(res, 503, { error: 'Not connected. Check your .env file.' });
      }
      const cacheStats = db.getCacheStats();
      const workerStats = db.getWorkerStats();
      const colRes = await safeListCollections(db);
      return jsonRes(res, 200, {
        bot: botInfo,
        channelId: config.channelId,
        cache: cacheStats,
        workers: workerStats,
        collections: colRes,
      });
    }

    // ── Collections list ───────────────────────────────────────
    if (pathname === '/api/collections') {
      if (!db) return jsonRes(res, 503, { error: 'Not connected' });
      const cols = await safeListCollections(db);
      return jsonRes(res, 200, { collections: cols });
    }

    // ── Collection data ────────────────────────────────────────
    const colMatch = pathname.match(/^\/api\/collection\/(.+)$/);
    if (colMatch) {
      if (!db) return jsonRes(res, 503, { error: 'Not connected' });
      const name = decodeURIComponent(colMatch[1] ?? '');

      // Guard: only alphanumeric / underscore / hyphen
      if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
        return jsonRes(res, 400, { error: 'Invalid collection name' });
      }

      const page = Math.max(1, parseInt(query.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.get('limit') || '25', 10)));
      const skip = (page - 1) * limit;
      const sortFieldRaw = query.get('sortField') || '_createdAt';
      const sortDirRaw = parseInt(query.get('sortDir') || '-1', 10);

      // Sanitize sort field — only allow safe identifiers
      const sortField = /^[a-zA-Z0-9_.]+$/.test(sortFieldRaw) ? sortFieldRaw : '_createdAt';
      const sortDir = sortDirRaw === 1 ? 1 : -1;

      // Build filter from text query param
      const filterText = (query.get('filter') || '').trim();
      let filter: Record<string, unknown> = {};
      if (filterText) {
        // Try key:value syntax first
        const kv = filterText.match(/^([a-zA-Z0-9_.]+):(.+)$/);
        if (kv) {
          const [, k, v] = kv;
          const key = String(k ?? 'unknown');
          const num = Number(v ?? '');
          const filterVal = v === 'true' ? true : v === 'false' ? false : !isNaN(num) ? num : (v ?? '');
          filter = Object.fromEntries([[key, { $eq: filterVal }]]);
        } else {
          // text search via $regex on any string field (best-effort)
          filter = { $or: [{ text: { $regex: filterText } }, { name: { $regex: filterText } }, { title: { $regex: filterText } }] } as any;
        }
      }

      try {
        const { z } = await import('zod');
        const col = db.collection(name, { schema: z.record(z.unknown()) });
        const sort: Record<string, 1 | -1> = {};
        sort[sortField] = sortDir;
        const [docs, allDocs] = await Promise.all([
          (col as any).find({ filter, sort, limit, skip }),
          (col as any).count(filter),
        ]);

        // Discover columns from first few docs
        const colSet = new Set<string>();
        (docs as any[]).slice(0, 10).forEach((d: any) => Object.keys(d).forEach(k => colSet.add(k)));
        const columns = Array.from(colSet).filter(c => !['_id','_collection','_msgId','_createdAt','_updatedAt'].includes(c));

        return jsonRes(res, 200, { docs, total: allDocs, page, limit, columns });
      } catch (e: any) {
        return jsonRes(res, 500, { error: e.message || 'Query failed' });
      }
    }

    jsonRes(res, 404, { error: 'Not found' });
  });

  server.listen(port, '127.0.0.1', () => {});
  return server;
}

// ─── Safe collection discovery ────────────────────────────────────────────────

async function safeListCollections(db: GramoBase): Promise<Array<{ name: string; count: number }>> {
  try {
    // Access internal collection registry to discover known collections
    const registry = (db as any).collections as Map<string, unknown> | undefined;
    if (!registry) return [];
    const result: Array<{ name: string; count: number }> = [];
    for (const [name] of registry) {
      if (name.startsWith('__')) continue; // skip internal collections
      try {
        const col = (registry.get(name) as any);
        const count = await col.count({});
        result.push({ name, count });
      } catch (_) {
        result.push({ name, count: 0 });
      }
    }
    return result;
  } catch (_) {
    return [];
  }
}
