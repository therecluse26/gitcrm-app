// The update banner (spec 11): a newer GitCRM release, and a button to the copy's Template update
// workflow. GitHub has no link that starts a workflow, so the owner clicks "Run workflow" there.
import { cn } from 'cn';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APP_VERSION, appRepo, availableUpdate, latestTag, type Update } from '@/app/update.ts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { linkButton } from './link-button.ts';

// One request per page load, shared by every screen. None off GitHub Pages.
let check: Promise<Update | null> | undefined;

function useUpdate(): Update | null {
  const [update, setUpdate] = useState<Update | null>(null);
  useEffect(() => {
    const repo = appRepo(location);
    if (!repo) return;
    let live = true;
    check ??= latestTag().then((tag) => availableUpdate(tag, APP_VERSION, repo));
    void check.then((found) => live && setUpdate(found));
    return () => {
      live = false;
    };
  }, []);
  return update;
}

export function UpdateBanner() {
  const update = useUpdate();
  if (!update) return null;
  return (
    // A status, not an alert: the update can wait, so a screen reader need not stop to read it.
    <Alert role="status">
      <AlertTitle>GitCRM {update.tag} is available</AlertTitle>
      <AlertDescription>
        <p>
          This site runs {APP_VERSION}.{' '}
          <a href={update.notes} target="_blank" rel="noopener noreferrer">
            What's new
          </a>
        </p>
      </AlertDescription>
      {/* Outside the description, whose link styles would recolor the button. */}
      <a className={cn(linkButton({ size: 'lg' }), 'my-2 h-11 justify-self-start px-5 text-base')} href={update.run} target="_blank" rel="noopener noreferrer">
        Update GitCRM
        <ExternalLink aria-hidden="true" data-icon="inline-end" />
      </a>
      <p className="text-muted-foreground">On GitHub, click "Run workflow", then the green "Run workflow" button. Reload this page in about 5 minutes.</p>
    </Alert>
  );
}
