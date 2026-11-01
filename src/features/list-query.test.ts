import { describe, expect, it } from 'vitest';
import { listRecords, type ListView } from './list-query.ts';

type Row = { id: string; name: string; tags: string[]; updatedAt: string; archivedAt: string | null };

const rows: Row[] = [
  { id: '1', name: 'Zoë Ålund', tags: ['vip'], updatedAt: '2026-10-05T00:00:00Z', archivedAt: null },
  { id: '2', name: 'ava Bennett', tags: ['referral'], updatedAt: '2026-10-03T00:00:00Z', archivedAt: null },
  { id: '3', name: 'Ben Carter', tags: [], updatedAt: '2026-10-02T00:00:00Z', archivedAt: '2026-10-04T00:00:00Z' },
];
const text = (row: Row) => [row.name, ...row.tags];
const view = (changes: Partial<ListView> = {}): ListView => ({ query: '', showArchived: false, sort: 'name', page: 0, ...changes });
const names = (result: { shown: Row[] }) => result.shown.map((row) => row.name);

describe('listRecords', () => {
  it('hides archived records and counts them', () => {
    const result = listRecords(rows, view(), text);
    expect(names(result)).toEqual(['ava Bennett', 'Zoë Ålund']);
    expect(result.hiddenArchived).toBe(1);
  });

  it('shows archived records when asked', () => {
    expect(names(listRecords(rows, view({ showArchived: true }), text))).toEqual(['ava Bennett', 'Ben Carter', 'Zoë Ålund']);
  });

  it('matches every word of the query, ignoring case and accents', () => {
    expect(names(listRecords(rows, view({ query: 'ZOE alu' }), text))).toEqual(['Zoë Ålund']);
    expect(names(listRecords(rows, view({ query: 'referral' }), text))).toEqual(['ava Bennett']);
  });

  it('counts only hidden archived records that match the query', () => {
    expect(listRecords(rows, view({ query: 'ava' }), text).hiddenArchived).toBe(0);
    expect(listRecords(rows, view({ query: 'ben' }), text).hiddenArchived).toBe(1);
  });

  it('sorts by most recently updated', () => {
    expect(names(listRecords(rows, view({ sort: 'updated', showArchived: true }), text))).toEqual(['Zoë Ålund', 'ava Bennett', 'Ben Carter']);
  });
});
