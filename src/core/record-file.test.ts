import { describe, expect, it } from 'vitest';
import { recordPath } from './paths.ts';
import { MAX_FILE_BYTES, parseRecordFile, parseWorkspaceFile, serializeRecord, serializeWorkspace } from './record-file.ts';
import type { CustomField } from './custom-fields.ts';
import type { Contact, WorkspaceConfig } from './schemas.ts';

const contactId = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';
const companyId = 'a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf';
const contactPath = recordPath('contact', contactId);

const contact: Contact = {
  schemaVersion: 1,
  type: 'contact',
  id: contactId,
  name: 'Ava Bennett',
  emails: ['ava@example.test'],
  phones: [],
  companyId,
  tags: ['referral'],
  createdAt: '2026-10-26T16:00:00Z',
  updatedAt: '2026-10-26T16:00:00Z',
  archivedAt: null,
};

// The canonical form: JSON.stringify with 2-space indent, schema key order, newline at EOF.
const contactText = `{
  "schemaVersion": 1,
  "type": "contact",
  "id": "${contactId}",
  "name": "Ava Bennett",
  "emails": [
    "ava@example.test"
  ],
  "phones": [],
  "companyId": "${companyId}",
  "tags": [
    "referral"
  ],
  "createdAt": "2026-10-26T16:00:00Z",
  "updatedAt": "2026-10-26T16:00:00Z",
  "archivedAt": null
}
`;

const workspace: WorkspaceConfig = {
  schemaVersion: 1,
  workspaceId: 'f81d4fae-7dec-4c1d-ae0c-0d04ef1a7291',
  name: 'Example Studio',
  defaultCurrency: 'USD',
  pipelineStages: [
    { id: 'lead', label: 'Lead', position: 0 },
    { id: 'qualified', label: 'Qualified', position: 1 },
    { id: 'proposal', label: 'Proposal', position: 2 },
    { id: 'won', label: 'Won', position: 3 },
    { id: 'lost', label: 'Lost', position: 4 },
  ],
};

function issueOf(path: string, text: string) {
  const result = parseRecordFile(path, text);
  if (result.ok) throw new Error('expected an issue');
  return result.issue;
}

describe('serializeRecord', () => {
  it('writes canonical JSON', () => {
    expect(serializeRecord(contact)).toBe(contactText);
  });

  it('writes keys in schema order, whatever order the input has', () => {
    const shuffled = Object.fromEntries(Object.entries(contact).reverse()) as Contact;
    expect(serializeRecord(shuffled)).toBe(contactText);
  });

  it('sorts customFields keys and keeps their values', () => {
    const text = serializeRecord({ ...contact, customFields: { source: 'referral', linkedin: 'https://example.test/ava' } });
    expect(text).toContain('"customFields": {\n    "linkedin": "https://example.test/ava",\n    "source": "referral"\n  },\n  "createdAt"');
  });

  it('refuses to serialize an invalid record', () => {
    expect(() => serializeRecord({ ...contact, emails: ['not an email'] })).toThrow();
  });
});

