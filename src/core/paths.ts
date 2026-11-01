// The filename invariant (docs/03-REPOSITORY-LAYOUT.md): data/{pluralType}/{shard}/{uuid}.json,
// where the shard is the UUID's first two hex characters.
import type { RecordType } from './schemas.ts';

export const WORKSPACE_PATH = '.gitcrm/workspace.json';

export const FOLDERS: Record<RecordType, string> = {
  contact: 'contacts',
  company: 'companies',
  opportunity: 'opportunities',
  task: 'tasks',
  activity: 'activities',
};

const TYPES_BY_FOLDER = new Map(Object.entries(FOLDERS).map(([type, folder]) => [folder, type as RecordType]));
const RECORD_PATH = /^data\/([a-z]+)\/([0-9a-f]{2})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;

export function recordPath(type: RecordType, id: string): string {
  return `data/${FOLDERS[type]}/${id.slice(0, 2)}/${id}.json`;
}

export function parseRecordPath(path: string): { type: RecordType; id: string } | null {
  const match = RECORD_PATH.exec(path);
  if (!match) return null;
  const [, folder, shard, id] = match;
  const type = TYPES_BY_FOLDER.get(folder);
  if (!type || shard !== id.slice(0, 2)) return null;
  return { type, id };
}
