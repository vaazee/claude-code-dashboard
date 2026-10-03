# Architecture

This document explains how ccdash works end to end: what it reads, how it turns raw Claude Code files into a live dashboard, which technologies it uses, and why each decision was made. For setup and usage see [README.md](README.md); for contributor guardrails see [CLAUDE.md](CLAUDE.md).

---

## 1. Goals and constraints

ccdash answers a handful of questions about Claude Code on one laptop: what's running right now, what each session was about, what it cost, and which skills, plugins, MCP servers and config are installed. Six constraints shaped every decision below:

| Constraint | Consequence |
|---|---|
| **Zero setup.** It must work on an existing install, with no hooks, wrappers or agents to register. | Everything comes from files Claude Code already writes under `~/.claude` and `~/.claude.json`. |
| **Read-only.** A dashboard must never be able to corrupt Claude Code's state. | The server never writes under `~/.claude`. Its own state lives in `~/.ccdash/`. |
| **Private.** Transcripts contain source code, prompts and sometimes secrets. | It runs only on 127.0.0.1, uses no external services and no telemetry, and masks secrets before config leaves the server. |
| **Live.** Running sessions should update within about a second. | File watching plus server-sent events, not page refreshes. |
| **Fast over large history.** Hundreds of MB of JSONL keep growing. | Incremental parsing into a SQLite cache. Each byte is parsed once. |
| **Trustworthy numbers.** Cost must agree with the existing `usage-cost` skill. | One pricing table, ported from that skill and checked against it to the cent. |

---

## 2. System overview

```
                    ┌──────────────────────────── ~/.claude ────────────────────────────┐
                    │ projects/<slug>/<session>.jsonl         transcripts (append-only)  │
                    │ projects/<slug>/<session>/subagents/    subagent transcripts       │
                    │ projects/<slug>/memory/*.md             per-project memory         │
                    │ sessions/<pid>.json                     live process registry      │
                    │ skills/, plugins/, settings.json, hooks/, history.jsonl, …         │
                    └───────────────┬───────────────────────────────┬────────────────────┘
                                    │ fs.watch + 30s rescan          │ fs.watch + 3s poll
                                    ▼                                ▼
┌──────────────────────────── server (Node, Hono) ──────────────────────────────────────────┐
│  ingest/transcripts.ts ──► SQLite cache (~/.ccdash/index.db)      lib/live.ts (pid check) │
│        │ incremental, byte offsets                     │                       │          │
│        └────── "sessions changed" ──┐                  ▼                       │          │
│                                     │          queries.ts (SQL) ◄──────────────┘          │
│  collectors/ (skills, plugins, MCP, config, history, projects: read on demand)            │
│                                     │                  │                                  │
│                         SSE /api/events         REST /api/*        lib/redact.ts          │
└─────────────────────────────────────┼──────────────────┼──────────────────────────────────┘
                                      ▼                  ▼
┌──────────────────────────── web (React SPA, served from web/dist) ────────────────────────┐
│  EventSource ──► TanStack Query invalidation ──► refetch only the affected queries        │
│  TanStack Router pages: Overview · Sessions · Session detail · Analytics · Projects ·     │
│                         Skills & plugins · Config & memory · Prompt history               │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

A single Node process does everything: it watches files, keeps the cache current, answers the API, pushes events, and serves the built SPA. The browser holds no state of its own beyond the appearance preference and saved session views in `localStorage`.

---

## 3. Tech stack and why

| Layer | Choice | Why this, and what it replaced |
|---|---|---|
| Language | **TypeScript everywhere** | One language for server, client and the shared API contract (`shared/types.ts`), so a field renamed on the server is a compile error in the UI. |
| Runtime | **Node ≥ 22.18, run with native type stripping** | Node runs `.ts` directly, so there's no build step, no `tsx` or `ts-node`, and no source maps for the server. The cost is that only erasable TypeScript is allowed (no enums or namespaces), enforced by `erasableSyntaxOnly`. |
| HTTP | **Hono** on `@hono/node-server` | Tiny, typed, with first-class streaming (`streamSSE`) and static serving. Express would have worked but brings more weight and weaker typing. |
| Storage | **`node:sqlite`** (built in) | SQL is the right tool for the analytics (group by day, model, project, hour and weekday). Being built in means no native module to compile; the alternative, `better-sqlite3`, needs prebuilt binaries for each Node version. |
| File watching | **`fs.watch({ recursive: true })`** plus periodic rescans | Recursive watch is native on macOS (FSEvents), so no `chokidar` dependency. Watchers can miss events, so a cheap stat-only rescan runs every 30 seconds as a safety net. |
| Push | **Server-sent events** | One-way server → client is all that's needed. SSE is plain HTTP, reconnects on its own, and works through the Vite dev proxy. WebSockets would add a protocol and a library for no gain. |
| UI | **React 19 + Vite** | Fast dev server with HMR, and a static bundle the Node server can serve. |
| Routing | **TanStack Router** (code-based routes) | Type-safe params and search params (`/sessions/$id`, `?q=`), with no file-based codegen step. |
| Data | **TanStack Query** | Caching, deduplication and background refetch, plus precise invalidation by query key, which is how SSE events turn into minimal refetches. |
| Styling | **Tailwind v4** with CSS-variable design tokens | Utility classes for speed. Theming is done purely by swapping CSS variables, so a theme change doesn't re-render React. |
| Primitives | **Radix** (Dialog, Popover, Tooltip), **cmdk**, **sonner**, **lucide-react** | Accessible, unstyled building blocks: focus traps, ARIA and keyboard handling come for free. |
| Charts | **Recharts** for cartesian charts; custom SVG for the heatmap, sparklines and orbit | Recharts covers bars and areas well. The bespoke pieces are small and need exact control. |
| Motion | **motion** (Framer Motion), CSS keyframes and SVG `animateMotion` | Entrance transitions use `motion`; ambient animation (rings, orbits, twinkles) uses CSS and SVG so it costs nothing in React. |

**Rejected alternatives:**
- **Next.js:** too much framework for a single-user local tool, and server components add little when one Node process already holds all the state.
- **Python/FastAPI:** would have reused `usage_cost.py` directly, but at the cost of two languages and a split type contract.
- **Hooks or OpenTelemetry:** both need per-machine setup and only capture sessions from after they were installed. The transcripts already hold the full history.

---

## 4. Repository layout

```
shared/                  code imported by both server and web
  pricing.ts             price table + cost math (port of the usage-cost skill)
  types.ts               API response types (the contract)
