// Reads main into a validated in-memory snapshot with the chunked GraphQL tree walk (ADR-022).
// Every expression is pinned to one commit SHA, so all records come from the same commit.
import { customFieldIssues, fieldSets } from '../core/custom-fields.ts';
import { linkIssues } from '../core/links.ts';
import { parseRecordPath, WORKSPACE_PATH } from '../core/paths.ts';
import { parseRecordFile, parseWorkspaceFile, unrecognizedPath, type FileIssue } from '../core/record-file.ts';
import { base64ToUtf8 } from './encoding.ts';
import { SnapshotError } from './errors.ts';
import { GitHubError, type GitHubClient } from './github-client.ts';
import type { VersionedRecord, WorkspaceSnapshot } from './workspace-repository.ts';

// S-04: about 100 files per query; one query of 800 files timed out.
const FILES_PER_QUERY = 100;
const PARALLEL_QUERIES = 10;

export type RepoLocation = { owner: string; repo: string; branch: string };
type FileText = { oid: string; text: string | null; isTruncated: boolean };
type TreeResult = { entries: { name: string; oid: string; object: { text?: string | null; isTruncated?: boolean } }[] } | null;

// Every managed file (the workspace config and data/**) at one commit: what the record cache
// keeps (ADR-017). `text` is null for a file that is not read as text: binary, cut off by GitHub,
// or outside the record layout. `commitSha` is null when the files may not match one commit,
// as after a save; the next load then compares blob SHAs instead.
export type CachedFile = { blobSha: string; text: string | null; isTruncated: boolean };
export type SnapshotFiles = { commitSha: string | null; files: Map<string, CachedFile> };

export function repoPath({ owner, repo }: RepoLocation): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function readRef(client: GitHubClient, location: RepoLocation): Promise<string> {
  const branch = location.branch.split('/').map(encodeURIComponent).join('/');
  const ref = await client.rest<{ object: { sha: string } }>('GET', `${repoPath(location)}/git/ref/heads/${branch}`);
  return ref.object.sha;
}

export async function readHead(client: GitHubClient, location: RepoLocation): Promise<{ sha: string; tree: string }> {
  const sha = await readRef(client, location);
  const commit = await client.rest<{ tree: { sha: string } }>('GET', `${repoPath(location)}/git/commits/${sha}`);
  return { sha, tree: commit.tree.sha };
}

// Every file on main: path -> blob SHA.
export async function readTree(client: GitHubClient, location: RepoLocation, treeSha: string): Promise<Map<string, string>> {
  const tree = await client.rest<{ truncated: boolean; tree: { path: string; type: string; sha: string }[] }>(
    'GET',
    `${repoPath(location)}/git/trees/${treeSha}?recursive=1`,
  );
  // GitHub cuts off very large trees; reading on would silently omit records.
  if (tree.truncated) throw new SnapshotError('The repository tree is too large to read in one request, so GitCRM cannot load every record');
  return new Map(tree.tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry.sha]));
}

// Loads main. With a cached snapshot, an unmoved main costs one request, and otherwise only
// files whose blob SHA changed are downloaded (docs/04, "Page load with a cached snapshot").
export async function loadSnapshot(client: GitHubClient, location: RepoLocation, cached?: SnapshotFiles): Promise<{ snapshot: WorkspaceSnapshot; files: SnapshotFiles }> {
  let commitSha: string;
  try {
    commitSha = await readRef(client, location);
  } catch (error) {
    // An empty repo answers with 409 "Git Repository is empty." (S-09): no workspace and no
    // records yet, so Connect offers Initialize. The same empty files again keep the cached object.
    if (error instanceof GitHubError && error.kind === 'conflict') {
      const files = cached?.commitSha === null && cached.files.size === 0 ? cached : { commitSha: null, files: new Map<string, CachedFile>() };
      return { snapshot: buildSnapshot(null, files.files), files };
    }
    if (error instanceof GitHubError && error.kind === 'not-found') {
      throw new SnapshotError('The default branch has no commits yet. Add a file on GitHub, such as a README, then connect again.');
    }
    throw error;
  }
  if (cached && cached.commitSha === commitSha) return { snapshot: buildSnapshot(commitSha, cached.files), files: cached };

  const commit = await client.rest<{ tree: { sha: string } }>('GET', `${repoPath(location)}/git/commits/${commitSha}`);
  const tree = await readTree(client, location, commit.tree.sha);
  const files = new Map<string, CachedFile>();
  const toFetch: string[] = [];
  for (const [path, blobSha] of tree) {
    if (path !== WORKSPACE_PATH && !path.startsWith('data/')) continue;
    const known = cached?.files.get(path);
    if (known?.blobSha === blobSha) files.set(path, known);
    else if (path !== WORKSPACE_PATH && !parseRecordPath(path)) files.set(path, { blobSha, text: null, isTruncated: false });
    else toFetch.push(path);
  }

  if (toFetch.includes(WORKSPACE_PATH)) {
    const blobSha = tree.get(WORKSPACE_PATH)!;
    const blob = await client.rest<{ content: string }>('GET', `${repoPath(location)}/git/blobs/${blobSha}`);
    files.set(WORKSPACE_PATH, { blobSha, text: base64ToUtf8(blob.content), isTruncated: false });
  }
  const recordPaths = toFetch.filter((path) => path !== WORKSPACE_PATH);
  const texts = await readFiles(client, location, commitSha, recordPaths);
  for (const path of recordPaths) {
    const file = texts.get(path);
    if (!file || file.oid !== tree.get(path)) throw new SnapshotError(`GitHub did not return ${path}, so GitCRM cannot load every record`);
    files.set(path, { blobSha: file.oid, text: file.text, isTruncated: file.isTruncated });
  }

  return { snapshot: buildSnapshot(commitSha, files), files: { commitSha, files } };
}

