// The opportunity form (spec 03): form values to opportunity fields, with an error for each bad field.
// Custom fields (spec 10) come after the built-in fields.
import { formValues, readCustomValues, type CustomField, type FormValue } from '@/core/custom-fields.ts';
import { isCurrency, minorToInput, parseMoney } from '@/core/money.ts';
import { opportunitySchema, type Opportunity } from '@/core/schemas.ts';
import type { FieldErrors, FormResult } from '../record-form.ts';

export type OpportunityFields = Pick<Opportunity, 'title' | 'stageId' | 'valueMinor' | 'currency' | 'expectedCloseDate' | 'companyId' | 'contactIds' | 'customFields'>;
export type OpportunityFormValues = {
  title: string;
  stageId: string;
  value: string;
  currency: string;
  expectedCloseDate: string; // YYYY-MM-DD from a date input, or ''
  companyId: string;
  contactIds: string[];
  custom: Record<string, FormValue>;
};

export function opportunityFields({ title, stageId, valueMinor, currency, expectedCloseDate, companyId, contactIds, customFields }: Opportunity): OpportunityFields {
  return { title, stageId, valueMinor, currency, expectedCloseDate, companyId, contactIds, customFields };
}

// `defaults` gives a new opportunity its stage and currency. `custom` holds the custom fields the form shows.
export function opportunityValues(fields: OpportunityFields | null, defaults: { stageId: string; currency: string }, custom: CustomField[] = []): OpportunityFormValues {
  if (!fields) return { title: '', stageId: defaults.stageId, value: '', currency: defaults.currency, expectedCloseDate: '', companyId: '', contactIds: [], custom: formValues(custom, undefined) };
  return {
    title: fields.title,
    stageId: fields.stageId,
    value: fields.valueMinor === null ? '' : minorToInput(fields.valueMinor, fields.currency),
    currency: fields.currency,
    expectedCloseDate: fields.expectedCloseDate ?? '',
    companyId: fields.companyId ?? '',
    contactIds: fields.contactIds,
    custom: formValues(custom, fields.customFields),
  };
}

// `stages`, `companies`, and `contacts` hold the IDs an opportunity may link to. Its current stage
// and links may stay, even when they are missing, so that an unrelated edit still saves.
export function readOpportunityForm(
  values: OpportunityFormValues,
  {
    stages,
    companies,
    contacts,
    current,
    custom = [],
  }: { stages: ReadonlySet<string>; companies: ReadonlySet<string>; contacts: ReadonlySet<string>; current: OpportunityFields | null; custom?: CustomField[] },
): FormResult<OpportunityFields> {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  if (!opportunitySchema.shape.title.safeParse(title).success) errors.title = 'Enter a title.';
  if (!stages.has(values.stageId) && values.stageId !== current?.stageId) errors.stageId = 'Choose a stage from the list.';

  const currency = values.currency.trim().toUpperCase();
  const knownCurrency = isCurrency(currency) || currency === current?.currency;
  if (!knownCurrency) errors.currency = 'Enter a currency code, such as USD.';
  const money = knownCurrency ? parseMoney(values.value, currency) : null;
  if (money && !money.ok) errors.value = money.error;

  const expectedCloseDate = values.expectedCloseDate || null;
  if (expectedCloseDate && !opportunitySchema.shape.expectedCloseDate.safeParse(expectedCloseDate).success) {
    errors.expectedCloseDate = 'Enter a real date, such as 2026-11-30.';
  }
  const companyId = values.companyId || null;
  if (companyId && companyId !== current?.companyId && !companies.has(companyId)) errors.companyId = 'Choose a company from the list.';
  const missing = values.contactIds.filter((id) => !contacts.has(id) && !current?.contactIds.includes(id));
  if (missing.length > 0) {
    errors.contactIds =
      missing.length === 1 ? 'A chosen contact is no longer in the workspace. Remove it, then save.' : `${missing.length} chosen contacts are no longer in the workspace. Remove them, then save.`;
  }

  const customFields = readCustomValues(custom, values.custom, current?.customFields);
  if (!customFields.ok) Object.assign(errors, customFields.errors);

  if (Object.keys(errors).length > 0 || !money?.ok || !customFields.ok) return { ok: false, errors };
  return {
    ok: true,
    fields: { title, stageId: values.stageId, valueMinor: money.minor, currency, expectedCloseDate, companyId, contactIds: [...new Set(values.contactIds)], customFields: customFields.customFields },
  };
}
