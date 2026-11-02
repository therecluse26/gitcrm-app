// The app's in-memory state (ADR-012: Zustand): the connection, the snapshot, and the sync status.
// The token lives here in memory, and in localStorage only when "Remember on this device" is on.
// main is checked on page load, on Refresh, and in the background when a tab gains focus (docs/04).
import { create } from 'zustand';
import { assessRepository, describeConnectError, inspectRepository, type Access } from '../auth/connect.ts';
import { forgetConnection, readSavedConnection, saveConnection, type SavedConnection } from '../auth/credentials.ts';
import { applyTheme, forgetTheme, storedTheme, storeTheme, type Theme } from './theme.ts';
import { WORKSPACE_PATH } from '../core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../core/record-file.ts';
import type { CRMRecord, WorkspaceConfig } from '../core/schemas.ts';
import { newWorkspaceConfig } from '../core/workspace.ts';
import { DEFAULT_LIST_VIEW, type ListView } from '../features/list-query.ts';
import { changeView } from '../features/list-page.ts';
import { DEFAULT_PIPELINE_VIEW, type PipelineView } from '../features/opportunities/pipeline.ts';
import { DEFAULT_TASK_VIEW, type TaskView } from '../features/tasks/task-list.ts';
import { DEFAULT_SEARCH_VIEW, type SearchView } from '../search/search.ts';
import { createGitHubClient, GitHubError, type GitHubClient } from '../storage/github-client.ts';
import { createGitHubWorkspace } from '../storage/github-workspace.ts';
import { stateForError, type OperationState } from '../storage/operation-state.ts';
import { ConflictError } from '../storage/errors.ts';
import { createRecordCache } from '../storage/record-cache.ts';
import { keepUnchanged, snapshotFromFiles, type CachedFile, type SnapshotFiles } from '../storage/snapshot.ts';
import type { DeletePlan, VersionedRecord, WorkspaceRepository, WorkspaceSnapshot } from '../storage/workspace-repository.ts';
import { backgroundCheck } from './background-check.ts';
import { joinTabs, type TabMessage, type Tabs } from './tabs.ts';

export type Screen =
  | { name: 'starting' }
  | { name: 'connect'; problem: string | null; busy: boolean }
  | { name: 'initialize' }
  | { name: 'blocked'; problem: string }
  | { name: 'ready' };

export type Credentials = SavedConnection & { remember: boolean };

// What the connect checks found. Null until they pass, so writes stay disabled while a page loads.
type Session = {
  login: string;
  branch: string;
  access: Exclude<Access, { kind: 'refused' }>;
  client: GitHubClient;
  workspace: WorkspaceRepository;
};

export type AppState = {
  screen: Screen;
  repoName: string; // owner/repo
  credentials: Credentials | null;
  session: Session | null;
  snapshot: WorkspaceSnapshot | null;
  files: SnapshotFiles | null; // what the record cache holds
  sync: OperationState;
  saving: boolean; // one write at a time (docs/04: keep mutating calls serialized)
  lastSave: { action: 'Saved' | 'Deleted'; commitSha: string | null } | null;
  checksPaused: boolean; // background checks skipped: fewer than 500 REST requests left (ADR-023)
  // List filters stay in memory, not in the URL: browsers keep URLs in history, and some sync it.
  lists: Record<'contact' | 'company', ListView>;
  pipeline: PipelineView;
  tasks: TaskView;
  search: SearchView;
  theme: Theme;
  start(): Promise<void>;
  connect(credentials: Credentials): Promise<void>;
  refresh(): Promise<void>;
  initialize(input: { name: string; defaultCurrency: string }): Promise<void>;
  // Creates the record when expectedBlobSha is null; otherwise updates it from that version.
  saveRecord<R extends CRMRecord>(record: R, expectedBlobSha: string | null): Promise<VersionedRecord<R>>;
  // Updates .gitcrm/workspace.json from the version with that blob SHA, in one commit.
  saveWorkspace(config: WorkspaceConfig, expectedBlobSha: string): Promise<void>;
  // Deletes the records and rewrites the linking ones in one commit (ADR-021).
  deleteRecords(plan: DeletePlan): Promise<void>;
  setListView(type: keyof AppState['lists'], changes: Partial<ListView>): void;
  setPipelineView(changes: Partial<PipelineView>): void;
  setTaskView(changes: Partial<TaskView>): void;
  setSearchView(changes: Partial<SearchView>): void;
  // Applies at once; stored on this device only while the connection is remembered (spec 12).
  setTheme(theme: Theme): void;
  tabFocused(): void;
  disconnect(): Promise<void>;
};

