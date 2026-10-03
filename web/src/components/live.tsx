import type { SessionSummary } from '@shared/types.ts';
import { Link } from '@tanstack/react-router';
import { GitBranch, Hourglass, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { duration, usd } from '@/lib/format';
import { Avatar, projectEmoji } from './avatar';
import { cx, useNow } from './ui';

export function statusOf(status: string | undefined) {
  if (status === 'busy') return { label: 'Working', tone: 'good' as const, color: 'var(--good)', Icon: Zap };
  if (status === 'idle') return { label: 'Waiting for you', tone: 'warning' as const, color: 'var(--warning)', Icon: Hourglass };
  return { label: status ? status[0].toUpperCase() + status.slice(1) : 'Unknown', tone: 'neutral' as const, color: 'var(--text-3)', Icon: Hourglass };
}

/** The status ring: an orbiting arc while working, a slow breathing halo while it waits on you. */
export function LiveRing({ status, size = 44 }: { status: string; size?: number }) {
  const s = statusOf(status);
  const busy = status === 'busy';
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      {busy ? (
        <g className="ring-orbit">
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c}`}
          />
        </g>
      ) : (
        <>
          <circle cx="20" cy="20" r="6" fill={s.color} className="ring-breathe" />
          <circle cx="20" cy="20" r={r} fill="none" stroke={s.color} strokeWidth="3" opacity="0.55" />
        </>
      )}
      <circle cx="20" cy="20" r="5" fill={s.color} />
    </svg>
  );
}

export function StatusLabel({ status, className }: { status: string; className?: string }) {
  const s = statusOf(status);
  return (
    <span className={cx('inline-flex items-center gap-1 text-[12.5px] font-medium', className)} style={{ color: s.color }}>
      <s.Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

/** One live session as a horizontal lane: identity on the left, a ticking clock and spend on the right. */
export function LiveLane({ s, index }: { s: SessionSummary; index: number }) {
  const now = useNow(1000);
  const live = s.live!;
  const status = statusOf(live.status);
  const since = live.statusUpdatedAt ? now - live.statusUpdatedAt : null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: 'easeOut' }}
    >
      <Link
        to="/sessions/$id"
        params={{ id: s.id }}
        className="group grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-2 md:grid-cols-[auto_minmax(0,1fr)_auto]"
      >
        <LiveRing status={live.status} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            <span className="truncate text-[15px] font-semibold text-ink group-hover:text-signal">{s.title}</span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Avatar name={s.project} emoji={projectEmoji(s.project)} size={18} rounded="rounded-md" />
              {s.project}
            </span>
            {s.gitBranch && (
              <span className="inline-flex items-center gap-0.5 text-[12px] text-ink-3">
                <GitBranch className="size-3" aria-hidden />
                {s.gitBranch}
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[13px]">
            <StatusLabel status={live.status} />
            <span className="truncate text-ink-2">
              {live.status === 'busy'
                ? live.activity ?? 'Thinking…'
                : since != null
                  ? `for ${duration(since)}${live.activity ? ` · last: ${live.activity}` : ''}`
                  : live.activity}
            </span>
          </div>
        </div>
        <div className="col-span-2 flex items-baseline gap-6 pl-[60px] md:col-span-1 md:pl-0 md:text-right">
          <div>
            <div className="display num text-[19px] font-[600] text-ink">{duration(now - live.startedAt, true)}</div>
            <div className="text-[11.5px] text-ink-3">running</div>
          </div>
          <div className="min-w-[72px]">
            <div className="display num text-[19px] font-[600]" style={{ color: status.tone === 'good' ? 'var(--text)' : 'var(--text-2)' }}>
              {usd(s.cost)}
            </div>
            <div className="text-[11.5px] text-ink-3" title={s.resumedFrom ? `Resumed from “${s.resumedFrom.title}”` : undefined}>
              {s.resumedFrom ? `+${usd(s.resumedFrom.cost)} before resume` : `${s.prompts} prompts`}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
