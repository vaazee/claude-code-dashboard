import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Point the server modules at a throwaway ~/.claude before importing them.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccdash-rebuild-'));
process.env.CCDASH_CLAUDE_DIR = path.join(root, 'claude');
process.env.CCDASH_DATA_DIR = path.join(root, 'data');
const proj = path.join(root, 'claude', 'projects', '-tmp-proj');
const agentDir = path.join(proj, 'A', 'subagents');
fs.mkdirSync(agentDir, { recursive: true });

const { openDb } = await import('../src/db.ts');
const { TranscriptIndex } = await import('../src/ingest/transcripts.ts');

const usage = { input_tokens: 0, output_tokens: 1_000_000 }; // $25 on Opus 5
const prompt = (sid: string, uuid: string, ts: string) =>
  JSON.stringify({ type: 'user', sessionId: sid, uuid, timestamp: ts, cwd: '/tmp/proj', message: { role: 'user', content: `q ${uuid}` } });
const reply = (sid: string, id: string, ts: string) =>
  JSON.stringify({ type: 'assistant', sessionId: sid, requestId: `r-${id}`, timestamp: ts, message: { id, model: 'claude-opus-5', usage, content: [] } });
const write = (file: string, lines: string[]) => fs.writeFileSync(file, lines.join('\n') + '\n');

const aLines = [
  prompt('A', 'u1', '2026-10-01T10:00:00Z'),
  reply('A', 'm1', '2026-10-01T10:00:05Z'),
  prompt('A', 'u2', '2026-10-01T11:00:00Z'),
  reply('A', 'm2', '2026-10-01T11:00:05Z'),
];
write(path.join(proj, 'A.jsonl'), aLines);
// B resumed A: its file starts with a copy of A's records, then continues as B.
write(path.join(proj, 'B.jsonl'), [...aLines, prompt('B', 'u3', '2026-10-02T10:00:00Z'), reply('B', 'm3', '2026-10-02T10:00:05Z')]);
// A subagent whose .meta.json hasn't been written yet.
write(path.join(agentDir, 'agent-x1.jsonl'), [reply('A', 'm4', '2026-10-01T10:30:00Z')]);

const db = openDb();
const index = new TranscriptIndex(db);
const cost = (id: string) => (db.prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage WHERE session_id = ?').get(id) as any).c;
const prompts = (id: string) => (db.prepare('SELECT prompts FROM sessions WHERE id = ?').get(id) as any)?.prompts;
const agent = () => db.prepare('SELECT agent_type, description FROM agents WHERE id = ?').get('x1') as any;

test('subagent details missing at first read are filled in on a later scan', () => {
  index.scanAll();
  assert.equal(agent()?.agent_type, null);
  fs.writeFileSync(path.join(agentDir, 'agent-x1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Find things' }));
  const changed = index.scanAll();
  assert.ok(changed.has('A'), 'the session is reported as changed so the UI refreshes');
  assert.deepEqual({ ...agent() }, { agent_type: 'Explore', description: 'Find things' });
});

test('rebuilding a shrunk session keeps resumed copies and subagents', () => {
  assert.equal(cost('A'), 75); // m1 + m2 + subagent m4
  assert.equal(prompts('A'), 2);

  // Claude Code rewrites A's file shorter (e.g. after a rewind).
  write(path.join(proj, 'A.jsonl'), aLines.slice(0, 2));
  index.scanAll();

  // m2 and u2 survive because B's copy still credits them to A; the subagent row is recreated.
  assert.equal(cost('A'), 75);
  assert.equal(prompts('A'), 2);
  assert.equal(agent()?.agent_type, 'Explore');
  assert.equal(cost('B'), 25);
  assert.equal((db.prepare('SELECT SUM(cost) c FROM usage').get() as any).c, 100, 'nothing double counted');
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});
