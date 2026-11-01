// Typed custom fields (ADR-020, spec 10). The definitions live in .gitcrm/workspace.json, and the
// values in each record's `customFields`, by field ID. Each edit returns the fields in order:
// active fields by position, then removed ones, with positions 0, 1, 2, and so on.
import { WORKSPACE_PATH } from './paths.ts';
import type { FileIssue } from './record-file.ts';
import { CUSTOM_RECORD_TYPES, isCalendarDate, isWebsite, withScheme, type CRMRecord, type WorkspaceConfig } from './schemas.ts';
import { idFor } from './stages.ts';

export type CustomFieldSets = NonNullable<WorkspaceConfig['customFields']>;
export type CustomRecordType = keyof CustomFieldSets;
export type CustomField = CustomFieldSets[CustomRecordType][number];
export type CustomOption = CustomField['options'][number];
export type CustomFieldType = CustomField['type'];
export type CustomValue = string | number | boolean | null;
export type StoredValues = Record<string, CustomValue> | undefined;
// A checkbox is a boolean in the form; every other type is the text of its input.
export type FormValue = string | boolean;

export const TYPE_LABELS: Record<CustomFieldType, string> = { text: 'Text', number: 'Number', date: 'Date', checkbox: 'Checkbox', url: 'Web address', select: 'Choice list' };
export const NO_FIELDS: CustomFieldSets = { contact: [], company: [], opportunity: [] };

const renumber = (fields: CustomField[]) => fields.map((field, position) => ({ ...field, position }));

export function sortFields(fields: CustomField[]): CustomField[] {
  const byPosition = fields.toSorted((a, b) => a.position - b.position);
  return renumber([...byPosition.filter((f) => !f.archived), ...byPosition.filter((f) => f.archived)]);
}

export const activeFields = (fields: CustomField[]) => sortFields(fields).filter((f) => !f.archived);

export function fieldSets(config: Pick<WorkspaceConfig, 'customFields'> | null | undefined): CustomFieldSets {
  const sets = config?.customFields ?? NO_FIELDS;
  return { contact: sortFields(sets.contact), company: sortFields(sets.company), opportunity: sortFields(sets.opportunity) };
}

// After the last active field.
function insertActive(fields: CustomField[], field: CustomField): CustomField[] {
  const at = fields.findIndex((f) => f.archived);
  return renumber(fields.toSpliced(at === -1 ? fields.length : at, 0, field));
}

// The ID comes from the first name. A removed field keeps its ID, so a new one never reuses it.
export function addField(fields: CustomField[], label: string, type: CustomFieldType): CustomField[] {
  const sorted = sortFields(fields);
  const id = idFor(label, new Set(sorted.map((f) => f.id)), 'field');
  return insertActive(sorted, { id, label: label.trim(), type, position: 0, archived: false, options: [] });
}

const update = (fields: CustomField[], id: string, change: (field: CustomField) => CustomField) => sortFields(fields.map((f) => (f.id === id ? change(f) : f)));

export const renameField = (fields: CustomField[], id: string, label: string) => update(fields, id, (f) => ({ ...f, label }));

// Active fields come first, so a move swaps with the next active field and never passes a removed one.
export function moveField(fields: CustomField[], id: string, offset: -1 | 1): CustomField[] {
  const sorted = sortFields(fields);
  const from = sorted.findIndex((f) => f.id === id);
  const to = from + offset;
  if (from === -1 || sorted[from].archived || to < 0 || to >= sorted.length || sorted[to].archived) return sorted;
  return renumber(sorted.with(from, sorted[to]).with(to, sorted[from]));
}

export const removeField = (fields: CustomField[], id: string) => update(fields, id, (f) => ({ ...f, archived: true }));

export function restoreField(fields: CustomField[], id: string): CustomField[] {
  const sorted = sortFields(fields);
  const field = sorted.find((f) => f.id === id);
  return field ? insertActive(sorted.filter((f) => f.id !== id), { ...field, archived: false }) : sorted;
}

const updateOptions = (fields: CustomField[], fieldId: string, change: (options: CustomOption[]) => CustomOption[]) =>
  update(fields, fieldId, (f) => ({ ...f, options: change(f.options) }));

