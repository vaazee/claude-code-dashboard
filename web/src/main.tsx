import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { AppShell } from './components/shell';
import { Empty } from './components/ui';
import { AnalyticsPage } from './sections/analytics';
import { ConfigPage } from './sections/config';
import { HistoryPage } from './sections/history';
import { OverviewPage } from './sections/overview';
import { ProjectsPage } from './sections/projects';
import { SessionDetailPage } from './sections/session-detail';
import { SessionsPage } from './sections/sessions';
import { SkillsPage } from './sections/skills';
import { AppearanceContext, useAppearanceState } from './lib/themes';
import './styles.css';

const qSearch = (s: Record<string, unknown>): { q?: string } => (typeof s.q === 'string' && s.q ? { q: s.q } : {});

const root = createRootRoute({
  component: AppShell,
  notFoundComponent: () => <Empty title="This page doesn't exist">Use the sidebar or press ⌘K to find what you need.</Empty>,
});
const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', component: OverviewPage }),
  createRoute({ getParentRoute: () => root, path: '/sessions', component: SessionsPage, validateSearch: qSearch }),
  createRoute({ getParentRoute: () => root, path: '/sessions/$id', component: SessionDetailPage }),
  createRoute({ getParentRoute: () => root, path: '/analytics', component: AnalyticsPage }),
  createRoute({ getParentRoute: () => root, path: '/projects', component: ProjectsPage }),
  createRoute({ getParentRoute: () => root, path: '/skills', component: SkillsPage, validateSearch: qSearch }),
  createRoute({ getParentRoute: () => root, path: '/config', component: ConfigPage }),
  createRoute({ getParentRoute: () => root, path: '/history', component: HistoryPage }),
]);

const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    // Server-sent events drive freshness; this is only a fallback.
    queries: { staleTime: 15_000, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

function AppearanceProvider({ children }: { children: ReactNode }) {
  const ctx = useAppearanceState();
  return (
    <AppearanceContext.Provider value={ctx}>
      <MotionConfig reducedMotion={ctx.appearance.motion ? 'user' : 'always'}>{children}</MotionConfig>
      <Toaster
        position="bottom-right"
        theme={ctx.active.base}
        toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)' } }}
      />
    </AppearanceContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppearanceProvider>
        <TooltipPrimitive.Provider>
          <RouterProvider router={router} />
        </TooltipPrimitive.Provider>
      </AppearanceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
