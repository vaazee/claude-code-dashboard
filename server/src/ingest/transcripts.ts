import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { costOf, cacheSavingsOf, localDateOf, lookupPricing, tokensFromUsage } from '../../../shared/pricing.ts';
import { tx } from '../db.ts';
import { PROJECTS_DIR } from '../paths.ts';
import { describeTool, promptOf } from './parse.ts';

type FileRef = { path: string; sessionId: string; agentId: string | null; projectDir: string };

/** Every transcript on disk: top-level sessions and their subagent threads. */
export function listTranscripts(): FileRef[] {
  const out: FileRef[] = [];
  let projects: string[];
  try {
    projects = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return out;
  }
  for (const projectDir of projects) {
    const dir = path.join(PROJECTS_DIR, projectDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        out.push({ path: path.join(dir, e.name), sessionId: e.name.slice(0, -6), agentId: null, projectDir });
      } else if (e.isDirectory() && e.name !== 'memory') {
        const subDir = path.join(dir, e.name, 'subagents');
        let subs: string[] = [];
        try {
          subs = fs.readdirSync(subDir);
        } catch {
          continue;
        }
        for (const s of subs) {
          if (!s.endsWith('.jsonl')) continue;
          out.push({
            path: path.join(subDir, s),
            sessionId: e.name,
            agentId: s.slice(0, -6).replace(/^agent-/, ''),
            projectDir,
          });
        }
      }
    }
  }
  return out;
}

/** Map an absolute path back to a transcript ref, or null if it isn't one. */
export function refForPath(p: string): FileRef | null {
  const rel = path.relative(PROJECTS_DIR, p);
  if (rel.startsWith('..') || !rel.endsWith('.jsonl')) return null;
  const parts = rel.split(path.sep);
  if (parts.length === 2) return { path: p, sessionId: parts[1].slice(0, -6), agentId: null, projectDir: parts[0] };
  if (parts.length === 4 && parts[2] === 'subagents') {
    return { path: p, sessionId: parts[1], agentId: parts[3].slice(0, -6).replace(/^agent-/, ''), projectDir: parts[0] };
  }
  return null;
}

type SessionPatch = {
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  entrypoint: string | null;
  aiTitle: string | null;
  customTitle: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  lastPromptRecord: string | null;
  startedAt: number | null;
  lastAt: number | null;
  prompts: number;
  ccCost: number | null;
  permissionMode: string | null;
};

const emptyPatch = (): SessionPatch => ({
  cwd: null,
  gitBranch: null,
  version: null,
  entrypoint: null,
  aiTitle: null,
  customTitle: null,
  firstPrompt: null,
  lastPrompt: null,
  lastPromptRecord: null,
  startedAt: null,
  lastAt: null,
  prompts: 0,
  ccCost: null,
  permissionMode: null,
});