export const addOption = (fields: CustomField[], fieldId: string, label: string) =>
  updateOptions(fields, fieldId, (options) => [...options, { id: idFor(label, new Set(options.map((o) => o.id)), 'option'), label: label.trim(), archived: false }]);

const updateOption = (fields: CustomField[], fieldId: string, optionId: string, change: Partial<CustomOption>) =>
  updateOptions(fields, fieldId, (options) => options.map((o) => (o.id === optionId ? { ...o, ...change } : o)));

export const renameOption = (fields: CustomField[], fieldId: string, optionId: string, label: string) => updateOption(fields, fieldId, optionId, { label });
export const removeOption = (fields: CustomField[], fieldId: string, optionId: string) => updateOption(fields, fieldId, optionId, { archived: true });
export const restoreOption = (fields: CustomField[], fieldId: string, optionId: string) => updateOption(fields, fieldId, optionId, { archived: false });

// Errors by `${type}.${fieldId}` and `${type}.${fieldId}.${optionId}`: a blank name, or a name
// that another field of the type, or another option of the field, has too. Removed ones count.
export function nameErrors(sets: CustomFieldSets): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = <T extends { id: string; label: string }>(items: T[], key: (item: T) => string, blank: string, taken: (label: string) => string) => {
    const name = (label: string) => label.trim().toLowerCase();
    const count = new Map<string, number>();
    for (const { label } of items) count.set(name(label), (count.get(name(label)) ?? 0) + 1);
    for (const item of items) {
      if (!item.label.trim()) errors[key(item)] = blank;
      else if (count.get(name(item.label))! > 1) errors[key(item)] = taken(item.label.trim());
    }
  };
  for (const type of CUSTOM_RECORD_TYPES) {
    check(sets[type], (f) => `${type}.${f.id}`, 'Enter a field name.', (label) => `Another ${type} field is also called "${label}".`);
    for (const field of sets[type]) {
      const of = field.label.trim() || field.id;
      check(field.options, (o) => `${type}.${field.id}.${o.id}`, 'Enter an option name.', (label) => `Another option of ${of} is also called "${label}".`);
    }
  }
  return errors;
}

// The settings with these definitions, names trimmed. Version 2 only when there are any.
export function withCustomFields(config: WorkspaceConfig, sets: CustomFieldSets): WorkspaceConfig {
  const rest = { ...config };
  delete rest.customFields;
  const trim = (field: CustomField): CustomField => ({ ...field, label: field.label.trim(), options: field.options.map((o) => ({ ...o, label: o.label.trim() })) });
  const customFields = { contact: sortFields(sets.contact).map(trim), company: sortFields(sets.company).map(trim), opportunity: sortFields(sets.opportunity).map(trim) };
  return CUSTOM_RECORD_TYPES.some((type) => customFields[type].length > 0) ? { ...rest, schemaVersion: 2, customFields } : { ...rest, schemaVersion: 1 };
}

// A stored value in its input. A removed or unknown option shows as none.
export function formValue(field: CustomField, stored: CustomValue | undefined): FormValue {
  if (field.type === 'checkbox') return stored === true;
  if (field.type === 'select') return typeof stored === 'string' && field.options.some((o) => o.id === stored && !o.archived) ? stored : '';
  return stored === null || stored === undefined ? '' : String(stored);
}

// The form values of the fields a form shows.
export const formValues = (fields: CustomField[], stored: StoredValues): Record<string, FormValue> =>
  Object.fromEntries(fields.map((field) => [field.id, formValue(field, stored?.[field.id])]));

const NUMBER = /^-?\d+(\.\d+)?$/;
// A double holds 15 significant digits exactly, so a stored number is the one typed.
const MAX_DIGITS = 15;

