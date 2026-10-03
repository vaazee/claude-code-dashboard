import fs from 'node:fs';

export function readJson<T = any>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readText(p: string, max = 512 * 1024): string | null {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return null;
    if (st.size > max) {
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(max);
      fs.readSync(fd, buf, 0, max, 0);
      fs.closeSync(fd);
      return buf.toString('utf8') + '\n…(truncated)';
    }
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function listDir(p: string): fs.Dirent[] {
  try {
    return fs.readdirSync(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function mtimeOf(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

/** Minimal YAML frontmatter reader: top-level `key: value` pairs, including folded/quoted strings. */
export function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    if (val === '|' || val === '>' || val === '|-' || val === '>-' || val === '') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]) && !/^[A-Za-z0-9_-]+:/.test(lines[i + 1])) {
        block.push(lines[++i].trim());
      }
      val = block.join(val.startsWith('|') ? '\n' : ' ').trim();
    }
    out[key] = val.replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return out;
}
