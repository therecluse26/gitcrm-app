// Custom fields on the record forms and pages (spec 10): one input or one detail row per field
// that is not removed, after the built-in fields.
import { Link } from '@tanstack/react-router';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { activeFields, fits, formValue, misfit, type CustomField, type CustomRecordType, type FormValue, type StoredValues } from '@/core/custom-fields.ts';
import { SelectField, TextField } from '@/ui/form-fields.tsx';
import { Detail } from '@/ui/record-page.tsx';
import type { FieldErrors } from '../record-form.ts';
import { useFieldSets } from '../records.ts';
import { customText } from './custom-values.ts';

export function CustomFieldInputs({ fields, values, errors, onChange }: { fields: CustomField[]; values: Record<string, FormValue>; errors: FieldErrors; onChange: (values: Record<string, FormValue>) => void }) {
  return fields.map((field) => {
    const id = `custom-${field.id}`;
    const value = values[field.id] ?? formValue(field, undefined);
    const error = errors[`custom.${field.id}`];
    const set = (next: FormValue) => onChange({ ...values, [field.id]: next });
    switch (field.type) {
      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center gap-2">
            <Checkbox id={id} aria-labelledby={`${id}-label`} checked={value === true} onCheckedChange={(checked) => set(checked)} />
            <Label id={`${id}-label`} htmlFor={id}>{field.label}</Label>
          </div>
        );
      case 'select':
        return (
          <SelectField key={field.id} id={id} label={field.label} value={value as string} error={error} onChange={(e) => set(e.target.value)}>
            <option value="">None</option>
            {field.options.filter((o) => !o.archived).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </SelectField>
        );
      default: {
        const input = { number: { inputMode: 'decimal' as const }, date: { type: 'date' }, url: { type: 'url', inputMode: 'url' as const }, text: {} }[field.type];
        return <TextField key={field.id} id={id} label={field.label} autoComplete="off" value={value as string} error={error} onChange={(e) => set(e.target.value)} {...input} />;
      }
    }
  });
}

// Detail rows for a record page. A value that does not fit shows as stored, with what is wrong.
export function CustomFieldDetails({ type, values }: { type: CustomRecordType; values: StoredValues }) {
  const fields = activeFields(useFieldSets()[type]);
  return fields.map((field) => {
    const value = values?.[field.id];
    let shown;
    if (value === undefined || value === null || (field.type === 'select' && field.options.some((o) => o.id === value && o.archived))) {
      shown = field.type === 'checkbox' ? 'No' : <span className="text-muted-foreground">None</span>;
    } else if (!fits(field, value)) {
      const problem = misfit(field);
      shown = (
        <span>
          {JSON.stringify(value)}{' '}
          <span className="text-muted-foreground">
            {problem[0].toUpperCase() + problem.slice(1)}. <Link to="/settings" className="underline">See Settings</Link>.
          </span>
        </span>
      );
    } else if (field.type === 'url') {
      shown = <a className="underline" href={value as string} target="_blank" rel="noopener noreferrer">{value as string}</a>;
    } else {
      shown = <span className="whitespace-pre-wrap">{customText(field, value)}</span>;
    }
    return (
      <Detail key={field.id} label={field.label}>
        {shown}
      </Detail>
    );
  });
}
