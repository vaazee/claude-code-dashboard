import type { TranscriptItem } from '@shared/types.ts';
import {
  BookOpen,
  Bot,
  Brain,
  ChevronRight,
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Plug,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranscript } from '@/lib/api';
import { modelName, time, tokens, usd } from '@/lib/format';
import { CodeBlock, Markdown } from './markdown';
import { Button, cx, Empty, Skeleton } from './ui';

const TOOL_ICONS: Record<string, typeof Wrench> = {
  Bash: SquareTerminal,
  Read: FileText,
  Write: FilePen,
  Edit: FilePen,
  MultiEdit: FilePen,
  NotebookEdit: FilePen,
  Grep: Search,
  Glob: Search,
  WebFetch: Globe,
  WebSearch: Globe,
  Skill: Sparkles,
  Agent: Bot,
  Task: Bot,
  TodoWrite: ListChecks,
};

function toolIcon(name: string) {
  if (name.startsWith('mcp__')) return Plug;
  return TOOL_ICONS[name] ?? Wrench;
}

function toolLabel(name: string) {
  if (!name.startsWith('mcp__')) return name;
  const rest = name.slice(5);
  const i = rest.lastIndexOf('__');
  return i < 0 ? rest : `${rest.slice(0, i).replace(/^claude_ai_/, '')} · ${rest.slice(i + 2)}`;
}

function ToolInput({ name, input }: { name: string; input: any }) {
  if (name === 'Bash' && input?.command) return <CodeBlock text={`$ ${input.command}`} />;
  if ((name === 'Edit' || name === 'MultiEdit') && input) {
    const edits = name === 'Edit' ? [input] : input.edits ?? [];
    return (
      <div className="space-y-2">
        {edits.map((e: any, i: number) => (
          <div key={i} className="overflow-hidden rounded-lg border border-line font-mono text-[12px]">
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words bg-critical/8 px-3 py-2 text-ink-2">
              {String(e.old_string ?? '')
                .split('\n')
                .map((l) => `- ${l}`)
                .join('\n')}
            </pre>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-good/8 px-3 py-2 text-ink-2">
              {String(e.new_string ?? '')
                .split('\n')
                .map((l) => `+ ${l}`)
                .join('\n')}
            </pre>
          </div>
        ))}
      </div>
    );
  }
  if (name === 'Write' && input?.content) return <CodeBlock text={input.content} maxHeight={320} />;
  return <CodeBlock text={JSON.stringify(input, null, 2)} maxHeight={320} />;
}

function ToolRow({ item, onOpenAgent }: { item: Extract<TranscriptItem, { kind: 'tool' }>; onOpenAgent?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = toolIcon(item.name);
  const err = item.result?.isError;
  return (
    <div className={cx('rounded-lg border', err ? 'border-critical/40' : 'border-line', open && 'bg-surface-2')}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px]"
      >
        <ChevronRight className={cx('size-3.5 shrink-0 text-ink-3 transition-transform', open && 'rotate-90')} aria-hidden />
        <Icon className={cx('size-3.5 shrink-0', err ? 'text-critical' : 'text-ink-3')} aria-hidden />
        <span className="shrink-0 font-medium text-ink">{toolLabel(item.name)}</span>
        <span className="min-w-0 truncate text-ink-3">{item.summary?.split('\n')[0]}</span>
        {err && <span className="ml-auto shrink-0 text-[11.5px] font-medium text-critical">Error</span>}
        {!item.result && <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">no result</span>}
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-3">
          <ToolInput name={item.name} input={item.input} />
          {item.result && (
            <div>
              <div className="mb-1 text-[11.5px] text-ink-3">Result{item.result.truncated ? ' (truncated)' : ''}</div>
              <CodeBlock text={item.result.text || '(empty)'} className={err ? 'border-critical/40' : ''} maxHeight={360} />
            </div>
          )}
          {item.agentId && onOpenAgent && (
            <Button onClick={() => onOpenAgent(item.agentId!)}>
              <Bot className="size-3.5" /> Open subagent transcript
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-[12.5px]">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink-2">
        <Brain className="size-3.5" aria-hidden />
        {open ? 'Hide thinking' : 'Show thinking'}
      </button>
      {open && <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-line pl-3 italic text-ink-3">{text}</div>}
    </div>
  );
}

const PAGE = 400;

export function TranscriptView({
  sessionId,
  agentId,
  onOpenAgent,
}: {
  sessionId: string;
  agentId?: string | null;
  onOpenAgent?: (id: string) => void;
}) {
  const { data, isLoading, error } = useTranscript(sessionId, agentId);
  const [showTools, setShowTools] = useState(true);
  const [showThinking, setShowThinking] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (i) => (showTools || i.kind !== 'tool') && (showThinking || i.kind !== 'thinking'),
      ),
    [data, showTools, showThinking],
  );

  if (isLoading) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (error) return <Empty title="Couldn't read this transcript">{String((error as Error).message)}</Empty>;
  if (!data?.items.length) return <Empty title="No conversation yet">Messages appear here as soon as the session writes them.</Empty>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12.5px] text-ink-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} className="accent-[var(--signal)]" />
          Tool calls
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} className="accent-[var(--signal)]" />
          Thinking
        </label>
        {data.truncated && <span className="text-warning">Very long transcript: showing the most recent part.</span>}
      </div>
      <ol className="space-y-3">
        {items.slice(0, limit).map((item) => (
          <li key={item.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}>
            {item.kind === 'prompt' &&
              (item.command ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1 font-mono text-[12px] text-ink-2">
                  {item.text}
                </div>
              ) : (
                <div className="rounded-xl border border-signal/30 bg-signal-soft/60 px-4 py-3">
                  <div className="mb-1 flex items-center justify-between text-[11.5px] text-ink-3">
                    <span className="font-medium text-signal">You</span>
                    <span className="num">{time(item.ts)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[14px] text-ink">{item.text}</div>
                </div>
              ))}
            {item.kind === 'text' && (
              <div className="px-1">
                <Markdown text={item.text} className="text-[14px] text-ink" />
              </div>
            )}
            {item.kind === 'thinking' && <Thinking text={item.text} />}
            {item.kind === 'tool' && <ToolRow item={item} onOpenAgent={onOpenAgent} />}
            {item.kind === 'system' && (
              <div className={cx('text-center text-[12px]', item.level === 'error' ? 'text-critical' : 'text-ink-3')}>{item.text}</div>
            )}
            {item.kind === 'turn' && (
              <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
                <div className="h-px flex-1 bg-line" />
                <span className="num">
                  {usd(item.cost)} · {tokens(item.tokens.output)} out · {modelName(item.model)}
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
      {items.length > limit && (
        <div className="mt-4 text-center">
          <Button onClick={() => setLimit((l) => l + PAGE)}>
            <BookOpen className="size-3.5" /> Show {Math.min(PAGE, items.length - limit)} more of {items.length - limit}
          </Button>
        </div>
      )}
    </div>
  );
}
