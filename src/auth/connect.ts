// Connecting a repo (docs/05-AUTH-AND-ONBOARDING.md): the connect checks, what they allow, and
// the messages for each failure.
import { SnapshotError } from '../storage/errors.ts';
import { GitHubError, type GitHubClient } from '../storage/github-client.ts';
import { refusal, stateForError } from '../storage/operation-state.ts';

export type RepoCheck = {
  login: string; // the token's user
  ownerLogin: string;
  ownerType: string; // 'User' or 'Organization'
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  canWrite: boolean;
};

export type Access = { kind: 'write' } | { kind: 'read-only'; message: string } | { kind: 'refused'; message: string };

// 401 and 404 come back as GitHubError. A 404 means a wrong name, a repo outside the token,
// or a token with no permissions (S-02, S-08).
export async function inspectRepository(client: GitHubClient, owner: string, repo: string): Promise<RepoCheck> {
  const user = await client.rest<{ login: string }>('GET', '/user');
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const meta = await client.rest<{ private: boolean; archived: boolean; default_branch: string; owner: { login: string; type: string } }>('GET', base);
  const check: RepoCheck = {
    login: user.login,
    ownerLogin: meta.owner.login,
    ownerType: meta.owner.type,
    private: meta.private,
    archived: meta.archived,
    defaultBranch: meta.default_branch,
    canWrite: false,
  };
  // Never write to a public repo; an archived repo refuses writes anyway (S-08).
  if (!meta.private || meta.archived) return check;
  try {
    // `permissions` shows the user's role, not the token's (S-02), so a real write decides.
    // The blob is in no tree and on no branch.
    await client.rest('POST', `${base}/git/blobs`, { content: 'gitcrm write check', encoding: 'utf-8' });
    return { ...check, canWrite: true };
  } catch (error) {
    if (error instanceof GitHubError && error.kind === 'forbidden') return check;
    // An empty repo refuses every Git data write with 409 (S-09), so the check cannot tell. The
    // Initialize write, the repo's first commit, decides.
    if (error instanceof GitHubError && error.kind === 'conflict') return { ...check, canWrite: true };
    throw error;
  }
}

// ADR-025: a copy runs at <owner>.github.io/<app repo>/, and its owner makes the data repo
// beside it. On another host there is nothing to suggest.
export function suggestedRepo(hostname: string): { owner: string; repo: string } | null {
  const owner = pagesOwner(hostname);
  return owner ? { owner, repo: 'gitcrm-data' } : null;
}

// The owner of a GitHub Pages site, <owner>.github.io (ADR-025).
export function pagesOwner(hostname: string): string | null {
  return /^([A-Za-z0-9-]{1,39})\.github\.io$/i.exec(hostname)?.[1] ?? null;
}

// GitHub's new-repository form, filled in as a private repo (S-09). `@me` is the signed-in user.
export function newRepoLink(repo: { owner: string; repo: string } | null): string {
  const params = new URLSearchParams({
    name: repo?.repo ?? 'gitcrm-data',
    owner: repo?.owner ?? '@me',
    visibility: 'private',
    description: 'GitCRM records. Keep this repository private.',
  });
  return `https://github.com/new?${params}`;
}

// Accepts owner/repo, or the repo's GitHub URL as copied from the browser.
export function parseRepoName(input: string): { owner: string; repo: string } | null {
  const name = input.trim().replace(/^(https?:\/\/)?github\.com\//i, '').replace(/(\.git|\/)$/, '');
  const match = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(name);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function assessRepository(check: RepoCheck): Access {
  if (!check.private) {
    return {
      kind: 'refused',
      message: 'This repository is public, so anyone could read its records. GitCRM works only with private repositories. Make it private on GitHub, or create a new private repository. Records already committed to a public repository may have been copied.',
    };
  }
  if (check.ownerType === 'User' && check.ownerLogin.toLowerCase() !== check.login.toLowerCase()) {
    return {
      kind: 'refused',
      message: 'This personal repository belongs to another GitHub user. Team workspaces must live in a GitHub organization, where each member uses their own token.',
    };
  }
  if (check.archived) return { kind: 'read-only', message: 'This repository is archived, so GitCRM can only read it. Unarchive it on GitHub to make changes.' };
  if (!check.canWrite) return { kind: 'read-only', message: 'This token can read the repository but not change it. On GitHub, edit the token and set Contents to "Read and write".' };
  return { kind: 'write' };
}

export function describeConnectError(error: unknown, repoName: string): string {
  if (error instanceof GitHubError && error.kind === 'unauthorized') {
    return 'GitHub did not accept this token. It may be mistyped, expired, or revoked. Create a new token, then paste it here.';
  }
  if (error instanceof GitHubError && error.kind === 'not-found') {
    return `GitHub found no repository ${repoName} for this token. Check that the name is right, that the token includes this repository under "Only select repositories", and that Contents is set to "Read and write". In an organization, an owner may still need to approve the token.`;
  }
  if (error instanceof GitHubError && error.kind === 'forbidden') return refusal(error); // the connect screen has no Refresh
  if (error instanceof SnapshotError) return error.message;
  const state = stateForError(error);
  return 'message' in state ? state.message : 'Could not connect.';
}

// GitHub's token form, filled in for this repo's owner (S-07). No parameter can select the
// repository, so the description and the connect screen tell the user to pick it. 90 days is the
// owner's choice (2026-11-01): fewer new tokens than GitHub's 30-day default. An organization's
// token lifetime policy can still make it shorter.
export function tokenLink(owner: string, repo: string): string {
  const params = new URLSearchParams({
    name: `GitCRM ${repo}`.slice(0, 40),
    description: `GitCRM access to ${owner}/${repo}. Under Repository access, choose "Only select repositories" and pick this repository.`,
    target_name: owner,
    contents: 'write',
    expires_in: '90',
  });
  return `https://github.com/settings/personal-access-tokens/new?${params}`;
}
