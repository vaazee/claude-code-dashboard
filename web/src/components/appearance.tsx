import * as Popover from '@radix-ui/react-popover';
import { Check, Palette } from 'lucide-react';
import { THEMES, useAppearance, type Theme } from '@/lib/themes';
import { cx, Segmented } from './ui';

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
      {/* Miniature of the app drawn in the theme's own colors */}
      <div className="flex h-[58px] gap-1 p-1.5" style={{ background: t.bg }}>
        <div className="w-4 rounded-[4px]" style={{ background: t.surface }}>
          <div className="mx-auto mt-1.5 size-1.5 rounded-full" style={{ background: t.signal }} />
        </div>
        <div className="flex-1 space-y-1 rounded-[4px] p-1.5" style={{ background: t.surface }}>
          <div className="h-1.5 w-3/4 rounded-full" style={{ background: t.text, opacity: 0.85 }} />
          <div className="h-1 w-1/2 rounded-full" style={{ background: t['text-3'] }} />
          <div className="flex items-end gap-0.5 pt-0.5">
            {[5, 9, 6, 12, 8].map((h, i) => (
              <div key={i} className="w-1.5 rounded-t-[1px]" style={{ height: h, background: i === 3 ? t.signal : t['line-strong'] }} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 bg-surface px-2 py-1.5 text-[12px] font-medium text-ink">
        <span aria-hidden>{theme.emoji}</span>
        {theme.name}
        {selected && <Check className="ml-auto size-3.5 text-signal" aria-hidden />}
      </div>
    </button>
  );
}

export function AppearanceMenu() {
  const { appearance, active, update } = useAppearance();
  const light = THEMES.filter((t) => t.base === 'light');
  const dark = THEMES.filter((t) => t.base === 'dark');

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
          className="z-50 max-h-[80vh] w-[min(400px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="display text-[16px] font-[650] text-ink">Appearance</div>
              <div className="text-[12px] text-ink-3">Saved in this browser.</div>
            </div>
            <Segmented<'system' | 'fixed'>
              label="Theme mode"
              value={appearance.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: 'system', label: 'Match system' },
                { value: 'fixed', label: 'Pick one' },
              ]}
            />
          </div>

          {appearance.mode === 'fixed' ? (
            <div className="grid grid-cols-2 gap-2.5">
              {THEMES.map((t) => (
                <ThemeCard key={t.id} theme={t} selected={appearance.theme === t.id} onSelect={() => update({ theme: t.id })} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-ink-2">When your Mac is in light mode</div>
                <div className="grid grid-cols-3 gap-2">
                  {light.map((t) => (
                    <ThemeCard key={t.id} theme={t} selected={appearance.light === t.id} onSelect={() => update({ light: t.id })} />
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-ink-2">When your Mac is in dark mode</div>
                <div className="grid grid-cols-2 gap-2">
                  {dark.map((t) => (
                    <ThemeCard key={t.id} theme={t} selected={appearance.dark === t.id} onSelect={() => update({ dark: t.id })} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
            <span>
              <span className="block text-[13px] font-medium text-ink">Animations</span>
              <span className="block text-[12px] text-ink-3">Orbiting planets, status pulses and transitions</span>
            </span>
            <button
              role="switch"
              aria-checked={appearance.motion}
              onClick={() => update({ motion: !appearance.motion })}
              className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', appearance.motion ? 'bg-signal' : 'bg-line-strong')}
            >
              <span
                className={cx('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', appearance.motion ? 'translate-x-[18px]' : 'translate-x-0.5')}
              />
            </button>
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
