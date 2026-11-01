// S-02 checks, shared by p0-crud.html (browser) and run-node.js (Node 18+).
// Writes only under spike/ in a private repo named gitcrm-spike*, and removes those files at the end.

function client(token) {
  const inBrowser = typeof document !== 'undefined';
  return async function gh(method, path, body) {
    const started = performance.now();
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      ...(inBrowser && { cache: 'no-store' }),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return { status: res.status, json, ms: Math.round(performance.now() - started), rateRemaining: res.headers.get('x-ratelimit-remaining') };
  };
}

const toBase64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const fromBase64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const doc = (n) => JSON.stringify({ spike: 'p0-crud', n, at: new Date().toISOString() }, null, 2) + '\n';

async function headCommit(gh, base, branch) {
  const ref = await gh('GET', `${base}/git/ref/heads/${branch}`);
  const commit = await gh('GET', `${base}/git/commits/${ref.json.object.sha}`);
  return { sha: ref.json.object.sha, tree: commit.json.tree.sha };
}

// Trees + commits + non-forced ref update: the ADR-021 delete path.
async function multiFileCommit(gh, base, branch, entries, message) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const head = await headCommit(gh, base, branch);
  const tree = await gh('POST', `${base}/git/trees`, { base_tree: head.tree, tree: entries });
  if (tree.status !== 201) return { ok: false, detail: `trees status ${tree.status}: ${tree.json?.message}`, ms: elapsed() };
  const commit = await gh('POST', `${base}/git/commits`, { message, tree: tree.json.sha, parents: [head.sha] });
  if (commit.status !== 201) return { ok: false, detail: `commits status ${commit.status}: ${commit.json?.message}`, ms: elapsed() };
  const ref = await gh('PATCH', `${base}/git/refs/heads/${branch}`, { sha: commit.json.sha, force: false });
  return { ok: ref.status === 200, detail: `ref status ${ref.status}${ref.json?.message ? `: ${ref.json.message}` : ''}`, ms: elapsed() };
}

async function checkWrites(gh, record, owner, repo, base, branch) {
  const pathA = `spike/${crypto.randomUUID()}.json`;
  const created = await gh('PUT', `${base}/contents/${pathA}`, { message: 'spike: create', content: toBase64(doc(1)), branch });
  record('Create file (Contents PUT, no sha)', created.status === 201, `status ${created.status}`, created.ms);
  if (created.status !== 201) return;
  const shaV1 = created.json.content.sha;

  const read = await gh('GET', `${base}/contents/${pathA}?ref=${encodeURIComponent(branch)}`);
  const readOk = read.status === 200 && read.json.sha === shaV1 && JSON.parse(fromBase64(read.json.content)).n === 1;
  record('Read file back', readOk, `status ${read.status}`, read.ms);

  const updated = await gh('PUT', `${base}/contents/${pathA}`, { message: 'spike: update', content: toBase64(doc(2)), sha: shaV1, branch });
  record('Update with current blob SHA', updated.status === 200, `status ${updated.status}`, updated.ms);

  const stale = await gh('PUT', `${base}/contents/${pathA}`, { message: 'spike: stale update', content: toBase64(doc(3)), sha: shaV1, branch });
  record('Stale blob SHA is rejected', stale.status >= 400, `status ${stale.status}: ${stale.json?.message}`, stale.ms);

  const duplicate = await gh('PUT', `${base}/contents/${pathA}`, { message: 'spike: duplicate create', content: toBase64(doc(4)), branch });
  record('Create on existing path is rejected', duplicate.status >= 400, `status ${duplicate.status}: ${duplicate.json?.message}`, duplicate.ms);

  const pathB = `spike/${crypto.randomUUID()}.json`;
  const multi = await multiFileCommit(gh, base, branch, [
    { path: pathA, mode: '100644', type: 'blob', sha: null },
    { path: pathB, mode: '100644', type: 'blob', content: doc(5) },
  ], 'spike: delete A and create B in one commit');
  record('Multi-file commit (trees + commits + non-forced ref update)', multi.ok, multi.detail, multi.ms);

  // Build a commit on the current head, move the branch, then try to land the old commit.
  const before = await headCommit(gh, base, branch);
  const tree = await gh('POST', `${base}/git/trees`, { base_tree: before.tree, tree: [{ path: `spike/${crypto.randomUUID()}.json`, mode: '100644', type: 'blob', content: doc(6) }] });
  const late = await gh('POST', `${base}/git/commits`, { message: 'spike: commit that must not land', tree: tree.json.sha, parents: [before.sha] });
  const mover = await gh('PUT', `${base}/contents/spike/${crypto.randomUUID()}.json`, { message: 'spike: move the branch', content: toBase64(doc(7)), branch });
  const forward = await gh('PATCH', `${base}/git/refs/heads/${branch}`, { sha: late.json.sha, force: false });
  record('Non-forced ref update after the branch moved is rejected', mover.status === 201 && forward.status >= 400, `status ${forward.status}: ${forward.json?.message}`, forward.ms);

  const head = await headCommit(gh, base, branch);
  const gql = await gh('POST', '/graphql', {
    query: 'query($owner: String!, $name: String!, $expr: String!) { repository(owner: $owner, name: $name) { object(expression: $expr) { ... on Tree { entries { name oid object { ... on Blob { text } } } } } } }',
    variables: { owner, name: repo, expr: `${head.sha}:spike` },
  });
  const entries = gql.json?.data?.repository?.object?.entries ?? [];
  const fileB = entries.find((e) => `spike/${e.name}` === pathB);
  const gqlOk = gql.status === 200 && !gql.json?.errors && fileB && JSON.parse(fileB.object.text).n === 5;
  record('GraphQL tree walk returns file text and blob SHA', Boolean(gqlOk), `status ${gql.status}, entries ${entries.length}${gql.json?.errors ? `, errors: ${JSON.stringify(gql.json.errors)}` : ''}`, gql.ms);
}

