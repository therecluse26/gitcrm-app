// Navigation, the connected repo, and sync status around every page (docs/08).
import { Link, useRouter } from '@tanstack/react-router';
import { Lock, RefreshCw } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UpdateBanner } from './UpdateBanner.tsx';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/companies', label: 'Companies' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/search', label: 'Search' },
  { to: '/settings', label: 'Settings' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const repoName = useApp((s) => s.repoName);
  const access = useApp((s) => s.session?.access);
  const sync = useApp((s) => s.sync);
  const saving = useApp((s) => s.saving);
  const lastSave = useApp((s) => s.lastSave);
  const checksPaused = useApp((s) => s.checksPaused);
  const router = useRouter();
  const main = useRef<HTMLElement>(null);

  // After a page change, focus moves to the new page's heading, so a screen reader reads it
  // (spec 08). Not on the first load. The focus move never scrolls: the router and the browser
  // set the scroll position, such as the old position after Back.
  useEffect(
    () =>
      router.subscribe('onRendered', ({ fromLocation, pathChanged }) => {
        const heading = main.current?.querySelector('h1');
        if (!fromLocation || !pathChanged || !heading) return;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }),
    [router],
  );

  // Coming back to the tab checks main in the background (docs/04).
  useEffect(() => {
    const focused = () => useApp.getState().tabFocused();
    const shown = () => document.visibilityState === 'visible' && focused();
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', shown);
    return () => {
      window.removeEventListener('focus', focused);
      document.removeEventListener('visibilitychange', shown);
    };
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* A button, not a link: with hash addresses, a link to #main would change the page address. */}
      <Button variant="outline" size="lg" className="absolute -top-16 left-2 z-10 shadow-md transition-none focus-visible:top-2" onClick={() => main.current?.focus()}>
        Skip to main content
      </Button>
      {/* One top bar (spec 12): the main navigation as tabs, then the repository and sync status. */}
      <header className="flex flex-wrap items-center gap-x-5 border-b bg-sidebar px-4">
        <span className="py-2 font-mono text-sm font-medium">GitCRM</span>
        <nav aria-label="Main" className="flex flex-wrap self-stretch">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-11 items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: 'font-medium text-foreground shadow-[inset_0_-2px_0_var(--sidebar-primary)]' }}
              activeOptions={{ exact: to === '/' }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground" title="Private GitHub repository">
            <Lock className="size-3" aria-hidden />
            <span className="font-mono">{repoName}</span>
          </span>
          {access?.kind === 'read-only' && <Badge variant="secondary">Read-only</Badge>}
          <span role="status" className="text-muted-foreground">
            {sync.status === 'loading' ? (
              'Syncing…'
            ) : saving ? (
              'Saving…'
            ) : lastSave ? (
              <>
                {lastSave.action}
                {lastSave.commitSha && (
                  <>
                    {' · '}
                    <a className="underline" href={`https://github.com/${repoName}/commit/${lastSave.commitSha}`} target="_blank" rel="noopener noreferrer">View commit</a>
                  </>
                )}
              </>
            ) : sync.status === 'loaded' ? (
              'Up to date'
            ) : (
              'Not synced'
            )}
          </span>
          <Button variant="outline" size="sm" disabled={sync.status === 'loading' || saving} onClick={() => void useApp.getState().refresh()}>
            <RefreshCw aria-hidden />
            Refresh
          </Button>
        </div>
      </header>
      <main ref={main} tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <UpdateBanner />
        {'message' in sync && (
          <Alert role="alert">
            <AlertDescription>{sync.message} GitCRM is showing the records it has, read-only, until a refresh succeeds.</AlertDescription>
          </Alert>
        )}
        {access?.kind === 'read-only' && (
          <Alert>
            <AlertDescription>{access.message}</AlertDescription>
          </Alert>
        )}
        {checksPaused && (
          <p className="text-sm text-muted-foreground">Automatic checks for changes are paused: fewer than 500 GitHub requests are left this hour. Refresh still works.</p>
        )}
        {children}
      </main>
    </div>
  );
}
