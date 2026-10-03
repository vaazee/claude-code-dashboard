import type { TokenKind, TokenTotals } from '@shared/types.ts';
import { useSyncExternalStore } from 'react';
import { tokens, usd } from './format';

// What the charts measure: API-equivalent cost, or tokens. In token mode you also pick which
// kinds count (Anthropic prices each kind differently). One setting shared by every chart and
// remembered in this browser, so switching on one page switches them all.
export type Metric = 'cost' | 'tokens';

export const KINDS: { key: TokenKind; label: string; short: string; color: string; blurb: string }[] = [
  { key: 'input', label: 'Uncached input', short: 'Input', color: 'var(--s3)', blurb: 'New prompt text, full input price' },
  { key: 'write', label: 'Cache writes', short: 'Cache writes', color: 'var(--s2)', blurb: 'Context stored for reuse, 1.25–2× input price' },
  { key: 'read', label: 'Cache reads', short: 'Cache reads', color: 'var(--s1)', blurb: 'Context reread from cache, 0.1× input price' },
  { key: 'output', label: 'Output', short: 'Output', color: 'var(--s4)', blurb: 'Tokens Claude wrote, the priciest kind' },
];
const ALL: TokenKind[] = KINDS.map((k) => k.key);

type State = { metric: Metric; kinds: TokenKind[] };
const KEY = 'ccdash-metric';
const KINDS_KEY = 'ccdash-token-kinds';
const listeners = new Set<() => void>();

function read(): State {
  try {
    const metric = localStorage.getItem(KEY) === 'tokens' ? 'tokens' : 'cost';
    const saved = JSON.parse(localStorage.getItem(KINDS_KEY) ?? 'null');
    const kinds = Array.isArray(saved) ? ALL.filter((k) => saved.includes(k)) : ALL;
    return { metric, kinds: kinds.length ? kinds : ALL };
  } catch {
    return { metric: 'cost', kinds: ALL };
  }
}

let state: State = read();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setMetric(metric: Metric) {
  state = { ...state, metric };
  try {
    localStorage.setItem(KEY, metric);
  } catch {}
  emit();
}

export function setKinds(kinds: TokenKind[]) {
  if (!kinds.length) return; // at least one kind must stay selected
  state = { ...state, kinds: ALL.filter((k) => kinds.includes(k)) };
  try {
    localStorage.setItem(KINDS_KEY, JSON.stringify(state.kinds));
  } catch {}
  emit();
}

export function useMetric(): [Metric, (m: Metric) => void] {
  const m = useSyncExternalStore(subscribe, () => state.metric);
  return [m, setMetric];
}

export function useTokenKinds(): [TokenKind[], (k: TokenKind[]) => void] {
  const k = useSyncExternalStore(subscribe, () => state.kinds);
  return [k, setKinds];
}

/** Tokens of the selected kinds. */
export const sumKinds = (t: TokenTotals | undefined, kinds: TokenKind[]) => (t ? kinds.reduce((n, k) => n + t[k], 0) : 0);

/** The measure as one number: cost, or the selected kinds of tokens. */
export function useMeasure() {
  const [metric] = useMetric();
  const [kinds] = useTokenKinds();
  const byTokens = metric === 'tokens';
  return {
    metric,
    kinds,
    byTokens,
    allKinds: kinds.length === ALL.length,
    value: (cost: number, tok: TokenTotals | undefined) => (byTokens ? sumKinds(tok, kinds) : cost),
    format: formatMetric(metric),
    axis: axisMetric(metric),
    /** "tokens", "output tokens", "tokens excl. cache reads" … for titles and labels. */
    tokenNoun: kindsNoun(kinds),
  };
}

export function kindsNoun(kinds: TokenKind[]): string {
  if (kinds.length === ALL.length) return 'tokens';
  if (kinds.length === 1) return `${KINDS.find((k) => k.key === kinds[0])!.short.toLowerCase()} tokens`;
  const missing = ALL.filter((k) => !kinds.includes(k));
  if (missing.length === 1) return `tokens excl. ${KINDS.find((k) => k.key === missing[0])!.short.toLowerCase()}`;
  return `${kinds.map((k) => KINDS.find((x) => x.key === k)!.short.toLowerCase()).join(' + ')} tokens`;
}

/** Full-precision value for labels and tooltips. */
export const formatMetric = (m: Metric) => (v: number) => (m === 'cost' ? usd(v) : tokens(v));

/** Compact value for chart axes. */
export const axisMetric = (m: Metric) => (v: number) => (m === 'cost' ? `$${v}` : tokens(v));
