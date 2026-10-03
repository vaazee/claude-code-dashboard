import type { SkillInfo } from '@shared/types.ts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Avatar, mcpEmoji, skillEmoji } from '@/components/avatar';
import { cx, Empty, ErrorState, Meter, PageHeader, PageSkeleton, Pill, SearchInput, Segmented, Tip } from '@/components/ui';
import { useInventory } from '@/lib/api';
import { ago, int } from '@/lib/format';

type Tab = 'skills' | 'plugins' | 'mcp';
type Source = 'all' | SkillInfo['source'];

const SOURCE_LABEL: Record<SkillInfo['source'], string> = {
  user: 'Yours',
  plugin: 'Plugin',
  project: 'Project',
  builtin: 'Built in',
};

export function SkillsPage() {
  const search = useSearch({ from: '/skills' });
  const navigate = useNavigate({ from: '/skills' });
  const q = search.q ?? '';
  const setQ = (v: string) => navigate({ search: { q: v || undefined }, replace: true });
  const [tab, setTab] = useState<Tab>('skills');
  const [source, setSource] = useState<Source>('all');
  const { data, error, isLoading } = useInventory();

  const skills = useMemo(() => {
    const needle = q.toLowerCase();
    return (data?.skills ?? []).filter(
      (s) =>
        (source === 'all' || s.source === source) &&
        (!needle || `${s.qualifiedName} ${s.description} ${s.plugin ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [data, q, source]);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} />;

  const used = data.skills.filter((s) => s.usageCount + s.transcriptCalls > 0).length;
  const maxUse = Math.max(...data.skills.map((s) => s.usageCount + s.transcriptCalls), 1);
  const maxMcp = Math.max(...data.mcp.map((m) => m.calls), 1);

  return (
    <div>
      <PageHeader
        title="Skills, plugins and MCP servers"
        icon="🧩"
        actions={
          <Segmented<Tab>
            label="Inventory section"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'skills', label: `Skills (${data.skills.length})` },
              { value: 'plugins', label: `Plugins (${data.plugins.length})` },
              { value: 'mcp', label: `MCP servers (${data.mcp.length})` },
            ]}
          />
        }
      >
        Everything that extends Claude Code on this laptop. {used} of {data.skills.length} skills, commands and agents have been used.
      </PageHeader>

      {tab === 'skills' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search names and descriptions" className="w-full sm:w-72" />
            <Segmented<Source>
              label="Source"
              value={source}
              onChange={setSource}
              options={[
                { value: 'all', label: 'All' },
                { value: 'user', label: 'Yours' },
                { value: 'plugin', label: 'Plugins' },
                { value: 'project', label: 'Projects' },
                { value: 'builtin', label: 'Built in' },
              ]}
            />
          </div>
          {skills.length === 0 ? (
            <Empty title="No skills match" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] text-ink-3">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">What it does</th>
                    <th className="w-36 px-3 py-2.5 font-medium">Uses</th>
                    <th className="px-4 py-2.5 text-right font-medium">Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s) => {
                    const uses = s.usageCount + s.transcriptCalls;
                    return (
                      <tr key={`${s.source}-${s.kind}-${s.qualifiedName}-${s.path}`} className="border-b border-line align-top last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                          <Avatar name={s.name} emoji={skillEmoji(s.qualifiedName)} size={36} />
                          <div className="min-w-0">
                          <Tip content={s.path || 'Ships with Claude Code'}>
                            <div className="font-medium text-ink">{s.kind === 'command' ? `/${s.name}` : s.name}</div>
                          </Tip>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Pill tone={s.source === 'user' ? 'signal' : 'neutral'}>{SOURCE_LABEL[s.source]}</Pill>
                            {s.kind !== 'skill' && <Pill>{s.kind}</Pill>}
                            {s.plugin && <Pill>{s.plugin}</Pill>}
                          </div>
                          </div>
                          </div>
                        </td>
                        <td className="max-w-[560px] px-3 py-3 text-ink-2">
                          <p className="line-clamp-2">{s.description || <span className="text-ink-3">No description</span>}</p>
                        </td>
                        <td className="px-3 py-3">
                          {uses ? (
                            <Tip content={`${s.usageCount} invocations recorded by Claude Code, ${s.transcriptCalls} calls found in transcripts`}>
                              <div>
                                <div className="num mb-1 text-ink">{int(uses)}</div>
                                <Meter value={uses} max={maxUse} />
                              </div>
                            </Tip>
                          ) : (
                            <span className="text-ink-3">Never</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-ink-2">{ago(s.lastUsedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'plugins' && (
        <div className="space-y-6">
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {data.plugins.length === 0 && <div className="p-5 text-ink-3">No plugins installed.</div>}
            {data.plugins.map((p) => (
              <div key={p.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 max-w-[76ch] items-start gap-3.5">
                <Avatar name={p.name} emoji={skillEmoji(p.name)} size={44} rounded="rounded-xl" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{p.name}</span>
                    {p.version && <span className="text-[12px] text-ink-3">v{p.version}</span>}
                    <Pill tone={p.enabled ? 'good' : 'neutral'}>{p.enabled ? 'Enabled' : 'Disabled'}</Pill>
                  </div>
                  {p.description && <p className="mt-1 text-[13px] text-ink-2">{p.description}</p>}
                  <div className="mt-1 text-[12px] text-ink-3">
                    From {p.marketplace} · installed {ago(p.installedAt ? Date.parse(p.installedAt) : null)}
                  </div>
                </div>
                </div>
                <div className="flex gap-5 text-[13px]">
                  {[
                    ['skills', p.skills],
                    ['commands', p.commands],
                    ['agents', p.agents],
                  ].map(([label, n]) => (
                    <div key={label as string} className={cx(!n && 'opacity-50')}>
                      <div className="display num text-[17px] font-[600] text-ink">{n}</div>
                      <div className="text-[11.5px] text-ink-3">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <h2 className="mb-2 text-[13.5px] font-semibold text-ink">Marketplaces</h2>
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {data.marketplaces.map((m) => (
                <div key={m.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <div>
                    <span className="font-medium text-ink">{m.name}</span>
                    <span className="ml-2 font-mono text-[12px] text-ink-3">{m.source}</span>
                  </div>
                  <span className="text-ink-3">updated {ago(m.lastUpdated ? Date.parse(m.lastUpdated) : null)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'mcp' && (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {data.mcp.map((m) => (
            <div key={m.name} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 items-start gap-3.5">
              <Avatar name={m.name} emoji={mcpEmoji(m.name)} size={44} rounded="rounded-xl" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-ink">{m.name.replace(/^claude_ai_/, '')}</span>
                  <Pill tone={m.scope === 'user' ? 'signal' : 'neutral'}>
                    {m.scope === 'connector' ? 'claude.ai connector' : m.scope === 'session' ? 'Added per session' : m.scope.replace(/^project:/, 'Project ')}
                  </Pill>
                  {m.transport && <Pill>{m.transport}</Pill>}
                </div>
                {m.command && <div className="mt-1 truncate font-mono text-[12px] text-ink-3">{m.command}</div>}
                <div className="mt-2 text-[12.5px] text-ink-2">
                  {m.calls ? (
                    <>
                      <span className="num font-medium text-ink">{int(m.calls)}</span> tool calls · last used {ago(m.lastUsedAt)}
                    </>
                  ) : (
                    <span className="text-ink-3">Configured but never called</span>
                  )}
                </div>
                {m.calls > 0 && (
                  <div className="mt-1.5 max-w-xs">
                    <Meter value={m.calls} max={maxMcp} color="var(--accent2)" />
                  </div>
                )}
              </div>
              </div>
              {m.topTools.length > 0 && (
                <div className="flex flex-wrap content-start gap-1.5">
                  {m.topTools.map((t) => (
                    <Pill key={t.tool}>
                      {t.tool.replace(/_/g, ' ')} <span className="num text-ink-3">{t.count}</span>
                    </Pill>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
