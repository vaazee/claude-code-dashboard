import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { localDateOf } from '../../shared/pricing.ts';
import type { Analytics, LiveInfo, ModelRow, Overview, SessionDetail, SessionSummary } from '../../shared/types.ts';
import { activityPhrase } from './ingest/parse.ts';
import type { LiveRecord } from './lib/live.ts';
import { HOME, tildify } from './paths.ts';

const SUMMARY_SQL = `
SELECT s.*,
  COALESCE(u.cost, 0) AS cost, COALESCE(u.requests, 0) AS requests,
  COALESCE(u.input, 0) AS t_input, COALESCE(u.output, 0) AS t_output,
  COALESCE(u.write, 0) AS t_write, COALESCE(u.read, 0) AS t_read, u.models,
  COALESCE(t.calls, 0) AS tool_calls, COALESCE(t.added, 0) AS added, COALESCE(t.removed, 0) AS removed,
  COALESCE(a.n, 0) AS subagents
FROM sessions s
LEFT JOIN (
  SELECT session_id, SUM(cost) cost, COUNT(*) requests, SUM(input) input, SUM(output) output,
         SUM(write5m + write1h) write, SUM(read) read, GROUP_CONCAT(DISTINCT model) models
  FROM usage GROUP BY session_id
) u ON u.session_id = s.id
LEFT JOIN (
  SELECT session_id, COUNT(*) calls, SUM(added) added, SUM(removed) removed FROM tools GROUP BY session_id
) t ON t.session_id = s.id
LEFT JOIN (SELECT session_id, COUNT(*) n FROM agents GROUP BY session_id) a ON a.session_id = s.id
`;

// Token columns summed by kind, and the row → TokenTotals mapping that goes with them.
const KINDS_SQL = 'SUM(input) AS input, SUM(write5m + write1h) AS write, SUM(read) AS read, SUM(output) AS output';
const KINDS_SQL_U = 'SUM(u.input) AS input, SUM(u.write5m + u.write1h) AS write, SUM(u.read) AS read, SUM(u.output) AS output';
const tok = (r: any) => ({ input: r?.input ?? 0, write: r?.write ?? 0, read: r?.read ?? 0, output: r?.output ?? 0 });
const tokSum = (t: { input: number; write: number; read: number; output: number }) => t.input + t.write + t.read + t.output;

export function projectName(cwd: string | null | undefined): string {
  if (!cwd) return 'unknown';
  if (cwd === HOME) return '~';
  return path.basename(cwd);
}

function titleOf(row: any, inherited?: string | null): string {
  const t = row.custom_title || row.ai_title || inherited || row.first_prompt;
  if (!t) return 'Untitled session';
  const one = String(t).replace(/\s+/g, ' ').trim();
  return one.length > 90 ? one.slice(0, 90) + '…' : one;
}

export class Queries {
  private db: DatabaseSync;
  live: LiveRecord[] = [];

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private liveInfo(sessionId: string): LiveInfo | null {
    const l = this.live.find((x) => x.sessionId === sessionId);
    if (!l) return null;
    const last = this.db
      .prepare('SELECT name, detail, ts FROM tools WHERE session_id = ? ORDER BY ts DESC LIMIT 1')
      .get(sessionId) as { name: string; detail: string | null; ts: number } | undefined;
    return {
      pid: l.pid,
      status: l.status,
      name: l.name,
      startedAt: l.startedAt,
      statusUpdatedAt: l.statusUpdatedAt,
      activity: last ? activityPhrase(last.name, last.detail) : null,
      activityAt: last?.ts ?? null,
      kind: l.kind,
    };
  }

