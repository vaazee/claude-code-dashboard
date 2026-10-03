import * as Tooltip from '@radix-ui/react-tooltip';
import { clsx } from 'clsx';
import { Search, X } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { PlanetArt } from './art';
import { IconTile } from './avatar';
import { KINDS, useMetric, useTokenKinds, type Metric } from '@/lib/metric';

export const cx = clsx;

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function PageHeader({
  title,
  children,
  actions,
  icon,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {icon && <IconTile size={52}>{icon}</IconTile>}
        <div className="min-w-0">
          <h1 className="display text-[30px] font-[650] leading-tight text-ink">{title}</h1>
          {children && <div className="mt-1 max-w-[72ch] text-[15px] text-ink-2">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('min-w-0 rounded-2xl border border-line bg-surface shadow-[0_1px_0_0_color-mix(in_oklab,var(--text)_4%,transparent),0_12px_32px_-20px_rgb(0_0_0/0.35)]', className)}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title && <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>}
          {aside && <div className="text-[12.5px] text-ink-3">{aside}</div>}
        </div>
      )}
      <div className={bodyClassName ?? 'p-5'}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </div>
      <div className="display num mt-0.5 truncate text-[22px] font-[600] text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'signal' | 'good' | 'warning' | 'critical'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-ink-2',
    signal: 'bg-signal-soft text-signal',
    good: 'bg-good-soft text-good',
    warning: 'bg-warning-soft text-warning',
    critical: 'bg-critical/15 text-critical',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = 'ghost',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'solid' | 'danger' }) {
  const variants = {
    ghost: 'border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
    solid: 'bg-signal text-on-signal shadow-[0_6px_20px_-8px_var(--signal)] hover:brightness-110',
    danger: 'border border-critical/40 text-critical hover:bg-critical/10',
  };
  return (
    <button
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
            value === o.value ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cx('relative flex h-8 items-center', className)}>
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full w-full rounded-lg border border-line bg-surface pl-8 pr-7 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-signal"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 text-ink-3 hover:text-ink" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center">
      <PlanetArt size={112} />
      <div className="mt-3 text-[15px] font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-[52ch] text-[13px] text-ink-3">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-surface-3/70', className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-36" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <Empty title="Couldn't load this view">
      {String((error as Error)?.message ?? error)}. Check that the ccdash server is running, then reload.
    </Empty>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink shadow-lg"
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Horizontal magnitude bar used in ranked lists. */
export function Meter({ value, max, color = 'var(--signal)' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/**
 * Cost / Tokens switch. In token mode it also offers the four token kinds, so you can count
 * everything, leave out cache rereads, or look at output alone. Every chart follows it.
 */
export function MetricToggle({ className, kinds: showKinds = true }: { className?: string; kinds?: boolean }) {
  const [metric, setMetric] = useMetric();
  const [kinds, setKinds] = useTokenKinds();
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <Segmented<Metric>
        label="Measure charts by"
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'cost', label: '$ Cost' },
          { value: 'tokens', label: '# Tokens' },
        ]}
      />
      {metric === 'tokens' && showKinds && (
        <div role="group" aria-label="Token kinds to count" className="inline-flex flex-wrap gap-1">
          {KINDS.map((k) => {
            const on = kinds.includes(k.key);
            return (
              <button
                key={k.key}
                aria-pressed={on}
                title={on && kinds.length === 1 ? 'At least one kind stays selected' : k.blurb}
                onClick={() => setKinds(on ? kinds.filter((x) => x !== k.key) : [...kinds, k.key])}
                className={cx(
                  'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[12px] transition-colors',
                  on ? 'border-line-strong bg-surface text-ink' : 'border-dashed border-line text-ink-3 hover:text-ink-2',
                )}
              >
                <span className="size-2 rounded-sm" style={{ background: on ? k.color : 'var(--line-strong)' }} aria-hidden />
                {k.short}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
