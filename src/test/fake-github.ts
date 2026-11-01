// An in-memory GitHub for tests: one repo with one branch, and only the endpoints GitCRM calls.
// Responses follow what the spikes recorded (S-02, S-08, S-09). Blob SHAs are real Git SHAs;
// tree and commit SHAs are opaque counters. handle() takes a Fetch Request, so MSW (Vitest)
// and page.route (Playwright) can both serve it.
import { base64ToUtf8, gitBlobSha, utf8ToBase64 } from '../storage/encoding.ts';

type Files = Map<string, string>; // path -> blob SHA
type Commit = { tree: string; parent: string | null; message: string };
type Fault =
  | { respond: { status: number; body?: unknown; headers?: Record<string, string> } }
  | { network: 'before' | 'after' } // 'after' applies the request, then loses the response
  | { run: () => Promise<void> }; // runs before the request, for example another user's save

export type FakeGitHubOptions = {
  token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  private?: boolean;
  archived?: boolean;
  canWrite?: boolean; // false: a token with Contents read-only
  empty?: boolean; // a repo with no commits, until a Contents API PUT makes the first one
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'x-ratelimit-remaining, x-ratelimit-reset, retry-after',
};

export class FakeGitHub {
  token: string; // tests change it to revoke the token
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  private: boolean;
  archived: boolean;
  canWrite: boolean;
  empty: boolean;
  truncateTrees = false;
  // The REST budget each answer reports (ADR-023); tests lower it. Faults send their own headers.
  rateRemaining = 4999;
  rateReset = Math.floor(Date.now() / 1000) + 3600;
  head: string;
  readonly requests: { method: string; path: string; body: unknown }[] = [];

  private readonly blobs = new Map<string, string>();
  private readonly trees = new Map<string, Files>();
  private readonly commits = new Map<string, Commit>();
  private readonly faults: { method: string; path: RegExp; fault: Fault }[] = [];
  private counter = 0;

  constructor(options: FakeGitHubOptions = {}) {
    this.token = options.token ?? 'test-token';
    this.owner = options.owner ?? 'octo-dev';
    this.repo = options.repo ?? 'crm';
    this.branch = options.branch ?? 'main';
    this.private = options.private ?? true;
    this.archived = options.archived ?? false;
    this.canWrite = options.canWrite ?? true;
    this.empty = options.empty ?? false;
    const tree = this.newTree(new Map());
    this.head = this.newCommit({ tree, parent: null, message: 'Initial commit' });
  }

  // --- Test helpers ---

  // Commits a file directly, as another user or a hand edit would. Returns the blob SHA.
  async seed(path: string, text: string): Promise<string> {
    const sha = await this.storeBlob(text);
    this.commitFiles((files) => files.set(path, sha), `seed ${path}`);
    return sha;
  }

  remove(path: string): void {
    this.commitFiles((files) => files.delete(path), `remove ${path}`);
  }

  file(path: string): string | undefined {
    const sha = this.headFiles().get(path);
    return sha === undefined ? undefined : this.blobs.get(sha);
  }

  paths(): string[] {
    return [...this.headFiles().keys()].sort();
  }

  commitCount(): number {
    if (this.empty) return 0;
    let count = 0;
    for (let sha: string | null = this.head; sha; sha = this.commits.get(sha)!.parent) count += 1;
    return count;
  }

  lastCommitMessage(): string {
    return this.commits.get(this.head)!.message;
  }

  // The next request that matches gets this fault, once.
  failNext(method: string, path: RegExp, fault: Fault): void {
    this.faults.push({ method, path, fault });
  }

  count(method: string, path?: RegExp): number {
    return this.requests.filter((r) => r.method === method && (!path || path.test(r.path))).length;
  }

  // --- Request handling ---

