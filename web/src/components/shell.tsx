import * as Dialog from '@radix-ui/react-dialog';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useInventory, useLiveEvents, useOverview, useProjects, useSessions } from '@/lib/api';
import { ago, usd } from '@/lib/format';
import { NAV } from '@/sections/nav';
import { AppearanceMenu } from './appearance';
import { Avatar, projectEmoji, skillEmoji } from './avatar';
import { cx } from './ui';

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2 py-1">
      <svg width="30" height="30" viewBox="-16 -16 32 32" aria-hidden>
        <defs>
          <radialGradient id="brand-sun">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="45%" stopColor="var(--signal)" />
            <stop offset="100%" stopColor="var(--glow1)" />
          </radialGradient>
        </defs>
        <ellipse rx="13" ry="5.5" fill="none" stroke="var(--accent3)" strokeOpacity="0.6" strokeWidth="1.5" transform="rotate(-24)" />
        <circle r="6" fill="url(#brand-sun)" />
        <circle cx="11" cy="-5" r="2.6" fill="var(--accent2)" />
      </svg>
      <span className="leading-tight">
        <span className="display block text-[17px] font-[700] text-ink">ccdash</span>
        <span className="block text-[11px] text-ink-3">Claude Code mission control</span>
      </span>
    </Link>
  );
}

function useCrumbs(): { label: string; to?: string; icon?: React.ReactNode }[] {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const sessions = useSessions();
  const top = NAV.find((n) => (n.to === '/' ? path === '/' : path.startsWith(n.to))) ?? NAV[0];
  const crumbs: { label: string; to?: string; icon?: React.ReactNode }[] = [{ label: top.label, to: top.to, icon: <top.icon className="size-4" aria-hidden /> }];
  const m = path.match(/^\/sessions\/(.+)$/);
  if (m) {
    const s = sessions.data?.find((x) => x.id === m[1]);
    crumbs.push({ label: s?.title ?? m[1].slice(0, 8), icon: s ? <Avatar name={s.project} emoji={projectEmoji(s.project)} size={18} rounded="rounded-md" /> : undefined });
  }
  return crumbs;
}