describe('parseRecordFile', () => {
  it('re-parses a written record identically', () => {
    const result = parseRecordFile(contactPath, serializeRecord(contact));
    expect(result).toEqual({ ok: true, record: contact });
  });

  it('accepts hand-formatted JSON with the same content', () => {
    const result = parseRecordFile(contactPath, JSON.stringify(contact));
    expect(result).toEqual({ ok: true, record: contact });
  });

  it('parses every record type from the data model', () => {
    const records = [
      {
        schemaVersion: 1, type: 'company', id: companyId, name: 'Example Studio', website: 'https://example.test', tags: [],
        createdAt: '2026-10-26T16:00:00Z', updatedAt: '2026-10-26T16:00:00Z', archivedAt: null,
      },
      {
        schemaVersion: 1, type: 'opportunity', id: 'e8c756c7-f1b2-4c47-9d3d-26457c6b0979', title: 'Website rebuild', stageId: 'proposal',
        companyId, contactIds: [contactId], valueMinor: 250000, currency: 'USD', expectedCloseDate: '2026-11-30',
        createdAt: '2026-10-26T16:00:00Z', updatedAt: '2026-10-26T16:00:00Z', archivedAt: null,
      },
      {
        schemaVersion: 1, type: 'task', id: '9b8b4d79-75d6-450c-a492-1e0638d49cd8', title: 'Follow up on proposal', description: 'Ask about next steps',
        dueDate: '2026-11-02', completedAt: null, related: { type: 'opportunity', id: 'e8c756c7-f1b2-4c47-9d3d-26457c6b0979' },
        createdAt: '2026-10-26T16:00:00Z', updatedAt: '2026-10-26T16:00:00Z', archivedAt: null,
      },
      {
        schemaVersion: 1, type: 'activity', id: 'bf80abe2-aeda-4aec-8fc4-75f44e55d04b', kind: 'note', body: 'Discussed timeline and budget.',
        occurredAt: '2026-10-26T16:15:00Z', related: { type: 'contact', id: contactId },
        createdAt: '2026-10-26T16:16:00Z', updatedAt: '2026-10-26T16:16:00Z', archivedAt: null,
      },
    ] as const;
    for (const record of records) {
      const result = parseRecordFile(recordPath(record.type, record.id), JSON.stringify(record));
      expect(result, record.type).toEqual({ ok: true, record });
    }
  });

  it('reports invalid JSON', () => {
    expect(issueOf(contactPath, '{ "schemaVersion": 1,')).toMatchObject({ path: contactPath, code: 'invalid-json' });
  });

  it('reports a newer schema version separately from invalid records', () => {
    expect(issueOf(contactPath, JSON.stringify({ ...contact, schemaVersion: 2 }))).toMatchObject({ code: 'unsupported-version' });
  });

  it('reports unknown fields, invalid values, and missing fields', () => {
    for (const bad of [
      { ...contact, nickname: 'Ava' },
      { ...contact, emails: ['ava at example'] },
      { ...contact, name: '   ' },
      { ...contact, companyId: 'Example Studio' },
      { ...contact, createdAt: '2026-10-26T17:00:00+01:00' },
      { ...contact, archivedAt: undefined },
    ]) {
      expect(issueOf(contactPath, JSON.stringify(bad))).toMatchObject({ code: 'invalid-record' });
    }
  });

  it('allows only http and https websites', () => {
    const company = {
      schemaVersion: 1, type: 'company', id: companyId, name: 'Example Studio', website: 'javascript:alert(1)', tags: [],
      createdAt: '2026-10-26T16:00:00Z', updatedAt: '2026-10-26T16:00:00Z', archivedAt: null,
    };
    expect(issueOf(recordPath('company', companyId), JSON.stringify(company))).toMatchObject({ code: 'invalid-record' });
  });

  it('requires integer minor units and real calendar dates', () => {
    const id = 'e8c756c7-f1b2-4c47-9d3d-26457c6b0979';
    const opportunity = {
      schemaVersion: 1, type: 'opportunity', id, title: 'Website rebuild', stageId: 'proposal', companyId: null, contactIds: [],
      valueMinor: 2500, currency: 'USD', expectedCloseDate: null,
      createdAt: '2026-10-26T16:00:00Z', updatedAt: '2026-10-26T16:00:00Z', archivedAt: null,
    };
    const path = recordPath('opportunity', id);
    expect(parseRecordFile(path, JSON.stringify(opportunity)).ok).toBe(true);
    for (const bad of [{ valueMinor: 25.5 }, { valueMinor: -1 }, { expectedCloseDate: '2026-02-30' }, { currency: 'usd' }]) {
      expect(issueOf(path, JSON.stringify({ ...opportunity, ...bad })), JSON.stringify(bad)).toMatchObject({ code: 'invalid-record' });
    }
  });

  it('reports a record whose ID or type does not match its path', () => {
    const otherId = 'd2aa0f69-0a4c-4192-9009-9e36a51c42c0';
    expect(issueOf(recordPath('contact', otherId), contactText)).toMatchObject({ code: 'path-mismatch' });
    expect(issueOf(recordPath('company', contactId), contactText)).toMatchObject({ code: 'path-mismatch' });
  });

  it('reports a file outside the record layout', () => {
    expect(issueOf('data/contacts/d1/ava-bennett.json', contactText)).toMatchObject({ code: 'unrecognized-path' });
  });

  it('refuses files over the size cap before parsing them', () => {
    const big = JSON.stringify({ ...contact, name: 'x'.repeat(MAX_FILE_BYTES) });
    expect(issueOf(contactPath, big)).toMatchObject({ code: 'too-large' });
  });
});

