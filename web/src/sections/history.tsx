import type { HistoryEntry } from '@shared/types.ts';
import { Link } from '@tanstack/react-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Avatar, projectEmoji } from '@/components/avatar';
import { Empty, ErrorState, PageHeader, PageSkeleton, SearchInput } from '@/components/ui';
import { useHistory } from '@/lib/api';
import { int, time } from '@/lib/format';

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function Entry({ e }: { e: HistoryEntry }) {
  const [open, setOpen] = useState(false);
  const long = e.text.length > 280 || e.text.split('\n').length > 4;
  const body = (
    <div className={open ? 'whitespace-pre-wrap break-words' : 'line-clamp-3 whitespace-pre-wrap break-words'}>{e.text}</div>
  );
  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-5 py-3">
      <div className="num pt-0.5 text-[12px] text-ink-3">{time(e.ts)}</div>
      <div className="min-w-0 text-[13.5px] text-ink">
        {e.sessionId ? (
          <Link to="/sessions/$id" params={{ id: e.sessionId }} className="block hover:text-signal">
            {body}
          </Link>
        ) : (
          body
        )}
        <div className="mt-1 flex gap-3 text-[12px] text-ink-3">
          <span title={e.cwd} className="inline-flex items-center gap-1.5">
            <Avatar name={e.project} emoji={projectEmoji(e.project)} size={16} rounded="rounded" />
            {e.project}
          </span>
          {long && (
            <button onClick={() => setOpen((o) => !o)} className="hover:text-ink">
              {open ? 'Show less' : 'Show all'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function HistoryPage() {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q);
  const { data, error, isLoading } = useHistory(deferred);
  const groups = useMemo(() => {
    const m = new Map<string, HistoryEntry[]>();
    for (const e of data?.entries ?? []) {
      const k = dayLabel(e.ts);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()];
  }, [data]);

  if (isLoading && !data) return <PageSkeleton />;
  if (error) return <ErrorState error={error} />;

  return (
    <div>
      <PageHeader title="Prompt history" icon="🕰️" actions={<SearchInput value={q} onChange={setQ} placeholder="Search everything you've asked" className="w-72" />}>
        {deferred ? `${int(data?.total ?? 0)} prompts match “${deferred}”.` : `Every prompt you've typed into Claude Code, newest first.`}
        {data && data.total > data.entries.length && ` Showing the latest ${int(data.entries.length)}.`}
      </PageHeader>
      {groups.length === 0 ? (
        <Empty title="No prompts match that search">Try a shorter word, or search by project folder name.</Empty>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, entries]) => (
            <section key={day}>
              <h2 className="mb-2 text-[13px] font-semibold text-ink-2">{day}</h2>
              <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {entries.map((e, i) => (
                  <Entry key={`${e.ts}-${i}`} e={e} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
