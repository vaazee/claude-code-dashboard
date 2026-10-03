// Categorical color follows the entity, never its rank: a model keeps its color on every page.
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

// Fixed assignments, newest flagship first. Older models of a family share a slot.
const FIXED: [RegExp, number][] = [
  [/^claude-opus-5-5/, 0],
  [/^claude-fable/, 1],
  [/^claude-opus-4-8/, 2],
  [/^claude-sonnet/, 3],
  [/^claude-haiku/, 4],
  [/^claude-opus-4/, 5],
  [/^claude-opus-5/, 6],
  [/^claude-mythos/, 7],
];

export function modelColor(model: string): string {
  for (const [re, slot] of FIXED) if (re.test(model)) return SLOTS[slot];
  let h = 0;
  for (const ch of model) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SLOTS[h % SLOTS.length];
}

export function seriesColor(i: number): string {
  return SLOTS[i % SLOTS.length];
}
