import { describe, expect, it } from 'vitest';
import { opportunityValues, readOpportunityForm, type OpportunityFields, type OpportunityFormValues } from './opportunity-form.ts';

const companyId = 'a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf';
const contactId = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';
const missingId = '0b5e7c3a-1d2f-4e6a-8b9c-0d1e2f3a4b5c';
const links = { stages: new Set(['lead', 'proposal', 'won', 'lost']), companies: new Set([companyId]), contacts: new Set([contactId]), current: null };
const defaults = { stageId: 'lead', currency: 'USD' };

function form(changes: Partial<OpportunityFormValues> = {}): OpportunityFormValues {
  return { ...opportunityValues(null, defaults), title: 'Website rebuild', ...changes };
}

const saved: OpportunityFields = {
  title: 'Website rebuild',
  stageId: 'negotiation', // a stage someone removed
  valueMinor: 250000,
  currency: 'USD',
  expectedCloseDate: '2026-11-30',
  companyId: missingId,
  contactIds: [missingId],
};

describe('opportunityValues', () => {
  it('starts a new opportunity in the given stage and currency', () => {
    expect(opportunityValues(null, defaults)).toEqual({ title: '', stageId: 'lead', value: '', currency: 'USD', expectedCloseDate: '', companyId: '', contactIds: [], custom: {} });
  });

  it('shows a saved amount with all its decimal places', () => {
    expect(opportunityValues(saved, defaults)).toMatchObject({ value: '2500.00', expectedCloseDate: '2026-11-30', companyId: missingId });
  });
});

describe('readOpportunityForm', () => {
  it('reads "Website rebuild" in Proposal for $2500.00 (spec 03)', () => {
    const result = readOpportunityForm(form({ stageId: 'proposal', value: '2,500.00', currency: 'usd', companyId, contactIds: [contactId, contactId] }), links);
    expect(result).toEqual({
      ok: true,
      fields: { title: 'Website rebuild', stageId: 'proposal', valueMinor: 250000, currency: 'USD', expectedCloseDate: null, companyId, contactIds: [contactId] },
    });
  });

  it('gives each bad field its own error', () => {
    const result = readOpportunityForm(form({ title: ' ', stageId: 'negotiation', value: '-1', expectedCloseDate: '2026-02-30', companyId: missingId }), links);
    expect(result).toEqual({
      ok: false,
      errors: {
        title: 'Enter a title.',
        stageId: 'Choose a stage from the list.',
        value: 'Enter an amount of 0 or more.',
        expectedCloseDate: 'Enter a real date, such as 2026-11-30.',
        companyId: 'Choose a company from the list.',
      },
    });
  });

  it('refuses a chosen contact that is not in the workspace (spec 03, "Missing relation")', () => {
    expect(readOpportunityForm(form({ contactIds: [contactId, missingId] }), links)).toEqual({
      ok: false,
      errors: { contactIds: 'A chosen contact is no longer in the workspace. Remove it, then save.' },
    });
  });

  it('checks the amount against the currency, and skips it while the currency is bad', () => {
    expect(readOpportunityForm(form({ value: '2500.5', currency: 'JPY' }), links)).toEqual({ ok: false, errors: { value: 'JPY amounts have no decimal places.' } });
    expect(readOpportunityForm(form({ value: '2500.5', currency: 'XX' }), links)).toEqual({ ok: false, errors: { currency: 'Enter a currency code, such as USD.' } });
  });

  it('keeps the current stage and links, even when they are missing, so another edit still saves', () => {
    const result = readOpportunityForm({ ...opportunityValues(saved, defaults), title: 'Website rebuild, phase 2' }, { ...links, current: saved });
    expect(result).toEqual({ ok: true, fields: { ...saved, title: 'Website rebuild, phase 2' } });
  });

  it('reads back the values it made from saved fields', () => {
    const fields = { ...saved, stageId: 'lead', companyId, contactIds: [contactId] };
    expect(readOpportunityForm(opportunityValues(fields, defaults), links)).toEqual({ ok: true, fields });
  });
});
