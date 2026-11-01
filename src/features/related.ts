// The optional `related` link of a task or an activity (docs/02): one contact, company, or
// opportunity.
import type { Task } from '@/core/schemas.ts';

export type Related = NonNullable<Task['related']>;
export type RelatedType = Related['type'];
export type RelatedIds = Record<RelatedType, ReadonlySet<string>>;

const TYPES: readonly string[] = ['contact', 'company', 'opportunity'] satisfies RelatedType[];

// The value of a <select> option: "contact:<uuid>", or "" for no link.
export const relatedKey = (related: Related | null) => (related ? `${related.type}:${related.id}` : '');

export function parseRelatedKey(key: string): Related | null {
  const [type, id] = key.split(':');
  return TYPES.includes(type) && id ? { type: type as RelatedType, id } : null;
}

export const isRelatedTo = (record: { related: Related | null }, target: Related) => record.related?.type === target.type && record.related.id === target.id;

// The current link may stay when its record is missing, so that an unrelated edit still saves.
export function readRelated(key: string, ids: RelatedIds, current: Related | null): { related: Related | null; error?: string } {
  if (key === '') return { related: null };
  const related = parseRelatedKey(key);
  if (!related) return { related: null, error: 'Choose a record from the list.' };
  if (!ids[related.type].has(related.id) && key !== relatedKey(current)) {
    return { related, error: 'The chosen record is no longer in the workspace. Choose another one, or none.' };
  }
  return { related };
}
