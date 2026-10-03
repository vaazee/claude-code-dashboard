import * as Popover from '@radix-ui/react-popover';
import { Check, Palette } from 'lucide-react';
import { THEMES, useAppearance, type Theme } from '@/lib/themes';
import { cx } from './ui';

function ThemeCard({ theme, selected, onSelect }: { theme: Theme; selected: boolean; onSelect: () => void }) {
  const t = theme.tokens;
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      title={theme.blurb}
      className={cx(
        'group relative overflow-hidden rounded-xl border text-left transition-shadow',
        selected ? 'border-signal ring-2 ring-signal/40' : 'border-line hover:border-line-strong',
      )}
    >
      {/* Miniature of the app in the theme's own colors, showing all three of its hues */}
      <div
        className="flex h-[64px] gap-1 p-1.5"
        style={{ background: `radial-gradient(80% 120% at 100% 0%, color-mix(in oklab, ${t.glow2} 30%, transparent), transparent), ${t.bg}` }}
      >
        <div className="flex w-4 flex-col items-center gap-1 rounded-[4px] pt-1.5" style={{ background: t.surface }}>
          <div className="size-1.5 rounded-full" style={{ background: t.signal }} />
          <div className="size-1 rounded-full" style={{ background: t['text-3'] }} />
          <div className="size-1 rounded-full" style={{ background: t['text-3'] }} />
        </div>
        <div className="flex-1 space-y-1 rounded-[4px] p-1.5" style={{ background: t.surface }}>
          <div className="h-1.5 w-3/4 rounded-full" style={{ background: `linear-gradient(90deg, ${t.text}, ${t.signal})` }} />
          <div className="h-1 w-1/2 rounded-full" style={{ background: t['text-3'] }} />
          <div className="flex items-end gap-0.5 pt-0.5">
            {[
              [6, t.signal],
              [10, t.signal],
              [7, t.accent2],
              [13, t.accent2],
              [9, t.accent3],
              [5, t['line-strong']],
            ].map(([h, c], i) => (
              <div key={i} className="w-1.5 rounded-t-[1px]" style={{ height: h as number, background: c as string }} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 bg-surface px-2 py-1.5 text-[12px] font-medium text-ink">
        <span aria-hidden>{theme.emoji}</span>
        {theme.name}
        <span className="ml-auto flex gap-0.5" aria-hidden>
          {[t.signal, t.accent2, t.accent3].map((c) => (
            <span key={c} className="size-2 rounded-full" style={{ background: c }} />
          ))}
        </span>
        {selected && <Check className="size-3.5 text-signal" aria-label="Active" />}
      </div>
    </button>
  );
}

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', on ? 'bg-signal' : 'bg-line-strong')}
    >
      <span className={cx('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

function PairPicker({ base, value, onChange, current }: { base: 'light' | 'dark'; value: string; onChange: (id: string) => void; current: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-ink-2">
        {base === 'light' ? 'In light mode' : 'In dark mode'}
        {current && <span className="rounded bg-signal-soft px-1 text-[10.5px] font-medium text-signal">now</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {THEMES.filter((t) => t.base === base).map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-pressed={value === t.id}
            className={cx(
              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px]',
              value === t.id ? 'border-signal bg-signal-soft text-ink' : 'border-line text-ink-2 hover:border-line-strong',
            )}
          >
            <span aria-hidden>{t.emoji}</span>
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppearanceMenu() {
  const { appearance, active, osDark, update, choose } = useAppearance();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink"
          aria-label="Appearance"
        >
          <Palette className="size-4" aria-hidden />
          <span className="hidden sm:inline">
            {active.emoji} {active.name}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 max-h-[85vh] w-[min(420px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-2xl"
        >
          <div className="mb-3">
            <div className="display text-[16px] font-[650] text-ink">Appearance</div>
            <div className="text-[12px] text-ink-3">Click a theme to use it. Saved in this browser.</div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {THEMES.map((t) => (
              <ThemeCard key={t.id} theme={t} selected={active.id === t.id} onSelect={() => choose(t.id)} />
            ))}
          </div>

          <div className="mt-4 space-y-3 rounded-xl bg-surface-2 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[13px] font-medium text-ink">Match macOS light and dark</span>
                <span className="block text-[12px] text-ink-3">Switch themes when your Mac changes appearance</span>
              </span>
              <Switch
                label="Match macOS light and dark"
                on={appearance.followSystem}
                onToggle={() =>
                  update(
                    appearance.followSystem
                      ? { followSystem: false, theme: active.id }
                      : { followSystem: true, [active.base]: active.id },
                  )
                }
              />
            </div>
            {appearance.followSystem && (
              <div className="space-y-2.5 border-t border-line pt-3">
                <PairPicker base="light" value={appearance.light} current={!osDark} onChange={(id) => update({ light: id })} />
                <PairPicker base="dark" value={appearance.dark} current={osDark} onChange={(id) => update({ dark: id })} />
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-3">
            <span>
              <span className="block text-[13px] font-medium text-ink">Animations</span>
              <span className="block text-[12px] text-ink-3">Orbiting planets, status pulses and transitions</span>
            </span>
            <Switch label="Animations" on={appearance.motion} onToggle={() => update({ motion: !appearance.motion })} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
