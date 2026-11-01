// Custom field values as text, for forms, record pages, and the conflict panel (spec 10).
import { useMemo } from 'react';
import { fits, type CustomField, type CustomRecordType, type CustomValue, type StoredValues } from '@/core/custom-fields.ts';
import type { ConflictRowView } from '@/ui/ConflictPanel.tsx';
import { formatCalendarDate, useFieldSets } from '../records.ts';

// The fields a form or page shows, and all of them, removed ones too, for a conflict.
export function useCustomFields(type: CustomRecordType): { shown: CustomField[]; all: CustomField[] } {
  const all = useFieldSets()[type];
  return useMemo(() => ({ shown: all.filter((f) => !f.archived), all }), [all]);
}

const numbers = new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 });

// A value as text: "None", "Yes", an option's name, a formatted number or date.
export function customText(field: CustomField | undefined, value: CustomValue | undefined): string {
  if (value === undefined || value === null) return field?.type === 'checkbox' ? 'No' : 'None';
  if (!field || !fits(field, value)) return JSON.stringify(value);
  switch (field.type) {
    case 'checkbox':
      return value ? 'Yes' : 'No';
    case 'select': {
      const option = field.options.find((o) => o.id === value)!;
      return option.archived ? `${option.label} (removed)` : option.label;
    }
    case 'number':
      return numbers.format(value as number);
    case 'date':
      return formatCalendarDate(value as string);
    default:
      return String(value);
  }
}

// A conflict panel row for a custom field, which may be removed or unknown by now.
export function customConflictRow(fields: CustomField[], row: { customId?: string; mine: unknown; remote: unknown; changedByMe: boolean }): ConflictRowView {
  const field = fields.find((f) => f.id === row.customId);
  const text = (value: unknown) => customText(field, value as CustomValue | undefined);
  return { label: field?.label ?? row.customId ?? '', remote: text(row.remote), mine: text(row.mine), changedByMe: row.changedByMe };
}

// Lines of "Name: value" for the conflict panel's copy of my changes.
export const customCopyLines = (fields: CustomField[], stored: StoredValues) => fields.map((field) => `${field.label}: ${customText(field, stored?.[field.id])}`);
