import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readCsv, readList, readValue } from '../test/csv-reader.ts';
import { buildExport, csvTables, exportFileName, exportProblem, type ExportSource } from './export.ts';
import { recordPath, WORKSPACE_PATH } from './paths.ts';
import { parseRecordFile, parseWorkspaceFile, serializeRecord, serializeWorkspace, type FileIssue } from './record-file.ts';
import { newRecord } from './records.ts';
import { RECORD_TYPES, recordSchemas, type Activity, type Company, type Contact, type CRMRecord, type Opportunity, type RecordType, type Task } from './schemas.ts';
import { newWorkspaceConfig } from './workspace.ts';

const now = new Date('2026-10-29T12:00:00Z');
const exportedAt = new Date('2026-10-30T22:58:40Z');
const config = newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' });

const contact = (name: string, changes: Partial<Contact> = {}): Contact => ({ ...newRecord('contact', { name, emails: [], phones: [], companyId: null, tags: [] }, { now }), ...changes });
const company = (name: string, changes: Partial<Company> = {}): Company => ({ ...newRecord('company', { name, website: null, tags: [] }, { now }), ...changes });
const opportunity = (title: string, changes: Partial<Opportunity> = {}): Opportunity => ({
  ...newRecord('opportunity', { title, stageId: 'lead', companyId: null, contactIds: [], valueMinor: null, currency: 'USD', expectedCloseDate: null }, { now }),
  ...changes,
});
const task = (title: string, changes: Partial<Task> = {}): Task => ({ ...newRecord('task', { title, description: '', dueDate: null, completedAt: null, related: null }, { now }), ...changes });
const activity = (body: string, changes: Partial<Activity> = {}): Activity => ({ ...newRecord('activity', { kind: 'note', body, occurredAt: '2026-10-26T16:15:00Z', related: null }, { now }), ...changes });

const northwind = company('Northwind Traders', { website: 'https://northwind.example', tags: ['wholesale', 'a;b'] });
const ava = contact('=Ava Bennett', {
  emails: ['ava@northwind.example', 'ava.b@home.example'],
  phones: ['+1 555 0100'],
  companyId: northwind.id,
  tags: ['vip'],
  customFields: { seats: 3, tier: 'gold' },
});
const zoe = contact('Zoë Ålund "Z"', { archivedAt: '2026-10-30T09:00:00Z' });
const rebuild = opportunity('Website rebuild', { stageId: 'proposal', companyId: northwind.id, contactIds: [ava.id, zoe.id], valueMinor: 1_200_000, expectedCloseDate: '2026-11-30' });
const lead = opportunity('Retainer');
const followUp = task('Send the proposal', { description: 'Line 1\r\nLine 2, with "quotes"', dueDate: '2026-11-02', related: { type: 'opportunity', id: rebuild.id } });
const call = activity('Talked about the launch.\nShe wants it before March.', { kind: 'call', related: { type: 'contact', id: ava.id } });
const records: CRMRecord[] = [northwind, ava, zoe, rebuild, lead, followUp, call];

const filesOf = (list: CRMRecord[]): [string, string][] => [[WORKSPACE_PATH, serializeWorkspace(config)], ...list.map((r): [string, string] => [recordPath(r.type, r.id), serializeRecord(r)])];
const source: ExportSource = { repository: 'octo-dev/crm', branch: 'main', commitSha: 'c0ffee'.padEnd(40, '0'), config, records, files: filesOf(records) };

// ignoreBOM keeps the byte order mark at the start of each CSV file.
const utf8 = new TextDecoder('utf-8', { ignoreBOM: true });
const unzip = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([path, data]) => [path, utf8.decode(data)]));
const ofType = (type: RecordType, list: CRMRecord[] = records) => list.filter((r) => r.type === type).toSorted((a, b) => (a.id < b.id ? -1 : 1));
const SCHEMA_FILES = ['contact', 'company', 'opportunity', 'task', 'activity', 'workspace'].map((name) => `schemas/${name}.schema.json`);

