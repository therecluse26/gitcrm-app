// Storage failures beyond plain HTTP errors (GitHubError). operation-state.ts maps them all.
import type { FileIssue } from '../core/record-file.ts';
import type { VersionedRecord } from './workspace-repository.ts';

// Someone else changed, created, or deleted the record. `remote` is main's version, or null.
export class ConflictError extends Error {
  readonly remote: VersionedRecord | null;

  constructor(remote: VersionedRecord | null, message: string) {
    super(message);
    this.name = 'ConflictError';
    this.remote = remote;
  }
}

// A file in the repo failed validation.
export class InvalidFileError extends Error {
  readonly issue: FileIssue;

  constructor(issue: FileIssue) {
    super(`${issue.path}: ${issue.message}`);
    this.name = 'InvalidFileError';
    this.issue = issue;
  }
}

// A write's response was lost and the check after it failed too: the write may or may not be on main.
export class UnknownOutcomeError extends Error {
  constructor() {
    super('GitHub did not answer, and the check after it failed');
    this.name = 'UnknownOutcomeError';
  }
}

// GitCRM could not read every file in the snapshot. It never shows a partial snapshot.
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}