// Saves need a write-capable token and a finished sync (docs/04, "Page load with a cached snapshot").
export const selectCanWrite = (state: AppState) => state.session?.access.kind === 'write' && state.sync.status === 'loaded' && !state.saving;
// Nothing can be saved until a refresh succeeds: a read-only token, or cached records shown after a failed sync.
export const selectReadOnly = (state: AppState) => state.session?.access.kind === 'read-only' || 'message' in state.sync;

class RefusedError extends Error {}

const cache = createRecordCache();
const cacheKey = ({ owner, repo }: { owner: string; repo: string }) => `${owner}/${repo}`.toLowerCase();
const cleared = {
  session: null,
  snapshot: null,
  files: null,
  sync: { status: 'idle' },
  saving: false,
  lastSave: null,
  checksPaused: false,
  lists: { contact: DEFAULT_LIST_VIEW, company: DEFAULT_LIST_VIEW },
  pipeline: DEFAULT_PIPELINE_VIEW,
  tasks: DEFAULT_TASK_VIEW,
  search: DEFAULT_SEARCH_VIEW,
} satisfies Partial<AppState>;
let started = false; // StrictMode runs effects twice in development
// One client per token, kept across refreshes, so a wait that GitHub asked for still holds.
let api: { token: string; client: GitHubClient } | null = null;
let tabs: Tabs | null = null;
let lastCheckAt: number | null = null; // when this tab last read main

function clientFor(token: string): GitHubClient {
  if (api?.token !== token) api = { token, client: createGitHubClient(token) };
  return api.client;
}

