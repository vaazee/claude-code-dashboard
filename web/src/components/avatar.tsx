import { clsx as cx } from 'clsx';

// Keyword → emoji tables. First match wins, so put specific words before general ones.
type Rule = [RegExp, string];

const PROJECT_RULES: Rule[] = [
  [/^~$|^home$/, '🏠'],
  [/music|raga|carnatic|album|song|spotify|playlist/, '🎵'],
  [/guitar/, '🎸'],
  [/commute|bus|transit|train/, '🚌'],
  [/ios|swift|iphone/, '📱'],
  [/wiki|obsidian|notes|vault|knowledge/, '📚'],
  [/dashboard|stats|metrics/, '📊'],
  [/solr|search|elastic/, '🔎'],
  [/data|sql|db|warehouse/, '🗄️'],
  [/ml|handson|model|train|ai/, '🧠'],
  [/web|net|site|blog|landing/, '🌐'],
  [/dot-?files|config|settings/, '⚙️'],
  [/claude|agent|toolkit/, '🤖'],
  [/download/, '📥'],
  [/sandisk|volume|drive|disk|backup/, '💾'],
  [/gpt|prompt|\.md/, '📝'],
  [/output|artifact|export/, '📦'],
  [/^code$|src|dev|github/, '💻'],
];

const SKILL_RULES: Rule[] = [
  [/raga|carnatic|music|album|song|1001|playlist|spotify/, '🎵'],
  [/book/, '📚'],
  [/movie|film|letterboxd|tmdb/, '🎬'],
  [/youtube|video/, '▶️'],
  [/wiki|llm-wiki/, '🧠'],
  [/obsidian|vault/, '🗃️'],
  [/sync|dot-files|backup/, '🔄'],
  [/aws|architecture|diagram|mermaid|excalidraw/, '🏗️'],
  [/gif|slack/, '🎞️'],
  [/html|output|artifact|page/, '🖼️'],
  [/cost|usage|finance|journal|reconcil|sox|audit|variance|statement|close/, '💼'],
  [/health|macos|system/, '🩺'],
  [/mail|signup|kevin|gmail/, '✉️'],
  [/pdf/, '📄'],
  [/docx|doc|writ|coauthor/, '📝'],
  [/xlsx|sheet|csv/, '📊'],
  [/pptx|slide|deck/, '🖥️'],
  [/design|frontend|canvas|art|theme|brand/, '🎨'],
  [/review|security/, '🔍'],
  [/test/, '🧪'],
  [/debug|incident/, '🐞'],
  [/memory|claude-md|remember/, '🧾'],
  [/plugin|skill-creator|mcp/, '🧩'],
  [/config|setting|keybinding|statusline|permission/, '⚙️'],
  [/schedule|loop|cron|standup|morning/, '⏰'],
  [/deploy|ship|release/, '🚀'],
  [/api|claude/, '✳️'],
  [/chrome|browser|web/, '🌐'],
  [/task|todo|productiv/, '✅'],
];

const MCP_RULES: Rule[] = [
  [/spotify/, '🎧'],
  [/apple.?music|music/, '🎵'],
  [/gmail|mail/, '✉️'],
  [/chrome|browser/, '🌐'],
  [/drive/, '📁'],
  [/docs|pdf/, '📄'],
  [/calendar/, '📅'],
  [/slack/, '💬'],
  [/github/, '🐙'],
  [/cmux|cua|computer/, '🖱️'],
  [/tmdb|letterboxd|movie/, '🎬'],
  [/notion/, '📓'],
  [/linear|asana|jira|atlassian|clickup|monday/, '📋'],
  [/datadog|pagerduty/, '📟'],
  [/excalidraw|mermaid/, '📐'],
  [/uber|eats/, '🍔'],
  [/bigquery|sql/, '🗄️'],
  [/session|ccd/, '🔗'],
];

const FALLBACK = ['🪐', '🚀', '🌿', '🔭', '🧪', '🛠️', '🎯', '🧭', '🌊', '🍀', '⭐', '🦋'];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function pick(rules: Rule[], key: string): string {
  const k = key.toLowerCase();
  for (const [re, e] of rules) if (re.test(k)) return e;
  return FALLBACK[hash(k) % FALLBACK.length];
}

export const projectEmoji = (name: string) => pick(PROJECT_RULES, name);
export const skillEmoji = (name: string) => pick(SKILL_RULES, name);
export const mcpEmoji = (name: string) => pick(MCP_RULES, name);

/** The hue an entity's avatar uses; reuse it so a project looks the same in every chart. */
export function nameHue(name: string): number {
  return hash(name) % 360;
}

/** A solid, readable color for an entity (bars, sparklines) in both light and dark themes. */
export function nameColor(name: string): string {
  return `oklch(0.68 0.14 ${nameHue(name)})`;
}

/** A rounded tile with a name-derived gradient and an emoji: the same name always looks the same. */
export function Avatar({
  name,
  emoji,
  size = 32,
  className,
  rounded = 'rounded-[10px]',
}: {
  name: string;
  emoji: string;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const h = hash(name);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 60)) % 360;
  return (
    <span
      aria-hidden
      className={cx('inline-grid shrink-0 place-items-center select-none', rounded, className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `linear-gradient(135deg, oklch(0.72 0.12 ${hue} / 0.35), oklch(0.62 0.14 ${hue2} / 0.28))`,
        boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--text) 10%, transparent)',
      }}
    >
      {emoji}
    </span>
  );
}

/** Icon tile used beside page titles and stat labels. */
export function IconTile({ children, size = 40, className }: { children: React.ReactNode; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-grid shrink-0 place-items-center rounded-xl text-signal', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--signal) 32%, var(--surface)), color-mix(in oklab, var(--accent2) 30%, var(--surface)))',
        boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--accent2) 30%, transparent)',
      }}
    >
      {children}
    </span>
  );
}
