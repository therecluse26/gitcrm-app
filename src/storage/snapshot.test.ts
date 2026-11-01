import { describe, expect, it } from 'vitest';
import type { CustomField } from '../core/custom-fields.ts';
import { recordPath, WORKSPACE_PATH } from '../core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../core/record-file.ts';
import { newRecord } from '../core/records.ts';
import type { CRMRecord, WorkspaceConfig } from '../core/schemas.ts';
import { serveFakeGitHub } from '../test/msw.ts';
import { SnapshotError } from './errors.ts';
import { createGitHubClient } from './github-client.ts';
import { keepUnchanged, loadSnapshot, snapshotFromFiles, type SnapshotFiles } from './snapshot.ts';

const github = serveFakeGitHub();
const now = new Date('2026-10-28T12:00:00Z');

const config: WorkspaceConfig = {
  schemaVersion: 1,
  workspaceId: 'f81d4fae-7dec-4c1d-ae0c-0d04ef1a7291',
  name: 'Example Studio',
  defaultCurrency: 'USD',
  pipelineStages: [
    { id: 'lead', label: 'Lead', position: 0 },
    { id: 'won', label: 'Won', position: 1 },
    { id: 'lost', label: 'Lost', position: 2 },
  ],
};

function load(cached?: SnapshotFiles) {
  const fake = github();
  return loadSnapshot(createGitHubClient(fake.token), { owner: fake.owner, repo: fake.repo, branch: fake.branch }, cached);
}

// Contact n lives in shard n % 256: the shard is the first two hex characters of the ID.
function contactId(n: number): string {
  return `${(n % 256).toString(16).padStart(2, '0')}${n.toString(16).padStart(6, '0')}-0a4c-4192-9009-9e36a51c42c0`;
}

function contact(n: number, name = `Contact ${n}`) {
  return newRecord('contact', { name, emails: [], phones: [], companyId: null, tags: [] }, { now, id: contactId(n) });
}

async function seedContacts(count: number) {
  for (let n = 0; n < count; n++) await github().seed(recordPath('contact', contactId(n)), serializeRecord(contact(n)));
}

