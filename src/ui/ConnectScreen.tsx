// Connect a private data repo with a fine-grained PAT (docs/05, "Supported setup flow"), in three
// numbered steps (spec 01). Step 1, creating the data repo, is the most prominent control. A real
// login form, so password managers can save and fill the token.
import { cn } from 'cn';
import { ExternalLink } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '@/app/store.ts';
import { newRepoLink, parseRepoName, suggestedRepo, tokenLink } from '@/auth/connect.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TextField } from './form-fields.tsx';
import { linkButton } from './link-button.ts';
import { UpdateBanner } from './UpdateBanner.tsx';
import { useFocusFirstError } from './use-focus-first-error.ts';

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">
        {number}. {title}
      </h2>
      {children}
    </section>
  );
}

export function ConnectScreen({ problem, busy }: { problem: string | null; busy: boolean }) {
  const [repoName, setRepoName] = useState(() => {
    const suggested = suggestedRepo(location.hostname);
    return useApp.getState().repoName || (suggested ? `${suggested.owner}/${suggested.repo}` : '');
  });
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ repo?: string; token?: string }>({});
  const form = useFocusFirstError(errors);
  const repo = parseRepoName(repoName);

  function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({
      ...(!repo && { repo: 'Enter the repository as owner/repo, for example octo-dev/crm.' }),
      ...(!token.trim() && { token: 'Paste the token from GitHub.' }),
    });
    if (!repo || !token.trim()) return;
    void useApp.getState().connect({ ...repo, token: token.trim(), remember });
  }

  // A problem from GitHub, such as a refused token, shows only when the fields are filled in.
  const shown = Object.keys(errors).length === 0 ? problem : null;
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-4">
      <UpdateBanner />
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Connect GitCRM to a private GitHub repository</h1>
          </CardTitle>
          <CardDescription>
            Your data is stored in a private GitHub repository that you own. GitCRM runs in your browser and talks to GitHub directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={form} onSubmit={submit} className="flex flex-col gap-6" noValidate>
            <Step number={1} title="Create your data repository">
              <p className="text-sm text-muted-foreground">
                A private repository, only for your GitCRM records. GitHub's form opens filled in: click "Create repository" there. Already have one? Go to step 2.
              </p>
              <a className={cn(linkButton({ size: 'lg' }), 'h-11 w-full text-base')} href={newRepoLink(repo)} target="_blank" rel="noopener noreferrer">
                Create your data repository
                <ExternalLink aria-hidden="true" data-icon="inline-end" />
              </a>
            </Step>

            <Step number={2} title="Enter its name">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="repo">Repository</Label>
                <Input
                  id="repo"
                  name="username"
                  autoComplete="username"
                  placeholder="owner/repo"
                  spellCheck={false}
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  aria-invalid={Boolean(errors.repo)}
                  aria-describedby={errors.repo ? 'repo-error repo-hint' : 'repo-hint'}
                />
                {errors.repo && <p id="repo-error" className="text-sm text-destructive">{errors.repo}</p>}
                <p id="repo-hint" className="text-sm text-muted-foreground">
                  The repository from step 1, as owner/repo. It may be empty.
                </p>
              </div>
            </Step>

            <Step number={3} title="Create a token">
              {repo ? (
                <>
                  <a className={cn(linkButton({ variant: 'outline' }), 'self-start')} href={tokenLink(repo.owner, repo.repo)} target="_blank" rel="noopener noreferrer">
                    Open GitHub's token form
                    <ExternalLink aria-hidden="true" data-icon="inline-end" />
                  </a>
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    <li>Under Repository access, choose "Only select repositories" and pick {repo.owner}/{repo.repo}.</li>
                    <li>Check that Repository permissions, Contents, is set to "Read and write".</li>
                    <li>Generate the token, then paste it below. The form asks for 90 days; after that, make a new token.</li>
                  </ol>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Enter the repository in step 2 first. The token form is then filled in for it.</p>
              )}
              <TextField
                id="token"
                label="Fine-grained personal access token"
                name="password"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                value={token}
                error={errors.token}
                onChange={(e) => setToken(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox id="remember" aria-labelledby="remember-label" checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
                  <Label id="remember-label" htmlFor="remember">Remember on this device</Label>
                </div>
                <p className="text-sm text-muted-foreground">Uncheck on a shared computer. GitCRM then stores nothing in this browser.</p>
              </div>
            </Step>

            {shown && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{shown}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={busy} className="self-start">
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
