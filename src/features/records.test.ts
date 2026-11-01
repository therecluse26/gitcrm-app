import { describe, expect, it } from 'vitest';
import { recordPath } from '@/core/paths.ts';
import { serializeRecord } from '@/core/record-file.ts';
import { newRecord } from '@/core/records.ts';
import type { CRMRecord } from '@/core/schemas.ts';
import { snapshotFromFiles } from '@/storage/snapshot.ts';
import { recordsOf } from './records.ts';
import { relatableOf } from './use-relatable.ts';

const now = new Date('2026-10-29T12:00:00Z');
const ava = newRecord('contact', { name: 'Ava Bennett', emails: [], phones: [], companyId: null, tags: [] }, { now });
const acme = newRecord('company', { name: 'Acme Corp', website: null, tags: [] }, { now });
const gone = '5c1f5f8e-9a3b-4f6e-8d2c-0b7a1e4d3c21';

const snapshotOf = (commitSha: string, records: CRMRecord[]) =>
  snapshotFromFiles({ commitSha, files: new Map(records.map((r) => [recordPath(r.type, r.id), { blobSha: `${commitSha}-${r.id}`, text: serializeRecord(r), isTruncated: false }])) });

// docs/06: a list of 500 tasks drew each row's links from lists that every row built again.
describe('recordsOf', () => {
  it('gives every caller the same list for one snapshot', () => {
    const snapshot = snapshotOf('c1', [ava, acme]);
    expect(recordsOf(snapshot, 'contact').map((v) => v.record)).toEqual([ava]);
    expect(recordsOf(snapshot, 'contact')).toBe(recordsOf(snapshot, 'contact'));
    expect(recordsOf(null, 'task')).toEqual([]);
  });

  it('gives a new list for the next snapshot, such as after a save', () => {
    const before = snapshotOf('c1', [ava]);
    const list = recordsOf(before, 'contact');
    const after = snapshotOf('c2', [{ ...ava, name: 'Ava Carter' }]);
    expect(recordsOf(after, 'contact')).not.toBe(list);
    expect(recordsOf(after, 'contact').map((v) => v.record.name)).toEqual(['Ava Carter']);
  });
});

describe('relatableOf', () => {
  it('finds and names a linked record, and names a missing one', () => {
    const { find, name, ids } = relatableOf(snapshotOf('c1', [ava, acme]));
    expect(find({ type: 'company', id: acme.id })).toEqual(acme);
    expect(find({ type: 'contact', id: acme.id })).toBeUndefined();
    expect(name({ type: 'contact', id: ava.id })).toBe('Ava Bennett');
    expect(name({ type: 'contact', id: gone })).toBe('Missing contact (ID 5c1f5f8e)');
    expect(name(null)).toBe('None');
    expect([...ids.contact]).toEqual([ava.id]);
  });

  it('builds the lookup once per snapshot, and again for the next one', () => {
    const before = snapshotOf('c1', [ava]);
    expect(relatableOf(before)).toBe(relatableOf(before));
    const after = snapshotOf('c2', [{ ...ava, name: 'Ava Carter' }]);
    expect(relatableOf(after).name({ type: 'contact', id: ava.id })).toBe('Ava Carter');
  });
});
