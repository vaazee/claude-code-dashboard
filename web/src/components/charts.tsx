import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { modelColor } from '@/lib/colors';
import { modelName, shortDay, tokens, usd } from '@/lib/format';
import type { TokenKind, TokenTotals } from '@shared/types.ts';
import { axisMetric, formatMetric, KINDS, sumKinds, type Metric } from '@/lib/metric';
import { cx } from './ui';

type DailyRow = { day: string; total: number } & Record<string, number | string>;

function ChartTip({ active, payload, label, valueFormat = usd }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value > 0);
  const total = rows.reduce((n: number, p: any) => n + p.value, 0);
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-xl">
      <div className="mb-1 font-medium text-ink">{label?.length === 10 ? shortDay(label) : label}</div>
      {rows.length > 1 &&
        rows
          .slice()
          .reverse()
          .map((p: any) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-4 text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: p.color ?? p.fill }} />
                {p.name}
              </span>
              <span className="num text-ink">{valueFormat(p.value)}</span>
            </div>
          ))}
      <div className={cx('flex justify-between gap-4', rows.length > 1 && 'mt-1 border-t border-line pt-1')}>
        <span className="text-ink-3">Total</span>
        <span className="num font-semibold text-ink">{valueFormat(total)}</span>
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Daily spend (or tokens) stacked by model. Models beyond the top six fold into "Other". */
export function DailyCostChart({ data, height = 260, metric = 'cost' }: { data: DailyRow[]; height?: number; metric?: Metric }) {
  const { rows, series } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of data)
      for (const [k, v] of Object.entries(r)) if (k !== 'day' && k !== 'total') totals.set(k, (totals.get(k) ?? 0) + (v as number));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const keep = ranked.slice(0, 6);
    const other = ranked.slice(6);
    const rows = data.map((r) => {
      const out: Record<string, number | string> = { day: r.day };
      for (const k of keep) out[k] = (r[k] as number) ?? 0;
      if (other.length) out.Other = other.reduce((n, k) => n + ((r[k] as number) ?? 0), 0);
      return out;
    });
    const series = keep.map((k) => ({ key: k, label: modelName(k), color: modelColor(k) }));
    if (other.length) series.push({ key: 'Other', label: 'Other', color: 'var(--text-3)' });
    // Stack the biggest series at the bottom so the baseline reads cleanly.
    return { rows, series };
  }, [data]);

  if (!series.length) return <div className="grid place-items-center text-[13px] text-ink-3" style={{ height }}>No usage in this range.</div>;
  const tickEvery = Math.max(1, Math.ceil(rows.length / 7));
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3">
          <Legend items={series} />
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            interval={tickEvery - 1}
            tickFormatter={shortDay}
            tickMargin={8}
          />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={axisMetric(metric)} />
          <Tooltip content={<ChartTip valueFormat={formatMetric(metric)} />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny bar sparkline with a hover readout; used on overview and project rows. */
export function Sparkbars({
  values,
  labels,
  height = 36,
  className,
  format = usd,
  color = 'var(--signal)',
}: {
  color?: string;
  values: number[];
  labels?: string[];
  height?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...values, 0.0001);
  return (
    <div className={cx('relative', className)}>
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div
            key={i}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            aria-label={labels ? `${labels[i]}: ${format(v)}` : format(v)}
          >
            <div
              className="w-full rounded-t-[2px] transition-colors"
              style={{
                height: v > 0 ? `${Math.max(6, (v / max) * 100)}%` : '2px',
                background: v > 0 ? (hover === i ? 'var(--text)' : color) : 'var(--line)',
              }}
            />
          </div>
        ))}
      </div>
      {hover != null && (
        <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] text-ink shadow">
          {labels?.[hover] ? `${labels[hover]} · ` : ''}
          <span className="num font-medium">{format(values[hover])}</span>
        </div>
      )}
    </div>
  );
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday × hour activity grid on a single-hue sequential ramp. */
type HeatCell = { dow: number; hour: number; requests: number; cost: number; tok: TokenTotals };

