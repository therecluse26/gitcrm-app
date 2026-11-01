// Spike 3: compares first-load transports on branches made by gen-dataset.js. The token is never printed.
//   GITCRM_SPIKE_TOKEN=... node spikes/bench-load.js owner/repo bench-100 bench-500 bench-2000
const token = process.env.GITCRM_SPIKE_TOKEN;
const [owner, repo] = (process.argv[2] ?? '').split('/');
const branches = process.argv.slice(3);
if (!token || !repo?.startsWith('gitcrm-spike') || branches.length === 0) {
  console.error('usage: GITCRM_SPIKE_TOKEN=... node spikes/bench-load.js owner/gitcrm-spike <branch>...');
  process.exit(2);
}
const TYPES = ['companies', 'contacts', 'opportunities', 'tasks', 'activities'];
const BLOB_CONCURRENCY = 8;
// Tuning runs: BENCH_CHUNKED_ONLY=1 CHUNK_DIRS=50 CHUNK_CONCURRENCY=8 skips the slow transports.
const CHUNKED_ONLY = process.env.BENCH_CHUNKED_ONLY === '1';
const CHUNK_DIRS = Number(process.env.CHUNK_DIRS ?? 100);
const CHUNK_CONCURRENCY = Number(process.env.CHUNK_CONCURRENCY ?? 3);
const base = `/repos/${owner}/${repo}`;

