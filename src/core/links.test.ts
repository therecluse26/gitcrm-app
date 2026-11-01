import { describe, expect, it } from 'vitest';
import { linkIssues } from './links.ts';
import { recordPath } from './paths.ts';
import { newRecord } from './records.ts';
import type { CRMRecord } from './schemas.ts';

const now = new Date('2026-10-29T12:00:00Z');
const companyId = 'a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf';
const contactId = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';
const missingId = '0b5e7c3a-1d2f-4e6a-8b9c-0d1e2f3a4b5c';

const company = newRecord('company', { name: 'Northwind Traders', website: null, tags: [] }, { now, id: companyId });
const contact = (link: string | null) => newRecord('contact', { name: 'Ava Bennett', emails: [], phones: [], companyId: link, tags: [] }, { now, id: contactId });
const entries = (...records: CRMRecord[]) => records.map((record) => ({ path: recordPath(record.type, record.id), record }));

describe('linkIssues', () => {
  it('finds nothing when every link resolves', () => {
    expect(linkIssues(entries(company, contact(companyId)))).toEqual([]);
  });

  it('reports a contact whose company is missing', () => {
    expect(linkIssues(entries(contact(missingId)))).toEqual([
      { path: recordPath('contact', contactId), code: 'broken-link', message: 'companyId: no company with ID 0b5e7c3a is in the workspace' },
    ]);
  });

  it('reports an opportunity whose stage is not in the workspace settings', () => {
    const deal = newRecord(
      'opportunity',
      { title: 'Website rebuild', stageId: 'negotiation', companyId: null, contactIds: [], valueMinor: null, currency: 'USD', expectedCloseDate: null },
      { now, id: 'e8c756c7-f1b2-4c47-9d3d-26457c6b0979' },
    );
    expect(linkIssues(entries(deal), new Set(['lead', 'won', 'lost']))).toEqual([
      { path: recordPath('opportunity', deal.id), code: 'broken-link', message: 'stageId: no stage "negotiation" is in .gitcrm/workspace.json' },
    ]);
    expect(linkIssues(entries(deal), new Set(['negotiation']))).toEqual([]);
    // Without valid workspace settings there is nothing to check against; that file has its own issue.
    expect(linkIssues(entries(deal), null)).toEqual([]);
  });

  it('counts an archived record as present', () => {
    expect(linkIssues(entries({ ...company, archivedAt: '2026-10-29T12:00:00Z' }, contact(companyId)))).toEqual([]);
  });

  it('reports every broken link of one record in one issue', () => {
    const deal = newRecord(
      'opportunity',
      { title: 'Website rebuild', stageId: 'lead', companyId: missingId, contactIds: [contactId, missingId], valueMinor: null, currency: 'USD', expectedCloseDate: null },
      { now, id: 'e8c756c7-f1b2-4c47-9d3d-26457c6b0979' },
    );
    const [issue] = linkIssues(entries(contact(null), deal));
    expect(issue.message).toBe('companyId: no company with ID 0b5e7c3a is in the workspace; contactIds: no contact with ID 0b5e7c3a is in the workspace');
  });

  it('checks the type of a related record, not only its ID', () => {
    // The ID belongs to a company, but the task says it is a contact.
    const task = newRecord(
      'task',
      { title: 'Follow up', description: '', dueDate: null, completedAt: null, related: { type: 'contact', id: companyId } },
      { now, id: '9b8b4d79-75d6-450c-a492-1e0638d49cd8' },
    );
    expect(linkIssues(entries(company, task))).toEqual([
      { path: recordPath('task', task.id), code: 'broken-link', message: 'related: no contact with ID a28a8fb0 is in the workspace' },
    ]);
  });
});
