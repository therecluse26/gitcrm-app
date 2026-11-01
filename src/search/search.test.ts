import { describe, expect, it } from 'vitest';
import type { CustomFieldSets } from '@/core/custom-fields.ts';
import { formatMoney } from '@/core/money.ts';
import { recordPath } from '@/core/paths.ts';
import { newRecord } from '@/core/records.ts';
import type { Activity, Company, Contact, CRMRecord, Opportunity, Task } from '@/core/schemas.ts';
import { newWorkspaceConfig } from '@/core/workspace.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { DEFAULT_SEARCH_VIEW, indexRecords, search, type SearchResults, type SearchView } from './search.ts';

const now = new Date('2026-10-29T12:00:00Z');
const stages = newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' }).pipelineStages;
const archivedAt = '2026-10-30T09:00:00Z';

const contact = (name: string, changes: Partial<Contact> = {}): Contact => ({ ...newRecord('contact', { name, emails: [], phones: [], companyId: null, tags: [] }, { now }), ...changes });
const company = (name: string, changes: Partial<Company> = {}): Company => ({ ...newRecord('company', { name, website: null, tags: [] }, { now }), ...changes });
const opportunity = (title: string, changes: Partial<Opportunity> = {}): Opportunity => ({
  ...newRecord('opportunity', { title, stageId: 'lead', companyId: null, contactIds: [], valueMinor: null, currency: 'USD', expectedCloseDate: null }, { now }),
  ...changes,
});
const task = (title: string, changes: Partial<Task> = {}): Task => ({ ...newRecord('task', { title, description: '', dueDate: null, completedAt: null, related: null }, { now }), ...changes });
const activity = (body: string, changes: Partial<Activity> = {}): Activity => ({ ...newRecord('activity', { kind: 'note', body, occurredAt: '2026-10-26T16:15:00Z', related: null }, { now }), ...changes });

const saved = (record: CRMRecord): VersionedRecord => ({ record, path: recordPath(record.type, record.id), blobSha: `sha-${record.id}`, commitSha: null });

const northwind = company('Northwind Traders', { website: 'https://northwind.example', tags: ['wholesale'] });
const ava = contact('Ava Bennett', { emails: ['ava@northwind.example'], phones: ['+1 555 0100'], companyId: northwind.id, tags: ['vip'] });
const zoe = contact('Zoë Ålund');
const rebuild = opportunity('Website rebuild', { stageId: 'proposal', companyId: northwind.id, contactIds: [ava.id], valueMinor: 1_200_000 });
const followUp = task('Send the proposal', { description: 'Include the hosting quote', related: { type: 'opportunity', id: rebuild.id } });
const call = activity('Talked about the launch date', { kind: 'call', related: { type: 'contact', id: ava.id } });
const records = [northwind, ava, zoe, rebuild, followUp, call];

const find = (query: string, changes: Partial<SearchView> = {}, from: CRMRecord[] = records) => search(indexRecords(from.map(saved), stages), { ...DEFAULT_SEARCH_VIEW, query, ...changes });
// The found records, by type, as their names or the activity body.
const found = (results: SearchResults) =>
  Object.fromEntries(Object.entries(results.found).flatMap(([type, list]) => (list.length > 0 ? [[type, list.map(({ record: r }) => ('name' in r ? r.name : 'title' in r ? r.title : r.body))]] : [])));