  async handle(request: Request): Promise<Response | 'network-error'> {
    const url = new URL(request.url);
    const method = request.method;
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...CORS, 'access-control-allow-headers': 'authorization, content-type, x-github-api-version', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE' },
      });
    }
    const body = request.body ? await request.json() : undefined;
    this.requests.push({ method, path: url.pathname, body });

    const index = this.faults.findIndex((f) => f.method === method && f.path.test(url.pathname));
    const fault = index === -1 ? undefined : this.faults.splice(index, 1)[0].fault;
    if (fault && 'respond' in fault) return json(fault.respond.status, fault.respond.body ?? {}, fault.respond.headers);
    if (fault && 'network' in fault && fault.network === 'before') return 'network-error';
    if (fault && 'run' in fault) await fault.run();

    const response = await this.route(method, url, body, request.headers.get('authorization'));
    response.headers.set('x-ratelimit-remaining', String(this.rateRemaining));
    response.headers.set('x-ratelimit-reset', String(this.rateReset));
    return fault && 'network' in fault ? 'network-error' : response;
  }

  private async route(method: string, url: URL, body: any, authorization: string | null): Promise<Response> {
    if (authorization !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' });
    const path = url.pathname;
    if (method === 'GET' && path === '/user') return json(200, { login: this.owner });
    if (method === 'POST' && path === '/graphql') return this.graphql(body);

    const base = `/repos/${this.owner}/${this.repo}`;
    if (path !== base && !path.startsWith(`${base}/`)) return json(404, { message: 'Not Found' });
    const rest = path.slice(base.length);
    const write = method !== 'GET';
    if (write && this.archived) return json(403, { message: 'Repository was archived so is read-only.' });
    if (write && !this.canWrite) return json(403, { message: 'Resource not accessible by personal access token' });

    // S-09: an empty repo answers the Git data API with 409, and a Contents API read with 404.
    if (this.empty && rest.startsWith('/git/')) return json(409, { message: 'Git Repository is empty.' });
    if (this.empty && method === 'GET' && rest.startsWith('/contents/')) return json(404, { message: 'This repository is empty.' });

    let match: RegExpMatchArray | null;
    if (method === 'GET' && rest === '') {
      return json(200, {
        full_name: `${this.owner}/${this.repo}`,
        private: this.private,
        archived: this.archived,
        default_branch: this.branch,
        owner: { login: this.owner, type: 'User' },
        // The user's role on the repo, not the token's permissions (S-02).
        permissions: { admin: true, push: true, pull: true },
      });
    }
    if (method === 'POST' && rest === '/git/blobs') {
      const text = body.encoding === 'base64' ? base64ToUtf8(body.content) : body.content;
      return json(201, { sha: await this.storeBlob(text) });
    }
    if (method === 'GET' && (match = rest.match(/^\/git\/blobs\/([0-9a-f]{40})$/))) {
      const text = this.blobs.get(match[1]);
      if (text === undefined) return json(404, { message: 'Not Found' });
      return json(200, { sha: match[1], size: new TextEncoder().encode(text).length, encoding: 'base64', content: utf8ToBase64(text).replace(/.{60}/g, '$&\n') });
    }
    if ((match = rest.match(/^\/contents\/(.+)$/))) {
      const filePath = decodeURIComponent(match[1]);
      if (method === 'GET') return this.getContents(filePath, url.searchParams.get('ref') ?? this.branch);
      if (method === 'PUT') return this.putContents(filePath, body);
    }
    if (method === 'GET' && (match = rest.match(/^\/git\/ref\/heads\/(.+)$/))) {
      if (match[1] !== this.branch) return json(404, { message: 'Not Found' });
      return json(200, { ref: `refs/heads/${this.branch}`, object: { type: 'commit', sha: this.head } });
    }
    if (method === 'GET' && (match = rest.match(/^\/git\/commits\/([0-9a-f]+)$/))) {
      const commit = this.commits.get(match[1]);
      if (!commit) return json(404, { message: 'Not Found' });
      return json(200, { sha: match[1], tree: { sha: commit.tree }, parents: commit.parent ? [{ sha: commit.parent }] : [], message: commit.message });
    }
    if (method === 'GET' && (match = rest.match(/^\/git\/trees\/([0-9a-f]+)$/))) {
      const files = this.trees.get(match[1]);
      if (!files) return json(404, { message: 'Not Found' });
      return json(200, { sha: match[1], truncated: this.truncateTrees, tree: treeEntries(files) });
    }
    if (method === 'POST' && rest === '/git/trees') return this.postTree(body);
    if (method === 'POST' && rest === '/git/commits') {
      if (!this.trees.has(body.tree) || body.parents.length !== 1 || !this.commits.has(body.parents[0])) return json(422, { message: 'Invalid request.' });
      return json(201, { sha: this.newCommit({ tree: body.tree, parent: body.parents[0], message: body.message }) });
    }
    if (method === 'PATCH' && (match = rest.match(/^\/git\/refs\/heads\/(.+)$/))) {
      if (match[1] !== this.branch || !this.commits.has(body.sha)) return json(422, { message: 'Reference does not exist' });
      if (!body.force && !this.descendsFromHead(body.sha)) return json(422, { message: 'Update is not a fast forward' });
      this.head = body.sha;
      return json(200, { ref: `refs/heads/${this.branch}`, object: { type: 'commit', sha: this.head } });
    }
    return json(404, { message: 'Not Found' });
  }

  private getContents(filePath: string, ref: string): Response {
    const commit = ref === this.branch ? this.head : ref;
    const files = this.commits.has(commit) ? this.trees.get(this.commits.get(commit)!.tree)! : undefined;
    const sha = files?.get(filePath);
    if (sha === undefined) return json(404, { message: 'Not Found' });
    // GitHub wraps the Base64 content at 60 characters.
    const content = utf8ToBase64(this.blobs.get(sha)!).replace(/.{60}/g, '$&\n');
    return json(200, { type: 'file', path: filePath, sha, size: new TextEncoder().encode(this.blobs.get(sha)!).length, encoding: 'base64', content });
  }

  private async putContents(filePath: string, body: any): Promise<Response> {
    if (body.branch !== this.branch) return json(404, { message: 'Branch not found' });
    const existing = this.headFiles().get(filePath);
    if (existing !== undefined && body.sha === undefined) return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
    // S-02 recorded 409 for a stale SHA. Unverified: GitHub's answer when the SHA names a deleted file.
    if (body.sha !== undefined && body.sha !== existing) return json(409, { message: `${filePath} does not match ${body.sha}` });
    const sha = await this.storeBlob(base64ToUtf8(body.content));
    // Unverified: a fine-grained PAT's PUT to an empty repo (S-09). Here it makes the first commit.
    if (this.empty) {
      this.empty = false;
      this.head = this.newCommit({ tree: this.newTree(new Map([[filePath, sha]])), parent: null, message: body.message });
      return json(201, { content: { path: filePath, sha }, commit: { sha: this.head } });
    }
    const commit = this.commitFiles((files) => files.set(filePath, sha), body.message);
    return json(existing === undefined ? 201 : 200, { content: { path: filePath, sha }, commit: { sha: commit } });
  }

  private async postTree(body: any): Promise<Response> {
    const baseFiles = this.trees.get(body.base_tree);
    if (!baseFiles) return json(422, { message: 'Invalid request.' });
    const files = new Map(baseFiles);
    for (const entry of body.tree) {
      if (entry.sha === null) files.delete(entry.path);
      else if (typeof entry.content === 'string') files.set(entry.path, await this.storeBlob(entry.content));
      else files.set(entry.path, entry.sha);
    }
    return json(201, { sha: this.newTree(files) });
  }

  // Serves the chunked tree walk (ADR-022): aliases of the form `d0: object(expression: $e0)`.
  private graphql(body: { query: string; variables: Record<string, string> }): Response {
    const repository: Record<string, unknown> = {};
    for (const [, alias, variable] of body.query.matchAll(/(\w+): object\(expression: \$(\w+)\)/g)) {
      const [commit, dir] = body.variables[variable].split(':');
      const files = this.commits.has(commit) ? this.trees.get(this.commits.get(commit)!.tree)! : new Map<string, string>();
      const entries = [...files]
        .filter(([path]) => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/'))
        .map(([path, sha]) => ({ name: path.slice(dir.length + 1), oid: sha, object: { text: this.blobs.get(sha), isTruncated: false } }));
      repository[alias] = entries.length ? { entries } : null;
    }
    return json(200, { data: { repository } });
  }

  // --- Git objects ---

  private headFiles(): Files {
    return this.trees.get(this.commits.get(this.head)!.tree)!;
  }

  private commitFiles(change: (files: Files) => void, message: string): string {
    const files = new Map(this.headFiles());
    change(files);
    this.head = this.newCommit({ tree: this.newTree(files), parent: this.head, message });
    return this.head;
  }

  private descendsFromHead(sha: string): boolean {
    for (let at: string | null = sha; at; at = this.commits.get(at)!.parent) if (at === this.head) return true;
    return false;
  }

  private async storeBlob(text: string): Promise<string> {
    const sha = await gitBlobSha(text);
    this.blobs.set(sha, text);
    return sha;
  }

  private newTree(files: Files): string {
    const sha = this.nextSha();
    this.trees.set(sha, files);
    return sha;
  }

  private newCommit(commit: Commit): string {
    const sha = this.nextSha();
    this.commits.set(sha, commit);
    return sha;
  }

  private nextSha(): string {
    this.counter += 1;
    return this.counter.toString(16).padStart(40, 'c');
  }
}

function treeEntries(files: Files) {
  const dirs = new Set<string>();
  for (const path of files.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  return [
    ...[...dirs].map((path) => ({ path, mode: '040000', type: 'tree', sha: '0'.repeat(40) })),
    ...[...files].map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha })),
  ].sort((a, b) => (a.path < b.path ? -1 : 1));
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4999', ...CORS, ...headers } });
}
