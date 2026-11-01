// Delete with a cascade (ADR-021, spec 06, "Delete rules"): the record, its tasks and activities,
// and an unlink in each record that points to it. Archived records count.
import { unreadable, type FileIssue } from '@/core/record-file.ts';
import { editRecord } from '@/core/records.ts';
import { RECORD_TYPES, type CRMRecord, type RecordType } from '@/core/schemas.ts';
import type { DeletePlan, VersionedRecord } from '@/storage/workspace-repository.ts';

export type DeletePreview = {
  target: VersionedRecord;
  deleted: VersionedRecord[]; // the tasks and activities that go with the record
  unlinked: VersionedRecord[]; // the records that stay, without their link to it
  loaded: ReadonlyMap<string, string>; // every record file the preview read: path -> blob SHA
};

// How a record that points to the target loses the link, or null when it does not point to it.
function unlinker(record: CRMRecord, target: CRMRecord): ((now: Date) => CRMRecord) | null {
  if (target.type === 'company' && (record.type === 'contact' || record.type === 'opportunity') && record.companyId === target.id) {
    return (now) => editRecord(record, { companyId: null }, now);
  }
  if (target.type === 'contact' && record.type === 'opportunity' && record.contactIds.includes(target.id)) {
    return (now) => editRecord(record, { contactIds: record.contactIds.filter((id) => id !== target.id) }, now);
  }
  return null;
}

export function previewDelete(target: VersionedRecord, records: VersionedRecord[]): DeletePreview {
  const { type, id } = target.record;
  return {
    target,
    deleted: records.filter(({ record }) => (record.type === 'task' || record.type === 'activity') && record.related?.type === type && record.related.id === id),
    unlinked: records.filter(({ record }) => unlinker(record, target.record) !== null),
    loaded: new Map(records.map(({ path, blobSha }) => [path, blobSha])),
  };
}

// The commit, made when the user confirms: `now` becomes the updatedAt of each unlinked record.
export function planDelete({ target, deleted, unlinked, loaded }: DeletePreview, now: Date): DeletePlan {
  return {
    target: { type: target.record.type, id: target.record.id },
    deletes: [target, ...deleted].map(({ path, blobSha }) => ({ path, blobSha })),
    rewrites: unlinked.map(({ record, blobSha }) => ({ record: unlinker(record, target.record)!(now), blobSha })),
    loaded,
  };
}

const NOUNS: Record<RecordType, [one: string, many: string]> = {
  contact: ['contact', 'contacts'],
  company: ['company', 'companies'],
  opportunity: ['opportunity', 'opportunities'],
  task: ['task', 'tasks'],
  activity: ['activity', 'activities'],
};
const list = new Intl.ListFormat('en', { type: 'conjunction' });

// "2 contacts" and "1 opportunity", in record type order.
function counts(records: CRMRecord[]): string[] {
  return RECORD_TYPES.flatMap((type) => {
    const n = records.filter((r) => r.type === type).length;
    return n === 0 ? [] : [`${n} ${NOUNS[type][n === 1 ? 0 : 1]}`];
  });
}

// "This deletes the contact, 1 task, and 2 activities, and unlinks 1 opportunity."
export function deleteSummary({ target, deleted, unlinked }: DeletePreview): string {
  const removes = [`the ${target.record.type}`, ...counts(deleted.map((v) => v.record))];
  const sentence = `This deletes ${list.format(removes)}`;
  if (unlinked.length === 0) return `${sentence}.`;
  return `${sentence}${removes.length > 1 ? ',' : ''} and unlinks ${list.format(counts(unlinked.map((v) => v.record)))}.`;
}

// A file that did not load may link to the record, so a delete could leave a dangling link.
export function deleteBlocker(issues: FileIssue[]): string | null {
  const files = unreadable(issues);
  if (files.length === 0) return null;
  if (files.length === 1) return `1 file cannot be read, so GitCRM cannot tell whether it links to this record: ${files[0].path}`;
  return `${files.length} files cannot be read, so GitCRM cannot tell whether they link to this record. Settings lists them under "Files that need attention".`;
}
