import { describe, expect, it } from 'vitest';
import {
  addField,
  addOption,
  customFieldIssues,
  fieldSets,
  formValue,
  moveField,
  nameErrors,
  readCustomValues,
  readValue,
  removeField,
  removeOption,
  renameField,
  restoreField,
  restoreOption,
  searchText,
  sortFields,
  withCustomFields,
  type CustomField,
  type CustomFieldSets,
} from './custom-fields.ts';
import { recordPath } from './paths.ts';
import type { Contact, WorkspaceConfig } from './schemas.ts';
import { newWorkspaceConfig } from './workspace.ts';

const field = (id: string, type: CustomField['type'], changes: Partial<CustomField> = {}): CustomField => ({ id, label: id, type, position: 0, archived: false, options: [], ...changes });
const option = (id: string, archived = false) => ({ id, label: id[0].toUpperCase() + id.slice(1), archived });
const ids = (fields: CustomField[]) => fields.map((f) => f.id);
const source = field('source', 'select', { label: 'Lead source', options: [option('conference'), option('referral'), option('fair', true)] });
const none: CustomFieldSets = { contact: [], company: [], opportunity: [] };

describe('field definitions', () => {
  it('makes an ID from the first name, with a number when another field has it, also a removed one', () => {
    const fields = addField(addField([], 'Lead source', 'select'), 'LinkedIn', 'url');
    expect(fields).toEqual([field('lead-source', 'select', { label: 'Lead source' }), field('linkedin', 'url', { label: 'LinkedIn', position: 1 })]);
    const removed = removeField(fields, 'linkedin');
    expect(ids(addField(removed, 'linkedin', 'text'))).toEqual(['lead-source', 'linkedin-2', 'linkedin']);
    expect(addField([], '💰', 'number')[0].id).toBe('field');
  });

  it('renames a field and keeps its ID and type', () => {
    expect(renameField([source], 'source', 'Where from')).toEqual([{ ...source, label: 'Where from' }]);
  });

  it('moves a field past the active ones only, and keeps removed fields last', () => {
    const fields = sortFields([field('a', 'text'), field('b', 'text', { position: 1 }), field('c', 'text', { position: 2 })]);
    const removed = removeField(fields, 'b');
    expect(ids(removed)).toEqual(['a', 'c', 'b']);
    expect(ids(moveField(removed, 'c', -1))).toEqual(['c', 'a', 'b']);
    expect(ids(moveField(removed, 'c', 1))).toEqual(['a', 'c', 'b']);
    expect(moveField(removed, 'c', -1).map((f) => f.position)).toEqual([0, 1, 2]);
  });

  it('removes a field by marking it, and restores it at the end of the active ones', () => {
    const fields = removeField(sortFields([field('a', 'text'), field('b', 'text', { position: 1 }), field('c', 'text', { position: 2 })]), 'a');
    expect(fields.find((f) => f.id === 'a')?.archived).toBe(true);
    const restored = restoreField(fields, 'a');
    expect(ids(restored)).toEqual(['b', 'c', 'a']);
    expect(restored.every((f) => !f.archived)).toBe(true);
  });

  it('adds, renames, removes, and restores options; option IDs are never reused', () => {
    let fields = addOption([source], 'source', 'Referral');
    expect(fields[0].options.at(-1)).toEqual({ id: 'referral-2', label: 'Referral', archived: false });
    fields = removeOption(fields, 'source', 'conference');
    expect(fields[0].options.find((o) => o.id === 'conference')?.archived).toBe(true);
    fields = restoreOption(fields, 'source', 'fair');
    expect(fields[0].options.find((o) => o.id === 'fair')?.archived).toBe(false);
    expect(addOption([source], 'source', 'Fair')[0].options.at(-1)?.id).toBe('fair-2');
  });

  it('finds blank and repeated names in each list; a removed field or option counts', () => {
    const sets: CustomFieldSets = {
      ...none,
      contact: [field('a', 'text', { label: ' ' }), field('b', 'text', { label: 'Size' }), field('c', 'number', { label: 'size', archived: true })],
      company: [field('size', 'text', { label: 'Size' }), { ...source, options: [option('x'), { id: 'y', label: 'X', archived: true }] }],
    };
    expect(nameErrors(sets)).toEqual({
      'contact.a': 'Enter a field name.',
      'contact.b': 'Another contact field is also called "Size".',
      'contact.c': 'Another contact field is also called "size".',
      'company.source.x': 'Another option of Lead source is also called "X".',
      'company.source.y': 'Another option of Lead source is also called "X".',
    });
  });

  it('reads the definitions of a workspace, sorted, with empty lists when it has none', () => {
    const config = newWorkspaceConfig({ name: 'W', defaultCurrency: 'USD' });
    expect(fieldSets(config)).toEqual(none);
    expect(fieldSets(null)).toEqual(none);
    const v2: WorkspaceConfig = { ...config, schemaVersion: 2, customFields: { ...none, contact: [field('b', 'text', { position: 4 }), field('a', 'text', { position: 1 })] } };
    const sets = fieldSets(v2);
    expect(ids(sets.contact)).toEqual(['a', 'b']);
  });

  it('writes version 2 with definitions, and version 1 without, trimming names', () => {
    const config = newWorkspaceConfig({ name: 'W', defaultCurrency: 'USD' });
    const saved = withCustomFields(config, { ...none, contact: [field('a', 'select', { label: ' A ', options: [{ id: 'x', label: ' X ', archived: false }] })] });
    expect(saved.schemaVersion).toBe(2);
    expect(saved.customFields?.contact[0]).toMatchObject({ label: 'A', options: [{ label: 'X' }] });
    expect(withCustomFields(saved, none)).toEqual(config);
  });
});

