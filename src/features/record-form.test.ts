import { describe, expect, it } from 'vitest';
import { changedKeys, cleanList, conflictRows, rebaseFields, splitTags } from './record-form.ts';

describe('splitTags', () => {
  it('splits on commas, trims, and drops empty and repeated tags', () => {
    expect(splitTags(' referral, VIP,, vip ,partner ')).toEqual(['referral', 'VIP', 'partner']);
  });

  it('returns no tags for blank text', () => {
    expect(splitTags('  ')).toEqual([]);
  });
});

describe('cleanList', () => {
  it('trims each value and drops empty rows', () => {
    expect(cleanList([' ava@example.test ', '', '  '])).toEqual(['ava@example.test']);
  });
});

const base = { name: 'Ava Bennett', emails: ['ava@example.test'], phones: [] as string[] };

describe('changedKeys', () => {
  it('returns only the fields that differ, comparing lists by value', () => {
    expect(changedKeys({ ...base, emails: ['ava@example.test'], phones: ['555-0100'] }, base)).toEqual(['phones']);
  });
});

describe('custom fields (spec 10): each one is its own field', () => {
  const start = { name: 'Ava Bennett', customFields: { linkedin: 'https://linkedin.com/in/ava', source: 'conference' } as Record<string, string> | undefined };
  const mine = { ...start, customFields: { ...start.customFields, linkedin: 'https://linkedin.com/in/ava-b' } };
  const remote = { ...start, customFields: { ...start.customFields, source: 'referral' } };

  it('compares each custom field, and an empty object is the same as none', () => {
    expect(changedKeys(remote, start)).toEqual(['customFields.source']);
    expect(changedKeys({ name: 'A', customFields: undefined }, { name: 'A', customFields: {} })).toEqual([]);
  });

  it("keeps the remote's change to another custom field on a retry", () => {
    expect(rebaseFields(mine, start, remote)).toEqual({ name: 'Ava Bennett', customFields: { linkedin: 'https://linkedin.com/in/ava-b', source: 'referral' } });
  });

  it('removes a value I cleared, and leaves out an empty object', () => {
    const renamed = { ...start, name: 'Ava B.' };
    expect(rebaseFields({ ...start, customFields: { linkedin: 'https://linkedin.com/in/ava' } }, start, renamed)).toEqual({ name: 'Ava B.', customFields: { linkedin: 'https://linkedin.com/in/ava' } });
    expect(rebaseFields({ ...start, customFields: undefined }, start, renamed)).toEqual({ name: 'Ava B.', customFields: undefined });
  });

  it('lists one row for each custom field that I or the remote changed', () => {
    expect(conflictRows(mine, start, remote)).toEqual([
      { key: 'customFields', customId: 'linkedin', mine: 'https://linkedin.com/in/ava-b', remote: 'https://linkedin.com/in/ava', changedByMe: true, changedRemotely: false },
      { key: 'customFields', customId: 'source', mine: 'conference', remote: 'referral', changedByMe: false, changedRemotely: true },
    ]);
  });
});

describe('rebaseFields', () => {
  it("puts my changes on top of the remote version and keeps the remote's other changes", () => {
    const mine = { ...base, phones: ['555-0100'] };
    const remote = { ...base, emails: ['ava@studio.test'] };
    expect(rebaseFields(mine, base, remote)).toEqual({ name: 'Ava Bennett', emails: ['ava@studio.test'], phones: ['555-0100'] });
  });

  it('keeps a group of fields from one side, so my amount never meets their currency', () => {
    const start = { title: 'Website rebuild', valueMinor: 250000, currency: 'USD' };
    const mine = { ...start, valueMinor: 300000 };
    const remote = { ...start, title: 'Site rebuild', currency: 'JPY' };
    expect(rebaseFields(mine, start, remote, [['valueMinor', 'currency']])).toEqual({ title: 'Site rebuild', valueMinor: 300000, currency: 'USD' });
    expect(rebaseFields(start, start, remote, [['valueMinor', 'currency']])).toEqual(remote);
  });
});

describe('conflictRows', () => {
  it('lists each field that I or the remote changed', () => {
    const mine = { ...base, name: 'Ava B.', phones: ['555-0100'] };
    const remote = { ...base, name: 'Ava Bennett-Park', emails: ['ava@studio.test'] };
    expect(conflictRows(mine, base, remote)).toEqual([
      { key: 'name', mine: 'Ava B.', remote: 'Ava Bennett-Park', changedByMe: true, changedRemotely: true },
      { key: 'emails', mine: ['ava@example.test'], remote: ['ava@studio.test'], changedByMe: false, changedRemotely: true },
      { key: 'phones', mine: ['555-0100'], remote: [], changedByMe: true, changedRemotely: false },
    ]);
  });

  it('marks every field of a group as mine when I changed one of them', () => {
    const start = { valueMinor: 250000, currency: 'USD' };
    expect(conflictRows({ ...start, valueMinor: 300000 }, start, { ...start, currency: 'JPY' }, [['valueMinor', 'currency']])).toEqual([
      { key: 'valueMinor', mine: 300000, remote: 250000, changedByMe: true, changedRemotely: false },
      { key: 'currency', mine: 'USD', remote: 'JPY', changedByMe: true, changedRemotely: true },
    ]);
  });
});
