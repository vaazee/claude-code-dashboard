import { useSyncExternalStore } from 'react';
import { tokens, usd } from './format';

// Which measure the charts show: API-equivalent cost or raw tokens. One setting shared by
// every chart and remembered in this browser, so switching on one page switches them all.
export type Metric = 'cost' | 'tokens';

const KEY = 'ccdash-metric';
const listeners = new Set<() => void>();

function read(): Metric {
  try {
    return localStorage.getItem(KEY) === 'tokens' ? 'tokens' : 'cost';
  } catch {
    return 'cost';
  }
}

let current: Metric = read();

export function setMetric(m: Metric) {
  current = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {}
  listeners.forEach((l) => l());
}

export function useMetric(): [Metric, (m: Metric) => void] {
  const m = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  return [m, setMetric];
}

/** Full-precision value for labels and tooltips. */
export const formatMetric = (m: Metric) => (v: number) => (m === 'cost' ? usd(v) : tokens(v));

/** Compact value for chart axes. */
export const axisMetric = (m: Metric) => (v: number) => (m === 'cost' ? `$${v}` : tokens(v));

export const metricNoun = (m: Metric) => (m === 'cost' ? 'spend' : 'tokens');
