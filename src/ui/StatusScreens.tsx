// Full-page states outside the app shell: loading, and a workspace GitCRM cannot open.
import { useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function StartingScreen() {
  const repoName = useApp((s) => s.repoName);
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <p role="status" className="text-muted-foreground">{repoName ? `Connecting to ${repoName}…` : 'Starting…'}</p>
    </main>
  );
}

export function BlockedScreen({ problem }: { problem: string }) {
  const credentials = useApp((s) => s.credentials);
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-4">
      <h1 className="text-xl font-semibold">GitCRM cannot open this workspace</h1>
      <Alert variant="destructive" role="alert">
        <AlertDescription>{problem}</AlertDescription>
      </Alert>
      <div className="flex gap-2">
        {credentials && <Button onClick={() => void useApp.getState().refresh()}>Try again</Button>}
        <Button variant="outline" onClick={() => void useApp.getState().disconnect()}>Disconnect</Button>
      </div>
    </main>
  );
}
