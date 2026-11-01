// A private repo without .gitcrm/workspace.json: explicit setup, never automatic (docs/05).
import { useState, type FormEvent } from 'react';
import { selectCanWrite, useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { stateForError } from '@/storage/operation-state.ts';
import { useFocusFirstError } from './use-focus-first-error.ts';

export function InitializeScreen() {
  const repoName = useApp((s) => s.repoName);
  const access = useApp((s) => s.session?.access);
  const canWrite = useApp(selectCanWrite);
  const [name, setName] = useState(repoName.split('/')[1] ?? '');
  const [currency, setCurrency] = useState('USD');
  const [errors, setErrors] = useState<{ name?: string; currency?: string }>({});
  const form = useFocusFirstError(errors);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const code = currency.trim().toUpperCase();
    const found = {
      ...(!name.trim() && { name: 'Enter a name for the workspace.' }),
      ...(!/^[A-Z]{3}$/.test(code) && { currency: 'Enter a three-letter currency code, such as USD or EUR.' }),
    };
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setProblem(null);
    try {
      await useApp.getState().initialize({ name: name.trim(), defaultCurrency: code });
    } catch (error) {
      const state = stateForError(error);
      setProblem('message' in state ? state.message : 'The workspace was not set up.');
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Set up a GitCRM workspace</h1>
          </CardTitle>
          <CardDescription>
            {repoName} has no GitCRM workspace yet. Setting it up adds one settings file to the repository, in one commit. Nothing else in the repository changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={form} onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {access?.kind === 'read-only' && (
              <Alert role="alert">
                <AlertDescription>{access.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'workspace-name-error' : undefined} />
              {errors.name && <p id="workspace-name-error" className="text-sm text-destructive">{errors.name}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Default currency</Label>
              <Input id="currency" className="w-24" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-invalid={Boolean(errors.currency)} aria-describedby="currency-hint" />
              <p id="currency-hint" className={errors.currency ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                {errors.currency ?? 'A three-letter code, such as USD or EUR.'}
              </p>
            </div>
            {problem && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={!canWrite || saving}>{saving ? 'Setting up…' : 'Set up workspace'}</Button>
              <Button type="button" variant="ghost" onClick={() => void useApp.getState().disconnect()}>Disconnect</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
