// Reads and writes the JSON files in the workspace repo. Every file read from Git is validated,
// even if GitCRM wrote it; a bad file becomes a visible issue, never a silent drop.
import type { z } from 'zod';
import { parseRecordPath, WORKSPACE_PATH } from './paths.ts';
import { recordSchemas, WORKSPACE_VERSION, workspaceSchema, type CRMRecord, type WorkspaceConfig } from './schemas.ts';

// Size cap for one file (docs/07); a larger file is reported, not parsed.
export const MAX_FILE_BYTES = 100 * 1024;

// With 'broken-link' (core/links.ts) and 'custom-field' (core/custom-fields.ts), the record still loads.
export type FileIssueCode = 'too-large' | 'invalid-json' | 'unsupported-version' | 'invalid-record' | 'path-mismatch' | 'unrecognized-path' | 'broken-link' | 'custom-field';
export type FileIssue = { path: string; code: FileIssueCode; message: string };

// The issues of files that did not load.
export const unreadable = (issues: FileIssue[]) => issues.filter((issue) => issue.code !== 'broken-link' && issue.code !== 'custom-field');

type Failure = { ok: false; issue: FileIssue };

export function serializeRecord(record: CRMRecord): string {
  const parsed = recordSchemas[record.type].parse(record);
  if ('customFields' in parsed && parsed.customFields) {
    parsed.customFields = Object.fromEntries(Object.entries(parsed.customFields).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return toText(parsed);
}

export function serializeWorkspace(config: WorkspaceConfig): string {
  return toText(workspaceSchema.parse(config));
}

export function parseRecordFile(path: string, text: string): { ok: true; record: CRMRecord } | Failure {
  const location = parseRecordPath(path);
  if (!location) return { ok: false, issue: unrecognizedPath(path) };
  const json = readJson(path, text, 1);
  if (!json.ok) return json;
  if (json.value.type !== location.type) return failure(path, 'path-mismatch', `The file is in the ${location.type} folder but has type ${String(json.value.type)}`);
  const result = recordSchemas[location.type].safeParse(json.value);
  if (!result.success) return failure(path, 'invalid-record', describe(result.error));
  if (result.data.id !== location.id) return failure(path, 'path-mismatch', 'The record ID does not match the filename');
  return { ok: true, record: result.data };
}

export function unrecognizedPath(path: string): FileIssue {
  return { path, code: 'unrecognized-path', message: 'Not a record path (data/{type}/{shard}/{uuid}.json)' };
}

export function parseWorkspaceFile(text: string): { ok: true; config: WorkspaceConfig } | Failure {
  const json = readJson(WORKSPACE_PATH, text, WORKSPACE_VERSION);
  if (!json.ok) return json;
  const result = workspaceSchema.safeParse(json.value);
  if (!result.success) return failure(WORKSPACE_PATH, 'invalid-record', describe(result.error));
  return { ok: true, config: result.data };
}

function toText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(path: string, text: string, newest: number): { ok: true; value: Record<string, unknown> } | Failure {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) return failure(path, 'too-large', `The file is over ${MAX_FILE_BYTES} bytes`);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return failure(path, 'invalid-json', 'The file is not valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return failure(path, 'invalid-record', 'The file is not a JSON object');
  const version = (value as Record<string, unknown>).schemaVersion;
  // A newer GitCRM wrote this file; older clients must not rewrite it.
  if (typeof version === 'number' && version > newest) return failure(path, 'unsupported-version', `Schema version ${version} is newer than this app supports`);
  return { ok: true, value: value as Record<string, unknown> };
}

function describe(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(file)'}: ${issue.message}`).join('; ');
}

function failure(path: string, code: FileIssueCode, message: string): Failure {
  return { ok: false, issue: { path, code, message } };
}
