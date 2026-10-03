import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH } from './paths.ts';

// Bump when the schema or the parser's output changes; the cache is rebuilt from transcripts.
const SCHEMA_VERSION = '3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- One row per transcript file; offset is how far we've parsed.
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  mtime REAL NOT NULL DEFAULT 0,
  offset INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS files_session ON files(session_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_dir TEXT,
  cwd TEXT,
  git_branch TEXT,
  version TEXT,
  entrypoint TEXT,
  ai_title TEXT,
  custom_title TEXT,
  first_prompt TEXT,
  last_prompt TEXT,
  started_at INTEGER,
  last_at INTEGER,
  prompts INTEGER NOT NULL DEFAULT 0,
  cc_cost REAL,
  permission_mode TEXT
);
CREATE INDEX IF NOT EXISTS sessions_last ON sessions(last_at);

-- Deduplicated API requests (message id + request id), priced at ingest time.
CREATE TABLE IF NOT EXISTS usage (
  key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  file TEXT NOT NULL,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  model TEXT NOT NULL,
  speed TEXT,
  input INTEGER NOT NULL,
  output INTEGER NOT NULL,
  write5m INTEGER NOT NULL,
  write1h INTEGER NOT NULL,
  read INTEGER NOT NULL,
  cost REAL NOT NULL,
  savings REAL NOT NULL,
  priced INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_session ON usage(session_id);
CREATE INDEX IF NOT EXISTS usage_day ON usage(day);

CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  file TEXT NOT NULL,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT,
  added INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tools_session ON tools(session_id);
CREATE INDEX IF NOT EXISTS tools_name ON tools(name);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_type TEXT,
  description TEXT,
  file TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agents_session ON agents(session_id);
`;

export function openDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let db = new DatabaseSync(DB_PATH);
  const version = readVersion(db);
  if (version !== SCHEMA_VERSION) {
    db.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    db = new DatabaseSync(DB_PATH);
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema', ?)").run(SCHEMA_VERSION);
  return db;
}

function readVersion(db: DatabaseSync): string | null {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