export const useApp = create<AppState>()((set, get) => {
  // `persist` is false for files from another tab, which wrote the record cache itself.
  function show(next: WorkspaceSnapshot, files: SnapshotFiles, persist = true) {
    const snapshot = keepUnchanged(next, get().snapshot);
    set({ snapshot, files, sync: { status: 'loaded' }, screen: screenFor(snapshot) });
    if (persist && get().credentials?.remember) void cache.write(cacheKey(get().credentials!), files);
  }

  // The connect checks (docs/05), then main, reusing the cached files.
  async function establish(credentials: Credentials, cached: SnapshotFiles | null) {
    lastCheckAt = Date.now();
    const client = clientFor(credentials.token);
    const check = await inspectRepository(client, credentials.owner, credentials.repo);
    const access = assessRepository(check);
    if (access.kind === 'refused') throw new RefusedError(access.message);
    const workspace = createGitHubWorkspace({ client, owner: credentials.owner, repo: credentials.repo, branch: check.defaultBranch });
    const loaded = await workspace.loadWorkspace(cached ?? undefined);
    set({ session: { login: check.login, branch: check.defaultBranch, access, client, workspace } });
    show(loaded.snapshot, loaded.files);
    const key = cacheKey(credentials);
    if (tabs?.key !== key) {
      tabs?.close();
      tabs = joinTabs(key, receive);
    }
  }

  // A background check of main, then its result for the other tabs (ADR-023), sent also when
  // the check was skipped: that is the answer a tab waits for.
  async function checkMain() {
    const moved = await readMain();
    tabs?.send({ type: 'checked', files: moved, paused: get().checksPaused });
  }

  // Reads main only, so an unmoved main costs one request; the connect checks run on page load
  // and Refresh. Returns the new files when main moved.
  async function readMain(): Promise<SnapshotFiles | null> {
    const { session, files, saving, sync } = get();
    if (!session || !files || saving || sync.status === 'loading') return null;
    const decision = backgroundCheck(Date.now(), lastCheckAt, session.client.limits());
    if (decision === 'low-budget') set({ checksPaused: true });
    if (decision !== 'run') return null;
    lastCheckAt = Date.now();
    try {
      const loaded = await session.workspace.loadWorkspace(files);
      // A save, a refresh, or another tab changed the records meanwhile, so they are newer.
      if (get().session !== session || get().files !== files) return null;
      set({ checksPaused: false });
      const moved = loaded.files !== files;
      if (moved || get().sync.status !== 'loaded') show(loaded.snapshot, loaded.files);
      return moved ? loaded.files : null;
    } catch {
      // Main alone cannot tell lost access from an outage or an empty branch; the connect checks can.
      if (get().session === session) await get().refresh();
      return null;
    }
  }

  function receive(message: TabMessage) {
    if (message.type === 'disconnected') return signOut();
    if (message.type === 'check') {
      if (tabs?.leading()) void checkMain();
      return;
    }
    set({ checksPaused: message.paused });
    if (message.files && get().session && !get().saving) show(snapshotFromFiles(message.files), message.files, false);
  }

  // One write at a time (docs/04: keep mutating calls serialized). `changes` are the files the
  // write left on main, for the snapshot and the record cache: null for a deleted file.
  async function write<T extends { commitSha: string | null }>(
    action: 'Saved' | 'Deleted',
    run: (workspace: WorkspaceRepository) => Promise<T>,
    changes: (saved: T) => [path: string, file: CachedFile | null][],
  ): Promise<T> {
    const { session } = get();
    if (!session || !selectCanWrite(get())) throw new Error('GitCRM cannot save right now');
    set({ saving: true });
    let saved: T;
    try {
      saved = await run(session.workspace);
    } catch (error) {
      set({ saving: false });
      // GitHub has a newer version: load it for the rest of the app (ARCHITECTURE, "Write path").
      // The form keeps its own copy, so the user's changes stay.
      if (error instanceof ConflictError && get().session === session) void get().refresh();
      throw error;
    }
    set({ saving: false });
    if (get().session !== session) return saved; // disconnected while saving
    // main may now hold other people's commits too, so the next load compares blob SHAs (docs/04).
    const next: SnapshotFiles = { commitSha: null, files: new Map(get().files?.files) };
    for (const [path, file] of changes(saved)) {
      if (file) next.files.set(path, file);
      else next.files.delete(path);
    }
    show(snapshotFromFiles(next), next);
    set({ lastSave: { action, commitSha: saved.commitSha } });
    return saved;
  }

  // Leaves the workspace: no records on screen, and no part in the tab sync.
  function leave(next: Partial<AppState>) {
    tabs?.close();
    tabs = null;
    lastCheckAt = null;
    set({ ...cleared, ...next });
  }

  // Forgets the token in memory too. The stored token and the cache are already gone.
  function signOut() {
    api = null;
    forgetTheme();
    applyTheme('dark');
    set({ theme: 'dark' });
    leave({ credentials: null, repoName: '', screen: { name: 'connect', problem: null, busy: false } });
  }

  // What a failed connect, page load, or refresh leaves on screen.
  function fail(error: unknown, from: 'connect' | 'load') {
    const problem = error instanceof RefusedError ? error.message : describeConnectError(error, get().repoName);
    const tokenRejected = error instanceof GitHubError && (error.kind === 'unauthorized' || error.kind === 'not-found');
    if (from === 'connect' || tokenRejected) {
      if (tokenRejected) {
        forgetConnection();
        forgetTheme();
        api = null;
      }
      leave({ credentials: null, screen: { name: 'connect', problem, busy: false } });
    } else if (!(error instanceof RefusedError) && get().snapshot) {
      // GitHub is unreachable or slowing us down: keep the records on screen, read-only (ARCHITECTURE, "Offline model").
      set({ sync: stateForError(error) });
    } else {
      // A refusal here means the repo turned public: stop showing its records.
      leave({ screen: { name: 'blocked', problem } });
    }
  }

  return {
    screen: { name: 'starting' },
    repoName: '',
    credentials: null,
    ...cleared,
    theme: storedTheme(),

    async start() {
      if (started) return;
      started = true;
      const saved = readSavedConnection();
      if (!saved) return set({ screen: { name: 'connect', problem: null, busy: false } });
      const credentials = { ...saved, remember: true };
      set({ credentials, repoName: `${saved.owner}/${saved.repo}` });
      const cached = await cache.read(cacheKey(saved));
      if (cached) {
        const snapshot = snapshotFromFiles(cached);
        if (snapshot.workspace) set({ snapshot, files: cached, sync: { status: 'loading' }, screen: { name: 'ready' } });
      }
      try {
        await establish(credentials, cached);
      } catch (error) {
        fail(error, 'load');
      }
    },

    async connect(credentials) {
      leave({ credentials, repoName: `${credentials.owner}/${credentials.repo}`, screen: { name: 'connect', problem: null, busy: true } });
      try {
        if (!credentials.remember) {
          // A shared computer: store nothing in this browser.
          forgetConnection();
          forgetTheme();
          await cache.clear();
        }
        await establish(credentials, credentials.remember ? await cache.read(cacheKey(credentials)) : null);
        if (credentials.remember) {
          saveConnection({ owner: credentials.owner, repo: credentials.repo, token: credentials.token });
          storeTheme(get().theme);
        }
      } catch (error) {
        fail(error, 'connect');
      }
    },

    async refresh() {
      const { credentials, files } = get();
      if (!credentials || get().saving) return;
      set({ sync: { status: 'loading' }, lastSave: null });
      try {
        await establish(credentials, files);
      } catch (error) {
        fail(error, 'load');
      }
    },

    async initialize(input) {
      const { session, files } = get();
      if (session?.access.kind !== 'write') throw new Error('This token cannot write to the repository');
      const config = newWorkspaceConfig(input);
      const saved = await session.workspace.writeWorkspace(config, null);
      const next: SnapshotFiles = {
        commitSha: null,
        files: new Map(files?.files).set(WORKSPACE_PATH, { blobSha: saved.blobSha, text: serializeWorkspace(config), isTruncated: false }),
      };
      show(snapshotFromFiles(next), next);
    },

    saveRecord(record, expectedBlobSha) {
      return write(
        'Saved',
        (workspace) => (expectedBlobSha === null ? workspace.createRecord(record) : workspace.updateRecord(record, expectedBlobSha)),
        (saved) => [[saved.path, { blobSha: saved.blobSha, text: serializeRecord(record), isTruncated: false }]],
      );
    },

    async saveWorkspace(config, expectedBlobSha) {
      await write(
        'Saved',
        (workspace) => workspace.writeWorkspace(config, expectedBlobSha),
        (saved) => [[WORKSPACE_PATH, { blobSha: saved.blobSha, text: serializeWorkspace(config), isTruncated: false }]],
      );
    },

    async deleteRecords(plan) {
      await write(
        'Deleted',
        (workspace) => workspace.deleteWithCascade(plan),
        ({ rewritten }) => [
          ...plan.deletes.map(({ path }): [string, null] => [path, null]),
          ...rewritten.map(({ path, blobSha, record }): [string, CachedFile] => [path, { blobSha, text: serializeRecord(record), isTruncated: false }]),
        ],
      );
    },

    setListView(type, changes) {
      set({ lists: { ...get().lists, [type]: changeView(get().lists[type], changes) } });
    },

    setPipelineView(changes) {
      set({ pipeline: changeView(get().pipeline, changes) });
    },

    setTaskView(changes) {
      set({ tasks: changeView(get().tasks, changes) });
    },

    setSearchView(changes) {
      set({ search: changeView(get().search, changes) });
    },

    setTheme(theme) {
      applyTheme(theme);
      set({ theme });
      if (get().credentials?.remember) storeTheme(theme);
    },

    tabFocused() {
      if (tabs && !tabs.leading()) tabs.ask(() => void checkMain());
      else void checkMain();
    },

    async disconnect() {
      forgetConnection();
      await cache.clear();
      tabs?.send({ type: 'disconnected' });
      signOut();
    },
  };
});

function screenFor(snapshot: WorkspaceSnapshot): Screen {
  const issue = snapshot.issues.find((i) => i.path === WORKSPACE_PATH);
  if (issue?.code === 'unsupported-version') {
    return { name: 'blocked', problem: 'A newer version of GitCRM set up this workspace. Open it with that version; this one will not change it.' };
  }
  if (issue) return { name: 'blocked', problem: `The workspace settings file, ${WORKSPACE_PATH}, is invalid: ${issue.message}. Fix it in the repository; GitCRM will not overwrite it.` };
  return snapshot.workspace ? { name: 'ready' } : { name: 'initialize' };
}
