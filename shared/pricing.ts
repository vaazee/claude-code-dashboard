// API-equivalent pricing for Claude models, ported from
// ~/.claude/skills/usage-cost/scripts/usage_cost.py so both tools agree.
// Prices are USD per million tokens.

export type Rates = {
  input: number;
  write5m: number;
  write1h: number;
  read: number;
  output: number;
};

const r = (input: number, write5m: number, write1h: number, read: number, output: number): Rates => ({
  input,
  write5m,
  write1h,
  read,
  output,
});

export const PRICING: Record<string, Rates> = {
  'claude-fable-5': r(10, 12.5, 20, 1, 50),
  'claude-mythos-5': r(10, 12.5, 20, 1, 50),
  'claude-opus-5': r(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-8': r(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-7': r(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-6': r(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-5': r(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-1': r(15, 18.75, 30, 1.5, 75),
  'claude-opus-4': r(15, 18.75, 30, 1.5, 75),
  'claude-sonnet-4-6': r(3, 3.75, 6, 0.3, 15),
  'claude-sonnet-4-5': r(3, 3.75, 6, 0.3, 15),
  'claude-sonnet-4': r(3, 3.75, 6, 0.3, 15),
  'claude-haiku-4-5': r(1, 1.25, 2, 0.1, 5),
  'claude-haiku-3-5': r(0.8, 1, 1.6, 0.08, 4),
};

// Sonnet 5 introductory pricing runs through 2026-08-31 (local date).
const SONNET5_INTRO = r(2, 2.5, 4, 0.2, 10);
const SONNET5_STANDARD = r(3, 3.75, 6, 0.3, 15);
const SONNET5_INTRO_END = '2026-08-31';

// Fast mode has premium base rates; cache multipliers apply on top.
export const FAST_PRICING: Record<string, Rates> = {
  'claude-opus-5': r(10, 12.5, 20, 1, 50),
  'claude-opus-4-8': r(10, 12.5, 20, 1, 50),
  'claude-opus-4-7': r(30, 37.5, 60, 3, 150),
};

const KNOWN_BY_LENGTH = Object.keys(PRICING).sort((a, b) => b.length - a.length);

/** `localDate` is YYYY-MM-DD in the user's timezone. Returns null for unknown models. */
export function lookupPricing(model: string, localDate: string, speed?: string): Rates | null {
  if (speed === 'fast' && FAST_PRICING[model]) return FAST_PRICING[model];
  if (model.startsWith('claude-sonnet-5')) {
    return localDate <= SONNET5_INTRO_END ? SONNET5_INTRO : SONNET5_STANDARD;
  }
  if (PRICING[model]) return PRICING[model];
  // Dated snapshot ids like claude-haiku-4-5-20251001 → strip the suffix.
  for (const known of KNOWN_BY_LENGTH) {
    if (model.startsWith(known)) return PRICING[known];
  }
  return null;
}

export type UsageTokens = {
  input: number;
  output: number;
  write5m: number;
  write1h: number;
  read: number;
};

/** Normalise a transcript `message.usage` object into token buckets. */
export function tokensFromUsage(u: any): UsageTokens {
  const cc = u?.cache_creation ?? {};
  let w5 = cc.ephemeral_5m_input_tokens;
  let w1 = cc.ephemeral_1h_input_tokens;
  if (w5 == null && w1 == null) {
    // No breakdown available; assume the default 5-minute cache.
    w5 = u?.cache_creation_input_tokens ?? 0;
    w1 = 0;
  }
  return {
    input: u?.input_tokens || 0,
    output: u?.output_tokens || 0,
    write5m: w5 || 0,
    write1h: w1 || 0,
    read: u?.cache_read_input_tokens || 0,
  };
}

export function costOf(t: UsageTokens, rates: Rates | null): number {
  if (!rates) return 0;
  return (
    (t.input * rates.input +
      t.write5m * rates.write5m +
      t.write1h * rates.write1h +
      t.read * rates.read +
      t.output * rates.output) /
    1_000_000
  );
}

/** Cost split by token kind; the four parts sum to costOf(). */
export function costParts(t: UsageTokens, rates: Rates | null): { input: number; write: number; read: number; output: number } {
  if (!rates) return { input: 0, write: 0, read: 0, output: 0 };
  return {
    input: (t.input * rates.input) / 1_000_000,
    write: (t.write5m * rates.write5m + t.write1h * rates.write1h) / 1_000_000,
    read: (t.read * rates.read) / 1_000_000,
    output: (t.output * rates.output) / 1_000_000,
  };
}

/** What cache reads saved versus paying full input price. */
export function cacheSavingsOf(t: UsageTokens, rates: Rates | null): number {
  if (!rates) return 0;
  return (t.read * (rates.input - rates.read)) / 1_000_000;
}

/** Local YYYY-MM-DD for an epoch-ms timestamp. */
export function localDateOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