  /** Walk the resume chain backwards: the nearest ancestor and everything spent before this session. */
  private resumeInfo(row: any): { parent: SessionSummary['resumedFrom']; inheritedTitle: string | null } {
    if (!row.resumed_from) return { parent: null, inheritedTitle: null };
    const getRow = this.db.prepare('SELECT id, custom_title, ai_title, first_prompt, resumed_from FROM sessions WHERE id = ?');
    const costOf = this.db.prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage WHERE session_id = ?');
    const first = getRow.get(row.resumed_from) as any;
    if (!first) return { parent: null, inheritedTitle: null };
    let cost = 0;
    const seen = new Set<string>([row.id]);
    for (let cur: any = first; cur && !seen.has(cur.id) && seen.size < 50; cur = cur.resumed_from ? getRow.get(cur.resumed_from) : null) {
      seen.add(cur.id);
      cost += (costOf.get(cur.id) as any).c;
    }
    const title = titleOf(first);
    return { parent: { id: first.id, title, cost }, inheritedTitle: first.custom_title || first.ai_title || null };
  }

  private toSummary(row: any): SessionSummary {
    const cwd = row.cwd ?? '';
    const { parent, inheritedTitle } = this.resumeInfo(row);
    const children = (
      this.db.prepare('SELECT id, custom_title, ai_title, first_prompt FROM sessions WHERE resumed_from = ? ORDER BY started_at').all(row.id) as any[]
    ).map((c) => ({ id: c.id, title: titleOf(c) }));
    return {
      id: row.id,
      title: titleOf(row, inheritedTitle),
      aiTitle: row.ai_title,
      customTitle: row.custom_title,
      firstPrompt: row.first_prompt,
      lastPrompt: row.last_prompt,
      project: projectName(cwd),
      cwd: tildify(cwd),
      cwdAbs: cwd,
      gitBranch: row.git_branch && row.git_branch !== 'HEAD' ? row.git_branch : null,
      version: row.version,
      entrypoint: row.entrypoint,
      startedAt: row.started_at,
      lastAt: row.last_at,
      prompts: row.prompts,
      requests: row.requests,
      cost: row.cost,
      ccCost: row.cc_cost,
      tokens: { input: row.t_input, output: row.t_output, write: row.t_write, read: row.t_read },
      models: row.models ? String(row.models).split(',') : [],
      toolCalls: row.tool_calls,
      linesAdded: row.added,
      linesRemoved: row.removed,
      subagents: row.subagents,
      live: this.liveInfo(row.id),
      resumedFrom: parent,
      continuedIn: children,
    };
  }

  /** A live process whose transcript has no records yet still deserves a card. */
  private placeholder(l: LiveRecord): SessionSummary {
    return {
      id: l.sessionId,
      title: l.name ?? 'New session',
      aiTitle: null,
      customTitle: null,
      firstPrompt: null,
      lastPrompt: null,
      project: projectName(l.cwd),
      cwd: tildify(l.cwd),
      cwdAbs: l.cwd,
      gitBranch: null,
      version: l.version,
      entrypoint: l.entrypoint,
      startedAt: l.startedAt,
      lastAt: l.updatedAt,
      prompts: 0,
      requests: 0,
      cost: 0,
      ccCost: null,
      tokens: { input: 0, output: 0, write: 0, read: 0 },
      models: [],
      toolCalls: 0,
      linesAdded: 0,
      linesRemoved: 0,
      subagents: 0,
      live: this.liveInfo(l.sessionId),
      resumedFrom: null,
      continuedIn: [],
    };
  }

  sessions(): SessionSummary[] {
    const rows = this.db
      .prepare(`${SUMMARY_SQL} WHERE s.prompts > 0 OR u.requests > 0 ORDER BY s.last_at DESC`)
      .all();
    return rows.map((r) => this.toSummary(r));
  }

  session(id: string): SessionSummary | null {
    const row = this.db.prepare(`${SUMMARY_SQL} WHERE s.id = ?`).get(id);
    if (row) return this.toSummary(row);
    const l = this.live.find((x) => x.sessionId === id);
    return l ? this.placeholder(l) : null;
  }

