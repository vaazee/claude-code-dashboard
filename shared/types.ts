// API contract shared by server and web.

export type TokenTotals = { input: number; output: number; write: number; read: number };
/** The four token kinds Anthropic prices separately. */
export type TokenKind = keyof TokenTotals;

export type LiveInfo = {
  pid: number;
  status: string; // 'busy' | 'idle' | other future states
  name: string | null;
  startedAt: number;
  statusUpdatedAt: number | null;
  activity: string | null;
  activityAt: number | null;
  kind: string | null;
};

export type SessionSummary = {
  id: string;
  title: string;
  aiTitle: string | null;
  customTitle: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  project: string;
  cwd: string; // display form (~/...)
  cwdAbs: string;
  gitBranch: string | null;
  version: string | null;
  entrypoint: string | null;
  startedAt: number | null;
  lastAt: number | null;
  prompts: number;
  requests: number;
  cost: number;
  ccCost: number | null;
  tokens: TokenTotals;
  models: string[];
  toolCalls: number;
  linesAdded: number;
  linesRemoved: number;
  subagents: number;
  live: LiveInfo | null;
  /** The session this one was resumed from, and what was spent before resuming (whole chain). */
  resumedFrom: { id: string; title: string; cost: number } | null;
  /** Sessions that later resumed this one. */
  continuedIn: { id: string; title: string }[];
};

export type DailyPoint = { day: string; cost: number; tokens: number; tok: TokenTotals; requests: number };

export type Overview = {
  kpis: {
    today: number;
    yesterday: number;
    week: number;
    month: number;
    allTime: number;
    todayTokens: number;
    todayRequests: number;
    liveCount: number;
    busyCount: number;
    sessionsToday: number;
  };
  daily: DailyPoint[];
  live: SessionSummary[];
  recent: SessionSummary[];
  firstDay: string | null;
  user: string;
};

export type ModelRow = { model: string; cost: number; requests: number; tokens: TokenTotals };

export type SessionDetail = SessionSummary & {
  byModel: ModelRow[];
  tools: { name: string; count: number }[];
  files: { path: string; reads: number; edits: number; added: number; removed: number }[];
  agents: { id: string; type: string | null; description: string | null; cost: number; requests: number }[];
  timeline: { ts: number; cost: number; tok: TokenTotals; output: number; model: string; agentId: string | null }[];
};

export type ToolResult = { text: string; isError: boolean; truncated: boolean };

export type TranscriptItem =
  | { kind: 'prompt'; id: string; ts: number | null; text: string; command: boolean }
  | { kind: 'text'; id: string; ts: number | null; text: string; model: string | null }
  | { kind: 'thinking'; id: string; ts: number | null; text: string }
  | {
      kind: 'tool';
      id: string;
      ts: number | null;
      name: string;
      summary: string | null;
      input: unknown;
      result: ToolResult | null;
      agentId: string | null;
    }
  | { kind: 'system'; id: string; ts: number | null; text: string; level: string | null }
  | { kind: 'turn'; id: string; ts: number | null; cost: number; tokens: TokenTotals; model: string };

export type Transcript = { items: TranscriptItem[]; truncated: boolean };

export type Analytics = {
  range: { from: string | null; to: string };
  totals: {
    cost: number;
    tokens: number;
    tok: TokenTotals;
    /** Cost split by token kind; sums to `cost`. */
    costByKind: TokenTotals;
    sessions: number;
    requests: number;
    prompts: number;
    toolCalls: number;
    savings: number;
  };
  /** Per-day cost (USD) by model, with every day in range present. */
  daily: Array<{ day: string; total: number } & Record<string, number | string>>;
  /** Per-day, per-model tokens by kind (sparse: only days with usage). */
  dayModelTokens: Array<{ day: string; model: string } & TokenTotals>;
  /** Per-day tokens split by kind. */
  tokenMix: { day: string; input: number; write: number; read: number; output: number }[];
  models: ModelRow[];
  projects: { project: string; cwd: string; cost: number; tok: TokenTotals; sessions: number; lastAt: number | null }[];
  heatmap: { dow: number; hour: number; requests: number; cost: number; tok: TokenTotals }[];
  tools: { name: string; count: number }[];
  cache: { input: number; write: number; read: number; output: number; savings: number; hitRate: number };
  lines: { day: string; added: number; removed: number }[];
  durations: { bucket: string; count: number }[];
};

export type ProjectInfo = {
  project: string;
  cwd: string;
  cwdAbs: string;
  cost: number;
  tok: TokenTotals;
  sessions: number;
  prompts: number;
  lastAt: number | null;
  firstAt: number | null;
  live: number;
  mcpServers: string[];
  claudeMd: string[];
  memoryFiles: number;
  daily: number[]; // last 14 days cost
  dailyTok: TokenTotals[]; // last 14 days tokens by kind
};

export type SkillInfo = {
  name: string;
  qualifiedName: string;
  kind: 'skill' | 'command' | 'agent';
  source: 'user' | 'plugin' | 'project' | 'builtin';
  plugin: string | null;
  description: string;
  path: string;
  usageCount: number;
  lastUsedAt: number | null;
  transcriptCalls: number;
};

export type PluginInfo = {
  id: string;
  name: string;
  marketplace: string;
  version: string | null;
  description: string | null;
  enabled: boolean;
  installedAt: string | null;
  lastUpdated: string | null;
  skills: number;
  commands: number;
  agents: number;
  path: string;
};

export type McpServerInfo = {
  name: string;
  scope: string; // user | project:<path> | plugin:<id> | connector
  transport: string | null;
  command: string | null;
  calls: number;
  lastUsedAt: number | null;
  topTools: { tool: string; count: number }[];
};

export type Inventory = {
  skills: SkillInfo[];
  plugins: PluginInfo[];
  marketplaces: { name: string; source: string; lastUpdated: string | null }[];
  mcp: McpServerInfo[];
};

export type ConfigFile = { label: string; path: string; language: 'json' | 'markdown' | 'shell' | 'text'; content: string };

export type ConfigBundle = {
  facts: { label: string; value: string }[];
  settings: ConfigFile[];
  hooks: { event: string; matcher: string | null; command: string }[];
  claudeMd: ConfigFile[];
  memory: { project: string; files: ConfigFile[] }[];
  scripts: ConfigFile[];
};

export type HistoryEntry = { ts: number; text: string; project: string; cwd: string; sessionId: string | null };

export type ServerEvent =
  | { type: 'sessions'; ids: string[] }
  | { type: 'live' }
  | { type: 'inventory' }
  | { type: 'hello'; version: string };
