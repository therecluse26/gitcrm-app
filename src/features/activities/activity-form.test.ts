import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelatedIds } from '../related.ts';
import { activityValues, readActivityForm, type ActivityFields, type ActivityFormValues } from './activity-form.ts';

const ava = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';
const ids: RelatedIds = { contact: new Set([ava]), company: new Set(), opportunity: new Set() };
const defaults = { occurredAt: '2026-10-26T12:15', related: `contact:${ava}` };
const values = (changes: Partial<ActivityFormValues> = {}): ActivityFormValues => ({ ...activityValues(null, defaults), body: 'Discussed timeline and budget.', ...changes });

beforeEach(() => void vi.stubEnv('TZ', 'America/New_York'));
afterEach(() => void vi.unstubAllEnvs());

describe('readActivityForm', () => {
  it('reads a note about a contact, with the local time stored in UTC', () => {
    expect(readActivityForm(values(), { ids, current: null })).toEqual({
      ok: true,
      fields: { kind: 'note', body: 'Discussed timeline and budget.', occurredAt: '2026-10-26T16:15:00Z', related: { type: 'contact', id: ava } },
    });
  });

  it('keeps the text of the body as typed, apart from blank lines at the ends', () => {
    const body = '<script>alert(1)</script>\n  indented line';
    const result = readActivityForm(values({ body: `\n${body}\n\n` }), { ids, current: null });
    expect(result.ok && result.fields.body).toBe(body);
  });

  it('gives an error for each bad field', () => {
    expect(readActivityForm(values({ kind: 'sms', body: '  ', occurredAt: '2026-02-30T10:00' }), { ids, current: null })).toEqual({
      ok: false,
      errors: { kind: 'Choose a kind from the list.', body: 'Enter what happened.', occurredAt: 'Enter a real date and time.' },
    });
  });

  it('round-trips the fields of a saved activity, seconds included', () => {
    const fields: ActivityFields = { kind: 'call', body: 'Called about the quote.', occurredAt: '2026-10-26T16:15:30Z', related: null };
    expect(readActivityForm(activityValues(fields, defaults), { ids, current: fields })).toEqual({ ok: true, fields });
  });
});
