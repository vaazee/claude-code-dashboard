import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { modelColor } from '@/lib/colors';
import { modelName, shortDay, usd } from '@/lib/format';
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

/** Daily spend stacked by model. Models beyond the top six fold into "Other". */
export function DailyCostChart({ data, height = 260 }: { data: DailyRow[]; height?: number }) {
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
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v}`} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
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
export function ActivityHeatmap({ cells }: { cells: { dow: number; hour: number; requests: number; cost: number }[] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const max = Math.max(...cells.map((c) => c.requests), 1);
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
                    style={{ background: step(c?.requests ?? 0) }}
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
              <span className="num text-ink">{hovered?.requests ?? 0} requests</span> ·{' '}
              <span className="num text-ink">{usd(hovered?.cost ?? 0)}</span>
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

export { ChartTip };
