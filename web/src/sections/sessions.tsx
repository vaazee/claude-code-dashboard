import type { SessionSummary } from '@shared/types.ts';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowDown, Bookmark, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, projectEmoji } from '@/components/avatar';
import { StatusLabel } from '@/components/live';
import { Button, cx, Empty, ErrorState, PageHeader, PageSkeleton, SearchInput, Segmented, Tip } from '@/components/ui';
import { useSessions } from '@/lib/api';
import { modelColor } from '@/lib/colors';
import { dateTime, duration, int, modelName, tokens, usd } from '@/lib/format';

type Range = '1' | '7' | '30' | '90' | 'all';
type Sort = 'recent' | 'cost' | 'duration' | 'prompts';
type View = { name: string; q: string; range: Range; project: string; liveOnly: boolean; sort: Sort };

const VIEWS_KEY = 'ccdash-session-views';
function loadViews(): View[] {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveViews(v: View[]) {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(v));
  } catch {}
}

function matches(s: SessionSummary, q: string): boolean {
  if (!q) return true;
  const hay = `${s.title} ${s.firstPrompt ?? ''} ${s.lastPrompt ?? ''} ${s.project} ${s.cwd} ${s.id} ${s.gitBranch ?? ''}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export function SessionsPage() {
  const search = useSearch({ from: '/sessions' });
  const navigate = useNavigate({ from: '/sessions' });
  const q = search.q ?? '';
  const setQ = (v: string) => navigate({ search: { q: v || undefined }, replace: true });
  const [range, setRange] = useState<Range>('all');
  const [project, setProject] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('recent');
  const [limit, setLimit] = useState(150);
  const [views, setViews] = useState<View[]>(loadViews);
  const { data, error, isLoading } = useSessions();

  const projects = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data ?? []) m.set(s.project, (m.get(s.project) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const rows = useMemo(() => {
    const since = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
    const out = (data ?? []).filter(
      (s) => (s.lastAt ?? 0) >= since && (!project || s.project === project) && (!liveOnly || s.live) && matches(s, q),
    );
    const dur = (s: SessionSummary) => (s.lastAt ?? 0) - (s.startedAt ?? 0);
    const by: Record<Sort, (a: SessionSummary, b: SessionSummary) => number> = {
      recent: (a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0),
      cost: (a, b) => b.cost - a.cost,
      duration: (a, b) => dur(b) - dur(a),
      prompts: (a, b) => b.prompts - a.prompts,
    };
    return out.sort(by[sort]);
  }, [data, range, project, liveOnly, q, sort]);

  const totals = useMemo(
    () => ({ cost: rows.reduce((n, s) => n + s.cost, 0), prompts: rows.reduce((n, s) => n + s.prompts, 0) }),
    [rows],
  );

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} />;

  const applyView = (v: View) => {
    setQ(v.q);
    setRange(v.range);
    setProject(v.project);
    setLiveOnly(v.liveOnly);
    setSort(v.sort);
  };
  const saveView = () => {
    const name = [q && `“${q}”`, project, range !== 'all' && `${range}d`, liveOnly && 'live', sort !== 'recent' && `by ${sort}`]
      .filter(Boolean)
      .join(' ');
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, q, range, project, liveOnly, sort }];
    setViews(next);
    saveViews(next);
  };
  const removeView = (name: string) => {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    saveViews(next);
  };

  return (
    <div>
      <PageHeader title="Sessions" icon="🗂️">
        {int(rows.length)} of {int(data?.length ?? 0)} sessions, {usd(totals.cost)} and {int(totals.prompts)} prompts in this view.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search titles, prompts, paths, branches" className="w-full sm:w-80" />
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Project"
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink-2"
        >
          <option value="">All projects</option>
          {projects.map(([p, n]) => (
            <option key={p} value={p}>
              {p} ({n})
            </option>
          ))}
        </select>
        <Segmented<Range>
          label="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: '1', label: '24h' },
            { value: '7', label: '7d' },
            { value: '30', label: '30d' },
            { value: '90', label: '90d' },
            { value: 'all', label: 'All' },
          ]}
        />
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} className="accent-[var(--signal)]" />
          Running only
        </label>
        <Button onClick={saveView} title="Save these filters as a view">
          <Bookmark className="size-3.5" /> Save view
        </Button>
      </div>

      {views.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {views.map((v) => (
            <span key={v.name} className="inline-flex items-center rounded-lg border border-line bg-surface text-[12.5px] text-ink-2">
              <button onClick={() => applyView(v)} className="py-1 pl-2.5 pr-1.5 hover:text-ink">
                {v.name}
              </button>
              <button onClick={() => removeView(v.name)} className="py-1 pr-2 text-ink-3 hover:text-critical" aria-label={`Remove view ${v.name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty title="No sessions match these filters">Clear the search or widen the time range.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-ink-3">
                <th className="px-4 py-2.5 font-medium">Session</th>
                <th className="px-3 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 font-medium">Models</th>
                <SortTh label="Started" active={sort === 'recent'} onClick={() => setSort('recent')} />
                <SortTh label="Duration" active={sort === 'duration'} onClick={() => setSort('duration')} align="right" />
                <SortTh label="Prompts" active={sort === 'prompts'} onClick={() => setSort('prompts')} align="right" />
                <SortTh label="Cost" active={sort === 'cost'} onClick={() => setSort('cost')} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((s) => (
                <tr key={s.id} className="group border-b border-line last:border-b-0 hover:bg-surface-2">
                  <td className="max-w-[420px] px-4 py-2.5">
                    <Link to="/sessions/$id" params={{ id: s.id }} className="block">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink group-hover:text-signal">{s.title}</span>
                        {s.live && <StatusLabel status={s.live.status} className="shrink-0 text-[11.5px]" />}
                        {s.resumedFrom && (
                          <span className="shrink-0 rounded-md bg-surface-3 px-1.5 text-[11px] text-ink-2" title={`Resumed from “${s.resumedFrom.title}”`}>
                            ↩️ resumed
                          </span>
                        )}
                      </div>
                      {s.lastPrompt && s.lastPrompt !== s.title && (
                        <div className="mt-0.5 truncate text-[12px] text-ink-3">Last: {s.lastPrompt}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Tip content={s.cwd}>
                      <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-2">
                        <Avatar name={s.project} emoji={projectEmoji(s.project)} size={22} rounded="rounded-md" />
                        {s.project}
                      </span>
                    </Tip>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {s.models.map((m) => (
                        <span key={m} className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-ink-2">
                          <span className="size-2 rounded-full" style={{ background: modelColor(m) }} />
                          {modelName(m)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-ink-2">{dateTime(s.startedAt)}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-right text-ink-2">
                    {s.startedAt && s.lastAt ? duration(s.lastAt - s.startedAt) : '—'}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink-2">{s.prompts}</td>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-right">
                    <Tip content={`${tokens(s.tokens.input + s.tokens.write + s.tokens.read)} in, ${tokens(s.tokens.output)} out, ${s.requests} requests`}>
                      <span className="font-medium text-ink">{usd(s.cost)}</span>
                    </Tip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && (
            <div className="border-t border-line p-3 text-center">
              <Button onClick={() => setLimit((l) => l + 300)}>Show {Math.min(300, rows.length - limit)} more</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortTh({ label, active, onClick, align }: { label: string; active: boolean; onClick: () => void; align?: 'right' }) {
  return (
    <th className={cx('px-3 py-2.5 font-medium', align === 'right' && 'text-right')} aria-sort={active ? 'descending' : 'none'}>
      <button onClick={onClick} className={cx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}>
        {label}
        {active && <ArrowDown className="size-3" aria-hidden />}
      </button>
    </th>
  );
}
