import { describe, expect, it } from 'vitest';
import { recordPath } from '@/core/paths.ts';
import type { FileIssue } from '@/core/record-file.ts';
import { newRecord } from '@/core/records.ts';
import type { Activity, Company, Contact, CRMRecord, Opportunity, Task } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { deleteBlocker, deleteSummary, planDelete, previewDelete } from './delete-plan.ts';
import type { Related } from './related.ts';

const now = new Date('2026-10-29T12:00:00Z');
const later = new Date('2026-10-30T15:00:00Z');

const contact = (name: string, changes: Partial<Contact> = {}): Contact => ({ ...newRecord('contact', { name, emails: [], phones: [], companyId: null, tags: [] }, { now }), ...changes });
const company = (name: string): Company => newRecord('company', { name, website: null, tags: [] }, { now });
const opportunity = (title: string, changes: Partial<Opportunity> = {}): Opportunity => ({
  ...newRecord('opportunity', { title, stageId: 'lead', companyId: null, contactIds: [], valueMinor: null, currency: 'USD', expectedCloseDate: null }, { now }),
  ...changes,
});
const task = (title: string, related: Related | null = null): Task => newRecord('task', { title, description: '', dueDate: null, completedAt: null, related }, { now });
const activity = (body: string, related: Related | null, changes: Partial<Activity> = {}): Activity => ({
  ...newRecord('activity', { kind: 'note', body, occurredAt: '2026-10-26T16:15:00Z', related }, { now }),
  ...changes,
});
const saved = (record: CRMRecord): VersionedRecord => ({ record, path: recordPath(record.type, record.id), blobSha: `sha-${record.id}`, commitSha: null });

const northwind = company('Northwind Traders');
const ava = contact('Ava Bennett', { companyId: northwind.id });
const ben = contact('Ben Carter', { companyId: northwind.id });
const deal = opportunity('Website rebuild', { companyId: northwind.id, contactIds: [ava.id, ben.id] });
const retainer = opportunity('Retainer', { contactIds: [ben.id] });
const callAva = task('Call Ava', { type: 'contact', id: ava.id });
const metAva = activity('Met Ava', { type: 'contact', id: ava.id });
const oldNote = activity('An old note about Ava', { type: 'contact', id: ava.id }, { archivedAt: '2026-10-29T13:00:00Z' });
const proposal = task('Send the proposal', { type: 'opportunity', id: deal.id });
const visit = activity('Visited the office', { type: 'company', id: northwind.id });
const loose = task('A task with no link');
const records = [northwind, ava, ben, deal, retainer, callAva, metAva, oldNote, proposal, visit, loose];

const preview = (record: CRMRecord) => previewDelete(saved(record), records.map(saved));
const plan = (record: CRMRecord) => planDelete(preview(record), later);
const ids = (list: { record: CRMRecord }[]) => list.map((v) => v.record.id).toSorted();
const paths = (list: { path: string }[]) => list.map((d) => d.path).toSorted();

describe('previewDelete and planDelete', () => {
  it('delete a contact with its tasks and activities, archived ones too, and take it out of each opportunity', () => {
    expect(ids(preview(ava).deleted)).toEqual(ids([callAva, metAva, oldNote].map(saved)));
    expect(preview(ava).unlinked).toEqual([saved(deal)]);
    const commit = plan(ava);
    expect(commit.target).toEqual({ type: 'contact', id: ava.id });
    expect(paths(commit.deletes)).toEqual(paths([ava, callAva, metAva, oldNote].map(saved)));
    expect(commit.deletes.find((d) => d.path === recordPath('task', callAva.id))?.blobSha).toBe(`sha-${callAva.id}`);
    expect(commit.rewrites).toEqual([{ record: { ...deal, contactIds: [ben.id], updatedAt: '2026-10-30T15:00:00Z' }, blobSha: `sha-${deal.id}` }]);
  });

  it('delete a company with its tasks and activities, and clear companyId in its contacts and opportunities', () => {
    expect(ids(preview(northwind).deleted)).toEqual(ids([visit].map(saved)));
    expect(ids(preview(northwind).unlinked)).toEqual(ids([ava, ben, deal].map(saved)));
    const { rewrites } = plan(northwind);
    for (const { record } of rewrites) expect(record).toMatchObject({ companyId: null, updatedAt: '2026-10-30T15:00:00Z' });
    expect(rewrites.find((r) => r.record.id === deal.id)?.record).toMatchObject({ contactIds: [ava.id, ben.id] });
  });

  it('delete an opportunity with its tasks and activities, and unlink nothing', () => {
    expect(ids(preview(deal).deleted)).toEqual(ids([proposal].map(saved)));
    expect(preview(deal).unlinked).toEqual([]);
  });

  it('delete a task or an activity alone', () => {
    for (const record of [callAva, metAva, loose]) {
      expect([preview(record).deleted, preview(record).unlinked]).toEqual([[], []]);
      expect(paths(plan(record).deletes)).toEqual([recordPath(record.type, record.id)]);
      expect(plan(record).rewrites).toEqual([]);
    }
  });

  it('list every record file the preview read, so that a later change on main is a conflict', () => {
    expect(plan(loose).loaded).toEqual(new Map(records.map((r) => [recordPath(r.type, r.id), `sha-${r.id}`])));
  });
});

describe('deleteSummary', () => {
  it('counts what the delete removes and what it unlinks', () => {
    expect(deleteSummary(preview(ava))).toBe('This deletes the contact, 1 task, and 2 activities, and unlinks 1 opportunity.');
    expect(deleteSummary(preview(northwind))).toBe('This deletes the company and 1 activity, and unlinks 2 contacts and 1 opportunity.');
    expect(deleteSummary(preview(deal))).toBe('This deletes the opportunity and 1 task.');
    expect(deleteSummary(preview(loose))).toBe('This deletes the task.');
  });

  it('says "and unlinks" without a comma when the delete removes only the record', () => {
    const acme = company('Acme');
    const zoe = contact('Zoë', { companyId: acme.id });
    expect(deleteSummary(previewDelete(saved(acme), [acme, zoe].map(saved)))).toBe('This deletes the company and unlinks 1 contact.');
  });
});

describe('deleteBlocker', () => {
  const issue = (path: string, code: FileIssue['code']): FileIssue => ({ path, code, message: 'A problem' });
  const bad = 'data/contacts/ab/ab000000-0000-4000-8000-000000000000.json';

  it('allows a delete when every file can be read, even with a broken link', () => {
    expect(deleteBlocker([])).toBeNull();
    expect(deleteBlocker([issue(bad, 'broken-link')])).toBeNull();
  });

  it('blocks a delete while a file cannot be read, because that file may link to the record', () => {
    expect(deleteBlocker([issue(bad, 'invalid-json')])).toBe(`1 file cannot be read, so GitCRM cannot tell whether it links to this record: ${bad}`);
    expect(deleteBlocker([issue(bad, 'invalid-json'), issue('data/notes.txt', 'unrecognized-path')])).toBe(
      '2 files cannot be read, so GitCRM cannot tell whether they link to this record. Settings lists them under "Files that need attention".',
    );
  });
});
