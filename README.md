# ccdash: a local Claude Code dashboard

A web dashboard that runs on your laptop. It shows every Claude Code session that is running right now, the full history of past sessions, what each one cost, and what it was about. It also lists the skills, plugins, MCP servers, config and memory installed on this machine.

It only reads what Claude Code already writes to `~/.claude`. There are no hooks to install and nothing gets sent anywhere.

## Run it

Install once, and put the `ccdash` command on your PATH:

```sh
npm install
ln -s "$PWD/bin/ccdash" ~/.local/bin/ccdash     # any directory on your PATH works
```

Then, from anywhere:

| Command | What it does |
|---|---|
| `ccdash start` | Starts the server in the background on http://localhost:4321. It rebuilds the web app first if the sources changed. |
| `ccdash stop` | Stops the server. |
| `ccdash restart` | Stops the server, then starts it again. |
| `ccdash open` | Opens the dashboard in your browser, starting the server first if it isn't running. |
| `ccdash status` | Reports whether the server is running, with its pid and uptime. Exits with 3 when it's stopped. |
| `ccdash logs` | Follows the server log at `~/.ccdash/server.log`. |

The server's pid is kept in `~/.ccdash/server.pid`.

Development, with hot reload on both sides:

```sh
npm run dev          # API on :4321 (node --watch), Vite on http://localhost:5173
npm test             # pricing, transcript parsing and redaction tests
npm run typecheck
```

You need Node 22.18 or newer. The server runs TypeScript directly through Node's type stripping and uses the built-in `node:sqlite`, so it has no native dependencies.

## What you get

| Page | What it shows |
|---|---|
| Overview | Live sessions as lanes, each with a status ring (Working, or Waiting for you), a ticking uptime clock, the current activity and cost so far. Also spend for today, the week and the month, a 30-day chart and recent sessions. |
| Sessions | Every session with search, project and time filters, sorting and saved views. |
| Session detail | Readable transcript with prompts, replies, collapsible tool calls, edit diffs, thinking, per-turn cost and subagent threads. Also the cost curve, models, tools, files touched and lines changed. Actions: copy the resume command, open the folder in Finder, VS Code or Terminal, and stop a live session (asks first). |
| Analytics | Daily spend by model; spend by model and by project; a weekday × hour heatmap; top tools; cache savings; lines written; how long sessions last. |
| Projects | Every folder you've used Claude Code in, with spend, a 14-day sparkline, CLAUDE.md files, memory files and MCP servers. |
| Skills & plugins | User, plugin, project and built-in skills, commands and agents, with use counts. Also plugins, marketplaces and MCP servers with call counts. |
| Config & memory | Settings, hooks, the status line script, CLAUDE.md files and per-project memory, with secrets masked. |
| Prompt history | Full-text search over everything you've typed. |

Press ⌘K anywhere to jump to a session, project, skill or page, or to copy a resume command.

**Appearance.** Use the palette button in the top bar and click a theme to apply it. There are seven: Midnight, Aurora, Ember and Nebula are dark; Daylight, Glacier and Orchid are light. Each theme has three hues: a main accent, a contrasting partner used for the hero, heatmap and cost curves, and a third for small highlights. Turn on **Match macOS light and dark** to switch themes with your Mac, choosing one theme for each mode. You can also turn animations off. Your choice is saved in the browser and applied before the page first paints. Chart and status colors stay on a colorblind-safe palette in every theme. Themes live in `web/src/lib/themes.ts`; to add one, append an entry with its surface, ink and three accent colors (`signal`, `accent2`, `accent3`).

## How it works

```
~/.claude/**  ── fs.watch + polling ──▶ ingest ──▶ SQLite cache (~/.ccdash/index.db)
                                          │                 │
                                          └─ SSE /api/events ──▶ React (TanStack Query invalidation)
                                  Hono REST /api/*  ◀──────────┘
```

