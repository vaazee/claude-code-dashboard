import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ServerEvent } from '../../shared/types.ts';
import { buildConfig, buildProjects, readHistory } from './collectors/config.ts';
import { buildInventory } from './collectors/inventory.ts';
import { openDb } from './db.ts';
import { refForPath, TranscriptIndex } from './ingest/transcripts.ts';
import { exists } from './lib/fsx.ts';
import { readLive } from './lib/live.ts';
import { openDir, openUrl, terminalName, type OpenTarget } from './lib/open.ts';
import { readTranscript } from './lib/transcript.ts';
import { LIVE_DIR, PORT, PROJECTS_DIR } from './paths.ts';
import { Queries } from './queries.ts';

const VERSION = '0.1.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(here, '../../web/dist');

// ---------- state
const db = openDb();
const index = new TranscriptIndex(db);
const q = new Queries(db);
const t0 = performance.now();
const initial = index.scanAll();
q.live = readLive();
console.log(`[ccdash] indexed ${initial.size} changed sessions in ${Math.round(performance.now() - t0)}ms`);

// ---------- server-sent events
type Client = (e: ServerEvent) => void;
const clients = new Set<Client>();
const broadcast = (e: ServerEvent) => clients.forEach((send) => send(e));

// ---------- watchers
const pending = new Map<string, NodeJS.Timeout>();
function scheduleIngest(file: string) {
  clearTimeout(pending.get(file));
  pending.set(
    file,
    setTimeout(() => {
      pending.delete(file);
      const ref = refForPath(file);
      if (ref && index.ingest(ref)) broadcast({ type: 'sessions', ids: [ref.sessionId] });
    }, 250),
  );
}

let liveSig = JSON.stringify(q.live);
function refreshLive() {
  q.live = readLive();
  const sig = JSON.stringify(q.live);
  if (sig !== liveSig) {
    liveSig = sig;
    broadcast({ type: 'live' });
  }
}
let liveTimer: NodeJS.Timeout | undefined;
const scheduleLive = () => {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(refreshLive, 150);
};

try {
  fs.watch(PROJECTS_DIR, { recursive: true }, (_ev, name) => {
    if (name && String(name).endsWith('.jsonl')) scheduleIngest(path.join(PROJECTS_DIR, String(name)));
  });
} catch (e) {
  console.warn('[ccdash] could not watch transcripts; falling back to polling', e);
}
try {
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  fs.watch(LIVE_DIR, scheduleLive);
} catch {}
// Safety nets: processes can die without touching their session file, and watchers can miss events.
setInterval(refreshLive, 3000);
setInterval(() => {
  const changed = index.scanAll();
  if (changed.size) broadcast({ type: 'sessions', ids: [...changed] });
}, 30_000);

// ---------- http
const app = new Hono();

// Only answer to local hostnames (blocks DNS-rebinding), and require a custom header on writes (blocks CSRF).
app.use('*', async (c, next) => {
  const host = (c.req.header('host') ?? '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return c.text('Forbidden', 403);
  if (c.req.method !== 'GET' && c.req.header('x-ccdash') !== '1') return c.text('Forbidden', 403);
  await next();
});

const api = new Hono();
api.get('/overview', (c) => c.json(q.overview()));
api.get('/live', (c) => c.json(q.liveSessions()));
api.get('/sessions', (c) => c.json(q.sessions()));
api.get('/sessions/:id', (c) => {
  const d = q.detail(c.req.param('id'));
  return d ? c.json(d) : c.json({ error: 'not found' }, 404);
});
api.get('/sessions/:id/transcript', (c) => {
  const file = q.transcriptFile(c.req.param('id'), c.req.query('agent') ?? null);
  if (!file) return c.json({ items: [], truncated: false });
  return c.json(readTranscript(file));
});
api.get('/analytics', (c) => {
  const days = c.req.query('days');
  return c.json(q.analytics(days && days !== 'all' ? Math.max(1, Number(days)) : null));
});
api.get('/projects', (c) => c.json(buildProjects(q)));
api.get('/inventory', (c) => c.json(buildInventory(q)));
api.get('/config', (c) => c.json(buildConfig(q)));
api.get('/history', (c) => c.json(readHistory(c.req.query('q') ?? '', Math.min(2000, Number(c.req.query('limit') ?? 300)))));

// What this machine can open things with, so the UI can label its buttons.
api.get('/env', (c) => c.json({ platform: process.platform, terminal: terminalName() }));

api.post('/actions/open', async (c) => {
  const { sessionId, target } = await c.req.json<{ sessionId: string; target: OpenTarget }>();
  if (!['folder', 'editor', 'terminal'].includes(target)) return c.json({ ok: false, error: 'Unknown target' }, 400);
  // The path comes from our own index, never from the request body.
  const dir = q.session(sessionId)?.cwdAbs;
  if (!dir || !exists(dir)) return c.json({ ok: false, error: 'Directory not found' }, 404);
  const error = await openDir(target, dir);
  return error ? c.json({ ok: false, error }, 500) : c.json({ ok: true });
});

api.post('/actions/kill', async (c) => {
  const { pid } = await c.req.json<{ pid: number }>();
  // Only processes Claude Code itself registered as live sessions can be signalled.
  if (!q.live.some((l) => l.pid === pid)) return c.json({ ok: false, error: 'Not a live Claude Code session' }, 400);
  try {
    process.kill(pid, 'SIGTERM');
    setTimeout(refreshLive, 500);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

api.get('/events', (c) =>
  streamSSE(c, async (stream) => {
    const send: Client = (e) => void stream.writeSSE({ data: JSON.stringify(e) });
    clients.add(send);
    send({ type: 'hello', version: VERSION });
    const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: '' }), 20_000);
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    clearInterval(ping);
    clients.delete(send);
  }),
);

app.route('/api', api);

if (exists(WEB_DIST)) {
  const root = path.relative(process.cwd(), WEB_DIST) || '.';
  app.use('/*', serveStatic({ root }));
  // SPA fallback: client-side routes all render index.html.
  app.get('*', (c) => c.html(fs.readFileSync(path.join(WEB_DIST, 'index.html'), 'utf8')));
} else {
  app.get('/', (c) => c.text('ccdash API is running. Build the web app with `npm run build`, or use `npm run dev`.'));
}

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  const url = `http://localhost:${info.port}`;
  console.log(`[ccdash] ${url}`);
  if (process.argv.includes('--open')) openUrl(url);
});
