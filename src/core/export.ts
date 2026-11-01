// Export (spec 05, docs/09): the JSON snapshot ZIP and the CSV ZIP, built in the browser. Both
// hold DATA-DICTIONARY.md and schemas/. Nothing here sends a request.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { csvList, csvText } from './csv.ts';
import { csvColumns, dataDictionary, jsonSchemas, OPPORTUNITY_CSV_ONLY } from './data-dictionary.ts';
import { minorToInput } from './money.ts';
import { FOLDERS } from './paths.ts';
import { unreadable, type FileIssue } from './record-file.ts';
import { RECORD_TYPES, recordSchemas, type CRMRecord, type RecordType, type WorkspaceConfig } from './schemas.ts';
import type { Stage } from './stages.ts';

export type ExportKind = 'snapshot' | 'csv';

export type ExportSource = {
  repository: string; // owner/repo
  branch: string;
  commitSha: string | null; // null when saves changed the files after the last full read
  config: WorkspaceConfig;
  records: CRMRecord[];
  files: [path: string, text: string][]; // every file GitCRM manages, with its text on the branch
};

// A broken link does not block: every file is complete, and the link stays as it is on main.
export function exportProblem(issues: FileIssue[]): string | null {
  const unread = unreadable(issues);
  if (unread.length === 0) return null;
  if (unread.length === 1) return `1 file cannot be read, so the export would not be complete: ${unread[0].path}`;
  return `${unread.length} files cannot be read, so the export would not be complete. Settings lists them under "Files that need attention".`;
}

// No record data goes into the name (docs/09).
export function exportFileName(workspaceName: string, kind: ExportKind, now: Date): string {
  const ascii = workspaceName.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const slug = ascii.replace(/^-+/, '').slice(0, 40).replace(/-+$/, '') || 'workspace';
  return `gitcrm-${slug}-${now.toISOString().slice(0, 10)}-${kind}.zip`;
}

function cells(key: string, value: unknown): string[] {
  if (key === 'related') {
    const link = value as { type: string; id: string } | null;
    return [link?.type ?? '', link?.id ?? ''];
  }
  if (key === 'customFields') return [value === undefined ? '' : JSON.stringify(value)];
  if (Array.isArray(value)) return [csvList(value)];
  return [value === null || value === undefined ? '' : String(value)];
}

// One CSV per record type, rows in ID order, so the same records always give the same files.
export function csvTables(records: CRMRecord[], stages: Stage[]): Record<RecordType, string> {
  const labels = new Map(stages.map((stage) => [stage.id, stage.label]));
  const tables = RECORD_TYPES.map((type) => {
    const keys = Object.keys(recordSchemas[type].shape);
    const header = [...keys.flatMap(csvColumns), ...(type === 'opportunity' ? Object.keys(OPPORTUNITY_CSV_ONLY) : [])];
    const rows = records
      .filter((record) => record.type === type)
      .toSorted((a, b) => (a.id < b.id ? -1 : 1))
      .map((record) => {
        const row = keys.flatMap((key) => cells(key, (record as Record<string, unknown>)[key]));
        if (record.type === 'opportunity') row.push(labels.get(record.stageId) ?? '', record.valueMinor === null ? '' : minorToInput(record.valueMinor, record.currency));
        return row;
      });
    return [type, csvText([header, ...rows])];
  });
  return Object.fromEntries(tables) as Record<RecordType, string>;
}

// zipSync: the async fflate functions run in Web Workers, and this needs none.
export function buildExport(kind: ExportKind, source: ExportSource, now: Date): { name: string; bytes: Uint8Array<ArrayBuffer> } {
  const content: [string, string][] =
    kind === 'snapshot'
      ? source.files
      : Object.entries(csvTables(source.records, source.config.pipelineStages)).map(([type, text]) => [`${FOLDERS[type as RecordType]}.csv`, text]);
  const files: Zippable = {};
  for (const [path, text] of [...content, ['DATA-DICTIONARY.md', dataDictionary(source, now)], ...Object.entries(jsonSchemas())]) files[path] = strToU8(text);
  // fflate types the result loosely; zipSync always returns a new ArrayBuffer, never a shared one.
  return { name: exportFileName(source.config.name, kind, now), bytes: zipSync(files, { mtime: now }) as Uint8Array<ArrayBuffer> };
}