describe('loadSnapshot', () => {
  it('loads the workspace and every record, pinned to one commit', async () => {
    const configSha = await github().seed(WORKSPACE_PATH, serializeWorkspace(config));
    await seedContacts(3);
    const { snapshot } = await load();
    expect(snapshot.commitSha).toBe(github().head);
    expect(snapshot.workspace).toEqual({ config, blobSha: configSha });
    expect(snapshot.records.map((r) => r.record.type === 'contact' && r.record.name)).toEqual(['Contact 0', 'Contact 1', 'Contact 2']);
    expect(snapshot.records.every((r) => r.commitSha === snapshot.commitSha && r.blobSha.length === 40)).toBe(true);
    expect(snapshot.issues).toEqual([]);
  });

  it('reports a missing workspace config as null, without an issue', async () => {
    const { snapshot } = await load();
    expect(snapshot.workspace).toBeNull();
    expect(snapshot.issues).toEqual([]);
  });

  it('reports an invalid workspace config as an issue', async () => {
    await github().seed(WORKSPACE_PATH, '{"schemaVersion": 3}');
    const { snapshot } = await load();
    expect(snapshot.workspace).toBeNull();
    expect(snapshot.issues).toMatchObject([{ path: WORKSPACE_PATH, code: 'unsupported-version' }]);
  });

  it('reports bad files and still loads the good ones', async () => {
    await seedContacts(2);
    const broken = recordPath('contact', contactId(255));
    await github().seed(broken, '{ not json');
    await github().seed('data/contacts/README.md', 'notes');
    await github().seed('README.md', 'files outside data/ are not read');
    const { snapshot } = await load();
    expect(snapshot.records).toHaveLength(2);
    expect(snapshot.issues).toEqual([
      expect.objectContaining({ path: 'data/contacts/README.md', code: 'unrecognized-path' }),
      expect.objectContaining({ path: broken, code: 'invalid-json' }),
    ]);
  });

  it('loads a record with a broken link and reports the link as an issue', async () => {
    const orphan = { ...contact(1), companyId: 'a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf' };
    await github().seed(recordPath('contact', orphan.id), serializeRecord(orphan));
    const { snapshot } = await load();
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.issues).toEqual([expect.objectContaining({ path: recordPath('contact', orphan.id), code: 'broken-link' })]);
  });

  it('loads a record whose custom field value does not fit, and reports it (spec 10)', async () => {
    const employees: CustomField = { id: 'employees', label: 'Employees', type: 'number', position: 0, archived: false, options: [] };
    await github().seed(WORKSPACE_PATH, serializeWorkspace({ ...config, schemaVersion: 2, customFields: { contact: [employees], company: [], opportunity: [] } }));
    const many = { ...contact(1), customFields: { employees: 'many' } };
    await github().seed(recordPath('contact', many.id), serializeRecord(many));
    const { snapshot } = await load();
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.issues).toEqual([{ path: recordPath('contact', many.id), code: 'custom-field', message: 'customFields.employees: "many" is not a valid number' }]);
  });

  it('reads at most about 100 files per GraphQL query', async () => {
    await seedContacts(250);
    const { snapshot } = await load();
    expect(snapshot.records).toHaveLength(250);
    expect(github().count('POST', /graphql/)).toBe(3);
  });

  it('makes a bounded number of requests: ref, commit, tree, config blob, then one query per chunk', async () => {
    await github().seed(WORKSPACE_PATH, serializeWorkspace(config));
    await seedContacts(20);
    await load();
    expect(github().requests.map((r) => `${r.method} ${r.path.replace(/[0-9a-f]{40}/, '<sha>')}`)).toEqual([
      'GET /repos/octo-dev/crm/git/ref/heads/main',
      'GET /repos/octo-dev/crm/git/commits/<sha>',
      'GET /repos/octo-dev/crm/git/trees/<sha>',
      'GET /repos/octo-dev/crm/git/blobs/<sha>',
      'POST /graphql',
    ]);
  });

  it('splits a chunk that times out with 502 and retries each half once', async () => {
    await seedContacts(40);
    github().failNext('POST', /graphql/, { respond: { status: 502, body: { message: 'Server Error' } } });
    const { snapshot } = await load();
    expect(snapshot.records).toHaveLength(40);
    expect(github().count('POST', /graphql/)).toBe(3);
  });

  it('fails the whole load when a retried chunk fails again', async () => {
    await seedContacts(1);
    github().failNext('POST', /graphql/, { respond: { status: 502 } });
    github().failNext('POST', /graphql/, { respond: { status: 502 } });
    await expect(load()).rejects.toMatchObject({ kind: 'server' });
  });

  it('refuses a truncated tree instead of omitting records', async () => {
    await seedContacts(1);
    github().truncateTrees = true;
    await expect(load()).rejects.toBeInstanceOf(SnapshotError);
  });

  // S-09: an empty repo answers the Git data API with 409 "Git Repository is empty.".
  it('loads an empty repo as an empty snapshot with no workspace, so Connect offers Initialize', async () => {
    github().empty = true;
    const { snapshot, files } = await load();
    expect(snapshot).toEqual({ commitSha: null, workspace: null, records: [], issues: [] });
    expect(files).toEqual({ commitSha: null, files: new Map() });
    expect(github().requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /repos/octo-dev/crm/git/ref/heads/main']);
  });

  it('keeps the cached files of an empty repo, so a check of it changes nothing', async () => {
    github().empty = true;
    const first = await load();
    expect((await load(first.files)).files).toBe(first.files);
  });

  it('reports a default branch that GitHub does not find as a snapshot error', async () => {
    github().failNext('GET', /git\/ref\//, { respond: { status: 404, body: { message: 'Not Found' } } });
    await expect(load()).rejects.toThrow(/no commits/);
  });
});

