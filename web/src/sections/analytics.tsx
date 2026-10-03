import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar, nameColor, projectEmoji } from '@/components/avatar';
import { ActivityHeatmap, ChartTip, DailyCostChart, Legend, TokenMixChart } from '@/components/charts';
import { ErrorState, Meter, MetricToggle, PageHeader, PageSkeleton, Panel, Segmented, Stat, Tip } from '@/components/ui';
import { useAnalytics } from '@/lib/api';
import { modelColor } from '@/lib/colors';
import { int, modelName, pct, plural, shortDay, tokens, usd } from '@/lib/format';
import { formatMetric, useMetric } from '@/lib/metric';

type Range = '7' | '30' | '90' | '365' | 'all';

const sumTokens = (t: { input: number; output: number; write: number; read: number }) => t.input + t.output + t.write + t.read;

export function AnalyticsPage() {
  const [range, setRange] = useState<Range>('30');
  const { data, error, isLoading } = useAnalytics(range);
  const [metric] = useMetric();
  const fmt = formatMetric(metric);
  const byTokens = metric === 'tokens';
  // Rankings follow the chosen measure: the costliest model isn't always the hungriest.
  const models = useMemo(
    () => [...(data?.models ?? [])].sort((a, b) => (byTokens ? sumTokens(b.tokens) - sumTokens(a.tokens) : b.cost - a.cost)),
    [data, byTokens],
  );
  const projects = useMemo(
    () => [...(data?.projects ?? [])].sort((a, b) => (byTokens ? b.tokens - a.tokens : b.cost - a.cost)),
    [data, byTokens],
  );

  const controls = (
    <>
    <MetricToggle />
    <Segmented<Range>
      label="Time range"
      value={range}
      onChange={setRange}
      options={[
        { value: '7', label: '7 days' },
        { value: '30', label: '30 days' },
        { value: '90', label: '90 days' },
        { value: '365', label: 'Year' },
        { value: 'all', label: 'All time' },
      ]}
    />
    </>
  );

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} />;
  const t = data.totals;
  const days = data.daily.length || 1;
  const modelValue = (m: (typeof models)[number]) => (byTokens ? sumTokens(m.tokens) : m.cost);
  const projectValue = (p: (typeof projects)[number]) => (byTokens ? p.tokens : p.cost);
  const total = byTokens ? t.tokens : t.cost;
  const maxModel = models[0] ? modelValue(models[0]) : 0;
  const maxProject = projects[0] ? projectValue(projects[0]) : 0;
  const maxTool = data.tools[0]?.count ?? 0;
  const c = data.cache;
  const promptTokens = c.input + c.write + c.read;
  const linesData = data.lines.map((l) => ({ day: l.day, Added: l.added, Removed: -l.removed }));

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" icon="📈" actions={controls}>
        {byTokens
          ? 'Tokens processed by Claude Code: uncached input, cache writes, cache reads and output.'
          : 'API-equivalent cost of your Claude Code usage. On a Pro or Max plan this is the value you consumed, not a bill.'}
      </PageHeader>

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={byTokens ? 'Total tokens' : 'Total spend'} value={fmt(total)} hint={`${fmt(total / days)} a day`} />
        <Stat label="Sessions" value={int(t.sessions)} hint={t.sessions ? `${fmt(total / t.sessions)} each` : undefined} />
        <Stat label="Prompts" value={int(t.prompts)} hint={t.prompts ? `${fmt(total / t.prompts)} each` : undefined} />
        <Stat label="API requests" value={int(t.requests)} />
        <Stat label="Tool calls" value={int(t.toolCalls)} />
        <Stat label="Saved by caching" value={usd(t.savings)} hint={`${pct(c.hitRate)} of input from cache`} />
      </div>

      <Panel title={byTokens ? 'Daily tokens by model' : 'Daily spend by model'}>
        <DailyCostChart data={byTokens ? data.dailyTokens : data.daily} metric={metric} height={300} />
      </Panel>

      {byTokens && (
        <Panel title="Daily tokens by kind" aside="Cache reads cost a tenth of uncached input">
          <TokenMixChart data={data.tokenMix} height={260} />
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={byTokens ? 'Tokens by model' : 'Spend by model'}>
          <ul className="space-y-3.5">
            {models.map((m) => (
              <li key={m.model}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <span className="size-2.5 rounded-sm" style={{ background: modelColor(m.model) }} />
                    {modelName(m.model)}
                    <span className="text-[11.5px] text-ink-3">{m.model}</span>
                  </span>
                  <span className="num whitespace-nowrap text-ink">
                    {fmt(modelValue(m))} <span className="text-ink-3">· {pct(total ? modelValue(m) / total : 0)}</span>
                  </span>
                </div>
                <Meter value={modelValue(m)} max={maxModel} color={modelColor(m.model)} />
                <div className="mt-1 text-[11.5px] text-ink-3">
                  {int(m.requests)} requests · {byTokens ? usd(m.cost) : `${tokens(sumTokens(m.tokens))} tokens`} · {tokens(m.tokens.output)} output ·{' '}
                  {tokens(m.tokens.read)} cache reads
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={byTokens ? 'Tokens by project' : 'Spend by project'} aside={`${projects.length} projects`}>
          <ul className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {projects.map((p) => (
              <li key={p.cwd}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <Tip content={p.cwd}>
                    <span className="inline-flex min-w-0 items-center gap-2 truncate text-ink">
                      <Avatar name={p.project} emoji={projectEmoji(p.project)} size={20} rounded="rounded-md" />
                      {p.project}
                    </span>
                  </Tip>
                  <span className="num whitespace-nowrap text-ink">
                    {fmt(projectValue(p))} <span className="text-ink-3">· {plural(p.sessions, 'session')}</span>
                  </span>
                </div>
                <Meter value={projectValue(p)} max={maxProject} color={nameColor(p.project)} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="When you work" aside={`${byTokens ? 'Tokens' : 'Spend'} by weekday and hour`}>
        <ActivityHeatmap cells={data.heatmap} metric={metric} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Most used tools">
          <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {data.tools.map((tool) => (
              <li key={tool.name} className="text-[12.5px]">
                <div className="mb-1 flex justify-between gap-2">
                  <span className="truncate text-ink-2">{tool.name.replace(/^mcp__/, '').replace(/__/g, ' · ')}</span>
                  <span className="num text-ink">{int(tool.count)}</span>
                </div>
                <Meter value={tool.count} max={maxTool} color="var(--accent3)" />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Where your input tokens come from">
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-surface-3">
            {[
              { k: 'read', v: c.read, color: 'var(--s1)' },
              { k: 'write', v: c.write, color: 'var(--s2)' },
              { k: 'input', v: c.input, color: 'var(--s3)' },
            ].map((seg) => (
              <div key={seg.k} style={{ width: `${promptTokens ? (seg.v / promptTokens) * 100 : 0}%`, background: seg.color }} className="h-full border-r-2 border-surface last:border-r-0" />
            ))}
          </div>
          <Legend
            items={[
              { key: 'read', label: `Cache reads ${tokens(c.read)} (${pct(promptTokens ? c.read / promptTokens : 0)})`, color: 'var(--s1)' },
              { key: 'write', label: `Cache writes ${tokens(c.write)}`, color: 'var(--s2)' },
              { key: 'input', label: `Uncached input ${tokens(c.input)}`, color: 'var(--s3)' },
            ]}
          />
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
            Cache reads cost a tenth of the normal input price. Caching saved <span className="num font-semibold text-ink">{usd(c.savings)}</span> in
            this range. You also generated <span className="num font-semibold text-ink">{tokens(c.output)}</span> output tokens.
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Lines written and removed by Claude">
          {linesData.length ? (
            <>
              <div className="mb-3">
                <Legend
                  items={[
                    { key: 'a', label: 'Added', color: 'var(--s3)' },
                    { key: 'r', label: 'Removed', color: 'var(--s8)' },
                  ]}
                />
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={linesData} stackOffset="sign" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => tokens(Math.abs(v))} />
                  <ReferenceLine y={0} stroke="var(--line-strong)" />
                  <Tooltip content={<ChartTip valueFormat={(v: number) => int(Math.abs(v))} />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
                  <Bar dataKey="Added" stackId="l" fill="var(--s3)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="Removed" stackId="l" fill="var(--s8)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="py-10 text-center text-[13px] text-ink-3">No file edits in this range.</div>
          )}
        </Panel>

        <Panel title="How long sessions last">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.durations} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip content={<ChartTip valueFormat={(v: number) => `${v} sessions`} />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
              <Bar dataKey="count" name="Sessions" fill="var(--accent3)" maxBarSize={56} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}
