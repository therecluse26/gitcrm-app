import { describe, expect, it } from 'vitest';
import { SnapshotError } from '../storage/errors.ts';
import { createGitHubClient, GitHubError } from '../storage/github-client.ts';
import { serveFakeGitHub } from '../test/msw.ts';
import { assessRepository, describeConnectError, inspectRepository, newRepoLink, parseRepoName, suggestedRepo, tokenLink, type RepoCheck } from './connect.ts';

const github = serveFakeGitHub();

function inspect(token = github().token, repo = github().repo) {
  return inspectRepository(createGitHubClient(token), github().owner, repo);
}

describe('inspectRepository', () => {
  it('reports a private, writable repo and its default branch', async () => {
    expect(await inspect()).toEqual({ login: 'octo-dev', ownerLogin: 'octo-dev', ownerType: 'User', private: true, archived: false, defaultBranch: 'main', canWrite: true });
    expect(github().count('POST', /git\/blobs/)).toBe(1);
  });

  // GitHub answers the write check on an empty repo with 409 (S-09), so it cannot tell. The
  // Initialize write, the repo's first commit, decides.
  it('treats an empty repo as writable, and still detects a read-only token there', async () => {
    github().empty = true;
    expect(await inspect()).toMatchObject({ private: true, canWrite: true });
    github().canWrite = false;
    expect(await inspect()).toMatchObject({ canWrite: false });
  });

  it('detects a read-only token with the write check (S-02)', async () => {
    github().canWrite = false;
    expect(await inspect()).toMatchObject({ canWrite: false });
  });

  it('sends no write check to a public or archived repo', async () => {
    github().private = false;
    expect(await inspect()).toMatchObject({ private: false, canWrite: false });
    github().private = true;
    github().archived = true;
    expect(await inspect()).toMatchObject({ archived: true, canWrite: false });
    expect(github().count('POST')).toBe(0);
  });

  it('fails with unauthorized for a bad token', async () => {
    await expect(inspect('wrong-token')).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('fails with not-found for a repo the token cannot see', async () => {
    await expect(inspect(undefined, 'someone-elses-repo')).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('assessRepository', () => {
  const check: RepoCheck = { login: 'ava', ownerLogin: 'ava', ownerType: 'User', private: true, archived: false, defaultBranch: 'main', canWrite: true };

  it('allows writes to a private repo the token can write', () => {
    expect(assessRepository(check)).toEqual({ kind: 'write' });
    expect(assessRepository({ ...check, ownerLogin: 'studio', ownerType: 'Organization' })).toEqual({ kind: 'write' });
  });

  it('refuses a public repo with a privacy warning', () => {
    expect(assessRepository({ ...check, private: false })).toMatchObject({ kind: 'refused', message: expect.stringMatching(/public/) });
  });

  it('refuses another user’s personal repo (ADR-018)', () => {
    expect(assessRepository({ ...check, ownerLogin: 'bo' })).toMatchObject({ kind: 'refused', message: expect.stringMatching(/organization/) });
  });

  it('opens an archived repo or a read-only token as read-only', () => {
    expect(assessRepository({ ...check, archived: true, canWrite: false })).toMatchObject({ kind: 'read-only', message: expect.stringMatching(/archived/) });
    expect(assessRepository({ ...check, canWrite: false })).toMatchObject({ kind: 'read-only', message: expect.stringMatching(/Read and write/) });
  });
});

describe('describeConnectError', () => {
  it('explains a rejected token', () => {
    expect(describeConnectError(new GitHubError('unauthorized', 401, 'GET /user', 'Bad credentials'), 'ava/crm')).toMatch(/expired, or revoked/);
  });

  it('lists every cause of a 404 (S-02, S-08)', () => {
    const message = describeConnectError(new GitHubError('not-found', 404, 'GET /repos/ava/crm', 'Not Found'), 'ava/crm');
    for (const cause of [/ava\/crm/, /name/, /Only select repositories/, /Read and write/, /approve/]) expect(message).toMatch(cause);
  });

  it('passes other messages through', () => {
    expect(describeConnectError(new SnapshotError('The default branch has no commits yet.'), 'ava/crm')).toBe('The default branch has no commits yet.');
    expect(describeConnectError(new GitHubError('network', null, 'GET /user'), 'ava/crm')).toMatch(/Could not reach GitHub/);
  });

  // The connect screen has no Refresh button, so a 403 there gives GitHub's words alone.
  it("gives a 403 in GitHub's words, without the Refresh advice of a save", () => {
    expect(describeConnectError(new GitHubError('forbidden', 403, 'GET /user', 'Forbidden'), 'ava/crm')).toBe(
      'GitHub refused the request: Forbidden.',
    );
  });
});

describe('suggestedRepo', () => {
  // ADR-025: a copy runs at <owner>.github.io/<app repo>/, and its owner makes the data repo.
  it('suggests <owner>/gitcrm-data on a GitHub Pages site', () => {
    expect(suggestedRepo('octo-dev.github.io')).toEqual({ owner: 'octo-dev', repo: 'gitcrm-data' });
    expect(suggestedRepo('Octo-Dev.GitHub.io')).toEqual({ owner: 'Octo-Dev', repo: 'gitcrm-data' });
  });

  it('suggests nothing on another host', () => {
    expect(suggestedRepo('localhost')).toBeNull();
    expect(suggestedRepo('crm.example.com')).toBeNull();
    expect(suggestedRepo('a.b.github.io')).toBeNull();
  });
});

describe('newRepoLink', () => {
  it("opens GitHub's new-repository form, filled in as a private repo for the typed owner and name (S-09)", () => {
    const url = new URL(newRepoLink({ owner: 'octo-dev', repo: 'crm-records' }));
    expect(url.origin + url.pathname).toBe('https://github.com/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'crm-records', owner: 'octo-dev', visibility: 'private', description: expect.stringContaining('GitCRM') });
  });

  it('fills in gitcrm-data for the signed-in user when nothing is typed', () => {
    expect(Object.fromEntries(new URL(newRepoLink(null)).searchParams)).toMatchObject({ name: 'gitcrm-data', owner: '@me', visibility: 'private' });
  });
});

describe('tokenLink', () => {
  it('pre-fills the fine-grained PAT form for the repo owner (S-07)', () => {
    const url = new URL(tokenLink('octo-dev', 'crm'));
    expect(url.origin + url.pathname).toBe('https://github.com/settings/personal-access-tokens/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: 'GitCRM crm',
      description: expect.stringContaining('octo-dev/crm'),
      target_name: 'octo-dev',
      contents: 'write',
    });
  });

  it('keeps the token name within 40 characters', () => {
    expect(new URL(tokenLink('octo-dev', 'x'.repeat(60))).searchParams.get('name')).toHaveLength(40);
  });
});

describe('parseRepoName', () => {
  it('accepts owner/repo and a pasted GitHub URL', () => {
    for (const input of ['octo-dev/crm', ' octo-dev/crm ', 'https://github.com/octo-dev/crm', 'github.com/octo-dev/crm.git', 'https://github.com/octo-dev/crm/']) {
      expect(parseRepoName(input), input).toEqual({ owner: 'octo-dev', repo: 'crm' });
    }
  });

  it('rejects anything else', () => {
    for (const input of ['', 'crm', 'octo-dev/', 'a/b/c', 'octo dev/crm', 'https://gitlab.com/octo-dev/crm']) expect(parseRepoName(input), input).toBeNull();
  });
});

