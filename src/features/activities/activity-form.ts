// The activity form (spec 04): a note, call, meeting, or email that the user writes down. Nothing
// is captured or synced. The time is entered in local time and stored in UTC.
import { fromLocalInput, toLocalInput } from '@/core/local-time.ts';
import { activitySchema, type Activity } from '@/core/schemas.ts';
import type { FieldErrors, FormResult } from '../record-form.ts';
import { readRelated, relatedKey, type RelatedIds } from '../related.ts';

export const ACTIVITY_KINDS: { kind: Activity['kind']; label: string }[] = [
  { kind: 'note', label: 'Note' },
  { kind: 'call', label: 'Call' },
  { kind: 'meeting', label: 'Meeting' },
  { kind: 'email_manual', label: 'Email (written down by hand)' },
];

export const kindLabel = (kind: string) => ACTIVITY_KINDS.find((k) => k.kind === kind)?.label ?? kind;

export type ActivityFields = Pick<Activity, 'kind' | 'body' | 'occurredAt' | 'related'>;
export type ActivityFormValues = { kind: string; body: string; occurredAt: string; related: string };

export function activityFields({ kind, body, occurredAt, related }: Activity): ActivityFields {
  return { kind, body, occurredAt, related };
}

// `defaults` gives a new activity its time (a datetime-local value) and its link.
export function activityValues(fields: ActivityFields | null, defaults: { occurredAt: string; related: string }): ActivityFormValues {
  if (!fields) return { kind: 'note', body: '', ...defaults };
  return { kind: fields.kind, body: fields.body, occurredAt: toLocalInput(fields.occurredAt), related: relatedKey(fields.related) };
}

export function readActivityForm(values: ActivityFormValues, { ids, current }: { ids: RelatedIds; current: ActivityFields | null }): FormResult<ActivityFields> {
  const errors: FieldErrors = {};
  const kind = activitySchema.shape.kind.safeParse(values.kind);
  if (!kind.success) errors.kind = 'Choose a kind from the list.';
  // Only blank lines at the ends go: indents and markup stay as typed, and show as plain text.
  const body = values.body.replace(/^(\s*\n)+/, '').trimEnd();
  if (!activitySchema.shape.body.safeParse(body).success) errors.body = 'Enter what happened.';
  const occurredAt = fromLocalInput(values.occurredAt);
  if (!occurredAt) errors.occurredAt = 'Enter a real date and time.';
  const { related, error } = readRelated(values.related, ids, current?.related ?? null);
  if (error) errors.related = error;
  if (Object.keys(errors).length > 0 || !kind.success || !occurredAt) return { ok: false, errors };
  return { ok: true, fields: { kind: kind.data, body, occurredAt, related } };
}
