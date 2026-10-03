import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// A theme sets surfaces, ink and the accent ("signal"). Chart series and status
// colors come from the base (light/dark) so they stay colorblind-validated in every theme.
export type ThemeTokens = {
  bg: string;
  surface: string;
  'surface-2': string;
  'surface-3': string;
  line: string;
  'line-strong': string;
  text: string;
  'text-2': string;
  'text-3': string;
  signal: string;
  'signal-soft': string;
  'on-signal': string;
  glow1: string;
  glow2: string;
};

export type Theme = { id: string; name: string; emoji: string; base: 'light' | 'dark'; blurb: string; tokens: ThemeTokens };

export const THEMES: Theme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    emoji: '🌌',
    base: 'dark',
    blurb: 'Slate navy with a periwinkle signal',
    tokens: {
      bg: '#121a2b',
      surface: '#18223a',
      'surface-2': '#1d2843',
      'surface-3': '#25324f',
      line: '#2a3858',
      'line-strong': '#3a4a70',
      text: '#e9edf7',
      'text-2': '#a7b1c8',
      'text-3': '#7a86a1',
      signal: '#8b9cff',
      'signal-soft': '#27305a',
      'on-signal': '#121a2b',
      glow1: '#4f5fe0',
      glow2: '#22d3ee',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    emoji: '🌠',
    base: 'dark',
    blurb: 'Deep teal night with mint light',
    tokens: {
      bg: '#0d1b1e',
      surface: '#12252a',
      'surface-2': '#163035',
      'surface-3': '#1d3b41',
      line: '#24464d',
      'line-strong': '#31606a',
      text: '#e6f4f1',
      'text-2': '#a3c4bf',
      'text-3': '#76968f',
      signal: '#5eead4',
      'signal-soft': '#173f3f',
      'on-signal': '#0d1b1e',
      glow1: '#14b8a6',
      glow2: '#a78bfa',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    emoji: '🔥',
    base: 'dark',
    blurb: 'Warm charcoal lit in amber',
    tokens: {
      bg: '#1b1512',
      surface: '#241c18',
      'surface-2': '#2b221d',
      'surface-3': '#362a24',
      line: '#3d3029',
      'line-strong': '#574437',
      text: '#f5ece4',
      'text-2': '#c9b7a8',
      'text-3': '#94816f',
      signal: '#fbbf24',
      'signal-soft': '#3d2f17',
      'on-signal': '#1b1512',
      glow1: '#f97316',
      glow2: '#e11d48',
    },
  },
  {
    id: 'nebula',
    name: 'Nebula',
    emoji: '🪐',
    base: 'dark',
    blurb: 'Violet dusk with a rose signal',
    tokens: {
      bg: '#17122a',
      surface: '#1f1836',
      'surface-2': '#251d40',
      'surface-3': '#2e254d',
      line: '#362c5a',
      'line-strong': '#4a3d78',
      text: '#f0ebff',
      'text-2': '#b9add9',
      'text-3': '#8a7cb0',
      signal: '#f472b6',
      'signal-soft': '#3d1f3e',
      'on-signal': '#17122a',
      glow1: '#a855f7',
      glow2: '#f472b6',
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    emoji: '☀️',
    base: 'light',
    blurb: 'Cool paper with an indigo signal',
    tokens: {
      bg: '#eef1f7',
      surface: '#ffffff',
      'surface-2': '#f5f7fb',
      'surface-3': '#e8ecf5',
      line: '#d9deea',
      'line-strong': '#c3cadb',
      text: '#18213a',
      'text-2': '#4a5573',
      'text-3': '#667190',
      signal: '#4f5fe0',
      'signal-soft': '#e3e7ff',
      'on-signal': '#ffffff',
      glow1: '#818cf8',
      glow2: '#67e8f9',
    },
  },
  {
    id: 'glacier',
    name: 'Glacier',
    emoji: '🧊',
    base: 'light',
    blurb: 'Icy blue-green, crisp and calm',
    tokens: {
      bg: '#e9f3f5',
      surface: '#ffffff',
      'surface-2': '#f3f9fa',
      'surface-3': '#dcecef',
      line: '#cfe2e6',
      'line-strong': '#b2cfd5',
      text: '#0f2a30',
      'text-2': '#3d5d63',
      'text-3': '#5d7a80',
      signal: '#0e7490',
      'signal-soft': '#d4eef3',
      'on-signal': '#ffffff',
      glow1: '#22d3ee',
      glow2: '#34d399',
    },
  },
  {
    id: 'orchid',
    name: 'Orchid',
    emoji: '🌸',
    base: 'light',
    blurb: 'Soft lavender with a violet signal',
    tokens: {
      bg: '#f3effa',
      surface: '#ffffff',
      'surface-2': '#f8f5fc',
      'surface-3': '#ebe4f6',
      line: '#e0d7ef',
      'line-strong': '#cbbde3',
      text: '#25163d',
      'text-2': '#574872',
      'text-3': '#776a92',
      signal: '#7c3aed',
      'signal-soft': '#ede4fe',
      'on-signal': '#ffffff',
      glow1: '#c084fc',
      glow2: '#f9a8d4',
    },
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export type Appearance = {
  mode: 'fixed' | 'system';
  theme: string; // used when mode = fixed
  light: string; // used when mode = system and the OS is light
  dark: string; // used when mode = system and the OS is dark
  motion: boolean;
};

const DEFAULTS: Appearance = { mode: 'system', theme: 'midnight', light: 'daylight', dark: 'midnight', motion: true };
const KEY = 'ccdash-appearance';
// index.html reads this before React loads, so the first paint is already themed.
const PAINT_KEY = 'ccdash-paint';

function load(): Appearance {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function resolveTheme(a: Appearance, osDark: boolean): Theme {
  if (a.mode === 'fixed') return themeById(a.theme);
  return themeById(osDark ? a.dark : a.light);
}

export function applyTheme(theme: Theme, motion: boolean) {
  const root = document.documentElement;
  root.dataset.base = theme.base;
  root.dataset.motion = motion ? 'on' : 'off';
  for (const [k, v] of Object.entries(theme.tokens)) root.style.setProperty(`--${k}`, v);
  try {
    localStorage.setItem(PAINT_KEY, JSON.stringify({ base: theme.base, motion, tokens: theme.tokens }));
  } catch {}
}

type Ctx = {
  appearance: Appearance;
  active: Theme;
  update: (patch: Partial<Appearance>) => void;
};

export const AppearanceContext = createContext<Ctx | null>(null);

export function useAppearanceState(): Ctx {
  const [appearance, setAppearance] = useState<Appearance>(load);
  const [osDark, setOsDark] = useState(prefersDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const active = useMemo(() => resolveTheme(appearance, osDark), [appearance, osDark]);

  useEffect(() => {
    applyTheme(active, appearance.motion);
    try {
      localStorage.setItem(KEY, JSON.stringify(appearance));
    } catch {}
  }, [active, appearance]);

  return { appearance, active, update: (patch) => setAppearance((a) => ({ ...a, ...patch })) };
}

export function useAppearance(): Ctx {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used inside AppearanceContext');
  return ctx;
}
