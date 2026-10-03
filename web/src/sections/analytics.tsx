import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar, nameColor, projectEmoji } from '@/components/avatar';
import { ActivityHeatmap, ChartTip, DailyCostChart, KindBreakdown, Legend, TokenMixChart, tokenDailyRows } from '@/components/charts';
import { ErrorState, Meter, MetricToggle, PageHeader, PageSkeleton, Panel, Segmented, Stat, Tip } from '@/components/ui';
import { useAnalytics } from '@/lib/api';
import { modelColor } from '@/lib/colors';
import { int, modelName, pct, plural, shortDay, tokens, usd } from '@/lib/format';
import { useMeasure } from '@/lib/metric';

type Range = '7' | '30' | '90' | '365' | 'all';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function AnalyticsPage() {
  const [range, setRange] = useState<Range>('30');
  const { data, error, isLoading } = useAnalytics(range);
  const M = useMeasure();
  const { byTokens, kinds, metric } = M;
  const fmt = M.format;
  // Rankings follow the chosen measure: the costliest model isn't always the hungriest.
  const models = useMemo(
    () => [...(data?.models ?? [])].sort((a, b) => M.value(b.cost, b.tokens) - M.value(a.cost, a.tokens)),
    [data, byTokens, kinds],
  );
  const projects = useMemo(
    () => [...(data?.projects ?? [])].sort((a, b) => M.value(b.cost, b.tok) - M.value(a.cost, a.tok)),
    [data, byTokens, kinds],
  );
  const tokenDaily = useMemo(() => (data ? tokenDailyRows(data.daily, data.dayModelTokens, kinds) : []), [data, kinds]);
  const noun = byTokens ? M.tokenNoun : 'spend';

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
  const modelValue = (m: (typeof models)[number]) => M.value(m.cost, m.tokens);
  const projectValue = (p: (typeof projects)[number]) => M.value(p.cost, p.tok);
  const total = M.value(t.cost, t.tok);
  const maxModel = models[0] ? modelValue(models[0]) : 0;
  const maxProject = projects[0] ? projectValue(projects[0]) : 0;
  const maxTool = data.tools[0]?.count ?? 0;
  const c = data.cache;
  const linesData = data.lines.map((l) => ({ day: l.day, Added: l.added, Removed: -l.removed }));

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" icon="📈" actions={controls}>
        {byTokens
          ? `Counting ${M.tokenNoun}. Pick which kinds count with the chips; each kind is priced differently.`
          : 'API-equivalent cost of your Claude Code usage. On a Pro or Max plan this is the value you consumed, not a bill.'}
      </PageHeader>

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={byTokens ? cap(M.tokenNoun) : 'Total spend'} value={fmt(total)} hint={`${fmt(total / days)} a day`} />
        <Stat label="Sessions" value={int(t.sessions)} hint={t.sessions ? `${fmt(total / t.sessions)} each` : undefined} />
        <Stat label="Prompts" value={int(t.prompts)} hint={t.prompts ? `${fmt(total / t.prompts)} each` : undefined} />
        <Stat label="API requests" value={int(t.requests)} />
        <Stat label="Tool calls" value={int(t.toolCalls)} />
        <Stat label="Saved by caching" value={usd(t.savings)} hint={`${pct(c.hitRate)} of input from cache`} />
      </div>

      <Panel title="Tokens and cost by kind" aside="Anthropic prices each kind differently">
        <KindBreakdown tok={t.tok} cost={t.costByKind} />
      </Panel>

      <Panel title={`Daily ${noun} by model`}>
        <DailyCostChart data={byTokens ? tokenDaily : data.daily} metric={metric} height={300} />
      </Panel>

      {byTokens && (
        <Panel title={`Daily ${M.tokenNoun} by kind`}>
          <TokenMixChart data={data.tokenMix} kinds={kinds} height={260} />
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={`${cap(noun)} by model`}>
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
                  {int(m.requests)} requests · {usd(m.cost)} · {tokens(m.tokens.input + m.tokens.write + m.tokens.read + m.tokens.output)} tokens ·{' '}
                  {tokens(m.tokens.output)} output · {tokens(m.tokens.read)} cache reads
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={`${cap(noun)} by project`} aside={`${projects.length} projects`}>
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

      <Panel title="When you work" aside={`${cap(noun)} by weekday and hour`}>
        <ActivityHeatmap cells={data.heatmap} valueOf={(cell) => M.value(cell.cost, cell.tok)} />
      </Panel>

      <div>
        <Panel title="Most used tools">
          <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
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
