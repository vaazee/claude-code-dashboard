import path from 'node:path';
import type { Inventory, McpServerInfo, PluginInfo, SkillInfo } from '../../../shared/types.ts';
import { exists, frontmatter, listDir, readJson, readText } from '../lib/fsx.ts';
import { redactString, redactUrl } from '../lib/redact.ts';
import { mcpParts } from '../ingest/parse.ts';
import { CLAUDE_DIR, CLAUDE_JSON, HOME, tildify } from '../paths.ts';
import type { Queries } from '../queries.ts';

type Usage = Record<string, { usageCount?: number; lastUsedAt?: number }>;

/** Skills (dirs with SKILL.md), commands (*.md) and agents (*.md) under a `.claude`-style root. */
function scanRoot(
  root: string,
  source: SkillInfo['source'],
  plugin: string | null,
): Omit<SkillInfo, 'usageCount' | 'lastUsedAt' | 'transcriptCalls'>[] {
  const out: Omit<SkillInfo, 'usageCount' | 'lastUsedAt' | 'transcriptCalls'>[] = [];
  const qualify = (n: string) => (plugin ? `${plugin}:${n}` : n);
  for (const e of listDir(path.join(root, 'skills'))) {
    if (!e.isDirectory()) continue;
    const file = path.join(root, 'skills', e.name, 'SKILL.md');
    const md = readText(file, 64 * 1024);
    if (md == null) continue;
    const fm = frontmatter(md);
    const name = fm.name || e.name;
    out.push({ name, qualifiedName: qualify(name), kind: 'skill', source, plugin, description: fm.description ?? '', path: file });
  }
  for (const [dir, kind] of [
    ['commands', 'command'],
    ['agents', 'agent'],
  ] as const) {
    for (const e of listDir(path.join(root, dir))) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      const file = path.join(root, dir, e.name);
      const fm = frontmatter(readText(file, 64 * 1024) ?? '');
      const name = fm.name || e.name.slice(0, -3);
      out.push({ name, qualifiedName: qualify(name), kind, source, plugin, description: fm.description ?? '', path: file });
    }
  }
  return out;
}

export function knownProjectPaths(q: Queries): string[] {
  const cj = readJson(CLAUDE_JSON) ?? {};
  const paths = new Set<string>(Object.keys(cj.projects ?? {}));
  for (const r of q.projectRollups()) if (r.cwd) paths.add(r.cwd);
  return [...paths].filter((p) => p !== HOME && exists(p)).sort();
}

