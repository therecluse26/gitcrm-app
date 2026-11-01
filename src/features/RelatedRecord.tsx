// The parts that show and choose the `related` link of a task or an activity.
import { Link } from '@tanstack/react-router';
import type { CRMRecord } from '@/core/schemas.ts';
import { SelectField } from '@/ui/form-fields.tsx';
import { parseRelatedKey, relatedKey, type Related, type RelatedType } from './related.ts';
import { nameOf, pageOf, useRelatable } from './use-relatable.ts';

const byName = (a: CRMRecord, b: CRMRecord) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });

// The linked record's name, as a link to its page while the record exists.
export function RelatedLink({ related }: { related: Related | null }) {
  const { find, name } = useRelatable();
  if (!related || !find(related)) return <span>{name(related)}</span>;
  return (
    <Link {...pageOf(related)} className="underline">
      {name(related)}
    </Link>
  );
}

// "Related to": every active contact, company, and opportunity, grouped by type. The current and
// the chosen link stay on the list, also when their record is archived or missing.
export function RelatedField({ value, current, error, onChange }: { value: string; current: Related | null; error?: string; onChange: (value: string) => void }) {
  const { records, find, name } = useRelatable();
  const currentKey = relatedKey(current);
  const missing = new Map<string, Related>();
  for (const related of [current, parseRelatedKey(value)]) if (related && !find(related)) missing.set(relatedKey(related), related);
  const groups: { label: string; type: RelatedType }[] = [
    { label: 'Contacts', type: 'contact' },
    { label: 'Companies', type: 'company' },
    { label: 'Opportunities', type: 'opportunity' },
  ];
  return (
    <SelectField id="related" label="Related to" value={value} error={error} onChange={(e) => onChange(e.target.value)}>
      <option value="">Nothing</option>
      {groups.map(({ label, type }) => {
        const choices = records[type]
          .map((v) => v.record)
          .filter((record) => record.archivedAt === null || relatedKey({ type, id: record.id }) === currentKey)
          .sort(byName);
        return (
          choices.length > 0 && (
            <optgroup key={type} label={label}>
              {choices.map((record) => (
                <option key={record.id} value={relatedKey({ type, id: record.id })}>
                  {nameOf(record)}
                  {record.archivedAt ? ' (archived)' : ''}
                </option>
              ))}
            </optgroup>
          )
        );
      })}
      {[...missing].map(([key, related]) => (
        <option key={key} value={key}>{name(related)}</option>
      ))}
    </SelectField>
  );
}
