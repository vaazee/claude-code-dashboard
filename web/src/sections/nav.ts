import { BarChart3, Boxes, FolderGit2, History, LayoutDashboard, ListTree, Settings2 } from 'lucide-react';

// Adding a section: create its component under sections/, add a route in main.tsx, and list it here.
export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/sessions', label: 'Sessions', icon: ListTree },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/projects', label: 'Projects', icon: FolderGit2 },
  { to: '/skills', label: 'Skills & plugins', icon: Boxes },
  { to: '/config', label: 'Config & memory', icon: Settings2 },
  { to: '/history', label: 'Prompt history', icon: History },
] as const;
