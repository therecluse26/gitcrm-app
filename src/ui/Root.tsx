// Chooses the screen: connect and setup stay outside the app shell.
import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useApp } from '@/app/store.ts';
import { AppShell } from './AppShell.tsx';
import { ConnectScreen } from './ConnectScreen.tsx';
import { InitializeScreen } from './InitializeScreen.tsx';
import { BlockedScreen, StartingScreen } from './StatusScreens.tsx';

export function Root() {
  const screen = useApp((s) => s.screen);
  useEffect(() => {
    void useApp.getState().start();
  }, []);

  switch (screen.name) {
    case 'starting':
      return <StartingScreen />;
    case 'connect':
      return <ConnectScreen problem={screen.problem} busy={screen.busy} />;
    case 'initialize':
      return <InitializeScreen />;
    case 'blocked':
      return <BlockedScreen problem={screen.problem} />;
    case 'ready':
      return (
        <AppShell>
          <Outlet />
        </AppShell>
      );
  }
}
