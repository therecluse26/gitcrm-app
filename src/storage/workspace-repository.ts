// The persistence seam (ARCHITECTURE.md). The GitHub implementation is in github-workspace.ts.
import type { FileIssue } from '../core/record-file.ts';
import type { CRMRecord, RecordType, WorkspaceConfig } from '../core/schemas.ts';
import type { SnapshotFiles } from './snapshot.ts';

// A validated record and the Git blob SHA it was read or written at: the optimistic
// concurrency token for its next update or delete.
export type VersionedRecord<R extends CRMRecord = CRMRecord> = {
  record: R;
  path: string;
  blobSha: string;
  commitSha: string | null; // null when unknown, for example after a lost response
};

export type WorkspaceSnapshot = {
  commitSha: string | null; // null when the snapshot comes from a cache that saves have updated
  // null when .gitcrm/workspace.json is missing, or invalid (then `issues` has an entry for it)
  workspace: { config: WorkspaceConfig; blobSha: string } | null;
  records: VersionedRecord[];
  issues: FileIssue[];
};

// One commit (ADR-021): deletes files and rewrites linking records, each checked against the
// blob SHA the app loaded.
export type DeletePlan = {
  target: { type: RecordType; id: string };
  deletes: { path: string; blobSha: string }[];
  rewrites: { record: CRMRecord; blobSha: string }[];
  // Every file under data/ that the preview read, path -> blob SHA. If main differs, a record
  // may link to the target now, so the delete is a conflict.
  loaded: ReadonlyMap<string, string>;
};

export interface WorkspaceRepository {
  // `cached` is the record cache (ADR-017); the result's `files` is what to cache next.
  loadWorkspace(cached?: SnapshotFiles): Promise<{ snapshot: WorkspaceSnapshot; files: SnapshotFiles }>;
  readRecord(type: RecordType, id: string): Promise<VersionedRecord | null>;
  createRecord<R extends CRMRecord>(record: R): Promise<VersionedRecord<R>>;
  updateRecord<R extends CRMRecord>(record: R, expectedBlobSha: string): Promise<VersionedRecord<R>>;
  deleteWithCascade(plan: DeletePlan): Promise<{ commitSha: string; rewritten: VersionedRecord[] }>;
  // expectedBlobSha is null to initialize; an existing config is never overwritten.
  writeWorkspace(config: WorkspaceConfig, expectedBlobSha: string | null): Promise<{ config: WorkspaceConfig; blobSha: string; commitSha: string | null }>;
}
