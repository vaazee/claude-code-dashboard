import { Link } from '@tanstack/react-router';
import { Brain, FileText, Plug } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, projectEmoji } from '@/components/avatar';
import { Sparkbars } from '@/components/charts';
import { Empty, ErrorState, PageHeader, PageSkeleton, Pill, SearchInput, Segmented } from '@/components/ui';
import { useProjects } from '@/lib/api';
import { ago, int, shortDay, usd } from '@/lib/format';
import { localDateOf } from '@shared/pricing.ts';

type Sort = 'recent' | 'cost' | 'sessions';

export function ProjectsPage() {
  const { data, error, isLoading } = useProjects();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const dayLabels = useMemo(() => Array.from({ length: 14 }, (_, i) => shortDay(localDateOf(Date.now() - (13 - i) * 86400000))), []);

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    const out = (data ?? []).filter((p) => !needle || p.cwd.toLowerCase().includes(needle));
    if (sort === 'cost') out.sort((a, b) => b.cost - a.cost);
    if (sort === 'sessions') out.sort((a, b) => b.sessions - a.sessions);
    if (sort === 'recent') out.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));
    return out;
  }, [data, q, sort]);

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} />;

  return (
    <div>
      <PageHeader
        title="Projects"
        icon="📁"
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Filter by path" className="w-56" />
            <Segmented<Sort>
              label="Sort projects"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'recent', label: 'Recent' },
                { value: 'cost', label: 'Cost' },
                { value: 'sessions', label: 'Sessions' },
              ]}
            />
          </>
        }
      >
        Every folder you've run Claude Code in, with its spend and the context Claude loads there.
      </PageHeader>

      {rows.length === 0 ? (
        <Empty title="No projects match that filter" />
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((p) => (
            <div key={p.cwdAbs} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_160px] md:items-center">
              <div className="flex min-w-0 items-start gap-3.5">
                <Avatar name={p.project} emoji={projectEmoji(p.project)} size={44} rounded="rounded-xl" />
                <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link to="/sessions" search={{ q: p.cwd }} className="truncate text-[15px] font-semibold text-ink hover:text-signal">
                    {p.project}
                  </Link>
                  {p.live > 0 && <Pill tone="good">{p.live} running</Pill>}
                </div>
                <div className="truncate font-mono text-[12px] text-ink-3">{p.cwd}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.claudeMd.map((f) => (
                    <Pill key={f}>
                      <FileText className="size-3" aria-hidden /> {f}
                    </Pill>
                  ))}
                  {p.memoryFiles > 0 && (
                    <Pill>
                      <Brain className="size-3" aria-hidden /> {p.memoryFiles} memory files
                    </Pill>
                  )}
                  {p.mcpServers.map((m) => (
                    <Pill key={m}>
                      <Plug className="size-3" aria-hidden /> {m}
                    </Pill>
                  ))}
                </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-[13px]">
                <div>
                  <div className="display num text-[17px] font-[600] text-ink">{usd(p.cost)}</div>
                  <div className="text-[11.5px] text-ink-3">total</div>
                </div>
                <div>
                  <div className="display num text-[17px] font-[600] text-ink">{int(p.sessions)}</div>
                  <div className="text-[11.5px] text-ink-3">{p.sessions === 1 ? 'session' : 'sessions'}</div>
                </div>
                <div>
                  <div className="text-[13px] text-ink">{ago(p.lastAt)}</div>
                  <div className="text-[11.5px] text-ink-3">last active</div>
                </div>
              </div>
              <div>
                <Sparkbars values={p.daily} labels={dayLabels} height={34} />
                <div className="mt-1 text-[11px] text-ink-3">last 14 days</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