// Rebuilds a record from its CSV row by the rules in spec 05 ("CSV rules").
const LISTS = new Set(['emails', 'phones', 'tags', 'contactIds']);
function fromRow(header: string[], row: string[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  header.forEach((column, i) => {
    const value = readValue(row[i]);
    if (column === 'relatedType') record.related = value === '' ? null : { type: value, id: readValue(row[i + 1]) };
    else if (column === 'customFields') {
      if (value !== '') record.customFields = JSON.parse(value);
    } else if (LISTS.has(column)) record[column] = readList(row[i]);
    else if (column === 'schemaVersion' || column === 'valueMinor') record[column] = value === '' ? null : Number(value);
    else if (!['relatedId', 'stageLabel', 'value'].includes(column)) record[column] = value === '' && column !== 'description' ? null : value;
  });
  return record;
}

describe('csvTables', () => {
  it('gives each record type a fixed header: the JSON fields in order, with related as two columns', () => {
    const tables = csvTables([], config.pipelineStages);
    expect(Object.fromEntries(RECORD_TYPES.map((type) => [type, readCsv(tables[type])]))).toEqual({
      contact: [['schemaVersion', 'type', 'id', 'name', 'emails', 'phones', 'companyId', 'tags', 'customFields', 'createdAt', 'updatedAt', 'archivedAt']],
      company: [['schemaVersion', 'type', 'id', 'name', 'website', 'tags', 'customFields', 'createdAt', 'updatedAt', 'archivedAt']],
      opportunity: [
        ['schemaVersion', 'type', 'id', 'title', 'stageId', 'companyId', 'contactIds', 'valueMinor', 'currency', 'expectedCloseDate', 'customFields', 'createdAt', 'updatedAt', 'archivedAt', 'stageLabel', 'value'],
      ],
      task: [['schemaVersion', 'type', 'id', 'title', 'description', 'dueDate', 'completedAt', 'relatedType', 'relatedId', 'createdAt', 'updatedAt', 'archivedAt']],
      activity: [['schemaVersion', 'type', 'id', 'kind', 'body', 'occurredAt', 'relatedType', 'relatedId', 'createdAt', 'updatedAt', 'archivedAt']],
    });
  });

  it('writes one row per record, archived records too, in ID order', () => {
    const tables = csvTables(records, config.pipelineStages);
    for (const type of RECORD_TYPES) {
      expect(readCsv(tables[type]).slice(1).map((row) => row[2]), type).toEqual(ofType(type).map((r) => r.id));
    }
  });

  it('flattens lists, links, and custom fields, and adds the stage label and the amount to opportunities', () => {
    const tables = csvTables(records, config.pipelineStages);
    const [header, ...rows] = readCsv(tables.contact);
    const row = Object.fromEntries(header.map((column, i) => [column, rows.find((r) => r[2] === ava.id)![i]]));
    expect(row).toMatchObject({ name: "'=Ava Bennett", emails: 'ava@northwind.example;ava.b@home.example', phones: "'+1 555 0100", companyId: northwind.id, customFields: '{"seats":3,"tier":"gold"}', archivedAt: '' });

    const [dealHeader, ...deals] = readCsv(tables.opportunity);
    const deal = Object.fromEntries(dealHeader.map((column, i) => [column, deals.find((r) => r[2] === rebuild.id)![i]]));
    expect(deal).toMatchObject({ stageId: 'proposal', stageLabel: 'Proposal', valueMinor: '1200000', value: '12000.00', companyId: northwind.id, contactIds: `${ava.id};${zoe.id}` });
    const empty = Object.fromEntries(dealHeader.map((column, i) => [column, deals.find((r) => r[2] === lead.id)![i]]));
    expect(empty).toMatchObject({ stageLabel: 'Lead', valueMinor: '', value: '', companyId: '', contactIds: '', customFields: '' });

    const [taskHeader, taskRow] = readCsv(tables.task);
    expect(Object.fromEntries(taskHeader.map((column, i) => [column, taskRow[i]]))).toMatchObject({ relatedType: 'opportunity', relatedId: rebuild.id, description: 'Line 1\r\nLine 2, with "quotes"' });
  });

  it('leaves the stage label empty for a stage that is not in the workspace file', () => {
    const lost = opportunity('Old deal', { stageId: 'removed' });
    const [header, row] = readCsv(csvTables([lost], config.pipelineStages).opportunity);
    expect(row[header.indexOf('stageLabel')]).toBe('');
  });

  it('reads back to the same records, so the IDs keep every link between the tables', () => {
    const tables = csvTables(records, config.pipelineStages);
    for (const type of RECORD_TYPES) {
      const [header, ...rows] = readCsv(tables[type]);
      expect(rows.map((row) => recordSchemas[type].parse(fromRow(header, row))), type).toEqual(ofType(type));
    }
  });
});

describe('exportProblem', () => {
  const issue = (path: string, code: FileIssue['code']): FileIssue => ({ path, code, message: 'A problem' });
  const bad = 'data/contacts/ab/ab000000-0000-4000-8000-000000000000.json';

  it('allows an export when every file can be read, even with a broken link', () => {
    expect(exportProblem([])).toBeNull();
    expect(exportProblem([issue(bad, 'broken-link')])).toBeNull();
  });

  it('blocks an export when a file cannot be read, and names the file', () => {
    expect(exportProblem([issue(bad, 'invalid-json'), issue('data/tasks/x.json', 'broken-link')])).toBe(`1 file cannot be read, so the export would not be complete: ${bad}`);
    expect(exportProblem([issue(bad, 'invalid-record'), issue('data/notes.txt', 'unrecognized-path'), issue(WORKSPACE_PATH, 'too-large')])).toBe(
      '3 files cannot be read, so the export would not be complete. Settings lists them under "Files that need attention".',
    );
  });
});

describe('exportFileName', () => {
  it('uses the workspace name in lowercase ASCII, and the UTC date', () => {
    // 9:30 PM on October 30 in New York is already October 31 in UTC.
    expect(exportFileName('Example Studio', 'snapshot', new Date('2026-10-31T01:30:00Z'))).toBe('gitcrm-example-studio-2026-10-31-snapshot.zip');
    expect(exportFileName('Zoë & Ålund — Café!', 'csv', exportedAt)).toBe('gitcrm-zoe-alund-cafe-2026-10-30-csv.zip');
  });

  it('cuts the name to 40 characters without a hyphen at the end, and has a name for one with no ASCII letter or digit', () => {
    expect(exportFileName(`${'a'.repeat(39)} b`, 'csv', exportedAt)).toBe(`gitcrm-${'a'.repeat(39)}-2026-10-30-csv.zip`);
    expect(exportFileName('日本の会社', 'csv', exportedAt)).toBe('gitcrm-workspace-2026-10-30-csv.zip');
  });
});

describe('buildExport', () => {
  it('the JSON snapshot holds every file at its path, with the same text, and the data dictionary and schemas', () => {
    // A hand-edited file keeps its own layout: the snapshot copies text, it does not rewrite it.
    const files: [string, string][] = filesOf(records).map(([path, text]) => [path, path === recordPath('activity', call.id) ? JSON.stringify(call) : text]);
    const { name, bytes } = buildExport('snapshot', { ...source, files }, exportedAt);
    expect(name).toBe('gitcrm-example-studio-2026-10-30-snapshot.zip');
    const zip = unzip(bytes);
    expect(Object.keys(zip).toSorted()).toEqual([...files.map(([path]) => path), 'DATA-DICTIONARY.md', ...SCHEMA_FILES].toSorted());
    for (const [path, text] of files) expect(zip[path], path).toBe(text);
    const parsed = files.filter(([path]) => path !== WORKSPACE_PATH).map(([path]) => parseRecordFile(path, zip[path]));
    expect(parsed.map((result) => result.ok && result.record)).toEqual(files.slice(1).map(([path]) => records.find((r) => recordPath(r.type, r.id) === path)));
    expect(parseWorkspaceFile(zip[WORKSPACE_PATH])).toEqual({ ok: true, config });
  });

  it('the CSV export holds one CSV per record type, and the data dictionary and schemas', () => {
    const { name, bytes } = buildExport('csv', source, exportedAt);
    expect(name).toBe('gitcrm-example-studio-2026-10-30-csv.zip');
    const zip = unzip(bytes);
    const csv = ['contacts', 'companies', 'opportunities', 'tasks', 'activities'].map((table) => `${table}.csv`);
    expect(Object.keys(zip).toSorted()).toEqual([...csv, 'DATA-DICTIONARY.md', ...SCHEMA_FILES].toSorted());
    expect(zip['contacts.csv']).toBe(csvTables(records, config.pipelineStages).contact);
    expect([...unzipSync(bytes)['contacts.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('exports 2,000 records', () => {
    const many = Array.from({ length: 2000 }, (_, i) => (i % 2 ? contact(`Contact ${i}`) : activity(`Note ${i}\n${'Long text. '.repeat(40)}`)));
    const snapshot = unzip(buildExport('snapshot', { ...source, records: many, files: filesOf(many) }, exportedAt).bytes);
    expect(Object.keys(snapshot).filter((path) => path.startsWith('data/'))).toHaveLength(2000);
    const csv = unzip(buildExport('csv', { ...source, records: many, files: filesOf(many) }, exportedAt).bytes);
    expect(readCsv(csv['contacts.csv'])).toHaveLength(1001);
    expect(readCsv(csv['activities.csv'])).toHaveLength(1001);
  });
});
