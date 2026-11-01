// Links between records must point to records in the same workspace, and an opportunity's stage
// to a stage in .gitcrm/workspace.json (docs/02). The UI cannot create a broken link, but a hand
// edit, another app, or a stage removed while someone moved an opportunity into it can. A broken
// link is reported, and the record still loads.
import { WORKSPACE_PATH } from './paths.ts';
import type { FileIssue } from './record-file.ts';
import type { CRMRecord, RecordType } from './schemas.ts';

// `stageIds` is null when the workspace settings are missing or invalid.
export function linkIssues(entries: { path: string; record: CRMRecord }[], stageIds: ReadonlySet<string> | null = null): FileIssue[] {
  const ids = new Set(entries.map(({ record }) => `${record.type}:${record.id}`));
  const issues: FileIssue[] = [];
  for (const { path, record } of entries) {
    const problems = links(record)
      .filter(({ type, id }) => !ids.has(`${type}:${id}`))
      .map(({ field, type, id }) => `${field}: no ${type} with ID ${id.slice(0, 8)} is in the workspace`);
    if (stageIds && record.type === 'opportunity' && !stageIds.has(record.stageId)) {
      problems.unshift(`stageId: no stage "${record.stageId}" is in ${WORKSPACE_PATH}`);
    }
    if (problems.length > 0) issues.push({ path, code: 'broken-link', message: problems.join('; ') });
  }
  return issues;
}

function links(record: CRMRecord): { field: string; type: RecordType; id: string }[] {
  switch (record.type) {
    case 'contact':
      return record.companyId ? [{ field: 'companyId', type: 'company', id: record.companyId }] : [];
    case 'company':
      return [];
    case 'opportunity':
      return [
        ...(record.companyId ? [{ field: 'companyId', type: 'company' as const, id: record.companyId }] : []),
        ...record.contactIds.map((id) => ({ field: 'contactIds', type: 'contact' as const, id })),
      ];
    case 'task':
    case 'activity':
      return record.related ? [{ field: 'related', ...record.related }] : [];
  }
}