server/
  src/index.ts           startup, watchers, refresh loops, HTTP routes, SSE
  src/paths.ts           where ~/.claude, ~/.claude.json and ~/.ccdash live (env-overridable)
  src/db.ts              SQLite schema + version-gated rebuild
  src/ingest/parse.ts    pure helpers: what counts as a prompt, tool summaries, activity phrases
  src/ingest/transcripts.ts  incremental transcript ingest into SQLite
  src/queries.ts         SQL behind overview, sessions, detail, analytics, projects
  src/collectors/        inventory.ts (skills, plugins, MCP), config.ts (settings, hooks, CLAUDE.md, memory, history, projects)
  src/lib/               live.ts, transcript.ts (on-demand reader), redact.ts, open.ts, fsx.ts
  test/                  node:test suites
web/
  src/main.tsx           providers, routes
  src/lib/               api.ts (queries + SSE), themes.ts, colors.ts, format.ts
  src/components/        shell, live lanes, charts, transcript viewer, avatars, art, appearance menu, ui primitives
  src/sections/          one file per page, plus nav.ts
bin/ccdash               start | stop | restart | open | status | logs
```

---

## 5. Data sources

| Source | Format | What ccdash uses it for |
|---|---|---|
| `~/.claude/projects/<slug>/<session>.jsonl` | Append-only JSONL, one record per line | Prompts, assistant messages with token `usage`, tool calls, titles (`ai-title`, `custom-title`), `cost-state`, cwd, git branch, version |
| `…/<session>/subagents/agent-<id>.jsonl` and `.meta.json` | JSONL plus a small JSON file | Subagent usage and tools; agent type and description |
| `~/.claude/sessions/<pid>.json` | One JSON file per running process | Live registry: pid, sessionId, cwd, `status` (busy or idle), startedAt, procStart |
| `~/.claude.json` | JSON | MCP servers (user and per project), `skillUsage` counters, startup count, known project paths |
| `~/.claude/settings.json` (+ `.local`), `keybindings.json`, `hooks/*`, status line script | JSON and shell | Config page (masked) |
| `~/.claude/skills/*/SKILL.md`, plugin install paths, `installed_plugins.json`, `known_marketplaces.json` | Markdown frontmatter and JSON | Skills, commands, agents, plugins, marketplaces |
| `<project>/CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.mcp.json`, `.claude/settings*.json` | Markdown and JSON | Per-project context shown on the Projects and Config pages |
| `~/.claude/projects/<slug>/memory/*.md` | Markdown | Memory browser |
| `~/.claude/history.jsonl` | JSONL | Prompt history search |

The project slug is the cwd with every non-alphanumeric character replaced by `-`. ccdash maps slugs back to real paths through the cwd recorded in each session's transcript.

---

## 6. Server

### 6.1 Startup

1. `openDb()` opens `~/.ccdash/index.db`. If the stored `SCHEMA_VERSION` differs from the code's, it deletes the file and starts fresh (see §6.3).
2. `TranscriptIndex.scanAll()` brings the cache up to date. A cold start over about 170 sessions (~200 MB) takes roughly 0.4 s; a warm start that finds nothing changed takes a few milliseconds.
3. `readLive()` loads the live-process registry.
4. Watchers and refresh loops start (§6.6), then Hono starts listening on `127.0.0.1:4321`.

### 6.2 Incremental transcript ingest

Transcripts are append-only, which makes it cheap to keep up with them. The `files` table stores `(path, size, mtime, offset)` for each transcript:

```
ingest(file):
  stat file; if size and mtime are unchanged → nothing to do
  if size < stored offset → the file was rewritten: rebuild the session (§6.4)
  read bytes [offset, size), keep only up to the last '\n'   ← a half-written line waits for the next pass
  in one transaction: parse each line, write rows, advance offset
```

Each line is parsed with `JSON.parse` in a `try`, and unknown record types are skipped. The transcript format changes between Claude Code versions, so every field access is optional and nothing throws on an unexpected shape. This replaced the plan to use `zod`: a schema would reject records that are merely new, while defensive access degrades gracefully.

Per record:
- **`assistant` records with `message.usage`** become a `usage` row keyed by `message.id|requestId`. Claude Code writes one record per content block with the same id and usage, so the upsert keeps one row per API request and prefers the one with the most output tokens, exactly like `usage_cost.py`. Cost is computed at insert time from `shared/pricing.ts`, using the **local** date, because Sonnet 5 pricing changes by date. Rows from `<synthetic>` models are ignored.
- **`tool_use` blocks** become `tools` rows. A short `detail` is kept (Bash description, file path, skill name, subagent type) along with lines added and removed for Edit, Write and MultiEdit. These rows drive "current activity", the tool rankings, files touched, skill and MCP usage counts, and the lines-changed chart.
- **User records** pass through `promptOf()`, which separates prompts the person typed (including `/commands`) from meta records, tool results, system reminders and interruptions.
- **Titles, last prompt, cost-state, permission mode, cwd, branch and version** go into a per-session patch, which is upserted with merge rules: first value wins for cwd and first prompt, last value wins for titles and branch, and the min or max is kept for start and end times.

### 6.3 SQLite schema

| Table | Key | Purpose |
|---|---|---|
| `files` | path | Ingest progress: size, mtime and byte offset per transcript |
| `sessions` | id | One row per session: metadata, titles, first and last prompt, times, prompt count, `resumed_from` |
| `usage` | `message.id\|requestId` | Deduplicated, priced API requests: tokens by kind, cost, cache savings, local `day` |
| `tools` | tool_use id | Every tool call with a short detail and line counts |
| `prompts` | record uuid | Deduplicated prompts (see §6.4) |
| `agents` | agent id | Subagents: type, description and file |
| `meta` | key | Schema version |

**The cache is rebuilt, never migrated.** It's a derived cache over files that remain the source of truth, so the simplest correct way to change the schema or the parser's output is to bump `SCHEMA_VERSION`. The next start deletes the database and re-ingests everything in under a second. This removes a whole category of migration bugs.

### 6.4 Resumed sessions and rebuilds

When you resume a conversation, Claude Code writes a **new** session file that begins with a copy of the earlier records, and each copied record keeps its original `sessionId`. Crediting rows to the file's session would double the history or move it to the newest session. Instead:
- Every record is credited to the `sessionId` it carries. The new file's first foreign `sessionId` is stored as `sessions.resumed_from`.
- `usage` and `tools` are idempotent by key, so reading the same record from two files changes nothing.
- Prompts are additive counts, so they live in their own table keyed by record `uuid`, and `sessions.prompts` is recomputed as a `COUNT(*)`.
- The UI shows the chain both ways ("Continues …" and "Resumed later as …"), with the spend before resuming, so nothing is double counted.

**Rebuilds.** If a transcript shrinks (it was rewritten), the session's rows are deleted. Then **every file that credited rows to it** is re-read from offset 0: its own files, its subagents, and resumed copies in other sessions' files. This list comes from `usage.file`, `tools.file` and `prompts.file`. Re-reading is safe because every write is an idempotent upsert. Subagent rows are upserted on every read, so they're always restored. `server/test/rebuild.test.ts` and `server/test/resume.test.ts` cover these cases.

### 6.5 Live sessions

`~/.claude/sessions/<pid>.json` is Claude Code's own registry of running processes, with `status: busy | idle`. On its own it isn't enough, because a crashed process leaves its file behind and pids get reused. `lib/live.ts`:
1. Checks the pid is alive with `process.kill(pid, 0)`. `EPERM` still counts as alive.
2. Confirms the process is the same one by comparing `ps -o lstart=` against the recorded `procStart`. Claude Code writes that time in UTC and `ps` prints local time, so both readings are accepted within 2 seconds. Each pid is checked once and cached.
3. Derives "current activity" from that session's latest `tools` row, phrased by `activityPhrase()`: "Editing foo.ts", "Running npm test", "spotify · SpotifySearch".

The UI shows **Working** (busy) or **Waiting for you** (idle), with uptime from `startedAt` and the session's cost so far.

### 6.6 Watching, refresh and push

| Trigger | Action | Event pushed |
|---|---|---|
| `fs.watch` on `projects/` (recursive), debounced 250 ms per file | `ingest(file)` | `{type:'sessions', ids:[…]}` |
| `fs.watch` on `sessions/`, debounced 150 ms | `readLive()`; push only if the result changed | `{type:'live'}` |
| Every 3 s | `readLive()` again, because a dead process doesn't touch its file | `{type:'live'}` if changed |
| Every 30 s | `scanAll()`, a stat-only pass that catches missed watcher events and late subagent metadata | `{type:'sessions'}` if anything changed |

`/api/events` is an SSE stream with a 20-second ping. The client (`useLiveEvents` in `web/src/lib/api.ts`) maps each event to TanStack Query keys, batches them for 400 ms, and invalidates only those keys:

- `live` invalidates overview, live, sessions and projects.
- `sessions` invalidates overview, sessions, analytics, projects, and the affected session's detail and transcript.

So a session working in another terminal updates its lane and that session's page without refetching everything else. Queries also refetch every 60 s and on window focus, in case the event stream drops.

### 6.7 HTTP API

| Method and path | Returns |
|---|---|
| `GET /api/overview` | KPIs (today, yesterday, week, month, all time), 30-day series, live sessions, recent sessions, user name |
| `GET /api/live` | Live sessions as `SessionSummary[]` |
| `GET /api/sessions` | All sessions with any prompts or usage, as summaries (filtering is client-side) |
| `GET /api/sessions/:id` | Detail: cost by model, tools, files touched, subagents, request timeline |
| `GET /api/sessions/:id/transcript[?agent=]` | Render-ready transcript items (§6.8) |
| `GET /api/analytics?days=7\|30\|90\|365\|all` | Daily spend by model, models, projects, heatmap, tools, cache, lines, duration buckets |
| `GET /api/projects` | Per-cwd rollups plus CLAUDE.md, memory and MCP indicators |
| `GET /api/inventory` | Skills, commands and agents; plugins; marketplaces; MCP servers with call counts |
| `GET /api/config` | Facts, masked settings files, hooks, CLAUDE.md files, memory, scripts |
| `GET /api/history?q=&limit=` | Prompt history search |
| `GET /api/env` | Platform and terminal name (for button labels) |
| `POST /api/actions/open` | `{sessionId, target: folder\|editor\|terminal}` |
| `POST /api/actions/kill` | `{pid}`: SIGTERM, only for pids in the live registry |
| `GET /api/events` | SSE stream |

Session lists and analytics come from the SQLite cache. Inventory, config, projects and history are **read from disk on every request**. Those files are small and change rarely, so reading them on demand is simpler and never stale, and caching wouldn't make a noticeable difference.

### 6.8 Transcript reader

Transcripts are **not** copied into SQLite. The detail page reads the JSONL file on demand (`lib/transcript.ts`) and turns it into typed items: `prompt`, `text`, `thinking`, `tool` (with its result paired up by `tool_use_id` and a link to its subagent through `toolUseResult.agentId`), `system`, and `turn` (the cost and tokens of each prompt's answer). Storing the full text would roughly double disk use and add a write path for data that's only read one session at a time. Size limits keep the browser responsive:

- Files over 64 MB are read from the tail.
- Tool results are cut to 12k characters.
- Prompt, reply and thinking text is cut to 60k characters.
- The viewer renders 400 items at a time, with `content-visibility: auto`.

### 6.9 Security model

The server holds the most sensitive data on the machine, and any web page you visit can send requests to `localhost`. The defenses:

| Threat | Defense |
|---|---|
| Access from the network | Listens on `127.0.0.1` only |
| **DNS rebinding** (a malicious site pointing its own domain at 127.0.0.1 to read the API) | Every request must carry a `Host` of `localhost`, `127.0.0.1` or `[::1]`; anything else gets 403 |
| **CSRF** (a malicious page POSTing to an action) | Every request other than GET must carry the `x-ccdash: 1` header. A cross-site page can't set custom headers without a CORS preflight, and the server never allows one. |
| Path injection through actions | Actions take a **session id**; the directory comes from the cache, never from the request |
| Killing arbitrary processes | `kill` only accepts pids currently in the live registry. `bin/ccdash` confirms a pid is really a ccdash server before signalling it. |
| Secrets in config shown in the UI | `lib/redact.ts` masks secret-named keys and whole `env` blocks; known token formats (`sk-…`, `ghp_…`, `xox…`, AWS keys, JWTs, long hex); `KEY=value`, `--token value` and `?api_key=` forms; URL passwords; `Bearer` tokens. MCP URLs have every query value masked. |

Masking works on patterns, so it's best-effort. That's why config is shown read-only and only to localhost.

### 6.10 Cross-platform actions

`lib/open.ts` chooses how to open a folder for each platform:

| Target | macOS | Windows | Linux |
|---|---|---|---|
| Terminal | cmux if installed (`cmux <dir>`), else Terminal | cmux, else Windows Terminal, else `cmd` | cmux, else the first terminal found (x-terminal-emulator, gnome-terminal, konsole, kitty, …) |
| Folder | `open` | `explorer` | `xdg-open` |
| Editor | `code`, else VS Code via `open -a` | `code` | `code` |

`/api/env` reports which terminal will be used, so the button reads "Open in cmux" or "Open in Terminal". Setting `CCDASH_CMUX=off` forces the system terminal.

---

## 7. Cost model

- **Prices:** `shared/pricing.ts` is a direct port of the `usage-cost` skill: per-model input, 5-minute cache write, 1-hour cache write, cache read and output rates per million tokens. A model id without its own entry falls back to the longest matching prefix, so `claude-haiku-4-5-20251001` is priced as `claude-haiku-4-5`. Sonnet 5's introductory pricing switches to standard rates by local date. Fast mode uses premium rates where they're defined.
- **Cache writes** use the per-request 5m and 1h breakdown when it's present, and are treated as 5-minute writes when it isn't.
- **Cache savings** are `cache_read × (input price − read price)`: what caching saved compared with paying the full input price.
- **Parity:** daily totals from top-level transcripts (`usage WHERE agent_id IS NULL`) match `python3 ~/.claude/skills/usage-cost/scripts/usage_cost.py --all --json` to the cent. ccdash also counts subagent usage, which the Python script doesn't read.
- **Meaning:** these are API-equivalent prices. On a Pro or Max plan they show the value used, not a bill. Claude Code's own `cost-state.totalCostUSD` is kept as a cross-check and shown when it differs by more than 2%.

---

## 8. Web app

### 8.1 Structure

- `main.tsx` builds the route tree in code (TanStack Router) and wraps it in the providers: `QueryClient`, the appearance context (themes) with `MotionConfig`, and the tooltip provider.
- `components/shell.tsx` holds the sidebar, a sticky top bar (breadcrumbs, search, live pill, Appearance menu) and the **⌘K palette** (cmdk), which searches pages, sessions, resume commands, projects and skills.
- `sections/*` has one component per page. `sections/nav.ts` is the list the sidebar, mobile nav and palette are built from.
- `lib/api.ts` has one `useQuery` hook per endpoint, plus `useLiveEvents()` (§6.6) and `post()`, which adds the CSRF header.

### 8.2 Theming

Themes are data, not CSS files. Each entry in `lib/themes.ts` defines surfaces, three ink levels and **three hues**: `signal` (primary), `accent2` (a contrasting partner) and `accent3` (small highlights). Applying a theme writes those values as CSS variables on `<html>`. Tailwind's `@theme inline` maps the variables to utilities (`bg-surface`, `text-ink-2`, `text-signal`, `bg-accent2`, …), so components never hard-code colors and switching themes doesn't re-render React.

- The resolved theme is also saved to `localStorage['ccdash-paint']`. An inline script in `index.html` applies it **before first paint**, so there's no flash of the wrong theme.
- Appearance options: click a theme to apply it; turn on "Match macOS light and dark" to use separate light and dark picks; turn animations off. Turning animations off and the OS reduced-motion setting both stop all ambient animation (CSS, SVG and `motion`).

### 8.3 Color for data

Chart colors follow the dataviz skill's rules and are kept separate from theme colors:
- **Categorical series** (`--s1…--s8`) and **status** colors (`--good`, `--warning`, `--critical`) come from the light or dark **base**, not the theme. They're a palette validated for colorblind separation, so a theme can't break it.
- **Color follows the entity:** each model has a fixed slot (`lib/colors.ts`), and each project uses its avatar hue (`nameColor`), so the same thing looks the same on every page and filtering never repaints survivors.
- **Sequential** encodings (the heatmap) use one hue, the theme's `accent2`, mixed toward the surface in steps.
- Status is never color alone: Working and Waiting each come with an icon and a label.

### 8.4 Visual language

- **Orbit hero:** each live session is a planet around a sun. Working sessions travel their ring (`animateMotion`), waiting ones hold still with an amber pulse, and planet size grows with spend.
- **Live lanes:** a status ring (an orbiting arc while busy, a breathing halo while idle), a ticking uptime clock and the current activity.
- **Avatars:** keyword-matched emoji (🎵 music, 🚌 commute, 🎧 Spotify, …) on a gradient derived from a hash of the name, so the same project always looks the same.
- **Type:** Bricolage Grotesque for display, Schibsted Grotesk for UI, JetBrains Mono for code and paths, with tabular figures for numbers.

The intent is one memorable element per screen (the orbit and live lanes) with calm, consistent panels around it.

---

## 9. The `ccdash` CLI

`bin/ccdash` is a POSIX shell script, symlinked onto `PATH`:

- **`start`** rebuilds the web bundle only if `web/src`, `shared/` or `index.html` is newer than `web/dist`. It then starts `node server/src/index.ts` with `nohup`, records the pid in `~/.ccdash/server.pid`, and waits until `/api/overview` answers before reporting success. If startup fails, it prints the end of the log.
- **`stop`** sends SIGTERM and waits, then sends SIGKILL only if the pid is still a ccdash server.
- **`open`** starts the server if needed, then opens the browser (`open` on macOS, `xdg-open` elsewhere).
- **`status`**, **`logs`** and **`restart`** do what their names say.

A pid is trusted only after checking that its command line is `server/src/index.ts`, so a stale pid file can never cause an unrelated process to be killed. If the pid file is missing, the script finds a server that holds the port and was started another way (for example by `npm run dev`).

---

## 10. Testing and verification

- **Unit and integration tests** (`node --test`, no framework):
  - `pricing.test.ts`: prefix matching, date-based pricing, fast mode, cache-write math.
  - `parse.test.ts`: prompt detection, slash commands, tool summaries and line counts, MCP name parsing.
  - `redact.test.ts`: key, value, flag, URL and Bearer masking, and prose left alone.
  - `resume.test.ts` and `rebuild.test.ts`: end-to-end ingest over a temporary `~/.claude` (env-overridable paths), covering resumed sessions, rebuilds, subagent restoration and late metadata.
- **Cost parity:** compare against `usage_cost.py` day by day (see CLAUDE.md for the query).
- **UI:** screenshots from headless Chrome over the DevTools protocol, in each theme, at desktop and phone width, with a check for horizontal overflow and console errors.

---

## 11. Performance

| Operation | Typical cost |
|---|---|
| Cold index of about 170 sessions (~200 MB JSONL) | ~0.4 s |
| Warm start or rescan with nothing changed | a few ms (stat calls only) |
| Appending to a live transcript | parse only the new bytes, one transaction |
| `/api/sessions` (all sessions) | ~5 ms |
| `/api/analytics` | ~15–20 ms |
| `/api/config` (reads many files) | ~130 ms |

The design scales with *new* bytes, not total history. The main thing that could grow is `/api/sessions`, which returns every session for client-side filtering. Past several thousand sessions it should move to server-side paging and filtering.

---

## 12. Known limitations and future directions

- **Format coupling:** ccdash depends on undocumented Claude Code file formats. Parsing degrades gracefully, but a renamed field silently drops a metric until the parser is updated.
- **Pricing table:** new models without an entry fall back by prefix, or show $0 if nothing matches. Update `shared/pricing.ts` and the skill together.
- **Live status** is only as detailed as Claude Code's registry: busy or idle. There's no "waiting for permission" state.
- **Masking** is based on patterns, so it's best-effort.
- **Single machine:** there's no sync between laptops. The cache could be shared, but transcripts are local by design.
- **Possible extensions:**
  - Server-side paging for very large histories.
  - Desktop notifications when a session goes idle (the SSE stream already carries the signal).
  - Budgets and alerts per project.
  - LLM-written summaries of sessions, stored alongside `ai-title`.

---

## 13. Adding a feature

1. Data: add a collector under `server/src/collectors/`, or SQL in `queries.ts` if it can come from the cache. If it needs new ingested fields, extend `ingest/` and bump `SCHEMA_VERSION`.
2. Contract: add the response type to `shared/types.ts`.
3. Route: expose it in `server/src/index.ts`. If it changes as sessions change, invalidate its query key in `useLiveEvents`.
4. UI: add a hook in `web/src/lib/api.ts`, a page in `web/src/sections/`, a route in `main.tsx` and an entry in `sections/nav.ts`. Use theme tokens for chrome and the data palette for charts.
5. Verify: run `npm test` and `npm run typecheck`, check cost parity if cost is involved, and take screenshots in a light and a dark theme.
