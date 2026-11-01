import { describe, expect, it } from 'vitest';
import { recordPath, WORKSPACE_PATH } from '../core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../core/record-file.ts';
import { editRecord, newRecord } from '../core/records.ts';
import type { Contact, Opportunity } from '../core/schemas.ts';
import { newWorkspaceConfig } from '../core/workspace.ts';
import { serveFakeGitHub } from '../test/msw.ts';
import { gitBlobSha } from './encoding.ts';
import { ConflictError, InvalidFileError, UnknownOutcomeError } from './errors.ts';
import { createGitHubClient, GitHubError } from './github-client.ts';
import { createGitHubWorkspace } from './github-workspace.ts';

const github = serveFakeGitHub();
const now = new Date('2026-10-28T12:00:00Z');
const later = new Date('2026-10-28T13:00:00Z');
const contactId = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';
const path = recordPath('contact', contactId);

function workspace() {
  const fake = github();
  return createGitHubWorkspace({ client: createGitHubClient(fake.token), owner: fake.owner, repo: fake.repo, branch: fake.branch });
}

function ava(): Contact {
  return newRecord('contact', { name: 'Ava Bennett', emails: ['ava@example.test'], phones: [], companyId: null, tags: [] }, { now, id: contactId });
}

async function seedAva(): Promise<string> {
  return github().seed(path, serializeRecord(ava()));
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('createRecord', () => {
  it('commits canonical JSON at the sharded path in one request', async () => {
    const saved = await workspace().createRecord(ava());
    expect(github().file(path)).toBe(serializeRecord(ava()));
    expect(saved).toMatchObject({ record: ava(), path, commitSha: github().head });
    expect(saved.blobSha).toHaveLength(40);
    expect(github().lastCommitMessage()).toBe('gitcrm: create contact d13d0f69');
    expect(github().count('PUT')).toBe(1);
  });

  it('reports a conflict when the path already exists, and keeps the file', async () => {
    const other = { ...ava(), name: 'Someone else' };
    await github().seed(path, serializeRecord(other));
    const error = await rejection(workspace().createRecord(ava()));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).remote?.record).toEqual(other);
    expect(github().file(path)).toBe(serializeRecord(other));
  });

  it('confirms a create whose response was lost, without a second write', async () => {
    github().failNext('PUT', /contents/, { network: 'after' });
    const saved = await workspace().createRecord(ava());
    expect(saved).toMatchObject({ record: ava(), path, commitSha: null });
    expect(github().file(path)).toBe(serializeRecord(ava()));
    expect(github().count('PUT')).toBe(1);
    expect(github().commitCount()).toBe(2);
  });

  it('reports a network failure when the create never arrived', async () => {
    github().failNext('PUT', /contents/, { network: 'before' });
    const error = await rejection(workspace().createRecord(ava()));
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).kind).toBe('network');
    expect(github().file(path)).toBeUndefined();
  });

  it('reports an unknown outcome when it cannot check after a lost response', async () => {
    github().failNext('PUT', /contents/, { network: 'after' });
    github().failNext('GET', /contents/, { network: 'before' });
    expect(await rejection(workspace().createRecord(ava()))).toBeInstanceOf(UnknownOutcomeError);
  });
});

describe('readRecord', () => {
  it('returns the record with its blob SHA', async () => {
    const sha = await seedAva();
    expect(await workspace().readRecord('contact', contactId)).toEqual({ record: ava(), path, blobSha: sha, commitSha: null });
  });

  it('returns null for a missing record', async () => {
    expect(await workspace().readRecord('contact', contactId)).toBeNull();
  });

  it('refuses an invalid file', async () => {
    await github().seed(path, '{ "name": ');
    const error = await rejection(workspace().readRecord('contact', contactId));
    expect(error).toBeInstanceOf(InvalidFileError);
    expect((error as InvalidFileError).issue.code).toBe('invalid-json');
  });
});