export function installedPlugins(): { id: string; installPath: string; version: string | null; installedAt: string | null; lastUpdated: string | null }[] {
  const d = readJson(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json')) ?? {};
  const out = [];
  for (const [id, installs] of Object.entries<any>(d.plugins ?? {})) {
    const latest = Array.isArray(installs) ? installs[installs.length - 1] : installs;
    if (!latest?.installPath) continue;
    out.push({
      id,
      installPath: latest.installPath,
      version: latest.version ?? null,
      installedAt: latest.installedAt ?? null,
      lastUpdated: latest.lastUpdated ?? null,
    });
  }
  return out;
}

export function buildInventory(q: Queries): Inventory {
  const cj = readJson(CLAUDE_JSON) ?? {};
  const settings = readJson(path.join(CLAUDE_DIR, 'settings.json')) ?? {};
  const usage: Usage = cj.skillUsage ?? {};
  const enabled: Record<string, boolean> = settings.enabledPlugins ?? {};

  // ---- skills, commands, agents
  const raw = [...scanRoot(CLAUDE_DIR, 'user', null)];
  const plugins: PluginInfo[] = [];
  for (const p of installedPlugins()) {
    const [name, marketplace = ''] = p.id.split('@');
    const items = scanRoot(p.installPath, 'plugin', name);
    raw.push(...items);
    const manifest = readJson(path.join(p.installPath, '.claude-plugin', 'plugin.json')) ?? {};
    plugins.push({
      id: p.id,
      name,
      marketplace,
      version: p.version ?? manifest.version ?? null,
      description: manifest.description ?? null,
      enabled: enabled[p.id] ?? false,
      installedAt: p.installedAt,
      lastUpdated: p.lastUpdated,
      skills: items.filter((i) => i.kind === 'skill').length,
      commands: items.filter((i) => i.kind === 'command').length,
      agents: items.filter((i) => i.kind === 'agent').length,
      path: tildify(p.installPath),
    });
  }
  for (const proj of knownProjectPaths(q)) {
    raw.push(...scanRoot(path.join(proj, '.claude'), 'project', null).map((s) => ({ ...s, plugin: tildify(proj) })));
  }

  const skillCalls = new Map<string, { count: number; lastAt: number }>();
  for (const r of q.toolUsage('Skill')) {
    if (!r.detail) continue;
    const prev = skillCalls.get(r.detail);
    skillCalls.set(r.detail, { count: (prev?.count ?? 0) + r.count, lastAt: Math.max(prev?.lastAt ?? 0, r.lastAt) });
  }
  const agentCalls = new Map<string, { count: number; lastAt: number }>();
  for (const r of [...q.toolUsage('Agent'), ...q.toolUsage('Task')]) {
    const type = r.detail?.split(':')[0];
    if (!type) continue;
    const prev = agentCalls.get(type);
    agentCalls.set(type, { count: (prev?.count ?? 0) + r.count, lastAt: Math.max(prev?.lastAt ?? 0, r.lastAt) });
  }

  // The same skill can exist in several places (e.g. a repo that mirrors ~/.claude/skills).
  // Usage is keyed by name, so credit it once: user first, then plugin, then project copies.
  const seenUsageKeys = new Set<string>();
  const claimed = new Set<string>();
  const skills: SkillInfo[] = raw.map((s) => {
    const claimKey = `${s.kind}:${s.qualifiedName}`;
    const first = !claimed.has(claimKey);
    claimed.add(claimKey);
    const key = !first ? null : usage[s.qualifiedName] ? s.qualifiedName : usage[s.name] && s.source !== 'plugin' ? s.name : null;
    if (key) seenUsageKeys.add(key);
    const calls = !first
      ? undefined
      : s.kind === 'agent'
        ? agentCalls.get(s.qualifiedName) ?? agentCalls.get(s.name)
        : skillCalls.get(s.qualifiedName) ?? (s.source !== 'plugin' ? skillCalls.get(s.name) : undefined);
    const u = key ? usage[key] : undefined;
    return {
      ...s,
      path: tildify(s.path),
      usageCount: u?.usageCount ?? 0,
      lastUsedAt: Math.max(u?.lastUsedAt ?? 0, calls?.lastAt ?? 0) || null,
      transcriptCalls: calls?.count ?? 0,
    };
  });
  // Skills that were used but aren't on disk ship inside Claude Code itself.
  for (const [name, u] of Object.entries(usage)) {
    if (seenUsageKeys.has(name) || skills.some((s) => s.qualifiedName === name)) continue;
    skills.push({
      name,
      qualifiedName: name,
      kind: 'skill',
      source: 'builtin',
      plugin: name.includes(':') ? name.split(':')[0] : null,
      description: '',
      path: '',
      usageCount: u.usageCount ?? 0,
      lastUsedAt: u.lastUsedAt ?? null,
      transcriptCalls: skillCalls.get(name)?.count ?? 0,
    });
  }
  skills.sort((a, b) => b.usageCount + b.transcriptCalls - (a.usageCount + a.transcriptCalls) || a.name.localeCompare(b.name));

  // ---- marketplaces
  const mk = readJson(path.join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json')) ?? {};
  const marketplaces = Object.entries<any>(mk).map(([name, m]) => ({
    name,
    source: m?.source?.repo ?? m?.source?.url ?? m?.source?.path ?? m?.source?.source ?? '',
    lastUpdated: m?.lastUpdated ?? null,
  }));

  return { skills, plugins, marketplaces, mcp: buildMcp(q, cj) };
}

function buildMcp(q: Queries, cj: any): McpServerInfo[] {
  const servers = new Map<string, McpServerInfo>();
  const add = (name: string, scope: string, cfg: any) => {
    if (servers.has(name)) return;
    const command = cfg?.command
      ? redactString([cfg.command, ...(cfg.args ?? [])].join(' '))
      : typeof cfg?.url === 'string'
        ? redactUrl(cfg.url)
        : null;
    servers.set(name, {
      name,
      scope,
      transport: cfg?.type ?? (cfg?.url ? 'http' : cfg?.command ? 'stdio' : null),
      command: command && command.length > 200 ? command.slice(0, 200) + '…' : command,
      calls: 0,
      lastUsedAt: null,
      topTools: [],
    });
  };
  for (const [name, cfg] of Object.entries<any>(cj.mcpServers ?? {})) add(name, 'user', cfg);
  for (const [proj, pcfg] of Object.entries<any>(cj.projects ?? {})) {
    for (const [name, cfg] of Object.entries<any>(pcfg?.mcpServers ?? {})) add(name, `project:${tildify(proj)}`, cfg);
  }
  for (const proj of knownProjectPaths(q)) {
    const mj = readJson(path.join(proj, '.mcp.json'));
    for (const [name, cfg] of Object.entries<any>(mj?.mcpServers ?? {})) add(name, `project:${tildify(proj)}`, cfg);
  }
  for (const p of installedPlugins()) {
    const pluginName = p.id.split('@')[0];
    const mj = readJson(path.join(p.installPath, '.mcp.json'));
    for (const [name, cfg] of Object.entries<any>(mj?.mcpServers ?? mj ?? {})) {
      if (cfg && typeof cfg === 'object') add(`plugin_${pluginName}_${name}`, `plugin:${pluginName}`, cfg);
    }
  }

  const tools = new Map<string, Map<string, number>>();
  for (const r of q.toolUsage('mcp\\_\\_%')) {
    const parts = mcpParts(r.name);
    if (!parts) continue;
    if (!servers.has(parts.server)) {
      const scope = parts.server.startsWith('claude_ai_')
        ? 'connector'
        : parts.server.startsWith('plugin_')
          ? `plugin:${parts.server.split('_')[1]}`
          : 'session';
      add(parts.server, scope, null);
    }
    const s = servers.get(parts.server)!;
    s.calls += r.count;
    s.lastUsedAt = Math.max(s.lastUsedAt ?? 0, r.lastAt);
    if (!tools.has(parts.server)) tools.set(parts.server, new Map());
    const t = tools.get(parts.server)!;
    t.set(parts.tool, (t.get(parts.tool) ?? 0) + r.count);
  }
  for (const [server, t] of tools) {
    servers.get(server)!.topTools = [...t.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }
  return [...servers.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
}
