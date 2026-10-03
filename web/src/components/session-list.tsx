import type { SessionSummary } from '@shared/types.ts';
import { Link } from '@tanstack/react-router';
import { ago, duration, usd } from '@/lib/format';
import { Avatar, projectEmoji } from './avatar';
import { StatusLabel } from './live';

/** Compact list of sessions for side panels. */
export function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <ul className="divide-y divide-line">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            to="/sessions/$id"
            params={{ id: s.id }}
            className="group flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2"
          >
            <Avatar name={s.project} emoji={projectEmoji(s.project)} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-ink group-hover:text-signal">{s.title}</div>
              <div className="mt-0.5 truncate text-[12px] text-ink-3">
                {s.project} · {ago(s.lastAt)}
                {s.startedAt && s.lastAt ? ` · ${duration(s.lastAt - s.startedAt)}` : ''}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-[13.5px] font-medium text-ink">{usd(s.cost)}</div>
              {s.live && <StatusLabel status={s.live.status} className="text-[11.5px]" />}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