describe('search', () => {
  it('finds nothing for an empty search', () => {
    expect(find('')).toMatchObject({ shown: 0, hiddenArchived: 0 });
    expect(find('   ').shown).toBe(0);
  });

  it('finds a contact by name, email, phone, tag, and company name', () => {
    for (const query of ['bennett', 'ava@north', '555 0100', 'vip', 'traders']) expect(found(find(query)).contact, query).toEqual(['Ava Bennett']);
  });

  it('finds the shown values of custom fields, but not removed ones (spec 10)', () => {
    const fields: CustomFieldSets = {
      contact: [
        { id: 'source', label: 'Lead source', type: 'select', position: 0, archived: false, options: [{ id: 'referral', label: 'Word of mouth', archived: false }] },
        { id: 'note', label: 'Note', type: 'text', position: 1, archived: false, options: [] },
        { id: 'old', label: 'Old', type: 'text', position: 2, archived: true, options: [] },
      ],
      company: [],
      opportunity: [],
    };
    const lee = contact('Lee Park', { customFields: { source: 'referral', note: 'met at the expo', old: 'hidden words' } });
    const findIn = (query: string) => found(search(indexRecords([saved(lee)], stages, fields), { ...DEFAULT_SEARCH_VIEW, query })).contact;
    expect(findIn('mouth')).toEqual(['Lee Park']);
    expect(findIn('expo')).toEqual(['Lee Park']);
    expect(findIn('referral')).toBeUndefined();
    expect(findIn('hidden')).toBeUndefined();
  });

  it('finds a company by name, website, and tag', () => {
    for (const query of ['traders', 'northwind.example', 'wholesale']) expect(found(find(query)).company, query).toEqual(['Northwind Traders']);
  });

  it('finds an opportunity by title, stage name, company name, contact name, and amount', () => {
    for (const query of ['rebuild', 'proposal', 'traders', 'bennett', '12000', formatMoney(1_200_000, 'USD')]) {
      expect(found(find(query)).opportunity, query).toEqual(['Website rebuild']);
    }
  });

  it('finds a task by title, description, and the name of its related record', () => {
    for (const query of ['send', 'hosting quote', 'website rebuild']) expect(found(find(query)).task, query).toEqual(['Send the proposal']);
  });

  it('finds an activity by what happened and the name of its related record', () => {
    for (const query of ['launch date', 'ava bennett']) expect(found(find(query)).activity, query).toEqual(['Talked about the launch date']);
  });

  it('needs every word, but the words can match different fields', () => {
    expect(found(find('ava northwind')).contact).toEqual(['Ava Bennett']);
    expect(found(find('ava nowhere'))).toEqual({});
  });

  it('ignores case and accents', () => {
    expect(found(find('ZOE alund'))).toEqual({ contact: ['Zoë Ålund'] });
  });

  it('finds every type that links to a company by its name, and counts the results', () => {
    const results = find('northwind');
    expect(found(results)).toEqual({ contact: ['Ava Bennett'], company: ['Northwind Traders'], opportunity: ['Website rebuild'] });
    expect(results.shown).toBe(3);
  });

  it('shows only the chosen record type', () => {
    expect(found(find('northwind', { type: 'opportunity' }))).toEqual({ opportunity: ['Website rebuild'] });
  });

  it('hides archived records and counts them, unless asked to show them', () => {
    const from = [...records, contact('Ava Archer', { archivedAt }), company('Ava Labs', { archivedAt })];
    expect(find('ava', {}, from)).toMatchObject({ shown: 3, hiddenArchived: 2 });
    expect(find('ava', { type: 'company' }, from)).toMatchObject({ shown: 0, hiddenArchived: 1 });
    expect(found(find('ava', { showArchived: true }, from)).contact).toEqual(['Ava Archer', 'Ava Bennett']);
  });

  it('sorts by name or title, A to Z, with a tie broken by ID, and activities latest first', () => {
    const [first, second] = [contact('ava'), contact('Ava')].sort((a, b) => (a.id < b.id ? -1 : 1));
    const from = [contact('Ben Ava'), second, first, activity('Ava 1', { occurredAt: '2026-10-01T10:00:00Z' }), activity('Ava 2', { occurredAt: '2026-10-02T10:00:00Z' })];
    const results = find('ava', {}, from);
    expect(results.found.contact.map((v) => v.record.id)).toEqual([first.id, second.id, from[0].id]);
    expect(found(results).activity).toEqual(['Ava 2', 'Ava 1']);
  });

  it('skips the name of a related record that is not in the workspace', () => {
    const lost = task('Call back', { related: { type: 'contact', id: zoe.id } });
    expect(found(find('call back', {}, [lost])).task).toEqual(['Call back']);
    expect(found(find('zoe', {}, [lost]))).toEqual({});
  });

  it('returns the saved versions, so a task can be completed from the results', () => {
    expect(find('send').found.task[0]).toEqual(saved(followUp));
  });
});
