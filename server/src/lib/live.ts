import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { LIVE_DIR } from '../paths.ts';
import { listDir, readJson } from './fsx.ts';

export type LiveRecord = {
  pid: number;
  sessionId: string;
  cwd: string;
  name: string | null;
  status: string;
  kind: string | null;
  entrypoint: string | null;
  version: string | null;
  startedAt: number;
  updatedAt: number | null;
  statusUpdatedAt: number | null;
};

// pid -> verified procStart string; avoids shelling out to ps on every poll.
const verified = new Map<number, string>();

function isAlive(pid: number, procStart: string | undefined): boolean {
  try {
    process.kill(pid, 0);
  } catch (e: any) {
    if (e?.code !== 'EPERM') {
      verified.delete(pid);
      return false;
    }
  }
  if (!procStart) return true;
  if (verified.get(pid) === procStart) return true;
  // Guard against pid reuse: the process start time must match what Claude Code recorded.
  try {
    const lstart = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    // ps prints local time; Claude Code records procStart in UTC. Accept either reading, to the second.
    const psMs = Date.parse(lstart.replace(/\s+/g, ' '));
    const norm = procStart.replace(/\s+/g, ' ');
    const candidates = [Date.parse(norm + ' UTC'), Date.parse(norm)];
    if (!candidates.some((ms) => Math.abs(ms - psMs) < 2000)) return false;
    verified.set(pid, procStart);
    return true;
  } catch {
    return false;
  }
}

/** Claude Code processes that are running right now, per ~/.claude/sessions. */
export function readLive(): LiveRecord[] {
  const out: LiveRecord[] = [];
  for (const e of listDir(LIVE_DIR)) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const d = readJson(path.join(LIVE_DIR, e.name));
    if (!d || typeof d.pid !== 'number' || !d.sessionId) continue;
    if (!isAlive(d.pid, d.procStart)) continue;
    out.push({
      pid: d.pid,
      sessionId: d.sessionId,
      cwd: d.cwd ?? '',
      name: d.name ?? null,
      status: d.status ?? 'unknown',
      kind: d.kind ?? null,
      entrypoint: d.entrypoint ?? null,
      version: d.version ?? null,
      startedAt: d.startedAt ?? Date.now(),
      updatedAt: d.updatedAt ?? null,
      statusUpdatedAt: d.statusUpdatedAt ?? null,
    });
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}
