// Settings (docs/08): workspace, pipeline stages, custom fields, connection health, files that need
// attention, export, and Disconnect.
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useApp } from '@/app/store.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomFieldEditor } from '@/features/custom-fields/CustomFieldEditor.tsx';
import { StageEditor } from '@/features/opportunities/StageEditor.tsx';
import { ExportCard } from './ExportCard.tsx';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const repoName = useApp((s) => s.repoName);
  const session = useApp((s) => s.session);
  const remember = useApp((s) => s.credentials?.remember ?? false);
  const snapshot = useApp((s) => s.snapshot);
  const [confirming, setConfirming] = useState(false);
  const config = snapshot?.workspace?.config;

  async function disconnect() {
    await useApp.getState().disconnect();
    await navigate({ to: '/' });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Workspace</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Name">{config?.name}</Row>
            <Row label="Default currency">{config?.defaultCurrency}</Row>
          </dl>
        </CardContent>
      </Card>

      <StageEditor />

      <CustomFieldEditor />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Connection</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Repository">
              <a className="underline" href={`https://github.com/${repoName}`} target="_blank" rel="noopener noreferrer">{repoName}</a> (private)
            </Row>
            <Row label="Branch">{session?.branch ?? 'Not checked yet'}</Row>
            <Row label="Signed in to GitHub as">{session?.login ?? 'Not checked yet'}</Row>
            <Row label="Access">{!session ? 'Not checked yet' : session.access.kind === 'write' ? 'Read and write' : `Read-only. ${session.access.message}`}</Row>
            <Row label="Token">{remember ? 'Stored in this browser until you disconnect' : 'Kept in this tab only'}</Row>
            <Row label="Last loaded commit">{snapshot?.commitSha?.slice(0, 7) ?? 'Changed since the last load'}</Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Files that need attention</h2>
          </CardTitle>
          <CardDescription>GitCRM reads every file again on each load. It does not change or delete files it cannot read.</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot?.issues.length ? (
            <ul aria-label="Files that need attention" className="flex flex-col gap-2 text-sm">
              {snapshot.issues.map((issue) => (
                <li key={`${issue.path}:${issue.code}`}>
                  <code className="break-all">{issue.path}</code>: {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">None. Every file is valid.</p>
          )}
        </CardContent>
      </Card>

      <ExportCard />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Disconnect</h2>
          </CardTitle>
          <CardDescription>
            Disconnect deletes the token and the saved records from this browser. Your repository does not change. To stop the token working everywhere, delete it on{' '}
            <a className="underline" href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">GitHub's token page</a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {confirming ? (
            <>
              <Button variant="destructive" onClick={() => void disconnect()}>Confirm disconnect</Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>Disconnect</Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