/** Weekday × hour grid shaded by `valueOf` (cost, or the selected token kinds). */
export function ActivityHeatmap({ cells, valueOf }: { cells: HeatCell[]; valueOf: (c: HeatCell) => number }) {
  const value = (c: HeatCell | undefined) => (c ? valueOf(c) : 0);
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const max = Math.max(...cells.map(value), 0.0001);
  const step = (n: number) => {
    if (!n) return 'var(--seq-0)';
    const t = n / max;
    return t > 0.75 ? 'var(--seq-4)' : t > 0.45 ? 'var(--seq-3)' : t > 0.2 ? 'var(--seq-2)' : 'var(--seq-1)';
  };
  const order = [1, 2, 3, 4, 5, 6, 0];
  const hovered = hover ? grid.get(`${hover.dow}-${hover.hour}`) : null;
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-[3px]" onMouseLeave={() => setHover(null)}>
          {order.map((d) => (
            <div key={d} className="contents">
              <div className="flex items-center text-[11px] text-ink-3">{DOW[d]}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const c = grid.get(`${d}-${h}`);
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHover({ dow: d, hour: h })}
                    className={cx('aspect-square rounded-[3px]', hover?.dow === d && hover?.hour === h && 'ring-2 ring-ink')}
                    style={{ background: step(value(c)) }}
                  />
                );
              })}
            </div>
          ))}
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[10.5px] text-ink-3">
              {h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`) : ''}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex min-h-5 flex-wrap items-center justify-between gap-3 text-[12px] text-ink-3">
        <span>
          {hover ? (
            <>
              {DOW[hover.dow]} {hover.hour}:00–{hover.hour + 1}:00 ·{' '}
              <span className="num text-ink">{usd(hovered?.cost ?? 0)}</span> ·{' '}
              <span className="num text-ink">{tokens(sumKinds(hovered?.tok, ['input', 'write', 'read', 'output']))} tokens</span> ·{' '}
              <span className="num text-ink">{hovered?.requests ?? 0} requests</span>
            </>
          ) : (
            'Hover a cell for details'
          )}
        </span>
        <span className="flex items-center gap-1.5">
          Fewer
          {['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)'].map((c) => (
            <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/** Daily tokens stacked by kind; only the selected kinds are drawn. */
export function TokenMixChart({
  data,
  kinds,
  height = 240,
}: {
  data: ({ day: string } & TokenTotals)[];
  kinds: TokenKind[];
  height?: number;
}) {
  // Biggest kind at the bottom so the baseline reads cleanly.
  const MIX = ['read', 'write', 'input', 'output'].flatMap((k) => KINDS.filter((x) => x.key === k && kinds.includes(x.key)));
  if (!data.some((d) => sumKinds(d, kinds) > 0)) {
    return <div className="grid place-items-center text-[13px] text-ink-3" style={{ height }}>No usage in this range.</div>;
  }
  const tickEvery = Math.max(1, Math.ceil(data.length / 7));
  return (
    <div>
      <div className="mb-3">
        {MIX.length > 1 && <Legend items={MIX.map((m) => ({ key: m.key, label: m.label, color: m.color }))} />}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} interval={tickEvery - 1} tickFormatter={shortDay} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v) => tokens(v)} />
          <Tooltip content={<ChartTip valueFormat={tokens} />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
          {MIX.map((m, i) => (
            <Bar
              key={m.key}
              dataKey={m.key}
              name={m.label}
              stackId="t"
              fill={m.color}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === MIX.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Turn per-day, per-model token rows into chart rows (every day present), counting `kinds`. */
export function tokenDailyRows(
  days: { day: string }[],
  rows: ({ day: string; model: string } & TokenTotals)[],
  kinds: TokenKind[],
): DailyRow[] {
  const map = new Map<string, DailyRow>(days.map((d) => [d.day, { day: d.day, total: 0 } as DailyRow]));
  for (const r of rows) {
    const e = map.get(r.day);
    if (!e) continue;
    const v = sumKinds(r, kinds);
    e[r.model] = ((e[r.model] as number) ?? 0) + v;
    e.total += v;
  }
  return [...map.values()];
}

/**
 * The holistic view: how tokens and cost split across the four priced kinds. Cache reads are
 * most of the tokens but a small share of the cost; output is the reverse.
 */
const pctOf = (part: number, total: number) => `${total ? ((part / total) * 100).toFixed(part / total < 0.1 ? 1 : 0) : 0}%`;

export function KindBreakdown({ tok, cost }: { tok: TokenTotals; cost: TokenTotals }) {
  const totalTok = sumKinds(tok, ['input', 'write', 'read', 'output']);
  const totalCost = sumKinds(cost, ['input', 'write', 'read', 'output']);
  const order = ['read', 'write', 'input', 'output'].map((k) => KINDS.find((x) => x.key === k)!);
  const Bar = ({ label, part, total, fmt }: { label: string; part: (k: TokenKind) => number; total: number; fmt: (n: number) => string }) => (
    <div>
      <div className="mb-1 flex justify-between text-[12px] text-ink-3">
        <span>{label}</span>
        <span className="num text-ink-2">{fmt(total)}</span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-md bg-surface-3">
        {order.map((k) => {
          const share = total ? part(k.key) / total : 0;
          return (
            <div
              key={k.key}
              title={`${k.label}: ${fmt(part(k.key))} (${(share * 100).toFixed(1)}%)`}
              className="h-full border-r-2 border-surface last:border-r-0"
              style={{ width: `${share * 100}%`, background: k.color, display: share > 0 ? undefined : 'none' }}
            />
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="space-y-4">
        <Bar label="Share of tokens" part={(k) => tok[k]} total={totalTok} fmt={tokens} />
        <Bar label="Share of cost" part={(k) => cost[k]} total={totalCost} fmt={usd} />
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Cache reads are <span className="num font-medium text-ink-2">{pctOf(tok.read, totalTok)}</span> of your tokens and{' '}
          <span className="num font-medium text-ink-2">{pctOf(cost.read, totalCost)}</span> of cost. Every reply rereads the conversation so far,
          mostly from cache at a tenth of the input price. Output is{' '}
          <span className="num font-medium text-ink-2">{pctOf(tok.output, totalTok)}</span> of tokens but{' '}
          <span className="num font-medium text-ink-2">{pctOf(cost.output, totalCost)}</span> of cost.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-3">
              <th className="pb-2 font-medium">Kind</th>
              <th className="pb-2 text-right font-medium">Tokens</th>
              <th className="pb-2 text-right font-medium">Share</th>
              <th className="pb-2 text-right font-medium">Cost</th>
              <th className="pb-2 text-right font-medium">Share</th>
              <th className="pb-2 text-right font-medium" title="Average cost per million tokens of this kind">$ / M</th>
            </tr>
          </thead>
          <tbody>
            {order.map((k) => (
              <tr key={k.key} className="border-t border-line" title={k.blurb}>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <span className="size-2.5 rounded-sm" style={{ background: k.color }} aria-hidden />
                    {k.label}
                  </span>
                </td>
                <td className="num py-2 text-right text-ink">{tokens(tok[k.key])}</td>
                <td className="num py-2 text-right text-ink-3">{totalTok ? ((tok[k.key] / totalTok) * 100).toFixed(1) : '0.0'}%</td>
                <td className="num py-2 text-right text-ink">{usd(cost[k.key])}</td>
                <td className="num py-2 text-right text-ink-3">{totalCost ? ((cost[k.key] / totalCost) * 100).toFixed(1) : '0.0'}%</td>
                <td className="num py-2 text-right text-ink-2">{tok[k.key] ? `$${((cost[k.key] / tok[k.key]) * 1e6).toFixed(2)}` : '—'}</td>
              </tr>
            ))}
            <tr className="border-t border-line-strong font-medium">
              <td className="py-2 text-ink">All kinds</td>
              <td className="num py-2 text-right text-ink">{tokens(totalTok)}</td>
              <td className="py-2" />
              <td className="num py-2 text-right text-ink">{usd(totalCost)}</td>
              <td className="py-2" />
              <td className="num py-2 text-right text-ink-2">{totalTok ? `$${((totalCost / totalTok) * 1e6).toFixed(2)}` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { ChartTip };
