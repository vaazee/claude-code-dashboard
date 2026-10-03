import * as Dialog from '@radix-ui/react-dialog';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Bot, Code2, Copy, FolderOpen, GitBranch, Power, SquareTerminal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Avatar, projectEmoji } from '@/components/avatar';
import { LiveRing, StatusLabel } from '@/components/live';
import { TranscriptView } from '@/components/transcript';
import { Button, cx, Empty, ErrorState, Meter, PageSkeleton, Panel, Stat, Tip, useNow } from '@/components/ui';
import { post, useSession } from '@/lib/api';
import { modelColor } from '@/lib/colors';
import { dateTime, duration, int, modelName, time, tokens, usd } from '@/lib/format';

export function SessionDetailPage() {
  const { id } = useParams({ from: '/sessions/$id' });
  const { data: s, error, isLoading } = useSession(id);
  const [agent, setAgent] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const now = useNow(1000);

  const curve = useMemo(() => {
    let acc = 0;
    return (s?.timeline ?? []).map((p) => ({ ts: p.ts, cost: (acc += p.cost) }));
  }, [s?.timeline]);

  if (isLoading) return <PageSkeleton />;
  if (error || !s) {
    return (
      <div>
        <BackLink />
        {error ? <ErrorState error={error} /> : <Empty title="Session not found">It may have been cleaned up by Claude Code's retention policy.</Empty>}
      </div>
    );
  }

  const resumeCmd = `cd ${JSON.stringify(s.cwdAbs)} && claude --resume ${s.id}`;
  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  };
  const open = async (target: 'finder' | 'vscode' | 'cmux') => {
    try {
      await post('/actions/open', { sessionId: s.id, target });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const kill = async () => {
    setConfirmKill(false);
    try {
      await post('/actions/kill', { pid: s.live!.pid });
      toast.success(`Sent stop signal to process ${s.live!.pid}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const elapsed = s.live ? now - s.live.startedAt : s.startedAt && s.lastAt ? s.lastAt - s.startedAt : null;
  const costGap = s.ccCost != null && s.cost > 0 ? Math.abs(s.ccCost - s.cost) / s.cost : 0;
  const agentInfo = s.agents.find((a) => a.id === agent);

  return (
    <div>
      <BackLink />
      <header className="mb-6">
        <div className="flex items-start gap-4">
          {s.live ? <LiveRing status={s.live.status} size={56} /> : <Avatar name={s.project} emoji={projectEmoji(s.project)} size={56} rounded="rounded-2xl" />}
          <div className="min-w-0 flex-1">
            <h1 className="display text-[26px] font-[650] leading-tight text-ink md:text-[30px]">{s.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
              {s.live && <StatusLabel status={s.live.status} />}
              {s.live?.activity && s.live.status === 'busy' && <span className="text-ink-2">{s.live.activity}</span>}
              <Tip content={s.cwdAbs}>
                <span className="font-medium">{s.cwd}</span>
              </Tip>
              {s.gitBranch && (
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="size-3.5" aria-hidden /> {s.gitBranch}
                </span>
              )}
              <span>{dateTime(s.startedAt)}</span>
              {s.version && <span className="text-ink-3">Claude Code {s.version}</span>}
              <button onClick={() => copy(s.id, 'Session ID')} className="font-mono text-[12px] text-ink-3 hover:text-ink">
                {s.id.slice(0, 8)}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="solid" onClick={() => copy(resumeCmd, 'Resume command')}>
            <Copy className="size-3.5" /> Copy resume command
          </Button>
          <Button onClick={() => open('finder')}>
            <FolderOpen className="size-3.5" /> Open folder
          </Button>
          <Button onClick={() => open('vscode')}>
            <Code2 className="size-3.5" /> Open in VS Code
          </Button>
          <Button onClick={() => open('cmux')}>
            <SquareTerminal className="size-3.5" /> Open in cmux
          </Button>
          {s.live && (
            <Button variant="danger" onClick={() => setConfirmKill(true)}>
              <Power className="size-3.5" /> Stop session
            </Button>
          )}
        </div>
      </header>

      {(s.resumedFrom || s.continuedIn.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-[13px] text-ink-2">
          {s.resumedFrom && (
            <span>
              <span aria-hidden>↩️ </span>
              Continues{' '}
              <Link to="/sessions/$id" params={{ id: s.resumedFrom.id }} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:text-signal">
                {s.resumedFrom.title}
              </Link>
              . <span className="num font-medium text-ink">{usd(s.resumedFrom.cost)}</span> was spent before resuming; this session's
              cost covers only what came after.
            </span>
          )}
          {s.continuedIn.map((c) => (
            <span key={c.id}>
              <span aria-hidden>↪️ </span>
              Resumed later as{' '}
              <Link to="/sessions/$id" params={{ id: c.id }} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:text-signal">
                {c.title}
              </Link>
            </span>
          ))}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-5 rounded-xl border border-line bg-surface px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Cost"
          value={usd(s.cost)}
          hint={
            s.ccCost != null && costGap > 0.02 ? (
              <Tip content="Claude Code's own running total, recorded in the transcript. It can differ when a session was resumed or compacted.">
                <span className="underline decoration-dotted">CC reported {usd(s.ccCost)}</span>
              </Tip>
            ) : (
              'API-equivalent'
            )
          }
        />
        <Stat label={s.live ? 'Running for' : 'Duration'} value={duration(elapsed, !!s.live)} hint={s.lastAt ? `last activity ${time(s.lastAt)}` : undefined} />
        <Stat label="Prompts" value={int(s.prompts)} hint={`${int(s.requests)} API requests`} />
        <Stat label="Tokens" value={tokens(s.tokens.input + s.tokens.write + s.tokens.read + s.tokens.output)} hint={`${tokens(s.tokens.output)} output`} />
        <Stat
          label="Lines changed"
          value={
            <span>
              <span className="text-good">+{int(s.linesAdded)}</span> <span className="text-critical">−{int(s.linesRemoved)}</span>
            </span>
          }
          hint={`${s.files.filter((f) => f.edits).length} files edited`}
        />
        <Stat label="Tool calls" value={int(s.toolCalls)} hint={s.subagents ? `${s.subagents} subagents` : 'no subagents'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Conversation" className="min-w-0">
          <TranscriptView sessionId={s.id} onOpenAgent={setAgent} />
        </Panel>

        <aside className="space-y-6">
          {curve.length > 1 && (
            <Panel title="Cost over the session">
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={curve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} hide />
                  <YAxis hide domain={[0, 'dataMax']} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-lg">
                          <div className="text-ink-3">{time(payload[0].payload.ts)}</div>
                          <div className="num font-medium text-ink">{usd(payload[0].payload.cost)}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Area type="stepAfter" dataKey="cost" stroke="var(--accent2)" strokeWidth={2} fill="var(--accent2)" fillOpacity={0.14} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {s.byModel.length > 0 && (
            <Panel title="Models">
              <ul className="space-y-3">
                {s.byModel.map((m) => (
                  <li key={m.model}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <span className="size-2.5 rounded-sm" style={{ background: modelColor(m.model) }} />
                        {modelName(m.model)}
                      </span>
                      <span className="num text-ink">{usd(m.cost)}</span>
                    </div>
                    <div className="text-[11.5px] text-ink-3">
                      {m.requests} requests · {tokens(m.tokens.read)} cache read · {tokens(m.tokens.output)} out
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {s.agents.length > 0 && (
            <Panel title="Subagents" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {s.agents.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => setAgent(a.id)} className="flex w-full items-start gap-2.5 px-5 py-2.5 text-left hover:bg-surface-2">
                      <Bot className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-ink">{a.description ?? a.id}</div>
                        <div className="text-[11.5px] text-ink-3">{a.type ?? 'general-purpose'}</div>
                      </div>
                      <span className="num text-[12.5px] text-ink-2">{usd(a.cost)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {s.tools.length > 0 && (
            <Panel title="Tools used">
              <ul className="space-y-2">
                {s.tools.slice(0, 12).map((t) => (
                  <li key={t.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[12.5px]">
                    <span className="truncate text-ink-2">{t.name.replace(/^mcp__/, '').replace(/__/g, ' · ')}</span>
                    <span className="num text-ink">{t.count}</span>
                    <div className="col-span-2">
                      <Meter value={t.count} max={s.tools[0].count} color="var(--accent3)" />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {s.files.length > 0 && (
            <Panel title="Files touched" aside={`${s.files.length}`} bodyClassName="p-0">
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {s.files.map((f) => (
                  <li key={f.path} className="flex items-center justify-between gap-3 px-5 py-2 text-[12.5px]">
                    <Tip content={f.path}>
                      <span className={cx('min-w-0 truncate font-mono text-[12px]', f.edits ? 'text-ink' : 'text-ink-3')}>
                        {f.path.split('/').pop()}
                      </span>
                    </Tip>
                    <span className="num shrink-0">
                      {f.edits > 0 ? (
                        <>
                          <span className="text-good">+{f.added}</span> <span className="text-critical">−{f.removed}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">read</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>

      {/* Subagent transcript drawer */}
      <Dialog.Root open={!!agent} onOpenChange={(o) => !o && setAgent(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(760px,100vw)] flex-col border-l border-line bg-bg shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="display truncate text-[18px] font-[650] text-ink">{agentInfo?.description ?? 'Subagent'}</Dialog.Title>
                <Dialog.Description className="text-[12.5px] text-ink-3">
                  {agentInfo?.type ?? 'general-purpose'} · {usd(agentInfo?.cost ?? 0)} · {agentInfo?.requests ?? 0} requests
                </Dialog.Description>
              </div>
              <Dialog.Close className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{agent && <TranscriptView sessionId={s.id} agentId={agent} />}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Kill confirmation */}
      <Dialog.Root open={confirmKill} onOpenChange={setConfirmKill}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-line bg-surface p-5 shadow-2xl">
            <Dialog.Title className="display text-[18px] font-[650] text-ink">Stop this session?</Dialog.Title>
            <Dialog.Description className="mt-2 text-[13.5px] text-ink-2">
              This sends SIGTERM to process {s.live?.pid}. Any work in progress stops. The transcript is kept, so you can resume it later with the
              resume command.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button>Keep running</Button>
              </Dialog.Close>
              <Button variant="danger" onClick={kill}>
                <Power className="size-3.5" /> Stop session
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/sessions" className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
      <ArrowLeft className="size-3.5" /> Sessions
    </Link>
  );
}
