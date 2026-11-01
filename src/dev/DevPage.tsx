// Developer page (Phase 1 exit, docs/11): create, read, edit, and delete one contact in a repo.
// The token stays in this tab's memory. The Vite dev server serves this page; builds leave it out.
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { editRecord, newRecord } from '../core/records.ts';
import type { Contact } from '../core/schemas.ts';
import { deleteSummary, planDelete, previewDelete } from '../features/delete-plan.ts';
import { createGitHubClient } from '../storage/github-client.ts';
import { inspectRepository } from '../auth/connect.ts';
import { createGitHubWorkspace } from '../storage/github-workspace.ts';
import { stateForError, type OperationState } from '../storage/operation-state.ts';
import type { VersionedRecord, WorkspaceRepository, WorkspaceSnapshot } from '../storage/workspace-repository.ts';

type Session = { workspace: WorkspaceRepository; summary: string; canWrite: boolean };
type ContactVersion = VersionedRecord<Contact>;

const REPO_NAME = /^[\w.-]+\/[\w.-]+$/;

const isContact = (version: VersionedRecord): version is ContactVersion => version.record.type === 'contact';

function splitEmails(text: string): string[] {
  return text.split(',').map((email) => email.trim()).filter(Boolean);
}

export function DevPage() {
  const [repoName, setRepoName] = useState('');
  const [token, setToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [selected, setSelected] = useState<ContactVersion | null>(null);
  const [form, setForm] = useState({ name: '', emails: '' });
  const [draft, setDraft] = useState({ name: '', emails: '' });
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null); // what the delete changes
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => setLog((lines) => [...lines, `${new Date().toLocaleTimeString()} ${line}`]);

  // Runs one GitHub operation, shows its state, and logs the outcome (IDs only, no names).
  async function run(label: string, pending: OperationState, action: () => Promise<OperationState>) {
    setState(pending);
    try {
      const done = await action();
      setState(done);
      note(`${label}: ${done.status}${done.status === 'committed' && done.commitSha ? ` ${done.commitSha.slice(0, 7)}` : ''}`);
    } catch (error) {
      const failed: OperationState = error instanceof z.ZodError ? { status: 'failed', message: `Invalid: ${z.prettifyError(error)}` } : stateForError(error);
      setState(failed);
      note(`${label}: ${failed.status}`);
    }
  }

  function select(version: ContactVersion) {
    setSelected(version);
    setForm({ name: version.record.name, emails: version.record.emails.join(', ') });
    setDeleteArmed(null);
  }

  // Keeps the loaded list in step with saves.
  function replaceInSnapshot(id: string, version: VersionedRecord | null) {
    setSnapshot((current) => current && { ...current, records: [...current.records.filter((v) => v.record.id !== id), ...(version ? [version] : [])] });
  }

  function connect(event: FormEvent) {
    event.preventDefault();
    const name = repoName.trim();
    if (!REPO_NAME.test(name)) return setState({ status: 'failed', message: 'Enter the repository as owner/repo.' });
    const [owner, repo] = name.split('/');
    setSession(null);
    setSnapshot(null);
    setSelected(null);
    void run('connect', { status: 'loading' }, async () => {
      const client = createGitHubClient(token.trim());
      const check = await inspectRepository(client, owner, repo);
      if (!check.private) return { status: 'failed', message: 'Refused: the repository is public. GitCRM works only with private repositories.' };
      const canWrite = check.canWrite && !check.archived;
      setSession({
        workspace: createGitHubWorkspace({ client, owner, repo, branch: check.defaultBranch }),
        summary: `Connected to ${name} as ${check.login}, branch ${check.defaultBranch}${canWrite ? '' : ', read-only: the repo is archived, or the token has no Contents write'}.`,
        canWrite,
      });
      return { status: 'idle' };
    });
  }

  function load() {
    void run('load snapshot', { status: 'loading' }, async () => {
      setSnapshot((await session!.workspace.loadWorkspace()).snapshot);
      return { status: 'loaded' };
    });
  }

  function open(id: string) {
    void run(`read contact ${id.slice(0, 8)}`, { status: 'loading' }, async () => {
      const version = await session!.workspace.readRecord('contact', id);
      if (!version || !isContact(version)) return { status: 'failed', message: 'The contact is no longer on main.' };
      select(version);
      return { status: 'loaded' };
    });
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void run('create contact', { status: 'saving' }, async () => {
      const record = newRecord('contact', { name: draft.name.trim(), emails: splitEmails(draft.emails), phones: [], companyId: null, tags: [] }, { now: new Date() });
      const saved = await session!.workspace.createRecord(record);
      select(saved);
      replaceInSnapshot(record.id, saved);
      setDraft({ name: '', emails: '' });
      return { status: 'committed', commitSha: saved.commitSha };
    });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const base = selected!;
    void run(`update contact ${base.record.id.slice(0, 8)}`, { status: 'saving' }, async () => {
      const edited = editRecord(base.record, { name: form.name.trim(), emails: splitEmails(form.emails) }, new Date());
      if (edited === base.record) return { status: 'idle' }; // nothing changed, so no commit
      const saved = await session!.workspace.updateRecord(edited, base.blobSha);
      select(saved);
      replaceInSnapshot(saved.record.id, saved);
      return { status: 'committed', commitSha: saved.commitSha };
    });
  }

  // Retry after review: keep the form, and save next against main's version.
  function rebaseOnRemote(remote: VersionedRecord | null) {
    if (!remote || !isContact(remote)) return setState({ status: 'failed', message: 'The contact is no longer on main.' });
    setSelected(remote);
    setState({ status: 'unsaved' });
  }

  function armDelete() {
    if (!snapshot) return setState({ status: 'failed', message: 'Load the snapshot first, so the page can list what the delete changes.' });
    setDeleteArmed(deleteSummary(previewDelete(selected!, snapshot.records)));
  }

  // The cascade (ADR-021): the contact's tasks and activities go too, and opportunities lose the link.
  function remove() {
    const target = selected!;
    const plan = planDelete(previewDelete(target, snapshot!.records), new Date());
    void run(`delete contact ${target.record.id.slice(0, 8)}`, { status: 'saving' }, async () => {
      const result = await session!.workspace.deleteWithCascade(plan);
      setSelected(null);
      setDeleteArmed(null);
      const changed = new Set([...plan.deletes, ...result.rewritten].map(({ path }) => path));
      setSnapshot((current) => current && { ...current, records: [...current.records.filter((v) => !changed.has(v.path)), ...result.rewritten] });
      return { status: 'committed', commitSha: result.commitSha };
    });
  }

  function edit(field: 'name' | 'emails', value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (state.status !== 'conflict') setState({ status: 'unsaved' });
  }

  const contacts = (snapshot?.records ?? []).filter(isContact).sort((a, b) => a.record.name.localeCompare(b.record.name));
  const writable = session?.canWrite ?? false;

  return (
    <main>
      <h1>GitCRM developer page</h1>
      <p>For development only. The token stays in this tab's memory. Writes go straight to the repo's default branch.</p>

      <form onSubmit={connect}>
        <fieldset>
          <legend>Connect</legend>
          <label htmlFor="repo">Repository (owner/repo)</label>
          <input id="repo" value={repoName} onChange={(e) => setRepoName(e.target.value)} autoComplete="off" spellCheck={false} />
          <label htmlFor="token">Fine-grained PAT</label>
          <input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          <button type="submit">Connect</button>
        </fieldset>
      </form>

      <p role="status">
        State: {state.status}
        {'message' in state && ` - ${state.message}`}
        {state.status === 'committed' && state.commitSha && ` (commit ${state.commitSha.slice(0, 7)})`}
      </p>
      {session && <p>{session.summary}</p>}

      {state.status === 'conflict' && (
        <section aria-label="Conflict">
          <h2>Conflict</h2>
          <p>Your edit is still in the form. Compare it with the version on main, then retry.</p>
          <pre aria-label="Remote version">{state.remote ? JSON.stringify(state.remote.record, null, 2) : 'The contact is no longer on main.'}</pre>
          <button type="button" onClick={() => rebaseOnRemote(state.remote)}>Use the remote version as the base</button>
        </section>
      )}

      {session && (
        <section aria-label="Contacts">
          <h2>Contacts</h2>
          <button type="button" onClick={load}>Load snapshot</button>
          {snapshot && <p>Commit {snapshot.commitSha?.slice(0, 7) ?? 'unknown'}: {contacts.length} contacts, {snapshot.issues.length} file issues.</p>}
          {snapshot?.issues.map((issue) => <p key={`${issue.path}:${issue.code}`}>{issue.path}: {issue.message}</p>)}
          <ul>
            {contacts.map(({ record, blobSha }) => (
              <li key={record.id}>
                {record.name} {record.emails.join(', ')} [{record.id.slice(0, 8)}, blob {blobSha.slice(0, 7)}]{' '}
                <button type="button" onClick={() => open(record.id)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {writable && (
        <form onSubmit={create}>
          <fieldset>
            <legend>New contact</legend>
            <label htmlFor="new-name">New contact name</label>
            <input id="new-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <label htmlFor="new-emails">New contact emails</label>
            <input id="new-emails" value={draft.emails} onChange={(e) => setDraft({ ...draft, emails: e.target.value })} placeholder="comma-separated" />
            <button type="submit">Create contact</button>
          </fieldset>
        </form>
      )}

      {selected && (
        <form onSubmit={save}>
          <fieldset>
            <legend>Contact {selected.record.id}</legend>
            <p>{selected.path}, blob {selected.blobSha}</p>
            <label htmlFor="edit-name">Name</label>
            <input id="edit-name" value={form.name} onChange={(e) => edit('name', e.target.value)} />
            <label htmlFor="edit-emails">Emails</label>
            <input id="edit-emails" value={form.emails} onChange={(e) => edit('emails', e.target.value)} />
            <button type="submit" disabled={!writable}>Save</button>{' '}
            <button type="button" onClick={() => open(selected.record.id)}>Read again</button>{' '}
            {deleteArmed !== null ? (
              <>
                {deleteArmed}{' '}
                <button type="button" onClick={remove}>Confirm delete</button>{' '}
                <button type="button" onClick={() => setDeleteArmed(null)}>Cancel</button>
              </>
            ) : (
              <button type="button" disabled={!writable} onClick={armDelete}>Delete</button>
            )}
            <pre aria-label="Record">{JSON.stringify(selected.record, null, 2)}</pre>
          </fieldset>
        </form>
      )}

      <section aria-label="Log">
        <h2>Log</h2>
        <ol>
          {log.map((line, i) => <li key={i}>{line}</li>)}
        </ol>
      </section>
    </main>
  );
}
