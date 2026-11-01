// The record cache (ADR-017): one IndexedDB entry per workspace, written in one transaction, so it
// always holds one coherent set of files. Storage can be unavailable (private windows, blocked
// site data); the app then loads everything from GitHub.
import { openDB, type IDBPDatabase } from 'idb';
import type { CachedFile, SnapshotFiles } from './snapshot.ts';

const DB_NAME = 'gitcrm';
const STORE = 'snapshots';
// Bump when the record schema or the cached shape changes: an old cache is then ignored.
const CACHE_VERSION = 1;

type Entry = { version: number; commitSha: string | null; files: [string, CachedFile][] };

export type RecordCache = {
  read(workspaceKey: string): Promise<SnapshotFiles | null>;
  write(workspaceKey: string, files: SnapshotFiles): Promise<void>;
  clear(): Promise<void>;
};

export function createRecordCache(): RecordCache {
  let db: Promise<IDBPDatabase> | null = null;
  const open = () => (db ??= openDB(DB_NAME, 1, { upgrade: (database) => void database.createObjectStore(STORE) }));

  return {
    async read(workspaceKey) {
      try {
        const entry = (await (await open()).get(STORE, workspaceKey)) as Entry | undefined;
        if (!entry || entry.version !== CACHE_VERSION) return null;
        return { commitSha: entry.commitSha, files: new Map(entry.files) };
      } catch {
        return null;
      }
    },
    async write(workspaceKey, { commitSha, files }) {
      try {
        const entry: Entry = { version: CACHE_VERSION, commitSha, files: [...files] };
        await (await open()).put(STORE, entry, workspaceKey);
      } catch {
        // The next page load fetches from GitHub instead.
      }
    },
    async clear() {
      try {
        await (await open()).clear(STORE);
      } catch {
        // Unavailable storage held nothing.
      }
    },
  };
}