describe('loadSnapshot with a cached snapshot (ADR-017)', () => {
  it('makes one request when main has not moved', async () => {
    await github().seed(WORKSPACE_PATH, serializeWorkspace(config));
    await seedContacts(3);
    const first = await load();
    github().requests.length = 0;
    const again = await load(first.files);
    expect(github().requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /repos/octo-dev/crm/git/ref/heads/main']);
    expect(again.snapshot).toEqual(first.snapshot);
  });

  it('fetches only folders with changed files, and drops deleted records', async () => {
    await github().seed(WORKSPACE_PATH, serializeWorkspace(config));
    await seedContacts(3);
    const first = await load();
    await github().seed(recordPath('contact', contactId(1)), serializeRecord(contact(1, 'Renamed')));
    github().remove(recordPath('contact', contactId(2)));
    github().requests.length = 0;

    const next = await load(first.files);
    expect(next.snapshot.records.map((r) => r.record.type === 'contact' && r.record.name)).toEqual(['Contact 0', 'Renamed']);
    expect(next.snapshot.workspace?.config).toEqual(config);
    expect(github().count('GET', /git\/blobs/)).toBe(0);
    const queries = github().requests.filter((r) => r.path === '/graphql');
    expect(queries.map((r) => Object.values((r.body as { variables: Record<string, string> }).variables).filter((v) => v.includes(':')))).toEqual([
      [`${next.snapshot.commitSha}:data/contacts/01`],
    ]);
    expect(next.files.commitSha).toBe(next.snapshot.commitSha);
  });

  it('keeps reporting bad files from the cache', async () => {
    await github().seed('data/contacts/README.md', 'notes');
    await github().seed(recordPath('contact', contactId(5)), '{ not json');
    const first = await load();
    const again = await load(first.files);
    expect(again.snapshot.issues).toEqual(first.snapshot.issues);
    expect(again.snapshot.issues).toHaveLength(2);
  });

  it('compares blob SHAs when the cached commit is unknown, as after a save', async () => {
    await seedContacts(2);
    const first = await load();
    github().requests.length = 0;
    const next = await load({ ...first.files, commitSha: null });
    expect(next.snapshot.records).toEqual(first.snapshot.records);
    expect(github().count('POST', /graphql/)).toBe(0);
  });
});

describe('keepUnchanged', () => {
  const filesOf = (commitSha: string | null, entries: [CRMRecord, string][]): SnapshotFiles => ({
    commitSha,
    files: new Map(entries.map(([record, blobSha]) => [recordPath(record.type, record.id), { blobSha, text: serializeRecord(record), isTruncated: false }])),
  });
  const [ava, ben, cy] = [contact(1, 'Ava'), contact(2, 'Ben'), contact(3, 'Cy')];
  const before = snapshotFromFiles(filesOf('c1', [[ava, 'a1'], [ben, 'b1'], [cy, 'c1']]));

  it('keeps the object of each record whose file did not change, so its list row need not draw again', () => {
    const after = keepUnchanged(snapshotFromFiles(filesOf(null, [[ava, 'a1'], [{ ...ben, name: 'Ben Carter' }, 'b2'], [cy, 'c1']])), before);
    expect(after.records[0]).toBe(before.records[0]);
    expect(after.records[1]).not.toBe(before.records[1]);
    expect(after.records[1]).toMatchObject({ blobSha: 'b2', commitSha: null, record: { name: 'Ben Carter' } });
    expect(after.records[2]).toBe(before.records[2]);
    expect(after.commitSha).toBeNull();
  });

  it('drops a deleted record and adds a new one', () => {
    const dee = contact(4, 'Dee');
    const after = keepUnchanged(snapshotFromFiles(filesOf('c2', [[ava, 'a1'], [cy, 'c1'], [dee, 'd1']])), before);
    expect(after.records.map((v) => v.record.id)).toEqual([ava.id, cy.id, dee.id]);
    expect(after.records[1]).toBe(before.records[2]);
  });

  it('keeps the workspace settings object while workspace.json has the same blob SHA', () => {
    const withConfig = (blobSha: string, name: string) => {
      const files = filesOf('c1', [[ava, 'a1']]);
      files.files.set(WORKSPACE_PATH, { blobSha, text: serializeWorkspace({ ...config, name }), isTruncated: false });
      return snapshotFromFiles(files);
    };
    const first = withConfig('w1', 'Example Studio');
    expect(keepUnchanged(withConfig('w1', 'Example Studio'), first).workspace).toBe(first.workspace);
    expect(keepUnchanged(withConfig('w2', 'Renamed Studio'), first).workspace?.config.name).toBe('Renamed Studio');
  });

  it('returns the next snapshot as it is when there is no previous one', () => {
    const next = snapshotFromFiles(filesOf('c1', [[ava, 'a1']]));
    expect(keepUnchanged(next, null)).toBe(next);
  });
});
