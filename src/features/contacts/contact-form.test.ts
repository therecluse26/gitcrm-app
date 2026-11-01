import { describe, expect, it } from 'vitest';
import type { CustomField } from '@/core/custom-fields.ts';
import { newRecord } from '@/core/records.ts';
import { contactValues, duplicateEmails, readContactForm, type ContactFormValues } from './contact-form.ts';

const now = new Date('2026-10-29T12:00:00Z');
const companyId = 'a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf';
const otherId = '0b5e7c3a-1d2f-4e6a-8b9c-0d1e2f3a4b5c';
const companies = new Set([companyId]);
const employees: CustomField = { id: 'employees', label: 'Employees', type: 'number', position: 0, archived: false, options: [] };
const vip: CustomField = { id: 'vip', label: 'VIP', type: 'checkbox', position: 1, archived: false, options: [] };

const filled: ContactFormValues = { name: ' Ava Bennett ', emails: ['ava@example.test', ''], phones: [' 555-0100 '], companyId, tags: 'referral, vip', custom: {} };

describe('contactValues', () => {
  it('starts a new contact with one empty email row and one empty phone row', () => {
    expect(contactValues(null)).toEqual({ name: '', emails: [''], phones: [''], companyId: '', tags: '', custom: {} });
  });

  it('reads a saved contact back into the form', () => {
    const fields = { name: 'Ava Bennett', emails: ['ava@example.test'], phones: [], companyId, tags: ['referral', 'vip'] };
    expect(contactValues(fields)).toEqual({ name: 'Ava Bennett', emails: ['ava@example.test'], phones: [''], companyId, tags: 'referral, vip', custom: {} });
  });

  it('shows each custom field that the form shows (spec 10)', () => {
    const fields = { name: 'Ava Bennett', emails: [], phones: [], companyId: null, tags: [], customFields: { employees: 12, gone: 'x' } };
    expect(contactValues(fields, [employees, vip]).custom).toEqual({ employees: '12', vip: false });
  });
});

describe('readContactForm', () => {
  it('turns valid values into contact fields', () => {
    expect(readContactForm(filled, { companies, currentCompanyId: null })).toEqual({
      ok: true,
      fields: { name: 'Ava Bennett', emails: ['ava@example.test'], phones: ['555-0100'], companyId, tags: ['referral', 'vip'], customFields: undefined },
    });
  });

  it('reads custom fields, keeps the other stored values, and reports a refused value (spec 10)', () => {
    const stored = { employees: 12, gone: 'x' };
    const read = (custom: ContactFormValues['custom']) => readContactForm({ ...filled, custom }, { companies, currentCompanyId: null, custom: [employees, vip], stored });
    expect(read({ employees: '12', vip: true })).toMatchObject({ ok: true, fields: { customFields: { employees: 12, gone: 'x', vip: true } } });
    expect(read({ employees: '1,200', vip: false })).toEqual({
      ok: false,
      errors: { 'custom.employees': 'Enter a number with a period for decimals, such as 1200 or 3.5.' },
    });
  });

  it('stores no company when none is chosen', () => {
    const result = readContactForm({ ...filled, companyId: '' }, { companies, currentCompanyId: null });
    expect(result.ok && result.fields.companyId).toBeNull();
  });

  it('requires a name', () => {
    expect(readContactForm({ ...filled, name: '   ' }, { companies, currentCompanyId: null })).toEqual({ ok: false, errors: { name: 'Enter a name.' } });
  });

  it('marks a malformed email on its own row', () => {
    const result = readContactForm({ ...filled, emails: ['', 'ava@'] }, { companies, currentCompanyId: null });
    expect(result).toEqual({ ok: false, errors: { 'emails.1': 'Enter a valid email address, such as ava@example.com.' } });
  });

  it('refuses a company that is not in the workspace', () => {
    const result = readContactForm({ ...filled, companyId: otherId }, { companies, currentCompanyId: null });
    expect(result).toEqual({ ok: false, errors: { companyId: 'Choose a company from the list.' } });
  });

  it("keeps the contact's current company link, even if that company is missing", () => {
    const result = readContactForm({ ...filled, companyId: otherId }, { companies, currentCompanyId: otherId });
    expect(result.ok).toBe(true);
  });
});

describe('duplicateEmails', () => {
  const ava = newRecord('contact', { name: 'Ava Bennett', emails: ['Ava@Example.test'], phones: [], companyId: null, tags: [] }, { now });

  it('finds another contact with the same email, ignoring case', () => {
    expect(duplicateEmails(['ava@example.TEST', 'new@example.test'], [ava], null)).toEqual([{ email: 'ava@example.TEST', contact: ava }]);
  });

  it('ignores the contact being edited', () => {
    expect(duplicateEmails(['ava@example.test'], [ava], ava.id)).toEqual([]);
  });
});