// A form value to the value to store. `undefined` removes it.
export function readValue(field: CustomField, value: FormValue): { ok: true; value: CustomValue | undefined } | { ok: false; error: string } {
  if (typeof value === 'boolean') return { ok: true, value: value || undefined };
  const typed = value.trim();
  if (typed === '') return { ok: true, value: undefined };
  const refuse = (error: string) => ({ ok: false as const, error });
  switch (field.type) {
    case 'number':
      if (!NUMBER.test(typed)) return refuse('Enter a number with a period for decimals, such as 1200 or 3.5.');
      if (typed.replace(/\D/g, '').replace(/^0+/, '').length > MAX_DIGITS) return refuse(`Enter at most ${MAX_DIGITS} digits.`);
      return { ok: true, value: Number(typed) };
    case 'date':
      return isCalendarDate(typed) ? { ok: true, value: typed } : refuse('Enter a date.');
    case 'url':
      return isWebsite(withScheme(typed)) ? { ok: true, value: withScheme(typed) } : refuse('Enter a web address, such as https://example.com.');
    case 'select':
      return field.options.some((o) => o.id === typed && !o.archived) ? { ok: true, value: typed } : refuse('Choose an option from the list.');
    default:
      return { ok: true, value: typed };
  }
}

// The values to store after a form save. Only the fields that the form changed get new values;
// each other stored value stays, also one the form cannot show. Errors use `custom.${fieldId}`.
export function readCustomValues(
  fields: CustomField[],
  values: Record<string, FormValue>,
  stored: StoredValues,
): { ok: true; customFields: StoredValues } | { ok: false; errors: Record<string, string> } {
  const next = { ...stored };
  const errors: Record<string, string> = {};
  let changed = false;
  for (const field of fields) {
    const value = values[field.id];
    if (value === undefined || value === formValue(field, stored?.[field.id])) continue;
    const result = readValue(field, value);
    if (!result.ok) {
      errors[`custom.${field.id}`] = result.error;
      continue;
    }
    changed = true;
    if (result.value === undefined) delete next[field.id];
    else next[field.id] = result.value;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!changed) return { ok: true, customFields: stored };
  return { ok: true, customFields: Object.keys(next).length > 0 ? next : undefined };
}

export function fits(field: CustomField, value: CustomValue): boolean {
  if (value === null) return true;
  switch (field.type) {
    case 'text':
      return typeof value === 'string' && value.trim() !== '';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'date':
      return isCalendarDate(value);
    case 'checkbox':
      return typeof value === 'boolean';
    case 'url':
      return isWebsite(value);
    case 'select':
      return field.options.some((o) => o.id === value);
  }
}

const VALID: Record<Exclude<CustomFieldType, 'select'>, string> = { text: 'valid text', number: 'a valid number', date: 'a valid date', checkbox: 'a valid checkbox value', url: 'a valid web address' };

// What is wrong with a value that does not fit: "not a valid number".
export const misfit = (field: CustomField) => (field.type === 'select' ? `not an option of ${field.label}` : `not ${VALID[field.type]}`);

// A stored value for a field ID that the record type does not have, or that does not fit its
// field. Removed fields and options still count. `sets` is null when the settings file cannot be read.
export function customFieldIssues(entries: { path: string; record: CRMRecord }[], sets: CustomFieldSets | null): FileIssue[] {
  if (!sets) return [];
  const issues: FileIssue[] = [];
  for (const { path, record } of entries) {
    if (record.type !== 'contact' && record.type !== 'company' && record.type !== 'opportunity') continue;
    const problems = Object.entries(record.customFields ?? {})
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .flatMap(([id, value]) => {
        if (value === null) return [];
        const field = sets[record.type].find((f) => f.id === id);
        if (!field) return [`customFields.${id}: no ${record.type} field "${id}" is in ${WORKSPACE_PATH}`];
        return fits(field, value) ? [] : [`customFields.${id}: ${JSON.stringify(value)} is ${misfit(field)}`];
      });
    if (problems.length > 0) issues.push({ path, code: 'custom-field', message: problems.join('; ') });
  }
  return issues;
}

// The words that search finds in a shown value: text, a web address, a number, or an option name.
export function searchText(field: CustomField, value: CustomValue | undefined): string {
  if (field.type === 'select') return field.options.find((o) => o.id === value && !o.archived)?.label ?? '';
  if (field.type === 'number') return typeof value === 'number' ? String(value) : '';
  if (field.type === 'text' || field.type === 'url') return typeof value === 'string' ? value : '';
  return '';
}