describe('updateRecord', () => {
  it('writes with the expected blob SHA and changes only that file', async () => {
    const sha = await seedAva();
    const other = recordPath('contact', 'a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf');
    await github().seed(other, 'unrelated');
    const edited = editRecord(ava(), { emails: ['ava@studio.test'] }, later);
    const saved = await workspace().updateRecord(edited, sha);
    expect(github().file(path)).toBe(serializeRecord(edited));
    expect(github().file(other)).toBe('unrelated');
    expect(saved.blobSha).not.toBe(sha);
    expect(github().lastCommitMessage()).toBe('gitcrm: update contact d13d0f69');
  });

  it('reports a conflict for a stale SHA and never overwrites the newer version', async () => {
    const sha = await seedAva();
    const theirs = editRecord(ava(), { name: 'Ava B. (theirs)' }, later);
    await github().seed(path, serializeRecord(theirs));
    const mine = editRecord(ava(), { name: 'Ava B. (mine)' }, later);
    const error = await rejection(workspace().updateRecord(mine, sha));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).remote?.record).toEqual(theirs);
    expect(github().file(path)).toBe(serializeRecord(theirs));
    expect(github().count('PUT')).toBe(1);
  });

  it('makes no request when the content is unchanged', async () => {
    const sha = await seedAva();
    const saved = await workspace().updateRecord(ava(), sha);
    expect(saved.blobSha).toBe(sha);
    expect(github().requests).toHaveLength(0);
  });

  it('confirms an update whose response was lost', async () => {
    const sha = await seedAva();
    const edited = editRecord(ava(), { name: 'Ava B.' }, later);
    github().failNext('PUT', /contents/, { network: 'after' });
    await workspace().updateRecord(edited, sha);
    expect(github().file(path)).toBe(serializeRecord(edited));
    expect(github().count('PUT')).toBe(1);
  });

  it('reports a network failure when the update never arrived, so a retry is safe', async () => {
    const sha = await seedAva();
    github().failNext('PUT', /contents/, { network: 'before' });
    const error = await rejection(workspace().updateRecord(editRecord(ava(), { name: 'Ava B.' }, later), sha));
    expect((error as GitHubError).kind).toBe('network');
    expect(github().file(path)).toBe(serializeRecord(ava()));
  });

  it('passes on a permission failure as it is', async () => {
    const sha = await seedAva();
    github().archived = true;
    const error = await rejection(workspace().updateRecord(editRecord(ava(), { name: 'Ava B.' }, later), sha));
    expect(error).toMatchObject({ kind: 'forbidden', githubMessage: 'Repository was archived so is read-only.' });
  });
});

