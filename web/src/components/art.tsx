import type { SessionSummary } from '@shared/types.ts';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { usd } from '@/lib/format';
import { useAppearance } from '@/lib/themes';

function useMotionAllowed(): boolean {
  const { appearance } = useAppearance();
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return appearance.motion && !reduced;
}

// Deterministic star field so it doesn't jump between renders.
function stars(n: number, w: number, h: number, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ x: rnd() * w - w / 2, y: rnd() * h - h / 2, r: 0.4 + rnd() * 1.1, d: 2 + rnd() * 5 }));
}

const RINGS = [
  { rx: 70, ry: 26, dur: 26 },
  { rx: 112, ry: 42, dur: 40 },
  { rx: 152, ry: 58, dur: 58 },
];

/**
 * Live sessions drawn as planets circling a sun. Working sessions travel their orbit;
 * sessions waiting for you hold still and glow amber. Planet size grows with spend.
 */
export function OrbitHero({ live }: { live: SessionSummary[] }) {
  const navigate = useNavigate();
  const motion = useMotionAllowed();
  const field = useMemo(() => stars(46, 360, 220), []);
  const [hover, setHover] = useState<string | null>(null);

  const planets = live.slice(0, 9).map((s, i) => {
    const ring = RINGS[i % RINGS.length];
    const busy = s.live?.status === 'busy';
    const r = 5 + Math.min(7, Math.log2(1 + s.cost) * 1.6);
    const phase = (i * 0.37 + (i % 3) * 0.21) % 1;
    const path = `M ${ring.rx},0 A ${ring.rx} ${ring.ry} 0 1 1 ${-ring.rx},0 A ${ring.rx} ${ring.ry} 0 1 1 ${ring.rx},0`;
    const angle = phase * Math.PI * 2;
    return { s, ring, busy, r, phase, path, x: Math.cos(angle) * ring.rx, y: Math.sin(angle) * ring.ry };
  });
  const hovered = planets.find((p) => p.s.id === hover);

  return (
    <div className="relative">
      <svg viewBox="-180 -110 360 220" className="h-auto w-full" role="img" aria-label={`${live.length} live sessions shown as planets`}>
        <defs>
          <radialGradient id="sun" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="var(--signal)" />
            <stop offset="100%" stopColor="var(--glow1)" />
          </radialGradient>
          <radialGradient id="sun-glow">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {field.map((st, i) => (
          <circle
            key={i}
            cx={st.x}
            cy={st.y}
            r={st.r}
            fill="var(--text)"
            className={motion ? 'twinkle' : undefined}
            style={{ ['--tw' as string]: `${st.d}s`, opacity: 0.35 }}
          />
        ))}

        {RINGS.map((ring) => (
          <ellipse key={ring.rx} rx={ring.rx} ry={ring.ry} fill="none" stroke="var(--line-strong)" strokeDasharray="2 5" strokeWidth="1" />
        ))}

        <circle r="46" fill="url(#sun-glow)" />
        <circle r="20" fill="url(#sun)" />

        {planets.map((p) => {
          const color = p.busy ? 'var(--good)' : 'var(--warning)';
          const body = (
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => navigate({ to: '/sessions/$id', params: { id: p.s.id } })}
              onMouseEnter={() => setHover(p.s.id)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${p.s.title} · ${p.busy ? 'working' : 'waiting for you'} · ${usd(p.s.cost)}`}</title>
              <circle r={p.r + 6} fill={color} opacity={hover === p.s.id ? 0.35 : 0.18} />
              <circle r={p.r} fill={color} stroke="var(--surface)" strokeWidth="2" />
              <circle r={p.r * 0.38} cx={-p.r * 0.3} cy={-p.r * 0.3} fill="#fff" opacity="0.45" />
            </g>
          );
          return p.busy && motion ? (
            <g key={p.s.id}>
              {body}
              <animateMotion dur={`${p.ring.dur}s`} begin={`${-p.phase * p.ring.dur}s`} repeatCount="indefinite" path={p.path} />
            </g>
          ) : (
            <g key={p.s.id} transform={`translate(${p.x} ${p.y})`}>
              {body}
              {!p.busy && motion && <circle r={p.r + 6} fill="none" stroke={color} strokeWidth="1.5" className="ring-breathe" />}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[12px] text-ink-3">
        {hovered ? (
          <span className="text-ink-2">
            {hovered.s.title} · <span className="num">{usd(hovered.s.cost)}</span>
          </span>
        ) : live.length ? (
          'Each planet is a live session. Click one to open it.'
        ) : (
          'All quiet. Start claude in a terminal to launch a session.'
        )}
      </div>
    </div>
  );
}

/** Small ringed-planet illustration for empty states. */
export function PlanetArt({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="-60 -45 120 90" aria-hidden>
      <defs>
        <linearGradient id="planet-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--glow2)" />
          <stop offset="100%" stopColor="var(--glow1)" />
        </linearGradient>
      </defs>
      {[
        [-44, -30, 1.4],
        [40, -34, 1],
        [48, 18, 1.6],
        [-50, 22, 0.9],
        [-20, -38, 0.8],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="var(--text-3)" />
      ))}
      <g transform="rotate(-16)">
        <ellipse rx="44" ry="12" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
        <circle r="22" fill="url(#planet-fill)" />
        {/* front half of the ring passes in front of the planet */}
        <path d="M -44 0 A 44 12 0 0 0 44 0" fill="none" stroke="var(--signal)" strokeWidth="3" />
      </g>
      <circle cx="-7" cy="-8" r="5" fill="#fff" opacity="0.35" />
    </svg>
  );
}