describe('form values', () => {
  const employees = field('employees', 'number');
  const linkedin = field('linkedin', 'url');
  const met = field('met', 'date');
  const vip = field('vip', 'checkbox');
  const notes = field('notes', 'text');

  it('shows a stored value in its input; a removed or unknown option shows as none', () => {
    expect(formValue(employees, 1200.5)).toBe('1200.5');
    expect(formValue(notes, null)).toBe('');
    expect(formValue(notes, undefined)).toBe('');
    expect(formValue(employees, 'many')).toBe('many');
    expect(formValue(vip, true)).toBe(true);
    expect(formValue(vip, 'yes')).toBe(false);
    expect(formValue(source, 'referral')).toBe('referral');
    expect(formValue(source, 'fair')).toBe('');
    expect(formValue(source, 'gone')).toBe('');
  });

  it('reads each type, and removes an empty value', () => {
    expect(readValue(notes, '  hello  ')).toEqual({ ok: true, value: 'hello' });
    expect(readValue(notes, '   ')).toEqual({ ok: true, value: undefined });
    expect(readValue(employees, '-3.50')).toEqual({ ok: true, value: -3.5 });
    expect(readValue(met, '2026-11-02')).toEqual({ ok: true, value: '2026-11-02' });
    expect(readValue(vip, true)).toEqual({ ok: true, value: true });
    expect(readValue(vip, false)).toEqual({ ok: true, value: undefined });
    expect(readValue(linkedin, 'linkedin.com/in/ava')).toEqual({ ok: true, value: 'https://linkedin.com/in/ava' });
    expect(readValue(source, 'referral')).toEqual({ ok: true, value: 'referral' });
  });

  it('refuses a value that does not fit', () => {
    const number = 'Enter a number with a period for decimals, such as 1200 or 3.5.';
    expect(readValue(employees, '1,200')).toEqual({ ok: false, error: number });
    expect(readValue(employees, '12e3')).toEqual({ ok: false, error: number });
    expect(readValue(employees, '1234567890123456')).toEqual({ ok: false, error: 'Enter at most 15 digits.' });
    expect(readValue(employees, '-0.00000000000001')).toEqual({ ok: true, value: -1e-14 });
    expect(readValue(met, '2026-02-30')).toEqual({ ok: false, error: 'Enter a date.' });
    expect(readValue(linkedin, 'javascript:alert(1)')).toEqual({ ok: false, error: 'Enter a web address, such as https://example.com.' });
    expect(readValue(source, 'fair')).toEqual({ ok: false, error: 'Choose an option from the list.' });
  });

  it('changes only the values the form changed, and keeps every other stored value', () => {
    const fields = [employees, source, vip];
    const stored = { employees: 'many', source: 'fair', vip: false, gone: 'kept', old: null };
    const values = { employees: 'many', source: '', vip: false };
    expect(readCustomValues(fields, values, stored)).toEqual({ ok: true, customFields: stored });
    expect(readCustomValues(fields, { ...values, vip: true }, stored)).toEqual({ ok: true, customFields: { ...stored, vip: true } });
    expect(readCustomValues(fields, { ...values, source: 'referral' }, stored)).toEqual({ ok: true, customFields: { ...stored, source: 'referral' } });
  });

  it('removes a cleared value, and leaves out an empty object', () => {
    expect(readCustomValues([employees], { employees: '' }, { employees: 12 })).toEqual({ ok: true, customFields: undefined });
    expect(readCustomValues([employees], { employees: '' }, undefined)).toEqual({ ok: true, customFields: undefined });
    expect(readCustomValues([employees], { employees: '' }, {})).toEqual({ ok: true, customFields: {} });
    expect(readCustomValues([employees], { employees: '7' }, undefined)).toEqual({ ok: true, customFields: { employees: 7 } });
  });

  it('gives each refused value its own error', () => {
    expect(readCustomValues([employees, met], { employees: 'x', met: 'y' }, undefined)).toEqual({
      ok: false,
      errors: { 'custom.employees': 'Enter a number with a period for decimals, such as 1200 or 3.5.', 'custom.met': 'Enter a date.' },
    });
  });

  it('gives search the text of a shown value', () => {
    expect(searchText(source, 'referral')).toBe('Referral');
    expect(searchText(source, 'fair')).toBe('');
    expect(searchText(employees, 1200)).toBe('1200');
    expect(searchText(vip, true)).toBe('');
    expect(searchText(notes, 42)).toBe('');
  });
});

