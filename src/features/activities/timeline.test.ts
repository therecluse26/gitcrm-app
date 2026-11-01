import { describe, expect, it } from 'vitest';
import { newRecord } from '@/core/records.ts';
import type { Activity } from '@/core/schemas.ts';
import { timeline } from './timeline.ts';

const now = new Date('2026-10-29T12:00:00Z');

function note(id: string, occurredAt: string): Activity {
  return { ...newRecord('activity', { kind: 'note', body: id, occurredAt, related: null }, { now, id: `${id}0000000-0000-4000-8000-000000000000` }) };
}

describe('timeline', () => {
  it('puts the latest activity first, and orders a tie by ID, whatever the input order', () => {
    const a = note('a', '2026-10-26T16:15:00Z');
    const b = note('b', '2026-10-26T16:15:00Z');
    const c = note('c', '2026-10-28T09:00:00Z');
    const d = note('d', '2026-10-01T09:00:00Z');
    const expected = ['c', 'a', 'b', 'd'];
    expect(timeline([a, b, c, d]).map((x) => x.body)).toEqual(expected);
    expect(timeline([d, c, b, a]).map((x) => x.body)).toEqual(expected);
  });
});
