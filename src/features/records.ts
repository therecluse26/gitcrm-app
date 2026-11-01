// Typed access to the records, the pipeline stages, and the custom fields in the current snapshot.
import { useMemo } from 'react';
import { useApp } from '@/app/store.ts';
import { fieldSets, type CustomFieldSets } from '@/core/custom-fields.ts';
import type { RecordOf, RecordType } from '@/core/schemas.ts';
import { sortStages, type Stage } from '@/core/stages.ts';
import type { VersionedRecord, WorkspaceSnapshot } from '@/storage/workspace-repository.ts';

// One list per record type and snapshot, shared by every caller, because each task and activity row
// asks for these lists (docs/06, "Measured in the browser"). A snapshot never changes; each load or
// save makes a new one.
const lists = new WeakMap<WorkspaceSnapshot, Map<RecordType, VersionedRecord[]>>();
const NONE: readonly VersionedRecord[] = Object.freeze([]);

export function recordsOf<T extends RecordType>(snapshot: WorkspaceSnapshot | null, type: T): VersionedRecord<RecordOf<T>>[] {
  if (!snapshot) return NONE as VersionedRecord<RecordOf<T>>[];
  let byType = lists.get(snapshot);
  if (!byType) lists.set(snapshot, (byType = new Map()));
  let list = byType.get(type);
  if (!list) byType.set(type, (list = snapshot.records.filter((v) => v.record.type === type)));
  return list as VersionedRecord<RecordOf<T>>[];
}

export function useRecords<T extends RecordType>(type: T): VersionedRecord<RecordOf<T>>[] {
  const snapshot = useApp((s) => s.snapshot);
  return recordsOf(snapshot, type);
}

export function useRecord<T extends RecordType>(type: T, id: string): VersionedRecord<RecordOf<T>> | undefined {
  return useRecords(type).find((v) => v.record.id === id);
}

// The address of a new-record page can link the new record: "Add contact" on a company page passes
// companyId, and "Add task" passes related, such as "opportunity:<uuid>". Every new-record page
// shares this one shape. With one shape per route, this router version types its route IDs as
// any, and each page would see every route's search type.
export type NewRecordSearch = { companyId?: string; contactId?: string; related?: string };

export function readNewRecordSearch({ companyId, contactId, related }: Record<string, unknown>): NewRecordSearch {
  return {
    ...(typeof companyId === 'string' && { companyId }),
    ...(typeof contactId === 'string' && { contactId }),
    ...(typeof related === 'string' && { related }),
  };
}

// The selector returns the stored array, so the component re-renders only when the stages change.
export function useStages(): Stage[] {
  const stages = useApp((s) => s.snapshot?.workspace?.config.pipelineStages);
  return useMemo(() => sortStages(stages ?? []), [stages]);
}

// The same for the custom field definitions (spec 10), sorted, with empty lists when there are none.
export function useFieldSets(): CustomFieldSets {
  const sets = useApp((s) => s.snapshot?.workspace?.config.customFields);
  return useMemo(() => fieldSets(sets && { customFields: sets }), [sets]);
}

export function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(timestamp));
}

// A moment in the user's time zone, such as when a call happened.
export function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

// A YYYY-MM-DD calendar date, such as an expected close date: the same day in every time zone.
export function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