describe('customFieldIssues', () => {
  const ava: Contact = {
    schemaVersion: 1,
    type: 'contact',
    id: 'd13d0f69-0a4c-4192-9009-9e36a51c42c0',
    name: 'Ava Bennett',
    emails: [],
    phones: [],
    companyId: null,
    tags: [],
    createdAt: '2026-10-26T16:00:00Z',
    updatedAt: '2026-10-26T16:00:00Z',
    archivedAt: null,
  };
  const path = recordPath('contact', ava.id);
  const sets: CustomFieldSets = { ...none, contact: [source, field('employees', 'number', { archived: true }), field('vip', 'checkbox')] };
  const issues = (customFields: Contact['customFields'], given: CustomFieldSets | null = sets) => customFieldIssues([{ path, record: { ...ava, customFields } }], given);

  it('accepts values that fit, null, and values of removed fields and options', () => {
    expect(issues({ source: 'fair', employees: 3, vip: true, 'lead-time': null })).toEqual([]);
    expect(issues(undefined)).toEqual([]);
  });

  it('reports each value that does not fit, or has no field, in one issue per file', () => {
    expect(issues({ source: 'gone', employees: 'many', vip: 'yes', size: 4 })).toEqual([
      {
        path,
        code: 'custom-field',
        message:
          'customFields.employees: "many" is not a valid number; customFields.size: no contact field "size" is in .gitcrm/workspace.json; customFields.source: "gone" is not an option of Lead source; customFields.vip: "yes" is not a valid checkbox value',
      },
    ]);
  });

  it('checks nothing when the workspace settings cannot be read', () => {
    expect(issues({ size: 4 }, null)).toEqual([]);
  });
});
