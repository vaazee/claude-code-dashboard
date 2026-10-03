import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cx } from './ui';

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cx('prose-md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

export function CodeBlock({ text, className, maxHeight = 420 }: { text: string; className?: string; maxHeight?: number }) {
  return (
    <pre
      className={cx('overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-2', className)}
      style={{ maxHeight }}
    >
      {text}
    </pre>
  );
}
