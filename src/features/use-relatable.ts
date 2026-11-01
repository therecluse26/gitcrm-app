// The records a task or an activity can link to: their IDs for the form checks, their names, and
// their pages.
import { useApp } from '@/app/store.ts';
import type { CRMRecord } from '@/core/schemas.ts';
import type { WorkspaceSnapshot } from '@/storage/workspace-repository.ts';
import { recordsOf } from './records.ts';
import type { Related, RelatedIds, RelatedType } from './related.ts';

const NOUNS: Record<RelatedType, string> = { contact: 'contact', company: 'company', opportunity: 'opportunity' };

export const nameOf = (record: CRMRecord) => ('name' in record ? record.name : 'title' in record ? record.title : record.id);

// The records a task or an activity can link to, and their IDs for the form checks. Built once per
// snapshot, because every task and activity row in a list asks for it.
export function useRelatable() {
  return relatableOf(useApp((s) => s.snapshot));
}

const relatables = new WeakMap<WorkspaceSnapshot, ReturnType<typeof buildRelatable>>();

export function relatableOf(snapshot: WorkspaceSnapshot | null) {
  if (!snapshot) return buildRelatable(null);
  let relatable = relatables.get(snapshot);
  if (!relatable) relatables.set(snapshot, (relatable = buildRelatable(snapshot)));
  return relatable;
}

function buildRelatable(snapshot: WorkspaceSnapshot | null) {
  const records = { contact: recordsOf(snapshot, 'contact'), company: recordsOf(snapshot, 'company'), opportunity: recordsOf(snapshot, 'opportunity') };
  const byId = (list: { record: CRMRecord }[]) => new Map(list.map((v) => [v.record.id, v.record]));
  const lookup = { contact: byId(records.contact), company: byId(records.company), opportunity: byId(records.opportunity) };
  const ids: RelatedIds = { contact: new Set(lookup.contact.keys()), company: new Set(lookup.company.keys()), opportunity: new Set(lookup.opportunity.keys()) };
  const find = (related: Related) => lookup[related.type].get(related.id);
  // The name to show for a link, also when its record is missing.
  const name = (related: Related | null) => {
    if (!related) return 'None';
    const record = find(related);
    return record ? nameOf(record) : `Missing ${NOUNS[related.type]} (ID ${related.id.slice(0, 8)})`;
  };
  return { records, ids, find, name };
}

// The page of a linked record, or Home when there is no link.
export function pageOf(related: Related | null) {
  if (related?.type === 'contact') return { to: '/contacts/$contactId', params: { contactId: related.id } } as const;
  if (related?.type === 'company') return { to: '/companies/$companyId', params: { companyId: related.id } } as const;
  if (related?.type === 'opportunity') return { to: '/opportunities/$opportunityId', params: { opportunityId: related.id } } as const;
  return { to: '/' } as const;
}
