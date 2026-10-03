import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// A theme is three hues on a set of surfaces:
//   signal  — the primary accent (navigation, primary buttons, focus)
//   accent2 — a contrasting warm/cool partner (hero glow, heatmap, cost curves)
//   accent3 — a third note for small highlights (tool meters, histogram, stars)
// Chart series and status colors come from the base (light/dark) so they stay
// colorblind-validated in every theme.
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
  accent2: string;
  accent3: string;
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
    blurb: 'Ink night, periwinkle with coral and mint',
    tokens: {
      bg: '#11141c',
      surface: '#181c27',
      'surface-2': '#1d2230',
      'surface-3': '#262c3c',
      line: '#2a3142',
      'line-strong': '#3c4459',
      text: '#eceef5',
      'text-2': '#aab0c2',
      'text-3': '#7f879c',
      signal: '#8b9cff',
      'signal-soft': '#272c4d',
      'on-signal': '#11141c',
      accent2: '#ff8a65',
      accent3: '#5eead4',
      glow1: '#6366f1',
      glow2: '#fb7185',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    emoji: '🌠',
    base: 'dark',
    blurb: 'Polar teal with lavender and gold',
    tokens: {
      bg: '#0b191c',
      surface: '#112328',
      'surface-2': '#152c32',
      'surface-3': '#1c383f',
      line: '#22434a',
      'line-strong': '#305b64',
      text: '#e6f4f1',
      'text-2': '#a3c4bf',
      'text-3': '#76968f',
      signal: '#5eead4',
      'signal-soft': '#153b3b',
      'on-signal': '#0b191c',
      accent2: '#c4b5fd',
      accent3: '#fcd34d',
      glow1: '#14b8a6',
      glow2: '#8b5cf6',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    emoji: '🔥',
    base: 'dark',
    blurb: 'Charcoal and amber with rose and teal',
    tokens: {
      bg: '#1a1411',
      surface: '#231b17',
      'surface-2': '#2a211c',
      'surface-3': '#352923',
      line: '#3d3029',
      'line-strong': '#574437',
      text: '#f5ece4',
      'text-2': '#c9b7a8',
      'text-3': '#94816f',
      signal: '#fbbf24',
      'signal-soft': '#3d2f17',
      'on-signal': '#1a1411',
      accent2: '#fb7185',
      accent3: '#2dd4bf',
      glow1: '#f97316',
      glow2: '#e11d48',
    },
  },
  {
    id: 'nebula',
    name: 'Nebula',
    emoji: '🪐',
    base: 'dark',
    blurb: 'Violet dusk, rose with cyan and gold',
    tokens: {
      bg: '#16112a',
      surface: '#1e1735',
      'surface-2': '#241c3f',
      'surface-3': '#2d244c',
      line: '#362c5a',
      'line-strong': '#4a3d78',
      text: '#f0ebff',
      'text-2': '#b9add9',
      'text-3': '#8a7cb0',
      signal: '#f472b6',
      'signal-soft': '#3d1f3e',
      'on-signal': '#16112a',
      accent2: '#67e8f9',
      accent3: '#fde68a',
      glow1: '#a855f7',
      glow2: '#06b6d4',
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    emoji: '☀️',
    base: 'light',
    blurb: 'Cool paper, indigo with tangerine and teal',
    tokens: {
      bg: '#f1f3f8',
      surface: '#ffffff',
      'surface-2': '#f6f7fb',
      'surface-3': '#e9ecf4',
      line: '#dce0ea',
      'line-strong': '#c4cada',
      text: '#18213a',
      'text-2': '#4a5573',
      'text-3': '#667190',
      signal: '#4f5fe0',
      'signal-soft': '#e3e7ff',
      'on-signal': '#ffffff',
      accent2: '#ea580c',
      accent3: '#0d9488',
      glow1: '#818cf8',
      glow2: '#fdba74',
    },
  },
  {
    id: 'glacier',
    name: 'Glacier',
    emoji: '🧊',
    base: 'light',
    blurb: 'Icy mint, deep teal with coral and ochre',
    tokens: {
      bg: '#e4f1f2',
      surface: '#fbfefe',
      'surface-2': '#f0f8f9',
      'surface-3': '#d9eaed',
      line: '#c9dfe3',
      'line-strong': '#a9cad0',
      text: '#0f2a30',
      'text-2': '#3d5d63',
      'text-3': '#5a777c',
      signal: '#0e7490',
      'signal-soft': '#cfeaf0',
      'on-signal': '#ffffff',
      accent2: '#e11d48',
      accent3: '#ca8a04',
      glow1: '#22d3ee',
      glow2: '#fda4af',
    },
  },
  {
    id: 'orchid',
    name: 'Orchid',
    emoji: '🌸',
    base: 'light',
    blurb: 'Lavender, violet with magenta and jade',
    tokens: {
      bg: '#f4eefb',
      surface: '#fffdff',
      'surface-2': '#f9f4fd',
      'surface-3': '#ece2f7',
      line: '#e1d5f0',
      'line-strong': '#cbbbe4',
      text: '#25163d',
      'text-2': '#574872',
      'text-3': '#776a92',
      signal: '#7c3aed',
      'signal-soft': '#ede4fe',
      'on-signal': '#ffffff',
      accent2: '#db2777',
      accent3: '#059669',
      glow1: '#c084fc',
      glow2: '#f9a8d4',
    },
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export type Appearance = {
  theme: string; // the chosen theme when not following the OS
  followSystem: boolean;
  light: string; // used when following the OS and it is light
  dark: string; // used when following the OS and it is dark
  motion: boolean;
};

const DEFAULTS: Appearance = { theme: 'midnight', followSystem: false, light: 'daylight', dark: 'midnight', motion: true };
const KEY = 'ccdash-appearance';
// index.html reads this before React loads, so the first paint is already themed.
const PAINT_KEY = 'ccdash-paint';

function load(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // Earlier versions stored { mode: 'system' | 'fixed' }.
    if (raw.mode && raw.followSystem === undefined) raw.followSystem = raw.mode === 'system';
    delete raw.mode;
    return { ...DEFAULTS, ...raw };
  } catch {
    return DEFAULTS;
  }
}

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function resolveTheme(a: Appearance, osDark: boolean): Theme {
  if (!a.followSystem) return themeById(a.theme);
  return themeById(osDark ? a.dark : a.light);
}

export function applyTheme(theme: Theme, motion: boolean) {
  const root = document.documentElement;
  root.dataset.base = theme.base;
  root.dataset.theme = theme.id;
  root.dataset.motion = motion ? 'on' : 'off';
  for (const [k, v] of Object.entries(theme.tokens)) root.style.setProperty(`--${k}`, v);
  try {
    localStorage.setItem(PAINT_KEY, JSON.stringify({ base: theme.base, motion, tokens: theme.tokens }));
  } catch {}
}

type Ctx = {
  appearance: Appearance;
  active: Theme;
  osDark: boolean;
  update: (patch: Partial<Appearance>) => void;
  /** Apply a theme right now, whatever the OS is doing. */
  choose: (id: string) => void;
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

  const update = (patch: Partial<Appearance>) => setAppearance((a) => ({ ...a, ...patch }));
  const choose = (id: string) => {
    const t = themeById(id);
    setAppearance((a) => {
      // While following the OS, a theme for the current mode just becomes that mode's pick.
      if (a.followSystem && (t.base === 'dark') === osDark) return { ...a, [t.base]: id };
      // Otherwise the person wants to see it now: stop following the OS.
      return { ...a, theme: id, followSystem: false };
    });
  };

  return { appearance, active, osDark, update, choose };
}

export function useAppearance(): Ctx {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used inside AppearanceContext');
  return ctx;
}
