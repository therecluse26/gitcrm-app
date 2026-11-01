// The update banner (spec 11, ADR-026). On a copy's GitHub Pages site, each page load asks GitHub
// once for the template's latest release. When it is newer than this build, the banner links to
// the copy's Template update workflow, where the owner starts the update.
import { z } from 'zod';
import { pagesOwner } from '@/auth/connect.ts';
import { isNewer } from '@/core/version.ts';
import { version } from '../../package.json';

// The same repository as TEMPLATE in .github/workflows/template-update.yml.
export const TEMPLATE = 'therecluse26/GitCRM';
export const APP_VERSION: string = version;

export type Update = { tag: string; run: string; notes: string };

// <owner>.github.io/<repo>/ is a project site; <owner>.github.io/ is the user site, whose
// repository is <owner>.github.io. Only a copy on GitHub Pages has the workflow (ADR-025).
export function appRepo({ hostname, pathname }: { hostname: string; pathname: string }): string | null {
  const owner = pagesOwner(hostname);
  if (!owner) return null;
  return `${owner}/${/^\/([^/]+)\//.exec(pathname)?.[1] ?? `${owner}.github.io`}`;
}

export function availableUpdate(tag: string | null, current: string, repo: string | null): Update | null {
  if (!tag || !repo) return null;
  try {
    if (!isNewer(tag, current)) return null;
  } catch {
    return null; // a tag in another form: the workflow names it, the app shows nothing
  }
  return { tag, run: `https://github.com/${repo}/actions/workflows/template-update.yml`, notes: `https://github.com/${TEMPLATE}/releases/tag/${tag}` };
}

const Release = z.object({ tag_name: z.string() });

// No token: the template is public, and the PAT goes only to the data repository. Any failure
// gives null, so the app runs on without the banner.
export async function latestTag(get: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await get(`https://api.github.com/repos/${TEMPLATE}/releases/latest`, { headers: { accept: 'application/vnd.github+json' }, credentials: 'omit' });
    if (!response.ok) return null;
    const release = Release.safeParse(await response.json());
    return release.success ? release.data.tag_name : null;
  } catch {
    return null;
  }
}
