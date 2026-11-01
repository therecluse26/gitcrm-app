import { describe, expect, it } from 'vitest';
import { editRecord, isoTimestamp, newRecord } from './records.ts';

const created = new Date('2026-10-26T16:00:00.250Z');
const later = new Date('2026-10-27T09:30:00Z');
const id = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';

const ava = newRecord('contact', { name: 'Ava Bennett', emails: ['ava@example.test'], phones: [], companyId: null, tags: [] }, { now: created, id });

describe('isoTimestamp', () => {
  it('writes UTC with second precision', () => {
    expect(isoTimestamp(created)).toBe('2026-10-26T16:00:00Z');
  });
});

describe('newRecord', () => {
  it('fills the common fields', () => {
    expect(ava).toEqual({
      schemaVersion: 1,
      type: 'contact',
      id,
      name: 'Ava Bennett',
      emails: ['ava@example.test'],
      phones: [],
      companyId: null,
      tags: [],
      createdAt: '2026-10-26T16:00:00Z',
      updatedAt: '2026-10-26T16:00:00Z',
      archivedAt: null,
    });
  });

  it('creates a random UUID v4 by default', () => {
    const record = newRecord('company', { name: 'Example Studio', website: null, tags: [] }, { now: created });
    expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('refuses invalid fields', () => {
    expect(() => newRecord('contact', { name: '', emails: [], phones: [], companyId: null, tags: [] }, { now: created })).toThrow();
  });
});

describe('editRecord', () => {
  it('applies changes and sets updatedAt', () => {
    const edited = editRecord(ava, { emails: ['ava@studio.test'] }, later);
    expect(edited).toEqual({ ...ava, emails: ['ava@studio.test'], updatedAt: '2026-10-27T09:30:00Z' });
  });

  it('returns the same record when nothing changes, so no commit follows', () => {
    expect(editRecord(ava, { name: 'Ava Bennett', emails: ['ava@example.test'] }, later)).toBe(ava);
  });

  it('keeps customFields it does not know about', () => {
    const withCustom = { ...ava, customFields: { linkedin: 'https://example.test/ava' } };
    expect(editRecord(withCustom, { name: 'Ava B.' }, later).customFields).toEqual({ linkedin: 'https://example.test/ava' });
  });

  it('refuses an edit that makes the record invalid', () => {
    expect(() => editRecord(ava, { emails: ['nope'] }, later)).toThrow();
  });
});