async function cleanUp(gh, record, base, branch) {
  const listing = await gh('GET', `${base}/contents/spike?ref=${encodeURIComponent(branch)}`);
  const files = Array.isArray(listing.json) ? listing.json : [];
  if (files.length === 0) return record('Clean up spike files', true, 'nothing to clean');
  const cleanup = await multiFileCommit(gh, base, branch, files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: null })), 'spike: clean up');
  record('Clean up spike files', cleanup.ok, `${files.length} files, ${cleanup.detail}`, cleanup.ms);
}

// record(name, ok, detail, ms) receives each result.
export async function runChecks({ token, owner, repo, record }) {
  if (!owner || !repo?.startsWith('gitcrm-spike')) {
    return record('Guard: repo name starts with gitcrm-spike', false, 'refusing to run');
  }
  const gh = client(token);
  const base = `/repos/${owner}/${repo}`;

  const user = await gh('GET', '/user');
  record('GET /user', user.status === 200, `status ${user.status}, login ${user.json?.login}`, user.ms);
  if (user.status !== 200) return;

  const meta = await gh('GET', base);
  record('GET repo', meta.status === 200, `status ${meta.status}`, meta.ms);
  if (meta.status !== 200) return;
  const info = meta.json;
  record('Repo is private', info.private === true, `private=${info.private}`);
  if (info.private !== true) return;
  record('Default branch readable', Boolean(info.default_branch), `default_branch=${info.default_branch}, owner.type=${info.owner?.type}, permissions=${JSON.stringify(info.permissions)}`);
  record('Rate-limit header visible', meta.rateRemaining !== null, `x-ratelimit-remaining=${meta.rateRemaining}`);

  // An unreferenced blob changes no branch: a candidate connect-time check for write access (S-08).
  const probe = await gh('POST', `${base}/git/blobs`, { content: 'gitcrm write check', encoding: 'utf-8' });
  record('Write check: POST git/blobs', probe.status === 201, `status ${probe.status}${probe.json?.message ? `: ${probe.json.message}` : ''}`, probe.ms);

  const branch = info.default_branch;
  try {
    await checkWrites(gh, record, owner, repo, base, branch);
  } finally {
    await cleanUp(gh, record, base, branch);
  }
}