- **Live sessions** come from `~/.claude/sessions/<pid>.json`. Each pid is verified against the process start time, so a reused pid isn't shown as alive.
- **Transcripts** (`~/.claude/projects/*/<session>.jsonl`, plus `subagents/`) are parsed incrementally. ccdash remembers how far into each file it has read and only parses new bytes, so a warm start takes milliseconds.
- **Cost** is the API-equivalent price. The pricing table in `shared/pricing.ts` is ported from the `usage-cost` skill, and requests are deduplicated by message id and request id. Daily totals match `usage_cost.py` to the cent, and subagent usage is included on top.
- **Resumed sessions**: when you resume a conversation, Claude Code copies the earlier records into the new session's file. ccdash credits each record to the session it actually happened in, using the `sessionId` it carries, and links the two. The resumed session shows only what it cost after resuming, with a link back to the original and the spend before it. Nothing is counted twice.
- **Redaction** (`server/src/lib/redact.ts`) masks token-like values and secret-named keys before any config leaves the server.
- **Security**: the server binds to 127.0.0.1 only and answers only to `localhost` Host headers, which blocks DNS rebinding. Write actions also require a custom header, which blocks CSRF. "Stop session" can only signal pids that Claude Code registered as live sessions.

If an update to Claude Code changes the transcript format, bump `SCHEMA_VERSION` in `server/src/db.ts` and the cache rebuilds from scratch on the next start.

## Adding a section

1. Server: add a collector under `server/src/collectors/` and expose it in `server/src/index.ts`.
2. Types: add the response shape to `shared/types.ts`.
3. Web: add a page under `web/src/sections/`, a hook in `web/src/lib/api.ts`, a route in `web/src/main.tsx` and an entry in `web/src/sections/nav.ts`.

## Configuration

| Env var | Default |
|---|---|
| `CCDASH_PORT` | `4321` |
| `CCDASH_CLAUDE_DIR` | `~/.claude` |
| `CCDASH_CLAUDE_JSON` | `~/.claude.json` |
| `CCDASH_DATA_DIR` | `~/.ccdash` |

## Stopping and troubleshooting

**Stop the server.** Run `ccdash stop`. It also stops a server that was started some other way, such as with `npm run dev`, as long as that server holds the dashboard's port.

**Port 4321 is already in use.** `ccdash start` reports this when another program holds the port. Find that program with `lsof -i :4321`, or use another port: `CCDASH_PORT=4400 ccdash start`. Use the same variable with `stop`, `open` and `status`.

**The server won't start.** `ccdash start` prints the end of the log when startup fails. Run `ccdash logs` to see the whole log.

**Numbers look wrong or stale.** Reset the cache: `ccdash stop && rm ~/.ccdash/index.db* && ccdash start`. It rebuilds from your transcripts in under a second. Your transcripts in `~/.claude` are never modified.

**UI changes don't show up.** `ccdash start` rebuilds only when files under `web/src` or `shared/` are newer than the last build. To force a rebuild, run `npm run build && ccdash restart`.

**A model shows $0.00.** Its id isn't in the pricing table. Add it to `PRICING` in `shared/pricing.ts`, using the same columns as the other rows: input, 5-minute cache write, 1-hour cache write, cache read and output, all in $ per million tokens. Current rates are at https://docs.claude.com/en/docs/about-claude/pricing. Prefix matching means `claude-opus-5-5` is priced as `claude-opus-5` unless it has its own entry. Cost is calculated when a transcript is first read, so reset the cache afterwards, as described above, to re-price history. Keep `~/.claude/skills/usage-cost/scripts/usage_cost.py` in step so the two tools still agree.

**A running session doesn't appear.** ccdash learns about live sessions from `~/.claude/sessions/<pid>.json`, which recent Claude Code versions write. Its history still appears under Sessions once its transcript has some content.

**Offline.** The fonts load from Google Fonts. Without internet the page falls back to system fonts, and everything else works.
