import fs from 'node:fs';
import path from 'node:path';
import type { ConfigBundle, ConfigFile, HistoryEntry, ProjectInfo } from '../../../shared/types.ts';
import { localDateOf } from '../../../shared/pricing.ts';
import { exists, listDir, readJson, readText } from '../lib/fsx.ts';
import { redact, redactString } from '../lib/redact.ts';
import { CLAUDE_DIR, CLAUDE_JSON, PROJECTS_DIR, tildify } from '../paths.ts';
import { projectName, type Queries } from '../queries.ts';
import { knownProjectPaths } from './inventory.ts';

/** Claude Code's project directory slug: every non-alphanumeric char becomes '-'. */
export const slugOf = (p: string) => p.replace(/[^A-Za-z0-9]/g, '-');

function jsonFile(label: string, p: string): ConfigFile | null {
  const d = readJson(p);
  if (d == null) return null;
  return { label, path: tildify(p), language: 'json', content: JSON.stringify(redact(d), null, 2) };
}

function textFile(label: string, p: string, language: ConfigFile['language']): ConfigFile | null {
  const t = readText(p);
  if (t == null) return null;
  return { label, path: tildify(p), language, content: redactString(t) };
}

function claudeMdFor(proj: string): string[] {
  return ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md']
    .map((f) => path.join(proj, f))
    .filter((f) => exists(f));
}

export function buildConfig(q: Queries): ConfigBundle {
  const cj = readJson(CLAUDE_JSON) ?? {};
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const settings = readJson(settingsPath) ?? {};

  const latestVersion = q.sessions().find((s) => s.version)?.version ?? null;
  const transcriptBytes = listDir(PROJECTS_DIR).reduce((n, e) => {
    if (!e.isDirectory()) return n;
    return (
      n +
      listDir(path.join(PROJECTS_DIR, e.name)).reduce((m, f) => {
        if (!f.isFile()) return m;
        try {
          return m + fs.statSync(path.join(PROJECTS_DIR, e.name, f.name)).size;
        } catch {
          return m;
        }
      }, 0)
    );
  }, 0);
  const facts = [
    { label: 'Claude Code version', value: latestVersion ?? '—' },
    { label: 'Install method', value: String(cj.installMethod ?? '—') },
    { label: 'Auto-updates', value: cj.autoUpdates === false ? 'off' : 'on' },
    { label: 'Default model', value: String(settings.model ?? 'default') },
    { label: 'Theme', value: String(settings.theme ?? 'default') },
    { label: 'Startups', value: String(cj.numStartups ?? '—') },
    { label: 'First used', value: cj.firstStartTime ? new Date(cj.firstStartTime).toLocaleDateString() : '—' },
    { label: 'Transcript retention', value: settings.cleanupPeriodDays ? `${settings.cleanupPeriodDays} days` : '30 days (default)' },
    { label: 'Transcripts on disk', value: `${(transcriptBytes / 1024 / 1024).toFixed(1)} MB` },
  ];

  const settingsFiles = [
    jsonFile('User settings', settingsPath),
    jsonFile('User local settings', path.join(CLAUDE_DIR, 'settings.local.json')),
    jsonFile('Keybindings', path.join(CLAUDE_DIR, 'keybindings.json')),
  ].filter(Boolean) as ConfigFile[];
  for (const proj of knownProjectPaths(q)) {
    for (const f of ['settings.json', 'settings.local.json']) {
      const file = jsonFile(`${projectName(proj)} · ${f}`, path.join(proj, '.claude', f));
      if (file) settingsFiles.push(file);
    }
  }

  const hooks: ConfigBundle['hooks'] = [];
  for (const [event, groups] of Object.entries<any>(settings.hooks ?? {})) {
    for (const g of Array.isArray(groups) ? groups : []) {
      for (const h of g?.hooks ?? []) {
        hooks.push({ event, matcher: g.matcher ?? null, command: redactString(String(h.command ?? h.prompt ?? h.type)) });
      }
    }
  }

  const claudeMd: ConfigFile[] = [];
  const globalMd = textFile('Global CLAUDE.md', path.join(CLAUDE_DIR, 'CLAUDE.md'), 'markdown');
  if (globalMd) claudeMd.push(globalMd);
  for (const proj of knownProjectPaths(q)) {
    for (const f of claudeMdFor(proj)) {
      const file = textFile(`${projectName(proj)} · ${path.relative(proj, f)}`, f, 'markdown');
      if (file) claudeMd.push(file);
    }
  }

  // Memory dirs are keyed by project slug; map slugs back to real paths via indexed sessions.
  const slugToCwd = new Map<string, string>();
  for (const r of q.projectRollups()) slugToCwd.set(slugOf(r.cwd), r.cwd);
  const memory: ConfigBundle['memory'] = [];
  for (const e of listDir(PROJECTS_DIR)) {
    if (!e.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, e.name, 'memory');
    const files = listDir(dir)
      .filter((f) => f.isFile() && f.name.endsWith('.md'))
      .map((f) => textFile(f.name, path.join(dir, f.name), 'markdown'))
      .filter(Boolean) as ConfigFile[];
    if (!files.length) continue;
    const cwd = slugToCwd.get(e.name);
    files.sort((a, b) => (a.label === 'MEMORY.md' ? -1 : b.label === 'MEMORY.md' ? 1 : a.label.localeCompare(b.label)));
    memory.push({ project: cwd ? tildify(cwd) : e.name, files });
  }

  const scripts: ConfigFile[] = [];
  const statusCmd: string | undefined = settings.statusLine?.command;
  const statusPath = statusCmd?.split(/\s+/).find((t) => t.startsWith('/') || t.startsWith('~'));
  if (statusPath) {
    const f = textFile('Status line', statusPath.replace(/^~/, process.env.HOME ?? ''), 'shell');
    if (f) scripts.push(f);
  }
  for (const e of listDir(path.join(CLAUDE_DIR, 'hooks'))) {
    if (!e.isFile()) continue;
    const f = textFile(`Hook · ${e.name}`, path.join(CLAUDE_DIR, 'hooks', e.name), e.name.endsWith('.json') ? 'json' : 'shell');
    if (f) scripts.push(f);
  }

  return { facts, settings: settingsFiles, hooks, claudeMd, memory, scripts };
}