export function AppShell() {
  const connected = useLiveEvents();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const overview = useOverview();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = useCrumbs();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const k = overview.data?.kpis;
  const user = overview.data?.user ?? '';

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line bg-surface/80 px-3 py-4 backdrop-blur md:flex">
        <Brand />
        <nav className="mt-7 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((n) => {
            const active = n.to === '/' ? path === '/' : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cx(
                  'group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors',
                  active ? 'bg-signal-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                {active && <span className="absolute -left-3 top-1.5 h-6 w-1 rounded-r-full bg-gradient-to-b from-signal to-accent2" aria-hidden />}
                <n.icon className={cx('size-[18px]', active ? 'text-signal' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden />
                {n.label}
                {n.to === '/' && (k?.liveCount ?? 0) > 0 && (
                  <span className="num ml-auto rounded-md bg-good-soft px-1.5 text-[11px] font-semibold text-good">{k!.liveCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          {k && (
            <div className="mesh overflow-hidden rounded-xl border border-line px-3.5 py-3">
              <div className="flex items-center justify-between text-[11.5px] text-ink-3">
                <span>Spent today</span>
                <span aria-hidden>💸</span>
              </div>
              <div className="display num text-[22px] font-[650] text-ink">{usd(k.today)}</div>
              <div className="text-[11.5px] text-ink-3">{usd(k.month)} this month</div>
            </div>
          )}
          <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[13px] font-semibold text-white" aria-hidden>
              {user.slice(0, 1).toUpperCase() || '·'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-ink">{user || 'You'}</div>
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3" title={connected ? 'Receiving live updates' : 'Reconnecting to the server…'}>
                <span className={cx('size-1.5 rounded-full', connected ? 'bg-good' : 'bg-warning')} />
                {connected ? 'Live' : 'Reconnecting…'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-[1320px] items-center gap-3 px-4 md:px-8">
            <div className="md:hidden">
              <Brand />
            </div>
            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
              {crumbs.map((c, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />}
                  <span className="shrink-0 text-ink-3">{c.icon}</span>
                  {c.to && i < crumbs.length - 1 ? (
                    <Link to={c.to} className="text-ink-2 hover:text-ink">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="truncate font-medium text-ink">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setPaletteOpen(true)}
                className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink-3 hover:border-line-strong hover:text-ink-2 sm:w-64"
                aria-label="Search"
              >
                <Search className="size-4" aria-hidden />
                <span className="hidden sm:inline">Search sessions, skills…</span>
                <kbd className="ml-auto hidden rounded border border-line px-1 text-[10.5px] sm:inline">⌘K</kbd>
              </button>
              {(k?.liveCount ?? 0) > 0 && (
                <Link
                  to="/"
                  className="hidden h-8 items-center gap-1.5 rounded-lg bg-good-soft px-2.5 text-[12.5px] font-medium text-good sm:inline-flex"
                >
                  <span className="relative flex size-2">
                    <span className="ring-breathe absolute inset-0 rounded-full bg-good" />
                    <span className="relative size-2 rounded-full bg-good" />
                  </span>
                  {k!.liveCount} live
                </Link>
              )}
              <AppearanceMenu />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Sections">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] text-ink-2 [&.active]:bg-signal-soft [&.active]:text-ink"
                activeOptions={{ exact: n.to === '/' }}
              >
                <n.icon className="size-3.5" aria-hidden />
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const sessions = useSessions();
  const projects = useProjects();
  const inventory = useInventory();
  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const recent = useMemo(() => (sessions.data ?? []).slice(0, 300), [sessions.data]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          <Dialog.Title className="sr-only">Jump to</Dialog.Title>
          <Command label="Jump to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-ink-3">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 text-ink-3" aria-hidden />
              <Command.Input
                autoFocus
                placeholder="Search sessions, projects, skills, pages…"
                className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-6 text-center text-[13px] text-ink-3">Nothing matches that search.</Command.Empty>
              <Command.Group heading="Pages">
                {NAV.map((n) => (
                  <PaletteItem key={n.to} value={`page ${n.label}`} onSelect={() => go(() => navigate({ to: n.to }))}>
                    <n.icon className="size-4 text-ink-3" aria-hidden />
                    {n.label}
                  </PaletteItem>
                ))}
              </Command.Group>
              <Command.Group heading="Sessions">
                {recent.map((s) => (
                  <PaletteItem
                    key={s.id}
                    value={`session ${s.title} ${s.project} ${s.id}`}
                    onSelect={() => go(() => navigate({ to: '/sessions/$id', params: { id: s.id } }))}
                  >
                    <Avatar name={s.project} emoji={projectEmoji(s.project)} size={22} rounded="rounded-md" />
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {s.live && <span className="size-2 shrink-0 rounded-full bg-good" aria-label="running" />}
                    <span className="shrink-0 text-[12px] text-ink-3">
                      {s.project} · {ago(s.lastAt)}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
              <Command.Group heading="Copy resume command">
                {recent.slice(0, 40).map((s) => (
                  <PaletteItem
                    key={`r-${s.id}`}
                    value={`resume ${s.title} ${s.project}`}
                    onSelect={() =>
                      go(() => {
                        navigator.clipboard.writeText(`cd ${JSON.stringify(s.cwdAbs)} && claude --resume ${s.id}`);
                        toast.success('Resume command copied');
                      })
                    }
                  >
                    <span aria-hidden>📋</span>
                    <span className="text-ink-3">Resume</span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  </PaletteItem>
                ))}
              </Command.Group>
              <Command.Group heading="Projects">
                {(projects.data ?? []).map((p) => (
                  <PaletteItem
                    key={p.cwdAbs}
                    value={`project ${p.project} ${p.cwd}`}
                    onSelect={() => go(() => navigate({ to: '/sessions', search: { q: p.cwd } }))}
                  >
                    <Avatar name={p.project} emoji={projectEmoji(p.project)} size={22} rounded="rounded-md" />
                    <span className="flex-1">{p.project}</span>
                    <span className="text-[12px] text-ink-3">{p.cwd}</span>
                  </PaletteItem>
                ))}
              </Command.Group>
              <Command.Group heading="Skills">
                {(inventory.data?.skills ?? []).map((s) => (
                  <PaletteItem
                    key={`${s.source}-${s.qualifiedName}-${s.path}`}
                    value={`skill ${s.qualifiedName} ${s.description}`}
                    onSelect={() => go(() => navigate({ to: '/skills', search: { q: s.name } }))}
                  >
                    <Avatar name={s.name} emoji={skillEmoji(s.qualifiedName)} size={22} rounded="rounded-md" />
                    <span className="flex-1">{s.qualifiedName}</span>
                    <span className="text-[12px] text-ink-3">{s.source}</span>
                  </PaletteItem>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteItem({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="mx-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-ink-2 data-[selected=true]:bg-surface-3 data-[selected=true]:text-ink"
    >
      {children}
    </Command.Item>
  );
}
