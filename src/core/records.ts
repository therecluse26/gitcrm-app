// Pure record creation and editing. Callers pass the clock, so results are deterministic.
import { serializeRecord } from './record-file.ts';
import { recordSchemas, type CRMRecord, type RecordOf, type RecordType } from './schemas.ts';

export type RecordFields<T extends RecordType> = Omit<RecordOf<T>, 'schemaVersion' | 'type' | 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>;
export type RecordChanges<R extends CRMRecord> = Partial<Omit<R, 'schemaVersion' | 'type' | 'id' | 'createdAt' | 'updatedAt'>>;

export function isoTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function newRecord<T extends RecordType>(type: T, fields: RecordFields<T>, { now, id = crypto.randomUUID() }: { now: Date; id?: string }): RecordOf<T> {
  const at = isoTimestamp(now);
  return recordSchemas[type].parse({ schemaVersion: 1, type, id, ...fields, createdAt: at, updatedAt: at, archivedAt: null }) as RecordOf<T>;
}

// Sets updatedAt only when the content changes, so an unchanged form never makes a commit.
export function editRecord<R extends CRMRecord>(record: R, changes: RecordChanges<R>, now: Date): R {
  const merged = { ...record, ...changes } as R;
  if (serializeRecord(merged) === serializeRecord(record)) return record;
  return { ...merged, updatedAt: isoTimestamp(now) };
}
