// Labeled form fields with their errors (docs/08, "Accessibility"). Native elements where they
// do the job, such as <select>.
import { Plus, X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FieldErrors } from '@/features/record-form.ts';

type FieldProps = { id: string; label: string; error?: string; hint?: string };

function Message({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (!error && !hint) return null;
  return <p id={id} className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{error ?? hint}</p>;
}

export function TextField({ id, label, error, hint, ...props }: FieldProps & ComponentProps<'input'>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-message` : undefined} {...props} />
      <Message id={`${id}-message`} error={error} hint={hint} />
    </div>
  );
}

export const selectClassName =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive';

export function SelectField({ id, label, error, hint, children, ...props }: FieldProps & ComponentProps<'select'>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={selectClassName} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-message` : undefined} {...props}>
        {children}
      </select>
      <Message id={`${id}-message`} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({ id, label, error, hint, ...props }: FieldProps & ComponentProps<'textarea'>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        className="min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        {...props}
      />
      <Message id={`${id}-message`} error={error} hint={hint} />
    </div>
  );
}

// Several values of one kind, such as email addresses. Errors use the keys `${name}.${index}`.
export function ValueListField({
  name,
  label,
  itemLabel,
  values,
  errors,
  onChange,
  ...inputProps
}: { name: string; label: string; itemLabel: string; values: string[]; errors: FieldErrors; onChange: (values: string[]) => void } & Pick<ComponentProps<'input'>, 'type' | 'autoComplete' | 'inputMode'>) {
  const lower = itemLabel.toLowerCase();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {values.map((value, i) => {
        const error = errors[`${name}.${i}`];
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex gap-2">
              <Input
                id={`${name}-${i}`}
                aria-label={`${itemLabel} ${i + 1}`}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${name}-${i}-message` : undefined}
                value={value}
                onChange={(e) => onChange(values.with(i, e.target.value))}
                {...inputProps}
              />
              {(values.length > 1 || value !== '') && (
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${lower} ${i + 1}`} onClick={() => onChange(values.length > 1 ? values.toSpliced(i, 1) : [''])}>
                  <X aria-hidden />
                </Button>
              )}
            </div>
            <Message id={`${name}-${i}-message`} error={error} />
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...values, ''])}>
        <Plus aria-hidden />
        Add {lower}
      </Button>
    </fieldset>
  );
}
