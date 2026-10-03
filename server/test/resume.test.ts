import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Point the server modules at a throwaway ~/.claude before importing them.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccdash-test-'));
process.env.CCDASH_CLAUDE_DIR = path.join(root, 'claude');
process.env.CCDASH_DATA_DIR = path.join(root, 'data');
const proj = path.join(root, 'claude', 'projects', '-tmp-proj');
fs.mkdirSync(proj, { recursive: true });

const { openDb } = await import('../src/db.ts');
const { TranscriptIndex } = await import('../src/ingest/transcripts.ts');

const usage = { input_tokens: 0, output_tokens: 1_000_000 }; // $25 on Opus 5
const prompt = (sid: string, uuid: string, text: string, ts: string) =>
  JSON.stringify({ type: 'user', sessionId: sid, uuid, timestamp: ts, cwd: '/tmp/proj', message: { role: 'user', content: text } });
const reply = (sid: string, id: string, ts: string) =>
  JSON.stringify({ type: 'assistant', sessionId: sid, requestId: `r-${id}`, timestamp: ts, message: { id, model: 'claude-opus-5', usage, content: [] } });

const original = [prompt('A', 'u1', 'first question', '2026-10-01T10:00:00Z'), reply('A', 'm1', '2026-10-01T10:00:05Z')];
// Resuming copies A's records (keeping sessionId A) into B's file, then B continues.
const resumed = [...original, prompt('B', 'u2', 'follow-up', '2026-10-02T10:00:00Z'), reply('B', 'm2', '2026-10-02T10:00:05Z')];
fs.writeFileSync(path.join(proj, 'A.jsonl'), original.join('\n') + '\n');
fs.writeFileSync(path.join(proj, 'B.jsonl'), resumed.join('\n') + '\n');

test('records copied into a resumed session stay credited to the original session', () => {
  const db = openDb();
  new TranscriptIndex(db).scanAll();
  const row = (id: string) => db.prepare('SELECT prompts, resumed_from FROM sessions WHERE id = ?').get(id) as any;
  const cost = (id: string) => (db.prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage WHERE session_id = ?').get(id) as any).c;
  assert.equal(cost('A'), 25);
  assert.equal(cost('B'), 25);
  assert.equal(row('A').prompts, 1);
  assert.equal(row('B').prompts, 1);
  assert.equal(row('B').resumed_from, 'A');
  assert.equal(row('A').resumed_from, null);
  const total = (db.prepare('SELECT SUM(cost) c FROM usage').get() as any).c;
  assert.equal(total, 50, 'copied requests are not double counted');
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});
