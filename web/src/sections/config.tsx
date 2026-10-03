import type { ConfigFile } from '@shared/types.ts';
import { ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CodeBlock, Markdown } from '@/components/markdown';
import { cx, Empty, ErrorState, PageHeader, PageSkeleton, Pill, Segmented } from '@/components/ui';
import { useConfig } from '@/lib/api';

type Tab = 'settings' | 'hooks' | 'claudeMd' | 'memory' | 'scripts';

function FileBrowser({ files, groupOf }: { files: ConfigFile[]; groupOf?: (f: ConfigFile) => string }) {
  const [selected, setSelected] = useState(0);
  const [raw, setRaw] = useState(false);
  const file = files[Math.min(selected, files.length - 1)];
  const groups = useMemo(() => {
    const m = new Map<string, { f: ConfigFile; i: number }[]>();
    files.forEach((f, i) => {
      const g = groupOf?.(f) ?? '';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push({ f, i });
    });
    return [...m.entries()];
  }, [files, groupOf]);
  if (!files.length) return <Empty title="Nothing here yet" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav className="max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-1.5" aria-label="Files">
        {groups.map(([g, items]) => (
          <div key={g} className="mb-1">
            {g && <div className="truncate px-2.5 pb-1 pt-2 text-[11.5px] text-ink-3">{g}</div>}
            {items.map(({ f, i }) => (
              <button
                key={`${f.path}-${i}`}
                onClick={() => setSelected(i)}
                className={cx(
                  'block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px]',
                  i === selected ? 'bg-signal-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5">
          <span className="truncate font-mono text-[12px] text-ink-3">{file.path}</span>
          {file.language === 'markdown' && (
            <Segmented<'r' | 'm'>
              label="View as"
              value={raw ? 'r' : 'm'}
              onChange={(v) => setRaw(v === 'r')}
              options={[
                { value: 'm', label: 'Rendered' },
                { value: 'r', label: 'Source' },
              ]}
            />
          )}
        </div>
        <div className="p-5">
          {file.language === 'markdown' && !raw ? (
            <Markdown text={file.content.replace(/^---\n[\s\S]*?\n---\n/, '')} className="max-w-[78ch] text-[14px] text-ink" />
          ) : (
            <CodeBlock text={file.content} maxHeight={640} className="border-0 bg-transparent p-0" />
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfigPage() {
  const { data, error, isLoading } = useConfig();
  const [tab, setTab] = useState<Tab>('settings');
  const memoryFiles = useMemo(
    () => (data?.memory ?? []).flatMap((m) => m.files.map((f) => ({ ...f, group: m.project }))),
    [data],
  );
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} />;

  return (
    <div>
      <PageHeader
        title="Config and memory"
        icon="⚙️"
        actions={
          <Segmented<Tab>
            label="Config section"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'settings', label: 'Settings' },
              { value: 'hooks', label: `Hooks (${data.hooks.length})` },
              { value: 'claudeMd', label: `CLAUDE.md (${data.claudeMd.length})` },
              { value: 'memory', label: `Memory (${memoryFiles.length})` },
              { value: 'scripts', label: 'Scripts' },
            ]}
          />
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-good" aria-hidden />
          Read-only. Tokens, keys and env values are masked before they reach this page.
        </span>
      </PageHeader>

      <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border border-line bg-surface px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
        {data.facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[12px] text-ink-3">{f.label}</dt>
            <dd className="truncate text-[14px] font-medium text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      {tab === 'settings' && <FileBrowser files={data.settings} />}
      {tab === 'claudeMd' && <FileBrowser files={data.claudeMd} />}
      {tab === 'memory' && <FileBrowser files={memoryFiles} groupOf={(f) => (f as ConfigFile & { group: string }).group} />}
      {tab === 'scripts' && <FileBrowser files={data.scripts} />}
      {tab === 'hooks' &&
        (data.hooks.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {data.hooks.map((h, i) => (
              <div key={i} className="px-5 py-3.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Pill tone="signal">{h.event}</Pill>
                  {h.matcher && <span className="font-mono text-[12px] text-ink-3">matcher: {h.matcher}</span>}
                </div>
                <CodeBlock text={h.command} maxHeight={160} />
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No hooks configured">Hooks run shell commands on Claude Code events, such as when a session stops.</Empty>
        ))}
    </div>
  );
}
