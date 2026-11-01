// WorkspaceRepository on GitHub. Creates and updates use the Contents API with the expected blob
// SHA; a delete is one commit through the Git Trees/Commits APIs with a non-forced ref update
// (ADR-021). Nothing retries blindly: after a lost response, main decides what happened.
import { recordPath, WORKSPACE_PATH } from '../core/paths.ts';
import { parseRecordFile, serializeRecord, serializeWorkspace } from '../core/record-file.ts';
import type { CRMRecord, RecordType } from '../core/schemas.ts';
import { base64ToUtf8, gitBlobSha, utf8ToBase64 } from './encoding.ts';
import { ConflictError, InvalidFileError, UnknownOutcomeError } from './errors.ts';
import { GitHubError, type GitHubClient } from './github-client.ts';
import { loadSnapshot, readHead, readTree, repoPath, type RepoLocation } from './snapshot.ts';
import type { DeletePlan, VersionedRecord, WorkspaceRepository } from './workspace-repository.ts';

// A delete starts again on a moved main at most this many times in total.
const DELETE_ATTEMPTS = 3;

type ContentsFile = { sha: string; content: string };
type ContentsWrite = { content: { sha: string }; commit: { sha: string } };

export function createGitHubWorkspace({ client, ...location }: RepoLocation & { client: GitHubClient }): WorkspaceRepository {
  const base = repoPath(location);
  const branchRef = location.branch.split('/').map(encodeURIComponent).join('/');

  async function currentFile(path: string): Promise<ContentsFile | null> {
    try {
      return await client.rest<ContentsFile>('GET', `${base}/contents/${path}?ref=${encodeURIComponent(location.branch)}`);
    } catch (error) {
      if (error instanceof GitHubError && error.kind === 'not-found') return null;
      throw error;
    }
  }

  function versioned(path: string, file: ContentsFile): VersionedRecord {
    const parsed = parseRecordFile(path, base64ToUtf8(file.content));
    if (!parsed.ok) throw new InvalidFileError(parsed.issue);
    return { record: parsed.record, path, blobSha: file.sha, commitSha: null };
  }

  async function readRecord(type: RecordType, id: string): Promise<VersionedRecord | null> {
    const path = recordPath(type, id);
    const file = await currentFile(path);
    return file && versioned(path, file);
  }

  // One Contents API write. expectedBlobSha is null for a create. `remote` turns main's file into
  // the version a conflict shows.
  async function writeFile(
    path: string,
    text: string,
    expectedBlobSha: string | null,
    message: string,
    remote: (path: string, file: ContentsFile) => VersionedRecord | null,
  ): Promise<{ blobSha: string; commitSha: string | null }> {
    const conflict = (file: ContentsFile | null) =>
      new ConflictError(file && remote(path, file), expectedBlobSha === null ? 'This already exists on main' : 'Someone else changed this after it was loaded');
    try {
      const result = await client.rest<ContentsWrite>('PUT', `${base}/contents/${path}`, {
        message,
        content: utf8ToBase64(text),
        branch: location.branch,
        ...(expectedBlobSha !== null && { sha: expectedBlobSha }),
      });
      return { blobSha: result.content.sha, commitSha: result.commit.sha };
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error;
      if (error.kind === 'network') {
        // The request may or may not have reached GitHub. Compare main's file with ours and with the expected one.
        let file: ContentsFile | null;
        try {
          file = await currentFile(path);
        } catch {
          throw new UnknownOutcomeError();
        }
        const remoteSha = file?.sha ?? null;
        if (remoteSha === (await gitBlobSha(text))) return { blobSha: remoteSha!, commitSha: null };
        if (remoteSha === expectedBlobSha) throw error; // the write never landed, so a retry is safe
        throw conflict(file);
      }
      if (error.kind !== 'conflict' && error.kind !== 'unprocessable') throw error;
      const file = await currentFile(path);
      // The file is as expected, so GitHub refused for another reason: pass that on.
      if ((file?.sha ?? null) === expectedBlobSha) throw error;
      throw conflict(file);
    }
  }

  async function writeRecord<R extends CRMRecord>(record: R, text: string, expectedBlobSha: string | null): Promise<VersionedRecord<R>> {
    const path = recordPath(record.type, record.id);
    const verb = expectedBlobSha === null ? 'create' : 'update';
    const saved = await writeFile(path, text, expectedBlobSha, `gitcrm: ${verb} ${record.type} ${record.id.slice(0, 8)}`, versioned);
    return { record, path, ...saved };
  }

  return {
    loadWorkspace: (cached) => loadSnapshot(client, location, cached),

    readRecord,

    async createRecord(record) {
      return writeRecord(record, serializeRecord(record), null);
    },

    async updateRecord(record, expectedBlobSha) {
      const text = serializeRecord(record);
      // Same bytes as main: nothing to commit.
      if ((await gitBlobSha(text)) === expectedBlobSha) return { record, path: recordPath(record.type, record.id), blobSha: expectedBlobSha, commitSha: null };
      return writeRecord(record, text, expectedBlobSha);
    },

    async writeWorkspace(config, expectedBlobSha) {
      const message = expectedBlobSha === null ? 'gitcrm: initialize workspace' : 'gitcrm: update workspace settings';
      const saved = await writeFile(WORKSPACE_PATH, serializeWorkspace(config), expectedBlobSha, message, () => null);
      return { config, ...saved };
    },

    async deleteWithCascade(plan: DeletePlan) {
      const message = `gitcrm: delete ${plan.target.type} ${plan.target.id.slice(0, 8)}`;
      const rewrites = plan.rewrites.map(({ record, blobSha }) => ({ record, path: recordPath(record.type, record.id), blobSha, text: serializeRecord(record) }));
      const expected = [...plan.deletes, ...rewrites];
      const entries = [
        ...plan.deletes.map(({ path }) => ({ path, mode: '100644', type: 'blob', sha: null })),
        ...rewrites.map(({ path, text }) => ({ path, mode: '100644', type: 'blob', content: text })),
      ];

      // The rewritten records, at the blob SHA of the text this delete committed.
      const rewritten = (commitSha: string) => Promise.all(rewrites.map(async ({ record, path, text }) => ({ record, path, blobSha: await gitBlobSha(text), commitSha })));

      for (let attempt = 1; ; attempt++) {
        const head = await readHead(client, location);
        const files = await readTree(client, location, head.tree);
        // Every file under data/ must be as the preview saw it: a record that changed, appeared,
        // or went may link to the target now (ADR-021: no dangling links).
        const onMain = [...files].filter(([path]) => path.startsWith('data/'));
        const moved = onMain.length !== plan.loaded.size || onMain.some(([path, blobSha]) => plan.loaded.get(path) !== blobSha);
        if (moved || expected.some(({ path, blobSha }) => files.get(path) !== blobSha)) {
          throw new ConflictError(null, 'A record in this delete changed after it was loaded. Reload, then confirm the delete again.');
        }
        const tree = await client.rest<{ sha: string }>('POST', `${base}/git/trees`, { base_tree: head.tree, tree: entries });
        const commit = await client.rest<{ sha: string }>('POST', `${base}/git/commits`, { message, tree: tree.sha, parents: [head.sha] });
        try {
          await client.rest('PATCH', `${base}/git/refs/heads/${branchRef}`, { sha: commit.sha, force: false });
          return { commitSha: commit.sha, rewritten: await rewritten(commit.sha) };
        } catch (error) {
          if (!(error instanceof GitHubError) || (error.kind !== 'network' && error.kind !== 'unprocessable')) throw error;
          if (error.kind === 'network') {
            let mainSha: string;
            try {
              mainSha = (await readHead(client, location)).sha;
            } catch {
              throw new UnknownOutcomeError();
            }
            if (mainSha === commit.sha) return { commitSha: commit.sha, rewritten: await rewritten(commit.sha) };
          }
          // 422 "Update is not a fast forward": main moved. The next attempt checks every SHA again.
          if (attempt === DELETE_ATTEMPTS) throw error;
        }
      }
    },
  };
}
