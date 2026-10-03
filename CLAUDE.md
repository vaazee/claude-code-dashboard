# ccdash — Claude Code dashboard

A local web dashboard that reads `~/.claude` (live sessions, transcripts, skills, plugins, config) and shows it at http://localhost:4321. It only reads `~/.claude` and never writes to it. See README.md for the user-facing tour.

## Commands

```sh
npm test                 # node:test suites in server/test (pricing, parsing, redaction, resumed sessions)
npm run typecheck        # tsc for server and web
npm run build            # vite build → web/dist (the server serves it)
npm run dev              # API on :4321 with node --watch + Vite on :5173 with HMR
ccdash restart           # pick up server changes when running via the CLI (bin/ccdash, symlinked in ~/.local/bin)
ccdash logs              # ~/.ccdash/server.log
```

After changing `web/src`, run `npm run build`. A running server serves the new build without a restart. After changing `server/src` or `shared/`, run `ccdash restart`.

## Layout

- `shared/`: `pricing.ts`, a port of `~/.claude/skills/usage-cost/scripts/usage_cost.py`, and `types.ts`, the API contract. Both server and web import these; the web app uses the `@shared` alias.
- `server/src/`: Hono app (`index.ts`), `db.ts` (node:sqlite schema), `ingest/` (transcript parsing), `queries.ts` (SQL behind each API), `collectors/` (inventory, config, history, projects), `lib/` (live sessions, redaction, transcript reader, cross-platform `open`).
- `web/src/`: Vite + React 19 + TanStack Router/Query + Tailwind v4. Pages live in `sections/`, shared UI in `components/`, and the theme system in `lib/themes.ts`.

## Things that will bite you

- **The server runs TypeScript directly through Node's type stripping.** It has no build step. Imports need the `.ts` extension and `import type` for types, and only erasable syntax is allowed: no enums, namespaces or parameter properties. `tsconfig` sets `erasableSyntaxOnly` to enforce this.
- **The cache is rebuilt, never migrated.** If you change the schema or what the parser produces, bump `SCHEMA_VERSION` in `server/src/db.ts`. Costs are calculated when a transcript is first read, so pricing changes also need a bump or a `rm ~/.ccdash/index.db*`.
- **Cost must match `usage_cost.py` to the cent.** Requests are deduplicated by `message.id|requestId`, keeping the row with the highest output, and dates are bucketed by local day. Verify with `python3 ~/.claude/skills/usage-cost/scripts/usage_cost.py --all --json` against `SELECT day, SUM(cost) FROM usage WHERE agent_id IS NULL GROUP BY day`. The Python script ignores subagent files, so compare top-level rows only. If you change `PRICING`, change both files.
- **Resumed sessions** copy earlier records into a new file, and each copy keeps its original `sessionId`. Ingest credits every record to the `sessionId` it carries, not to the file it's in, and records the link in `sessions.resumed_from`. Prompts are deduplicated by record `uuid` in the `prompts` table. `server/test/resume.test.ts` covers this.
- **Transcript format drifts between Claude Code versions.** Parse defensively in `ingest/parse.ts`: optional chaining everywhere, and skip unknown record types rather than throwing.
- **Live status** comes from `~/.claude/sessions/<pid>.json`. A pid is only trusted after checking its start time against `ps`; `procStart` is recorded in UTC while `ps` prints local time, and `lib/live.ts` accepts either.
- **Security model**: the server binds to 127.0.0.1, rejects requests whose Host header isn't localhost (blocks DNS rebinding), and requires an `x-ccdash: 1` header on every POST (blocks CSRF; `web/src/lib/api.ts` `post()` adds it). Actions take session ids, never paths, and look the path up in the index. Kill only signals pids listed as live sessions. Anything config-like goes through `lib/redact.ts` before it's returned.

## UI conventions

- **Themes** set surfaces, ink and three hues on `<html>` through inline CSS variables (`signal`, `accent2`, `accent3`, see `lib/themes.ts`). Use the Tailwind tokens (`bg-surface`, `text-ink-2`, `text-signal`, `bg-accent2`, …) and never hard-coded colors.
- **Chart series and status colors** (`--s1…--s8`, `--good/--warning/--critical`) come from the light or dark base, not the theme. They're a validated colorblind-safe palette, so don't theme them. Model colors are fixed per model in `lib/colors.ts`; a color follows the entity, never its rank. Projects use their avatar hue (`nameColor`).
- **Emoji avatars** are keyword-matched in `components/avatar.tsx`. Keep the rules generic and free of personal names.
- **Copy** is sentence case and plain: "Open in cmux", not "Launch Terminal Session".

## Verifying UI changes

The Claude in Chrome extension may not be connected. If it isn't, drive headless Chrome over the DevTools protocol, which takes full-page screenshots, emulates light and dark, sets the theme through `localStorage['ccdash-appearance']`, and clicks with `Input.dispatchMouseEvent` (Radix ignores synthetic `.click()`). Check the dark and light bases and a phone width (390px) for horizontal overflow, and look for console errors.

## Git

Commit in small, described checkpoints on `main`; the remote is the private `github.com/vaazee/claude-code-dashboard`. Push only when asked.
