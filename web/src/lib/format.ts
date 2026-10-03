export function usd(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (opts.compact && n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n > 0 && n < 0.01) return '<$0.01';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function tokens(n: number | null | undefined): string {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function int(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
}

/** 3h 12m, 4m 05s, 2d 3h */
export function duration(ms: number | null | undefined, withSeconds = false): string {
  if (ms == null || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return withSeconds ? `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s` : `${h}h ${m}m`;
  if (m) return withSeconds ? `${m}m ${String(sec).padStart(2, '0')}s` : `${m}m`;
  return `${sec}s`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function ago(ts: number | null | undefined): string {
  if (!ts) return '—';
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function time(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function shortDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** claude-opus-5-5 → Opus 5.5 ; claude-haiku-4-5-20251001 → Haiku 4.5 */
export function modelName(id: string): string {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/);
  if (!m) return id;
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  const ver = m[3] && m[3].length <= 2 ? `${m[2]}.${m[3]}` : m[2];
  return `${family} ${ver}`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}