describe('workspace file', () => {
  it('round-trips the example workspace', () => {
    expect(parseWorkspaceFile(serializeWorkspace(workspace))).toEqual({ ok: true, config: workspace });
  });

  it('requires exactly one won and one lost stage', () => {
    const noWon = { ...workspace, pipelineStages: workspace.pipelineStages.filter((s) => s.id !== 'won') };
    expect(parseWorkspaceFile(JSON.stringify(noWon))).toMatchObject({ ok: false, issue: { code: 'invalid-record' } });
  });

  it('rejects duplicate stage IDs and positions', () => {
    const [lead, ...rest] = workspace.pipelineStages;
    const duplicateId = { ...workspace, pipelineStages: [lead, { ...lead, position: 9 }, ...rest] };
    const duplicatePosition = { ...workspace, pipelineStages: [lead, { id: 'demo', label: 'Demo', position: 0 }, ...rest] };
    expect(parseWorkspaceFile(JSON.stringify(duplicateId)).ok).toBe(false);
    expect(parseWorkspaceFile(JSON.stringify(duplicatePosition)).ok).toBe(false);
  });

  it('reports a newer workspace version', () => {
    expect(parseWorkspaceFile(JSON.stringify({ ...workspace, schemaVersion: 3 }))).toMatchObject({ ok: false, issue: { code: 'unsupported-version' } });
  });

  it('reads version 2, but a record file stays at version 1', () => {
    expect(parseWorkspaceFile(serializeWorkspace({ ...workspace, schemaVersion: 2 }))).toMatchObject({ ok: true, config: { schemaVersion: 2 } });
    expect(issueOf(contactPath, JSON.stringify({ ...contact, schemaVersion: 2 })).code).toBe('unsupported-version');
  });
});

describe('workspace custom fields (spec 10)', () => {
  const source: CustomField = {
    id: 'source',
    label: 'Lead source',
    type: 'select',
    position: 1,
    archived: false,
    options: [{ id: 'referral', label: 'Referral', archived: false }],
  };
  const linkedin: CustomField = { id: 'linkedin', label: 'LinkedIn', type: 'url', position: 0, archived: false, options: [] };
  const withFields: WorkspaceConfig = { ...workspace, schemaVersion: 2, customFields: { contact: [linkedin, source], company: [], opportunity: [] } };

  it('round-trips the definitions, after the stages', () => {
    const text = serializeWorkspace(withFields);
    expect(parseWorkspaceFile(text)).toEqual({ ok: true, config: withFields });
    expect(Object.keys(JSON.parse(text))).toEqual(['schemaVersion', 'workspaceId', 'name', 'defaultCurrency', 'pipelineStages', 'customFields']);
  });

  it('needs schemaVersion 2, so a version 1 app refuses the file as newer', () => {
    expect(parseWorkspaceFile(JSON.stringify({ ...withFields, schemaVersion: 1 }))).toMatchObject({ ok: false, issue: { code: 'invalid-record' } });
  });

  it('gives options only to a choice list, and rejects unknown types', () => {
    const textWithOptions = { ...linkedin, type: 'text', options: source.options };
    const bad = (contact: object[]) => parseWorkspaceFile(JSON.stringify({ ...withFields, customFields: { ...withFields.customFields, contact } })).ok;
    expect(bad([textWithOptions])).toBe(false);
    expect(bad([{ ...linkedin, type: 'email' }])).toBe(false);
    expect(bad([source, { ...source, position: 0 }])).toBe(false); // the same ID twice
    expect(bad([linkedin, { ...source, position: 0 }])).toBe(false); // the same position twice
    expect(bad([{ ...source, options: [...source.options, ...source.options] }])).toBe(false);
  });
});
