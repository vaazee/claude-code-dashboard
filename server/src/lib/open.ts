import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Opening a folder in a file manager, an editor or a terminal, per platform.

type Launch = { cmd: string; args: string[] };
export type OpenTarget = 'folder' | 'editor' | 'terminal';

function onPath(name: string): string | null {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {}
    }
  }
  return null;
}

const exists = (p: string) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

/** cmux's CLI, if installed. It opens a directory in a new workspace and launches cmux if needed. */
function cmuxBin(): string | null {
  if (process.env.CCDASH_CMUX === 'off') return null;
  const candidates = [process.env.CCDASH_CMUX, '/Applications/cmux.app/Contents/Resources/bin/cmux'].filter(Boolean) as string[];
  return candidates.find(exists) ?? onPath('cmux');
}

/** Which terminal the "open terminal" action will use, for labelling the button. */
export function terminalName(): string {
  if (cmuxBin()) return 'cmux';
  if (process.platform === 'darwin') return 'Terminal';
  if (process.platform === 'win32') return onPath('wt') ? 'Windows Terminal' : 'Command Prompt';
  return 'Terminal';
}

function terminalLaunch(dir: string): Launch | null {
  const cmux = cmuxBin();
  if (cmux) return { cmd: cmux, args: [dir] };
  if (process.platform === 'darwin') return { cmd: 'open', args: ['-a', 'Terminal', dir] };
  if (process.platform === 'win32') {
    return onPath('wt')
      ? { cmd: 'wt', args: ['-d', dir] }
      : { cmd: 'cmd', args: ['/c', 'start', 'cmd', '/k', `cd /d "${dir}"`] };
  }
  // Linux and friends: try the common terminals in order.
  const linux: [string, (d: string) => string[]][] = [
    ['x-terminal-emulator', (d) => ['--working-directory', d]],
    ['gnome-terminal', (d) => [`--working-directory=${d}`]],
    ['konsole', (d) => ['--workdir', d]],
    ['xfce4-terminal', (d) => [`--working-directory=${d}`]],
    ['kitty', (d) => ['--directory', d]],
    ['alacritty', (d) => ['--working-directory', d]],
    ['wezterm', (d) => ['start', '--cwd', d]],
    ['xterm', (d) => ['-e', `cd "${d}" && exec "$SHELL"`]],
  ];
  for (const [bin, args] of linux) if (onPath(bin)) return { cmd: bin, args: args(dir) };
  return null;
}

function launchFor(target: OpenTarget, dir: string): Launch | null {
  if (target === 'terminal') return terminalLaunch(dir);
  if (target === 'editor') {
    if (onPath('code')) return { cmd: 'code', args: [dir] };
    if (process.platform === 'darwin') return { cmd: 'open', args: ['-a', 'Visual Studio Code', dir] };
    return null;
  }
  if (process.platform === 'darwin') return { cmd: 'open', args: [dir] };
  if (process.platform === 'win32') return { cmd: 'explorer', args: [dir] };
  return { cmd: 'xdg-open', args: [dir] };
}

/** Open a directory; resolves with an error message when nothing suitable is installed. */
export function openDir(target: OpenTarget, dir: string): Promise<string | null> {
  const launch = launchFor(target, dir);
  if (!launch) return Promise.resolve(`No ${target === 'editor' ? 'VS Code' : 'terminal'} found on this machine`);
  // GUI terminals on Linux keep running; detach so they outlive the request.
  if (process.platform === 'linux' && target === 'terminal') {
    try {
      spawn(launch.cmd, launch.args, { detached: true, stdio: 'ignore', cwd: dir }).unref();
      return Promise.resolve(null);
    } catch (e: any) {
      return Promise.resolve(e.message);
    }
  }
  return new Promise((resolve) =>
    execFile(launch.cmd, launch.args, { cwd: dir, windowsHide: true }, (err) =>
      // explorer.exe exits with 1 even when it succeeds.
      resolve(err && launch.cmd !== 'explorer' ? err.message : null),
    ),
  );
}

/** Open a URL in the default browser. */
export function openUrl(url: string) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  execFile(cmd as string, args as string[], () => {});
}