export class TranscriptIndex {
  private db: DatabaseSync;
  private q: Record<string, StatementSync>;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.q = {
      getFile: db.prepare('SELECT size, mtime, offset FROM files WHERE path = ?'),
      putFile: db.prepare(
        `INSERT INTO files(path, session_id, agent_id, size, mtime, offset) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, offset = excluded.offset`,
      ),
      upsertSession: db.prepare(
        `INSERT INTO sessions(id, project_dir, cwd, git_branch, version, entrypoint, ai_title, custom_title,
           first_prompt, last_prompt, started_at, last_at, cc_cost, permission_mode, resumed_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project_dir = COALESCE(sessions.project_dir, excluded.project_dir),
           cwd = COALESCE(sessions.cwd, excluded.cwd),
           git_branch = COALESCE(excluded.git_branch, sessions.git_branch),
           version = COALESCE(excluded.version, sessions.version),
           entrypoint = COALESCE(sessions.entrypoint, excluded.entrypoint),
           ai_title = COALESCE(excluded.ai_title, sessions.ai_title),
           custom_title = COALESCE(excluded.custom_title, sessions.custom_title),
           first_prompt = COALESCE(sessions.first_prompt, excluded.first_prompt),
           last_prompt = COALESCE(excluded.last_prompt, sessions.last_prompt),
           started_at = MIN(COALESCE(sessions.started_at, excluded.started_at), COALESCE(excluded.started_at, sessions.started_at)),
           last_at = MAX(COALESCE(sessions.last_at, excluded.last_at), COALESCE(excluded.last_at, sessions.last_at)),
           cc_cost = COALESCE(excluded.cc_cost, sessions.cc_cost),
           permission_mode = COALESCE(excluded.permission_mode, sessions.permission_mode),
           resumed_from = COALESCE(sessions.resumed_from, excluded.resumed_from)`,
      ),
      upsertUsage: db.prepare(
        `INSERT INTO usage(key, session_id, agent_id, file, ts, day, model, speed, input, output, write5m, write1h, read, cost, savings, priced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           session_id = excluded.session_id, agent_id = excluded.agent_id, file = excluded.file, ts = excluded.ts,
           day = excluded.day, model = excluded.model, speed = excluded.speed, input = excluded.input,
           output = excluded.output, write5m = excluded.write5m, write1h = excluded.write1h, read = excluded.read,
           cost = excluded.cost, savings = excluded.savings, priced = excluded.priced
         WHERE excluded.output >= usage.output`,
      ),
      insertTool: db.prepare(
        `INSERT OR IGNORE INTO tools(id, session_id, agent_id, file, ts, day, name, detail, added, removed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      insertAgent: db.prepare(
        `INSERT INTO agents(id, session_id, agent_type, description, file) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           agent_type = COALESCE(agents.agent_type, excluded.agent_type),
           description = COALESCE(agents.description, excluded.description)`,
      ),
      insertPrompt: db.prepare('INSERT OR IGNORE INTO prompts(uuid, session_id, file, ts) VALUES (?, ?, ?, ?)'),
      agentsMissingMeta: db.prepare('SELECT id, session_id, file FROM agents WHERE agent_type IS NULL OR description IS NULL'),
      // Every file that credited rows to a session: its own files plus resumed copies elsewhere.
      contributingFiles: db.prepare(
        `SELECT path FROM files WHERE session_id = ?
         UNION SELECT file FROM usage WHERE session_id = ?
         UNION SELECT file FROM tools WHERE session_id = ?
         UNION SELECT file FROM prompts WHERE session_id = ?`,
      ),
      countPrompts: db.prepare('UPDATE sessions SET prompts = (SELECT COUNT(*) FROM prompts WHERE session_id = ?) WHERE id = ?'),
    };
  }

  /** Scan all transcripts; returns ids of sessions whose data changed. */
  scanAll(): Set<string> {
    const changed = new Set<string>();
    for (const ref of listTranscripts()) {
      if (this.ingest(ref)) changed.add(ref.sessionId);
    }
    // A subagent's .meta.json can land after its transcript was first read; pick it up now.
    for (const a of this.q.agentsMissingMeta.all() as { id: string; session_id: string; file: string }[]) {
      if (this.recordAgent({ path: a.file, sessionId: a.session_id, agentId: a.id, projectDir: '' })) changed.add(a.session_id);
    }
    return changed;
  }

  /** Parse any bytes appended to a transcript since the last call. Returns true if anything changed. */
  ingest(ref: FileRef): boolean {
    let st: fs.Stats;
    try {
      st = fs.statSync(ref.path);
    } catch {
      return false;
    }
    const row = this.q.getFile.get(ref.path) as { size: number; mtime: number; offset: number } | undefined;
    if (row && row.size === st.size && row.mtime === st.mtimeMs) return false;
    if (row && st.size < row.offset) {
      // Rewritten or truncated: rebuild the session from every file that credited rows to it,
      // including resumed copies in other sessions' files. Re-reading a file is idempotent.
      for (const path of this.resetSession(ref.sessionId)) {
        const other = refForPath(path);
        if (other && other.path !== ref.path) this.ingest(other);
      }
      this.ingest(ref);
      return true;
    }
    const start = row?.offset ?? 0;
    const length = st.size - start;
    let buf = Buffer.alloc(0);
    if (length > 0) {
      const fd = fs.openSync(ref.path, 'r');
      try {
        buf = Buffer.alloc(length);
        fs.readSync(fd, buf, 0, length, start);
      } finally {
        fs.closeSync(fd);
      }
    }
    const lastNl = buf.lastIndexOf(0x0a);
    const complete = lastNl >= 0 ? buf.subarray(0, lastNl + 1) : Buffer.alloc(0);
    const newOffset = start + complete.length;

    tx(this.db, () => {
      if (ref.agentId) this.recordAgent(ref);
      if (complete.length) this.processChunk(ref, complete.toString('utf8'), start);
      this.q.putFile.run(ref.path, ref.sessionId, ref.agentId, st.size, st.mtimeMs, newOffset);
    });
    return complete.length > 0 || !row;
  }

  /** Drop everything credited to a session and mark its contributing files for a full re-read. */
  private resetSession(sessionId: string): string[] {
    return tx(this.db, () => {
      const files = (this.q.contributingFiles.all(sessionId, sessionId, sessionId, sessionId) as { path: string }[]).map((r) => r.path);
      for (const t of ['usage', 'tools', 'agents', 'prompts']) {
        this.db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(sessionId);
      }
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      const resetFile = this.db.prepare('UPDATE files SET size = 0, mtime = 0, offset = 0 WHERE path = ?');
      for (const f of files) resetFile.run(f);
      return files;
    });
  }

  /** Upsert a subagent row; returns true if its type or description was newly filled in. */
  private recordAgent(ref: FileRef): boolean {
    let meta: any = {};
    try {
      meta = JSON.parse(fs.readFileSync(ref.path.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    } catch {}
    const before = this.db.prepare('SELECT agent_type, description FROM agents WHERE id = ?').get(ref.agentId) as any;
    this.q.insertAgent.run(ref.agentId, ref.sessionId, meta.agentType ?? null, meta.description ?? null, ref.path);
    return !before || (!before.agent_type && !!meta.agentType) || (!before.description && !!meta.description);
  }

  private processChunk(ref: FileRef, text: string, baseOffset: number) {
    const isMain = ref.agentId === null;
    // A resumed session's file starts with a copy of the earlier conversation, and every
    // copied record keeps its original sessionId. Credit each record to the session it
    // actually happened in, and remember the link so the UI can show the chain.
    const patches = new Map<string, SessionPatch & { resumedFrom: string | null }>();
    const patchFor = (sid: string) => {
      let p = patches.get(sid);
      if (!p) patches.set(sid, (p = { ...emptyPatch(), resumedFrom: null }));
      return p;
    };
    patchFor(ref.sessionId);
    let pos = baseOffset;
    for (const line of text.split('\n')) {
      const lineOffset = pos;
      pos += Buffer.byteLength(line) + 1;
      if (!line) continue;
      let rec: any;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const sid: string = isMain && typeof rec.sessionId === 'string' && rec.sessionId ? rec.sessionId : ref.sessionId;
      if (sid !== ref.sessionId) patchFor(ref.sessionId).resumedFrom ??= sid;
      const patch = patchFor(sid);
      const ts = rec.timestamp ? Date.parse(rec.timestamp) : NaN;
      if (Number.isFinite(ts)) {
        patch.startedAt = patch.startedAt == null ? ts : Math.min(patch.startedAt, ts);
        patch.lastAt = patch.lastAt == null ? ts : Math.max(patch.lastAt, ts);
      }

      if (isMain) {
        patch.cwd ??= rec.cwd ?? null;
        patch.entrypoint ??= rec.entrypoint ?? null;
        if (rec.gitBranch) patch.gitBranch = rec.gitBranch;
        if (rec.version) patch.version = rec.version;
        switch (rec.type) {
          case 'ai-title':
            if (rec.aiTitle) patch.aiTitle = rec.aiTitle;
            break;
          case 'custom-title':
            if (rec.customTitle ?? rec.title) patch.customTitle = rec.customTitle ?? rec.title;
            break;
          case 'last-prompt':
            if (rec.lastPrompt) patch.lastPromptRecord = rec.lastPrompt;
            break;
          case 'cost-state':
            if (typeof rec.totalCostUSD === 'number') patch.ccCost = rec.totalCostUSD;
            break;
          case 'permission-mode':
            if (rec.permissionMode ?? rec.mode) patch.permissionMode = rec.permissionMode ?? rec.mode;
            break;
          case 'user': {
            if (rec.isSidechain) break;
            const p = promptOf(rec);
            if (p) {
              // Keyed by record uuid, so a prompt copied into a resumed file is counted once.
              this.q.insertPrompt.run(rec.uuid ?? `${ref.path}:${lineOffset}`, sid, ref.path, Number.isFinite(ts) ? ts : null);
              if (!p.command) {
                patch.firstPrompt ??= p.text.slice(0, 2000);
                patch.lastPrompt = p.text.slice(0, 2000);
              }
            }
            break;
          }
        }
      }

      if (rec.type === 'assistant' && Number.isFinite(ts)) this.recordAssistant(ref, sid, rec, ts, lineOffset);
    }

    for (const [sid, patch] of patches) {
      // A session seen only through another file's copy still gets a row, so its cost stays visible.
      this.q.upsertSession.run(
        sid,
        ref.projectDir,
        patch.cwd,
        patch.gitBranch,
        patch.version,
        patch.entrypoint,
        patch.aiTitle,
        patch.customTitle,
        patch.firstPrompt,
        patch.lastPrompt ?? patch.lastPromptRecord,
        patch.startedAt,
        patch.lastAt,
        patch.ccCost,
        patch.permissionMode,
        patch.resumedFrom,
      );
      this.q.countPrompts.run(sid, sid);
    }
  }

  private recordAssistant(ref: FileRef, sessionId: string, rec: any, ts: number, lineOffset: number) {
    const msg = rec.message ?? {};
    const day = localDateOf(ts);
    const model: string = msg.model ?? '';
    if (msg.usage && model && model !== '<synthetic>') {
      const tokens = tokensFromUsage(msg.usage);
      const speed = msg.usage.speed ?? 'standard';
      const rates = lookupPricing(model, day, speed);
      const key = msg.id || rec.requestId ? `${msg.id ?? ''}|${rec.requestId ?? ''}` : `${ref.path}:${lineOffset}`;
      this.q.upsertUsage.run(
        key,
        sessionId,
        ref.agentId,
        ref.path,
        ts,
        day,
        model,
        speed,
        tokens.input,
        tokens.output,
        tokens.write5m,
        tokens.write1h,
        tokens.read,
        costOf(tokens, rates),
        cacheSavingsOf(tokens, rates),
        rates ? 1 : 0,
      );
    }
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type !== 'tool_use' || !block.id || !block.name) continue;
        const info = describeTool(block.name, block.input);
        this.q.insertTool.run(
          block.id,
          sessionId,
          ref.agentId,
          ref.path,
          ts,
          day,
          block.name,
          info.detail,
          info.added,
          info.removed,
        );
      }
    }
  }
}
