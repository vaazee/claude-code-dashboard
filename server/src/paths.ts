import os from 'node:os';
import path from 'node:path';

const home = os.homedir();

export const CLAUDE_DIR = process.env.CCDASH_CLAUDE_DIR ?? path.join(home, '.claude');
export const CLAUDE_JSON = process.env.CCDASH_CLAUDE_JSON ?? path.join(home, '.claude.json');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const LIVE_DIR = path.join(CLAUDE_DIR, 'sessions');
export const DATA_DIR = process.env.CCDASH_DATA_DIR ?? path.join(home, '.ccdash');
export const DB_PATH = path.join(DATA_DIR, 'index.db');
export const PORT = Number(process.env.CCDASH_PORT ?? 4321);
export const HOME = home;

/** Shorten /Users/me/... to ~/... for display. */
export function tildify(p: string | null | undefined): string {
  if (!p) return '';
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}
