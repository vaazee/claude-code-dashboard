import { Link } from '@tanstack/react-router';
import { BarChart3, ListTree } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { OrbitHero } from '@/components/art';
import { DailyCostChart, Sparkbars, tokenDailyRows } from '@/components/charts';
import { LiveLane } from '@/components/live';
import { SessionList } from '@/components/session-list';
import { ErrorState, MetricToggle, PageSkeleton, Panel } from '@/components/ui';
import { useAnalytics, useOverview } from '@/lib/api';
import { plural, shortDay, tokens, usd } from '@/lib/format';
import { useMeasure } from '@/lib/metric';

function greeting(live: number, busy: number): string {
  if (!live) return 'Nothing running right now';
  if (busy === live) return `${plural(live, 'session')} running, all working`;
  if (!busy) return `${plural(live, 'session')} running, all waiting for you`;
  return `${plural(live, 'session')} running, ${busy} working`;
}

function salutation(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 5) return { text: 'Working late', emoji: '🌙' };
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  if (h < 22) return { text: 'Good evening', emoji: '🌆' };
  return { text: 'Working late', emoji: '🌙' };
}

// Each tile carries one of the theme's three hues so the row reads as a set, not a stripe of one color.
function StatTile({
  emoji,
  label,
  value,
  hint,
  hue,
  children,
  className,
}: {
  emoji: string;
  label: string;
  value?: React.ReactNode;
  hint?: React.ReactNode;
  hue: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative min-w-0 overflow-hidden rounded-2xl border border-line px-4 py-3.5 ${className ?? ''}`}
      style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${hue} 10%, var(--surface)), var(--surface) 60%)` }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: hue }} aria-hidden />
      <div className="flex items-center justify-between text-[12.5px] text-ink-3">
        {label}
        <span
          className="grid size-7 place-items-center rounded-lg text-[15px]"
          style={{ background: `color-mix(in oklab, ${hue} 20%, var(--surface))` }}
          aria-hidden
        >
          {emoji}
        </span>
      </div>
      {children}
      {value != null && <div className="display num mt-1 truncate text-[24px] font-[650] text-ink">{value}</div>}
      {hint && <div className="mt-0.5 truncate text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

function PanelTitle({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden>{emoji}</span>
      {children}
    </span>
  );
}

export function OverviewPage() {
  const { data, error, isLoading } = useOverview();
  const month = useAnalytics('30');
  const M = useMeasure();
  const { byTokens, metric } = M;
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} />;
  const k = data.kpis;
  const delta = k.yesterday > 0 ? (k.today - k.yesterday) / k.yesterday : null;
  const hello = salutation();

  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="mesh relative overflow-hidden rounded-3xl border border-line"
      >
        <div className="grid items-center gap-2 px-6 py-7 md:px-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[12.5px] text-ink-2 backdrop-blur">
              <span aria-hidden>{hello.emoji}</span>
              {hello.text}
              {data.user && <span className="font-medium text-ink">{data.user}</span>}
            </div>
            <h1 className="display text-gradient mt-4 text-[34px] font-[700] leading-[1.05] md:text-[46px]">{greeting(k.liveCount, k.busyCount)}</h1>
            <p className="mt-3 max-w-[52ch] text-[15px] text-ink-2">
              You've spent <span className="num font-semibold text-ink">{usd(k.today)}</span> across {plural(k.sessionsToday, 'session')} today
              {delta != null && (
                <>
                  , {delta >= 0 ? 'up' : 'down'} <span className="num font-semibold text-ink">{Math.abs(Math.round(delta * 100))}%</span> on yesterday
                </>
              )}
              .
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/sessions"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-signal px-4 text-[13.5px] font-medium text-on-signal shadow-[0_8px_24px_-10px_var(--signal)] hover:brightness-110"
              >
                <ListTree className="size-4" aria-hidden /> Browse sessions
              </Link>
              <Link
                to="/analytics"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface/70 px-4 text-[13.5px] font-medium text-ink-2 backdrop-blur hover:text-ink"
              >
                <BarChart3 className="size-4" aria-hidden /> See analytics
              </Link>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[520px]">
            <OrbitHero live={data.live} />
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile hue="var(--signal)" emoji="💸" label="Spent today" value={usd(k.today)} hint={`${usd(k.yesterday)} yesterday`} />
        <StatTile hue="var(--accent2)" emoji="📅" label="Last 7 days" value={usd(k.week)} hint={`${usd(k.week / 7)} a day`} />
        <StatTile hue="var(--accent3)" emoji="🗓️" label="This month" value={usd(k.month)} hint={`${usd(k.allTime, { compact: true })} all time`} />
        <StatTile hue="var(--signal)" emoji="🔤" label="Tokens today" value={tokens(k.todayTokens)} hint={`${k.todayRequests.toLocaleString()} API requests`} />
        <StatTile hue="var(--accent2)" emoji="📈" label="30-day rhythm" className="col-span-2 md:col-span-1">
          <Sparkbars
            className="mt-3"
            values={data.daily.map((d) => M.value(d.cost, d.tok))}
            labels={data.daily.map((d) => shortDay(d.day))}
            height={40}
            color="var(--accent2)"
            format={M.format}
          />
        </StatTile>
      </div>

      <Panel title={<PanelTitle emoji="🛰️">Running now</PanelTitle>} aside={k.liveCount ? 'Updates live as sessions work' : undefined} bodyClassName="p-0">
        {data.live.length ? (
          <AnimatePresence initial>
            {data.live.map((s, i) => (
              <LiveLane key={`${s.live?.pid}-${s.id}`} s={s} index={i} />
            ))}
          </AnimatePresence>
        ) : (
          <div className="px-5 py-8 text-[13.5px] text-ink-2">
            No Claude Code sessions are running. Start one with <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[12.5px]">claude</code> in
            any terminal and it shows up here within a second or two.
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title={<PanelTitle emoji="📊">Daily {byTokens ? M.tokenNoun : 'spend'}, last 30 days</PanelTitle>} aside={<MetricToggle />}>
          {month.data ? (
            <DailyCostChart data={byTokens ? tokenDailyRows(month.data.daily, month.data.dayModelTokens, M.kinds) : month.data.daily} metric={metric} height={280} />
          ) : (
            <div className="h-[300px]" />
          )}
        </Panel>
        <Panel title={<PanelTitle emoji="🕘">Recent sessions</PanelTitle>} aside={<Link to="/sessions" className="hover:text-signal">See all</Link>} bodyClassName="p-0">
          {data.recent.length ? <SessionList sessions={data.recent} /> : <div className="p-5 text-ink-3">No past sessions yet.</div>}
        </Panel>
      </div>
    </div>
  );
}
