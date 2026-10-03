// Pure helpers for interpreting Claude Code transcript records.
// The transcript schema shifts between CC versions, so everything here is defensive.

export type Prompt = { text: string; command: boolean };

const NOISE_PREFIXES = [
  '<local-command-',
  '<system-reminder',
  '<bash-input',
  '<bash-stdout',
  '<bash-stderr',
  '<task-notification',
  '<user-prompt-submit-hook',
  '[Request interrupted',
  'Caveat:',
];

/** Text the human typed, or null for meta/tool-result/system records. */
export function promptOf(rec: any): Prompt | null {
  if (rec?.type !== 'user' || rec.isMeta || rec.isCompactSummary) return null;
  const c = rec.message?.content;
  let text: string | null = null;
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    if (c.some((b: any) => b?.type === 'tool_result')) return null;
    const parts = c.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? ''));
    text = parts.length ? parts.join('\n') : null;
  }
  if (!text) return null;
  text = text.trim();
  const cmd = text.match(/<command-name>\s*(.*?)\s*<\/command-name>/s);
  if (cmd) {
    const args = text.match(/<command-args>(.*?)<\/command-args>/s)?.[1]?.trim() ?? '';
    const name = cmd[1].startsWith('/') ? cmd[1] : '/' + cmd[1];
    return { text: args ? `${name} ${args}` : name, command: true };
  }
  if (!text || NOISE_PREFIXES.some((p) => text!.startsWith(p))) return null;
  return { text, command: false };
}

const lineCount = (s: unknown) => (typeof s === 'string' && s.length ? s.split('\n').length : 0);
const clip = (s: unknown, n = 240) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : null);

export type ToolInfo = { detail: string | null; added: number; removed: number };

/** A one-line human description of a tool call, plus lines added/removed for edits. */
export function describeTool(name: string, input: any): ToolInfo {
  const i = input ?? {};
  switch (name) {
    case 'Bash':
      return { detail: clip(i.description || i.command), added: 0, removed: 0 };
    case 'Read':
    case 'NotebookRead':
      return { detail: clip(i.file_path ?? i.notebook_path), added: 0, removed: 0 };
    case 'Write':
      return { detail: clip(i.file_path), added: lineCount(i.content), removed: 0 };
    case 'Edit':
      return { detail: clip(i.file_path), added: lineCount(i.new_string), removed: lineCount(i.old_string) };
    case 'MultiEdit': {
      const edits = Array.isArray(i.edits) ? i.edits : [];
      return {
        detail: clip(i.file_path),
        added: edits.reduce((n: number, e: any) => n + lineCount(e?.new_string), 0),
        removed: edits.reduce((n: number, e: any) => n + lineCount(e?.old_string), 0),
      };
    }
    case 'NotebookEdit':
      return { detail: clip(i.notebook_path), added: lineCount(i.new_source), removed: 0 };
    case 'Grep':
    case 'Glob':
      return { detail: clip(i.pattern), added: 0, removed: 0 };
    case 'Skill':
      return { detail: clip(i.skill ?? i.command ?? i.name), added: 0, removed: 0 };
    case 'Agent':
    case 'Task':
      return {
        detail: clip([i.subagent_type, i.description].filter(Boolean).join(': ') || null),
        added: 0,
        removed: 0,
      };
    case 'WebFetch':
      return { detail: clip(i.url), added: 0, removed: 0 };
    case 'WebSearch':
      return { detail: clip(i.query), added: 0, removed: 0 };
    case 'TodoWrite':
      return { detail: Array.isArray(i.todos) ? `${i.todos.length} todos` : null, added: 0, removed: 0 };
    default: {
      const firstString = Object.values(i).find((v) => typeof v === 'string');
      return { detail: clip(firstString), added: 0, removed: 0 };
    }
  }
}

/** Present-tense phrase for "what is this session doing right now". */
export function activityPhrase(name: string, detail: string | null): string {
  const base = (p: string | null) => (p ? p.split('/').pop() : '');
  switch (name) {
    case 'Bash':
      return `Running ${detail ?? 'a command'}`;
    case 'Read':
      return `Reading ${base(detail)}`;
    case 'Write':
      return `Writing ${base(detail)}`;
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editing ${base(detail)}`;
    case 'Grep':
    case 'Glob':
      return `Searching ${detail ?? ''}`.trim();
    case 'Skill':
      return `Using skill ${detail ?? ''}`.trim();
    case 'Agent':
    case 'Task':
      return `Delegating to ${detail ?? 'a subagent'}`;
    case 'WebFetch':
      return `Fetching ${detail ?? ''}`.trim();
    case 'WebSearch':
      return `Searching the web for ${detail ?? ''}`.trim();
    case 'ExitPlanMode':
      return 'Presenting a plan for approval';
    case 'AskUserQuestion':
      return 'Asking you a question';
    case 'TodoWrite':
      return 'Updating the todo list';
    default: {
      const mcp = mcpParts(name);
      if (mcp) return `${mcp.server.replace(/^claude_ai_/, '')} · ${mcp.tool.replace(/_/g, ' ')}`;
      const first = detail?.split('\n')[0]?.slice(0, 100) ?? null;
      return first ? `${name}: ${first}` : name;
    }
  }
}

/** Split an MCP tool name into its server and tool. */
export function mcpParts(name: string): { server: string; tool: string } | null {
  if (!name.startsWith('mcp__')) return null;
  const rest = name.slice(5);
  const idx = rest.lastIndexOf('__');
  if (idx < 0) return { server: rest, tool: '' };
  return { server: rest.slice(0, idx), tool: rest.slice(idx + 2) };
}