export function readHistory(query: string, limit: number): { entries: HistoryEntry[]; total: number } {
  const raw = readText(path.join(CLAUDE_DIR, 'history.jsonl'), 64 * 1024 * 1024) ?? '';
  const needle = query.trim().toLowerCase();
  const all: HistoryEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let d: any;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const text = String(d.display ?? '').trim();
    if (!text) continue;
    if (needle && !text.toLowerCase().includes(needle) && !String(d.project ?? '').toLowerCase().includes(needle)) continue;
    all.push({
      ts: d.timestamp ?? 0,
      text: redactString(text),
      project: projectName(d.project),
      cwd: tildify(d.project),
      sessionId: d.sessionId ?? null,
    });
  }
  all.sort((a, b) => b.ts - a.ts);
  return { entries: all.slice(0, limit), total: all.length };
}

export function buildProjects(q: Queries): ProjectInfo[] {
  const cj = readJson(CLAUDE_JSON) ?? {};
  const liveByCwd = new Map<string, number>();
  for (const l of q.live) liveByCwd.set(l.cwd, (liveByCwd.get(l.cwd) ?? 0) + 1);
  const days = Array.from({ length: 14 }, (_, i) => localDateOf(Date.now() - (13 - i) * 86400000));
  return q.projectRollups().map((r) => {
    const mcp = new Set<string>(Object.keys(cj.projects?.[r.cwd]?.mcpServers ?? {}));
    for (const k of Object.keys(readJson(path.join(r.cwd, '.mcp.json'))?.mcpServers ?? {})) mcp.add(k);
    const memDir = path.join(PROJECTS_DIR, slugOf(r.cwd), 'memory');
    return {
      project: projectName(r.cwd),
      cwd: tildify(r.cwd),
      cwdAbs: r.cwd,
      cost: r.cost,
      sessions: r.sessions,
      prompts: r.prompts,
      lastAt: r.lastAt,
      firstAt: r.firstAt,
      live: liveByCwd.get(r.cwd) ?? 0,
      mcpServers: [...mcp],
      claudeMd: claudeMdFor(r.cwd).map((f) => path.relative(r.cwd, f)),
      memoryFiles: listDir(memDir).filter((f) => f.isFile() && f.name.endsWith('.md')).length,
      tok: r.tok,
      daily: days.map((d) => r.daily.get(d) ?? 0),
      dailyTok: days.map((d) => r.dailyTok.get(d) ?? { input: 0, write: 0, read: 0, output: 0 }),
    };
  });
}