  liveSessions(): SessionSummary[] {
    return this.live.map((l) => {
      const s = this.session(l.sessionId) ?? this.placeholder(l);
      // The process name and start time are more meaningful than the transcript's for a live card.
      return { ...s, cwd: tildify(l.cwd) || s.cwd, cwdAbs: l.cwd || s.cwdAbs, project: projectName(l.cwd || s.cwdAbs) };
    });
  }

  overview(): Overview {
    const now = new Date();
    const today = localDateOf(now.getTime());
    const daysAgo = (n: number) => localDateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n).getTime());
    const sumSince = (day: string) =>
      (this.db.prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage WHERE day >= ?').get(day) as any).c as number;
    const monthStart = `${today.slice(0, 8)}01`;
    const todayRow = this.db
      .prepare(
        'SELECT COALESCE(SUM(input + output + write5m + write1h + read), 0) tokens, COUNT(*) requests FROM usage WHERE day = ?',
      )
      .get(today) as any;
    const yesterday = (this.db.prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage WHERE day = ?').get(daysAgo(1)) as any)
      .c;

    const start = daysAgo(29);
    const byDay = new Map(
      (
        this.db
          .prepare(
            `SELECT day, SUM(cost) cost, ${KINDS_SQL}, COUNT(*) requests FROM usage WHERE day >= ? GROUP BY day`,
          )
          .all(start) as any[]
      ).map((r) => [r.day, r]),
    );
    const daily = Array.from({ length: 30 }, (_, i) => {
      const day = daysAgo(29 - i);
      const r = byDay.get(day);
      const t = tok(r);
      return { day, cost: r?.cost ?? 0, tokens: tokSum(t), tok: t, requests: r?.requests ?? 0 };
    });

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sessionsToday = (
      this.db.prepare('SELECT COUNT(*) n FROM sessions WHERE last_at >= ? AND prompts > 0').get(startOfToday) as any
    ).n;
    const firstDay = (this.db.prepare('SELECT MIN(day) d FROM usage').get() as any).d ?? null;

    const live = this.liveSessions();
    const liveIds = new Set(live.map((l) => l.id));
    const recent = (this.db.prepare(`${SUMMARY_SQL} WHERE s.prompts > 0 ORDER BY s.last_at DESC LIMIT 12`).all() as any[])
      .map((r) => this.toSummary(r))
      .filter((s) => !liveIds.has(s.id))
      .slice(0, 8);

    return {
      kpis: {
        today: sumSince(today),
        yesterday,
        week: sumSince(daysAgo(6)),
        month: sumSince(monthStart),
        allTime: sumSince('0000-00-00'),
        todayTokens: todayRow.tokens,
        todayRequests: todayRow.requests,
        liveCount: live.length,
        busyCount: live.filter((l) => l.live?.status === 'busy').length,
        sessionsToday,
      },
      daily,
      live,
      recent,
      firstDay,
      user: os.userInfo().username,
    };
  }

  detail(id: string): SessionDetail | null {
    const base = this.session(id);
    if (!base) return null;
    const byModel = (
      this.db
        .prepare(
          `SELECT model, SUM(cost) cost, COUNT(*) requests, SUM(input) input, SUM(output) output,
                  SUM(write5m + write1h) write, SUM(read) read
           FROM usage WHERE session_id = ? GROUP BY model ORDER BY cost DESC`,
        )
        .all(id) as any[]
    ).map(modelRow);
    const tools = this.db
      .prepare('SELECT name, COUNT(*) count FROM tools WHERE session_id = ? GROUP BY name ORDER BY count DESC')
      .all(id) as any[];
    const files = (
      this.db
        .prepare(
          `SELECT detail path,
             SUM(name IN ('Read', 'NotebookRead')) reads,
             SUM(name IN ('Edit', 'MultiEdit', 'Write', 'NotebookEdit')) edits,
             SUM(added) added, SUM(removed) removed
           FROM tools
           WHERE session_id = ? AND detail IS NOT NULL
             AND name IN ('Read', 'NotebookRead', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit')
           GROUP BY detail ORDER BY edits DESC, reads DESC LIMIT 200`,
        )
        .all(id) as any[]
    ).map((f) => ({ ...f, path: tildify(f.path) }));
    const agents = this.db
      .prepare(
        `SELECT a.id, a.agent_type type, a.description, COALESCE(SUM(u.cost), 0) cost, COUNT(u.key) requests
         FROM agents a LEFT JOIN usage u ON u.agent_id = a.id AND u.session_id = a.session_id
         WHERE a.session_id = ? GROUP BY a.id ORDER BY MIN(u.ts)`,
      )
      .all(id) as any[];
    const timeline = (
      this.db
        .prepare(
          'SELECT ts, cost, input, write5m + write1h AS write, read, output, model, agent_id FROM usage WHERE session_id = ? ORDER BY ts',
        )
        .all(id) as any[]
    ).map((r) => ({ ts: r.ts, cost: r.cost, tok: tok(r), output: r.output, model: r.model, agentId: r.agent_id }));
    return { ...base, byModel, tools, files, agents, timeline };
  }

  analytics(days: number | null): Analytics {
    const now = new Date();
    const to = localDateOf(now.getTime());
    const from = days ? localDateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime()) : null;
    const lo = from ?? '0000-00-00';
    const loMs = from ? new Date(`${from}T00:00:00`).getTime() : 0;

    const models = (
      this.db
        .prepare(
          `SELECT model, SUM(cost) cost, COUNT(*) requests, SUM(input) input, SUM(output) output,
                  SUM(write5m + write1h) write, SUM(read) read
           FROM usage WHERE day >= ? GROUP BY model ORDER BY cost DESC`,
        )
        .all(lo) as any[]
    ).map(modelRow);

    const dailyRows = this.db
      .prepare(`SELECT day, model, SUM(cost) cost, ${KINDS_SQL} FROM usage WHERE day >= ? GROUP BY day, model ORDER BY day`)
      .all(lo) as any[];
    type DayRow = Record<string, number | string> & { day: string; total: number };
    const dayMap = new Map<string, DayRow>();
    // Fill every day in range so the chart has no gaps.
    const firstDay = from ?? dailyRows[0]?.day ?? to;
    const rangeDays: string[] = [];
    for (let d = new Date(`${firstDay}T12:00:00`); localDateOf(d.getTime()) <= to; d.setDate(d.getDate() + 1)) {
      const key = localDateOf(d.getTime());
      rangeDays.push(key);
      dayMap.set(key, { day: key, total: 0 });
    }
    for (const r of dailyRows) {
      const e: DayRow = dayMap.get(r.day) ?? { day: r.day, total: 0 };
      e[r.model] = ((e[r.model] as number) ?? 0) + r.cost;
      e.total += r.cost;
      dayMap.set(r.day, e);
    }
    const dayModelTokens = dailyRows.map((r) => ({ day: r.day, model: r.model, ...tok(r) }));
    const mixRows = new Map(
      (
        this.db
          .prepare(
            `SELECT day, SUM(input) input, SUM(write5m + write1h) write, SUM(read) read, SUM(output) output
             FROM usage WHERE day >= ? GROUP BY day`,
          )
          .all(lo) as any[]
      ).map((r) => [r.day, r]),
    );
    const tokenMix = rangeDays.map((day) => {
      const r = mixRows.get(day);
      return { day, input: r?.input ?? 0, write: r?.write ?? 0, read: r?.read ?? 0, output: r?.output ?? 0 };
    });

    const projectRows = this.db
      .prepare(
        `SELECT s.cwd, SUM(u.cost) cost, ${KINDS_SQL_U},
                COUNT(DISTINCT s.id) sessions, MAX(s.last_at) last_at
         FROM usage u JOIN sessions s ON s.id = u.session_id
         WHERE u.day >= ? GROUP BY s.cwd ORDER BY cost DESC`,
      )
      .all(lo) as any[];
    // Several cwds can share a basename; merge by full path but label by basename.
    const projects = projectRows.map((r) => ({
      project: projectName(r.cwd),
      cwd: tildify(r.cwd),
      cost: r.cost,
      tok: tok(r),
      sessions: r.sessions,
      lastAt: r.last_at,
    }));

    const heatmap = (
      this.db
        .prepare(
          `SELECT CAST(strftime('%w', ts / 1000, 'unixepoch', 'localtime') AS INTEGER) dow,
                  CAST(strftime('%H', ts / 1000, 'unixepoch', 'localtime') AS INTEGER) hour,
                  COUNT(*) requests, SUM(cost) cost, ${KINDS_SQL}
           FROM usage WHERE day >= ? GROUP BY dow, hour`,
        )
        .all(lo) as any[]
    ).map((r) => ({ dow: r.dow, hour: r.hour, requests: r.requests, cost: r.cost, tok: tok(r) }));

    const tools = this.db
      .prepare('SELECT name, COUNT(*) count FROM tools WHERE day >= ? GROUP BY name ORDER BY count DESC LIMIT 25')
      .all(lo) as any[];

    const c = this.db
      .prepare(
        `SELECT COALESCE(SUM(input), 0) input, COALESCE(SUM(write5m + write1h), 0) write, COALESCE(SUM(read), 0) read,
                COALESCE(SUM(output), 0) output, COALESCE(SUM(savings), 0) savings, COALESCE(SUM(cost), 0) cost,
                COALESCE(SUM(cost_input), 0) c_input, COALESCE(SUM(cost_write), 0) c_write,
                COALESCE(SUM(cost_read), 0) c_read, COALESCE(SUM(cost_output), 0) c_output,
                COUNT(*) requests
         FROM usage WHERE day >= ?`,
      )
      .get(lo) as any;
    const promptable = c.input + c.write + c.read;

    const lines = this.db
      .prepare(
        `SELECT day, SUM(added) added, SUM(removed) removed FROM tools
         WHERE day >= ? AND (added > 0 OR removed > 0) GROUP BY day ORDER BY day`,
      )
      .all(lo) as any[];

    const sess = this.db
      .prepare(
        `SELECT COUNT(*) n, COALESCE(SUM(prompts), 0) prompts FROM sessions WHERE last_at >= ? AND prompts > 0`,
      )
      .get(loMs) as any;
    const toolCalls = (this.db.prepare('SELECT COUNT(*) n FROM tools WHERE day >= ?').get(lo) as any).n;

    const buckets: [string, number][] = [
      ['< 5m', 5],
      ['5–15m', 15],
      ['15–30m', 30],
      ['30m–1h', 60],
      ['1–2h', 120],
      ['2–4h', 240],
      ['4h+', Infinity],
    ];
    const durationsRaw = this.db
      .prepare('SELECT (last_at - started_at) / 60000.0 mins FROM sessions WHERE last_at >= ? AND prompts > 0')
      .all(loMs) as any[];
    const durations = buckets.map(([bucket]) => ({ bucket, count: 0 }));
    for (const { mins } of durationsRaw) {
      const idx = buckets.findIndex(([, max]) => mins < max);
      durations[idx >= 0 ? idx : durations.length - 1].count++;
    }

    return {
      range: { from, to },
      totals: {
        cost: c.cost,
        sessions: sess.n,
        requests: c.requests,
        prompts: sess.prompts,
        toolCalls,
        savings: c.savings,
        tokens: c.input + c.write + c.read + c.output,
        tok: tok(c),
        costByKind: { input: c.c_input, write: c.c_write, read: c.c_read, output: c.c_output },
      },
      daily: [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
      dayModelTokens,
      tokenMix,
      models,
      projects,
      heatmap,
      tools,
      cache: {
        input: c.input,
        write: c.write,
        read: c.read,
        output: c.output,
        savings: c.savings,
        hitRate: promptable ? c.read / promptable : 0,
      },
      lines,
      durations,
    };
  }

  /** Per-cwd rollups used by the Projects page. */
  projectRollups(): Array<{
    cwd: string;
    cost: number;
    tok: { input: number; write: number; read: number; output: number };
    sessions: number;
    prompts: number;
    lastAt: number | null;
    firstAt: number | null;
    daily: Map<string, number>;
    dailyTok: Map<string, { input: number; write: number; read: number; output: number }>;
  }> {
    const rows = this.db
      .prepare(
        `SELECT s.cwd, COUNT(*) sessions, SUM(s.prompts) prompts, MAX(s.last_at) last_at, MIN(s.started_at) first_at,
                COALESCE(SUM(u.cost), 0) cost, COALESCE(SUM(u.input), 0) input, COALESCE(SUM(u.write), 0) write,
                COALESCE(SUM(u.read), 0) read, COALESCE(SUM(u.output), 0) output
         FROM sessions s LEFT JOIN (SELECT session_id, SUM(cost) cost, ${KINDS_SQL} FROM usage GROUP BY session_id) u ON u.session_id = s.id
         WHERE s.cwd IS NOT NULL AND (s.prompts > 0 OR u.cost > 0)
         GROUP BY s.cwd ORDER BY last_at DESC`,
      )
      .all() as any[];
    const since = localDateOf(Date.now() - 13 * 86400000);
    const dailyRows = this.db
      .prepare(
        `SELECT s.cwd, u.day, SUM(u.cost) cost, ${KINDS_SQL_U}
         FROM usage u JOIN sessions s ON s.id = u.session_id
         WHERE u.day >= ? GROUP BY s.cwd, u.day`,
      )
      .all(since) as any[];
    const daily = new Map<string, Map<string, number>>();
    const dailyTok = new Map<string, Map<string, ReturnType<typeof tok>>>();
    for (const r of dailyRows) {
      if (!daily.has(r.cwd)) daily.set(r.cwd, new Map());
      if (!dailyTok.has(r.cwd)) dailyTok.set(r.cwd, new Map());
      daily.get(r.cwd)!.set(r.day, r.cost);
      dailyTok.get(r.cwd)!.set(r.day, tok(r));
    }
    return rows.map((r) => ({
      cwd: r.cwd,
      cost: r.cost,
      tok: tok(r),
      sessions: r.sessions,
      prompts: r.prompts,
      lastAt: r.last_at,
      firstAt: r.first_at,
      daily: daily.get(r.cwd) ?? new Map(),
      dailyTok: dailyTok.get(r.cwd) ?? new Map(),
    }));
  }

  toolUsage(prefix: string): { name: string; detail: string | null; count: number; lastAt: number }[] {
    return this.db
      .prepare(
        `SELECT name, detail, COUNT(*) count, MAX(ts) lastAt FROM tools WHERE name LIKE ? ESCAPE '\\' GROUP BY name, detail`,
      )
      .all(prefix) as any[];
  }

  transcriptFile(sessionId: string, agentId: string | null): string | null {
    const row = (
      agentId
        ? this.db.prepare('SELECT path FROM files WHERE session_id = ? AND agent_id = ?').get(sessionId, agentId)
        : this.db.prepare('SELECT path FROM files WHERE session_id = ? AND agent_id IS NULL').get(sessionId)
    ) as { path: string } | undefined;
    return row?.path ?? null;
  }

}

function modelRow(r: any): ModelRow {
  return {
    model: r.model,
    cost: r.cost,
    requests: r.requests,
    tokens: { input: r.input, output: r.output, write: r.write, read: r.read },
  };
}