describe('deleteWithCascade', () => {
  const opportunityId = 'e8c756c7-f1b2-4c47-9d3d-26457c6b0979';
  const opportunityPath = recordPath('opportunity', opportunityId);
  const taskPath = recordPath('task', '9b8b4d79-75d6-450c-a492-1e0638d49cd8');
  const deal = (): Opportunity =>
    newRecord('opportunity', {
      title: 'Website rebuild', stageId: 'lead', companyId: null, contactIds: [contactId], valueMinor: null, currency: 'USD', expectedCloseDate: null,
    }, { now, id: opportunityId });
  // Deletes Ava; `loaded` is every file under data/ that the preview read.
  const deleteAva = (sha: string, loaded: [string, string][] = [[path, sha]]) =>
    workspace().deleteWithCascade({ target: { type: 'contact', id: contactId }, deletes: [{ path, blobSha: sha }], rewrites: [], loaded: new Map(loaded) });

  it('deletes and rewrites in one non-forced commit, and returns the blob SHA of each rewritten file', async () => {
    const contactSha = await seedAva();
    const dealSha = await github().seed(opportunityPath, serializeRecord(deal()));
    const unlinked = editRecord(deal(), { contactIds: [] }, later);
    const commitsBefore = github().commitCount();

    const result = await workspace().deleteWithCascade({
      target: { type: 'contact', id: contactId },
      deletes: [{ path, blobSha: contactSha }],
      rewrites: [{ record: unlinked, blobSha: dealSha }],
      loaded: new Map([[path, contactSha], [opportunityPath, dealSha]]),
    });

    expect(result.commitSha).toBe(github().head);
    expect(result.rewritten).toEqual([{ record: unlinked, path: opportunityPath, blobSha: await gitBlobSha(serializeRecord(unlinked)), commitSha: result.commitSha }]);
    expect(github().commitCount()).toBe(commitsBefore + 1);
    expect(github().file(path)).toBeUndefined();
    expect(github().file(opportunityPath)).toBe(serializeRecord(unlinked));
    expect(github().lastCommitMessage()).toBe('gitcrm: delete contact d13d0f69');
  });

  it('reports a conflict and deletes nothing when a file changed since it was loaded', async () => {
    const staleSha = await seedAva();
    await github().seed(path, serializeRecord(editRecord(ava(), { name: 'Edited by someone' }, later)));
    const error = await rejection(deleteAva(staleSha));
    expect(error).toBeInstanceOf(ConflictError);
    expect(github().file(path)).toContain('Edited by someone');
    expect(github().count('PATCH')).toBe(0);
  });

  // A record that appeared or changed may link to the target now (ADR-021: no dangling links).
  it('reports a conflict when a file under data/ appeared, changed, or went after the preview', async () => {
    const sha = await seedAva();
    const dealSha = await github().seed(opportunityPath, serializeRecord(deal()));
    await github().seed(taskPath, 'added by someone else');
    expect(await rejection(deleteAva(sha, [[path, sha], [opportunityPath, dealSha]]))).toBeInstanceOf(ConflictError);

    const taskSha = await github().seed(taskPath, 'added by someone else');
    await github().seed(opportunityPath, serializeRecord(editRecord(deal(), { title: 'Renamed' }, later)));
    expect(await rejection(deleteAva(sha, [[path, sha], [opportunityPath, dealSha], [taskPath, taskSha]]))).toBeInstanceOf(ConflictError);

    github().remove(taskPath);
    const renamedSha = await github().seed(opportunityPath, serializeRecord(editRecord(deal(), { title: 'Renamed' }, later)));
    expect(await rejection(deleteAva(sha, [[path, sha], [opportunityPath, renamedSha], [taskPath, taskSha]]))).toBeInstanceOf(ConflictError);
    expect(github().file(path)).toBeDefined();
    expect(github().count('PATCH')).toBe(0);
  });

  it('starts again when main moves outside data/, and keeps the other change', async () => {
    const sha = await seedAva();
    github().failNext('PATCH', /git\/refs/, { run: async () => void (await github().seed('README.md', 'saved by someone else')) });
    await deleteAva(sha);
    expect(github().file(path)).toBeUndefined();
    expect(github().file('README.md')).toBe('saved by someone else');
    expect(github().count('PATCH')).toBe(2);
  });

  it('reports a conflict when a record changes while the delete runs', async () => {
    const sha = await seedAva();
    github().failNext('PATCH', /git\/refs/, { run: async () => void (await github().seed(taskPath, 'added by someone else')) });
    expect(await rejection(deleteAva(sha))).toBeInstanceOf(ConflictError);
    expect(github().file(path)).toBeDefined();
    expect(github().count('PATCH')).toBe(1);
  });

  it('stops after a bounded number of attempts', async () => {
    const sha = await seedAva();
    for (let i = 0; i < 5; i++) github().failNext('PATCH', /git\/refs/, { run: async () => void (await github().seed(`other-${i}.txt`, 'x')) });
    const error = await rejection(deleteAva(sha));
    expect(error).toMatchObject({ kind: 'unprocessable' });
    expect(github().count('PATCH')).toBe(3);
    expect(github().file(path)).toBeDefined();
  });

  it('confirms a delete whose ref update response was lost', async () => {
    const sha = await seedAva();
    github().failNext('PATCH', /git\/refs/, { network: 'after' });
    const result = await deleteAva(sha);
    expect(result.commitSha).toBe(github().head);
    expect(github().file(path)).toBeUndefined();
    expect(github().count('PATCH')).toBe(1);
  });
});

describe('writeWorkspace', () => {
  const config = newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' });

  it('creates .gitcrm/workspace.json in one commit', async () => {
    const before = github().commitCount();
    const saved = await workspace().writeWorkspace(config, null);
    expect(github().file(WORKSPACE_PATH)).toBe(serializeWorkspace(config));
    expect(github().commitCount()).toBe(before + 1);
    expect(github().lastCommitMessage()).toBe('gitcrm: initialize workspace');
    expect(saved).toEqual({ config, blobSha: saved.blobSha, commitSha: github().head });
  });

  it('initializes an empty repo: the config is its first commit (S-09)', async () => {
    github().empty = true;
    await workspace().writeWorkspace(config, null);
    expect(github().commitCount()).toBe(1);
    expect(github().paths()).toEqual([WORKSPACE_PATH]);
  });

  it('never overwrites an existing config', async () => {
    await github().seed(WORKSPACE_PATH, 'existing');
    expect(await rejection(workspace().writeWorkspace(config, null))).toBeInstanceOf(ConflictError);
    expect(github().file(WORKSPACE_PATH)).toBe('existing');
  });

  it('updates with the expected blob SHA', async () => {
    const sha = await github().seed(WORKSPACE_PATH, serializeWorkspace(config));
    await workspace().writeWorkspace({ ...config, name: 'Renamed Studio' }, sha);
    expect(github().file(WORKSPACE_PATH)).toContain('Renamed Studio');
    expect(github().lastCommitMessage()).toBe('gitcrm: update workspace settings');
  });
});

