// S-08 checks from Node 18+: visibility, default branch, token and permission failures, archived repo, branch protection.
// Temporarily archives the repo and protects its default branch, then restores both. Writes only under spike/.
//   GITCRM_SPIKE_TOKEN=... node spikes/repo-checks.js owner/gitcrm-spike
const token = process.env.GITCRM_SPIKE_TOKEN;
const [owner, repo] = (process.argv[2] ?? '').split('/');
if (!token || !owner || !repo?.startsWith('gitcrm-spike')) {
  console.error('Usage: GITCRM_SPIKE_TOKEN=... node spikes/repo-checks.js owner/gitcrm-spike*');
  process.exit(2);
}

async function call(auth, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      ...(auth && { Authorization: `Bearer ${auth}` }),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, json, headers: res.headers };
}
const gh = (method, path, body) => call(token, method, path, body);
const base = `/repos/${owner}/${repo}`;
const doc = (label) => Buffer.from(JSON.stringify({ spike: 'repo-checks', label, at: new Date().toISOString() }) + '\n').toString('base64');

const results = [];
function observe(name, res, detail = '') {
  const message = res.json?.message ?? null;
  results.push({ name, status: res.status, message, detail });
  console.log(`${res.status}  ${name}${message ? ` - ${message}` : ''}${detail ? ` [${detail}]` : ''}`);
}

const put = (branch, label) => gh('PUT', `${base}/contents/spike/${crypto.randomUUID()}.json`, { message: `spike: ${label}`, content: doc(label), branch });

// Builds a commit on the current head and tries a non-forced ref update: the ADR-021 delete path.
async function refUpdate(branch) {
  const ref = await gh('GET', `${base}/git/ref/heads/${branch}`);
  const head = await gh('GET', `${base}/git/commits/${ref.json.object.sha}`);
  const tree = await gh('POST', `${base}/git/trees`, { base_tree: head.json.tree.sha, tree: [{ path: `spike/${crypto.randomUUID()}.json`, mode: '100644', type: 'blob', content: 'ref update\n' }] });
  const commit = await gh('POST', `${base}/git/commits`, { message: 'spike: ref update', tree: tree.json.sha, parents: [ref.json.object.sha] });
  return gh('PATCH', `${base}/git/refs/heads/${branch}`, { sha: commit.json.sha, force: false });
}

async function cleanUp(branch) {
  const listing = await gh('GET', `${base}/contents/spike?ref=${encodeURIComponent(branch)}`);
  const files = Array.isArray(listing.json) ? listing.json : [];
  for (const f of files) await gh('DELETE', `${base}/contents/${f.path}`, { message: 'spike: clean up', sha: f.sha, branch });
  console.log(`Cleaned up ${files.length} spike files.`);
}

const meta = await gh('GET', base);
const info = meta.json ?? {};
observe('Repo metadata', meta, `private=${info.private}, visibility=${info.visibility}, default_branch=${info.default_branch}, archived=${info.archived}, owner.type=${info.owner?.type}, permissions=${JSON.stringify(info.permissions)}`);
if (meta.status !== 200 || info.private !== true) process.exit(1);
const branch = info.default_branch;

const pub = await gh('GET', '/repos/octocat/Hello-World');
observe('Public repo metadata', pub, `private=${pub.json?.private}, visibility=${pub.json?.visibility}`);
const br = await gh('GET', `${base}/branches/${branch}`);
observe('Default branch', br, `protected=${br.json?.protected}`);
const rules = await gh('GET', `${base}/rules/branches/${branch}`);
observe('Active rules on default branch', rules, `rules=${JSON.stringify(rules.json)}`);

observe('GET /user with a bad token', await call('github_pat_not_a_real_token', 'GET', '/user'));
observe('GET repo with a bad token', await call('github_pat_not_a_real_token', 'GET', base));
observe('GET repo with no token', await call(null, 'GET', base));
observe('GET a repo that does not exist', await gh('GET', `/repos/${owner}/gitcrm-spike-missing-${crypto.randomUUID()}`));

// An unreferenced blob is a write that changes no branch: a candidate connect-time write check.
const probe = await gh('POST', `${base}/git/blobs`, { content: 'gitcrm write probe', encoding: 'utf-8' });
observe('Write probe: POST git/blobs', probe, `x-accepted-github-permissions=${probe.headers.get('x-accepted-github-permissions')}`);

const archive = await gh('PATCH', base, { archived: true });
observe('Archive the repo', archive);
try {
  if (archive.status === 200) {
    const a = await gh('GET', base);
    observe('Archived repo metadata', a, `archived=${a.json?.archived}, permissions=${JSON.stringify(a.json?.permissions)}`);
    observe('Contents GET on archived repo', await gh('GET', `${base}/contents/README.md?ref=${encodeURIComponent(branch)}`));
    observe('Contents PUT on archived repo', await put(branch, 'archived'));
    observe('Write probe on archived repo', await gh('POST', `${base}/git/blobs`, { content: 'gitcrm write probe', encoding: 'utf-8' }));
  }
} finally {
  if (archive.status === 200) observe('Unarchive the repo', await gh('PATCH', base, { archived: false }));
}

const protect = (pullRequests, enforceAdmins) => gh('PUT', `${base}/branches/${branch}/protection`, {
  required_status_checks: null,
  enforce_admins: enforceAdmins,
  required_pull_request_reviews: pullRequests ? { required_approving_review_count: 1 } : null,
  restrictions: null,
});
const p1 = await protect(false, true);
observe('Protect default branch: no PR rule, admins included', p1);
try {
  if (p1.status === 200) {
    const b = await gh('GET', `${base}/branches/${branch}`);
    observe('Protected branch metadata', b, `protected=${b.json?.protected}`);
    observe('Contents PUT, no PR rule', await put(branch, 'protected, no PR rule'));
    observe('Protect default branch: PRs required, admins included', await protect(true, true));
    observe('Contents PUT, PRs required, admins included', await put(branch, 'PRs required'));
    observe('Ref update, PRs required, admins included', await refUpdate(branch));
    observe('Protect default branch: PRs required, admins exempt', await protect(true, false));
    observe('Contents PUT as admin, PRs required, admins exempt', await put(branch, 'admin bypass'));
  } else {
    const rs = await gh('POST', `${base}/rulesets`, {
      name: 'gitcrm-spike', target: 'branch', enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false } }],
    });
    observe('Ruleset requiring PRs on the default branch', rs);
    if (rs.status === 201) {
      try {
        observe('Active rules with ruleset', await gh('GET', `${base}/rules/branches/${branch}`));
        observe('Contents PUT with PR ruleset', await put(branch, 'ruleset'));
        observe('Ref update with PR ruleset', await refUpdate(branch));
      } finally {
        observe('Delete ruleset', await gh('DELETE', `${base}/rulesets/${rs.json.id}`));
      }
    }
  }
} finally {
  if (p1.status === 200) observe('Remove branch protection', await gh('DELETE', `${base}/branches/${branch}/protection`));
  await cleanUp(branch);
}

console.log(`\nResults JSON (safe to share; it contains no token):\n${JSON.stringify({ spike: 'S-08', when: new Date().toISOString(), results }, null, 2)}`);