async function call(method, path, body) {
  const started = performance.now();
  const res = await fetch(`https://api.github.com${path}`, {
    method,
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
  try { json = text ? JSON.parse(text) : null; } catch { /* GitHub returns an HTML page on gateway errors */ }
  return {
    status: res.status,
    json,
    bytes: Buffer.byteLength(text),
    ms: performance.now() - started,
    retryAfter: res.headers.get('retry-after'),
  };
}

const round = (ms) => Math.round(ms);

async function resolveHead(branch) {
  const ref = await call('GET', `${base}/git/ref/heads/${branch}`);
  const commit = await call('GET', `${base}/git/commits/${ref.json.object.sha}`);
  return { commit: ref.json.object.sha, tree: commit.json.tree.sha, ms: ref.ms + commit.ms };
}

const SHARDS = 'fragment Shards on Tree { entries { object { ... on Tree { entries { name oid object { ... on Blob { text } } } } } } }';

function recordsFrom(tree) {
  return (tree?.entries ?? []).flatMap((shard) => shard.object?.entries ?? []).map((file) => JSON.parse(file.object.text));
}

async function graphqlLoad(commit, types) {
  const vars = Object.fromEntries(types.map((t) => [t, `${commit}:data/${t}`]));
  const query = `query($owner: String!, $name: String!, ${types.map((t) => `$${t}: String!`).join(', ')}, $workspace: String!) {
    rateLimit { cost remaining }
    repository(owner: $owner, name: $name) {
      workspace: object(expression: $workspace) { ... on Blob { text } }
      ${types.map((t) => `${t}: object(expression: $${t}) { ...Shards }`).join('\n      ')}
    }
  } ${SHARDS}`;
  const res = await call('POST', '/graphql', { query, variables: { owner, name: repo, workspace: `${commit}:.gitcrm/workspace.json`, ...vars } });
  const data = res.json?.data?.repository;
  const records = data ? types.flatMap((t) => recordsFrom(data[t])) : [];
  return { ms: res.ms, bytes: res.bytes, records, cost: res.json?.data?.rateLimit?.cost, errors: errorsOf(res), status: res.status };
}

function errorsOf(res) {
  if (!res.json) return [`HTTP ${res.status}, non-JSON response after ${round(res.ms)} ms`];
  return res.json.errors?.map((e) => e.message) ?? [];
}

// Splits the snapshot into queries of `dirsPerQuery` shard folders each, listed from the recursive tree.
async function graphqlChunked(commit, treeSha, dirsPerQuery, concurrency) {
  const started = performance.now();
  const tree = await call('GET', `${base}/git/trees/${treeSha}?recursive=1`);
  const dirs = tree.json.tree.filter((e) => e.type === 'tree' && /^data\/[^/]+\/[^/]+$/.test(e.path)).map((e) => e.path);
  const chunks = [];
  for (let i = 0; i < dirs.length; i += dirsPerQuery) chunks.push(dirs.slice(i, i + dirsPerQuery));
  const results = [];
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      const fields = chunk.map((dir, i) => `d${i}: object(expression: ${JSON.stringify(`${commit}:${dir}`)}) { ... on Tree { entries { name oid object { ... on Blob { text } } } } }`);
      const res = await call('POST', '/graphql', { query: `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join(' ')} } }`, variables: { owner, name: repo } });
      const data = res.json?.data?.repository ?? {};
      results.push({
        ms: res.ms,
        bytes: res.bytes,
        errors: errorsOf(res),
        records: Object.values(data).flatMap((t) => t?.entries ?? []).map((f) => JSON.parse(f.object.text)),
      });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    ms: performance.now() - started,
    queries: chunks.length,
    slowestQueryMs: Math.max(...results.map((r) => r.ms)),
    // GitHub estimates secondary-limit CPU time from total response time (60 s of GraphQL per minute).
    sumQueryMs: results.reduce((a, r) => a + r.ms, 0),
    bytes: tree.bytes + results.reduce((a, r) => a + r.bytes, 0),
    records: results.flatMap((r) => r.records),
    errors: results.flatMap((r) => r.errors),
  };
}

async function perBlobLoad(treeSha) {
  const started = performance.now();
  const tree = await call('GET', `${base}/git/trees/${treeSha}?recursive=1`);
  const files = tree.json.tree.filter((e) => e.type === 'blob' && (e.path.startsWith('data/') || e.path === '.gitcrm/workspace.json'));
  const records = [];
  let bytes = tree.bytes;
  let blobMs = 0;
  let requests = 1;
  let limited = null;
  let next = 0;
  async function worker() {
    while (next < files.length && !limited) {
      const file = files[next++];
      const blob = await call('GET', `${base}/git/blobs/${file.sha}`);
      requests += 1;
      bytes += blob.bytes;
      blobMs += blob.ms;
      if (blob.status === 403 || blob.status === 429) {
        limited = { status: blob.status, retryAfter: blob.retryAfter, after: requests };
        return;
      }
      if (file.path.startsWith('data/') && blob.json) records.push(JSON.parse(Buffer.from(blob.json.content, 'base64').toString('utf8')));
    }
  }
  await Promise.all(Array.from({ length: BLOB_CONCURRENCY }, worker));
  return { ms: performance.now() - started, treeMs: tree.ms, treeBytes: tree.bytes, avgBlobMs: blobMs / Math.max(1, requests - 1), bytes, requests, records, limited, truncated: tree.json.truncated };
}

function searchLatency(records) {
  const haystack = records.map((r) => [r.name, r.title, r.body, r.description, ...(r.emails ?? []), ...(r.tags ?? [])].filter(Boolean).join(' ').toLowerCase());
  const terms = ['bennett', 'proposal', 'renewal', 'example.test', 'zzz-no-match'];
  const started = performance.now();
  let hits = 0;
  for (let i = 0; i < 100; i++) {
    const term = terms[i % terms.length];
    for (const text of haystack) if (text.includes(term)) hits += 1;
  }
  return { msPerSearch: (performance.now() - started) / 100, hits };
}

const report = [];
for (const branch of branches) {
  const expected = Number(branch.match(/\d+$/)?.[0]);
  const head = await resolveHead(branch);

  if (CHUNKED_ONLY) {
    const tuned = await graphqlChunked(head.commit, head.tree, CHUNK_DIRS, CHUNK_CONCURRENCY);
    report.push({ branch, expected, graphqlChunked: { ms: round(head.ms + tuned.ms), queries: tuned.queries, dirsPerQuery: CHUNK_DIRS, concurrency: CHUNK_CONCURRENCY, slowestQueryMs: round(tuned.slowestQueryMs), sumQueryMs: round(tuned.sumQueryMs), records: tuned.records.length, errors: tuned.errors } });
    continue;
  }

  const warm = [];
  for (let i = 0; i < 3; i++) warm.push((await call('GET', `${base}/git/ref/heads/${branch}`)).ms);

  const single = await graphqlLoad(head.commit, TYPES);
  const perTypeStarted = performance.now();
  const perType = await Promise.all(TYPES.map((t) => graphqlLoad(head.commit, [t])));
  const perTypeMs = performance.now() - perTypeStarted;
  const perTypeRecords = perType.flatMap((r) => r.records);
  const chunked = await graphqlChunked(head.commit, head.tree, CHUNK_DIRS, CHUNK_CONCURRENCY);

  const before = (await call('GET', '/rate_limit')).json.resources.core.remaining;
  if (before < expected + 50) {
    report.push({ branch, skippedPerBlob: `only ${before} REST requests left` });
    continue;
  }
  const blobs = await perBlobLoad(head.tree);

  report.push({
    branch,
    expected,
    warmCacheRefMs: round(warm.reduce((a, b) => a + b, 0) / warm.length),
    graphqlSingle: { ms: round(head.ms + single.ms), records: single.records.length, kb: round(single.bytes / 1024), cost: single.cost, errors: single.errors },
    graphqlPerTypeParallel: { ms: round(head.ms + perTypeMs), records: perTypeRecords.length, kb: round(perType.reduce((a, r) => a + r.bytes, 0) / 1024), errors: perType.flatMap((r) => r.errors ?? []) },
    graphqlChunked: { ms: round(head.ms + chunked.ms), queries: chunked.queries, dirsPerQuery: CHUNK_DIRS, concurrency: CHUNK_CONCURRENCY, slowestQueryMs: round(chunked.slowestQueryMs), records: chunked.records.length, kb: round(chunked.bytes / 1024), errors: chunked.errors },
    perBlob: { ms: round(head.ms + blobs.ms), records: blobs.records.length, requests: blobs.requests + 2, kb: round(blobs.bytes / 1024), limited: blobs.limited, treeTruncated: blobs.truncated },
    incrementalOneEditMs: round(head.ms + blobs.treeMs + blobs.avgBlobMs),
    recursiveTree: { ms: round(blobs.treeMs), kb: round(blobs.treeBytes / 1024) },
    search: searchLatency(blobs.records),
    restRemainingAfter: before - blobs.requests,
  });
  console.error(`done ${branch}: ${JSON.stringify(report.at(-1))}`);
}
console.log(JSON.stringify({ spike: 'S-04', runner: `node ${process.version}`, when: new Date().toISOString(), blobConcurrency: BLOB_CONCURRENCY, report }, null, 2));