// Builds a snapshot from cached files without GitHub, for example to show records while a page loads.
export function snapshotFromFiles({ commitSha, files }: SnapshotFiles): WorkspaceSnapshot {
  return buildSnapshot(commitSha, files);
}

// The next snapshot keeps the previous object of each file with the same blob SHA: the workspace
// settings and each record. So a list row with a memo draws again only when its record changed
// (docs/06). A kept record's commitSha stays the commit that it was read at.
export function keepUnchanged(next: WorkspaceSnapshot, previous: WorkspaceSnapshot | null): WorkspaceSnapshot {
  if (!previous) return next;
  const known = new Map(previous.records.map((version) => [version.path, version]));
  return {
    ...next,
    workspace: next.workspace && previous.workspace?.blobSha === next.workspace.blobSha ? previous.workspace : next.workspace,
    records: next.records.map((version) => {
      const old = known.get(version.path);
      return old?.blobSha === version.blobSha ? old : version;
    }),
  };
}

// Validates every file again, whether it came from GitHub or from the cache.
function buildSnapshot(commitSha: string | null, files: Map<string, CachedFile>): WorkspaceSnapshot {
  const issues: FileIssue[] = [];
  const records: VersionedRecord[] = [];
  let workspace: WorkspaceSnapshot['workspace'] = null;
  for (const [path, file] of files) {
    if (path === WORKSPACE_PATH) {
      const parsed = parseWorkspaceFile(file.text ?? '');
      if (parsed.ok) workspace = { config: parsed.config, blobSha: file.blobSha };
      else issues.push(parsed.issue);
    } else if (!parseRecordPath(path)) issues.push(unrecognizedPath(path));
    else if (file.isTruncated) issues.push({ path, code: 'too-large', message: 'GitHub cut this file off because it is too large' });
    else if (file.text === null) issues.push({ path, code: 'invalid-json', message: 'The file is binary, not JSON' });
    else {
      const parsed = parseRecordFile(path, file.text);
      if (parsed.ok) records.push({ record: parsed.record, path, blobSha: file.blobSha, commitSha });
      else issues.push(parsed.issue);
    }
  }
  issues.push(...linkIssues(records, workspace && new Set(workspace.config.pipelineStages.map((s) => s.id))));
  issues.push(...customFieldIssues(records, workspace && fieldSets(workspace.config)));
  // A record can have a broken-link and a custom-field issue; the sort keeps them in that order.
  const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { commitSha, workspace, records: records.sort(byPath), issues: issues.sort(byPath) };
}

async function readFiles(client: GitHubClient, location: RepoLocation, commitSha: string, paths: string[]): Promise<Map<string, FileText>> {
  const results = new Map<string, FileText>();
  const chunks = chunkByFolder(paths);
  let next = 0;
  let failed = false;

  async function worker() {
    while (!failed && next < chunks.length) {
      const dirs = chunks[next++];
      try {
        for (const [path, file] of await queryFolders(client, location, commitSha, dirs)) results.set(path, file);
      } catch (error) {
        failed = true; // stop the other workers from sending more queries
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL_QUERIES, chunks.length) }, worker));
  return results;
}

// Packs whole shard folders into chunks of about FILES_PER_QUERY files.
function chunkByFolder(paths: string[]): string[][] {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const [dir, count] of counts) {
    if (current.length > 0 && size + count > FILES_PER_QUERY) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(dir);
    size += count;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function queryFolders(client: GitHubClient, location: RepoLocation, commitSha: string, dirs: string[], retry = true): Promise<Map<string, FileText>> {
  try {
    const query = `query($owner: String!, $name: String!, ${dirs.map((_, i) => `$e${i}: String!`).join(', ')}) {
      repository(owner: $owner, name: $name) { ${dirs.map((_, i) => `d${i}: object(expression: $e${i}) { ...Files }`).join(' ')} }
    } fragment Files on Tree { entries { name oid object { ... on Blob { text isTruncated } } } }`;
    const variables = { owner: location.owner, name: location.repo, ...Object.fromEntries(dirs.map((dir, i) => [`e${i}`, `${commitSha}:${dir}`])) };
    const data = await client.graphql<{ repository: Record<string, TreeResult> }>(query, variables);
    const files = new Map<string, FileText>();
    dirs.forEach((dir, i) => {
      for (const entry of data.repository[`d${i}`]?.entries ?? []) {
        files.set(`${dir}/${entry.name}`, { oid: entry.oid, text: entry.object.text ?? null, isTruncated: entry.object.isTruncated ?? false });
      }
    });
    return files;
  } catch (error) {
    // GitHub ends a query that runs over 10 s with 502 or 504 (S-04): split it and retry once.
    const timedOut = error instanceof GitHubError && (error.status === 502 || error.status === 504);
    if (!retry || !timedOut) throw error;
    if (dirs.length === 1) return queryFolders(client, location, commitSha, dirs, false);
    const half = Math.ceil(dirs.length / 2);
    const first = await queryFolders(client, location, commitSha, dirs.slice(0, half), false);
    const second = await queryFolders(client, location, commitSha, dirs.slice(half), false);
    return new Map([...first, ...second]);
  }
}
