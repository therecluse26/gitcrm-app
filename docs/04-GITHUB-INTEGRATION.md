# GitHub REST Integration Contract

## Goal

Read and modify **only the selected private repository** from a static browser client, with predictable failure handling and no background processing.

## MVP endpoints (illustrative paths)

| Purpose | GitHub REST endpoint |
| --- | --- |
| Verify identity | `GET /user` |
| Inspect repo / visibility / archived / default branch | `GET /repos/{owner}/{repo}` |
| Check write access at connect (S-02) | `POST /repos/{owner}/{repo}/git/blobs` |
| Read workspace config or document | `GET /repos/{owner}/{repo}/contents/{path}?ref=main` |
| Create or update document | `PUT /repos/{owner}/{repo}/contents/{path}` |
| Delete with cascade, one commit (ADR-021) | `POST .../git/trees`, `POST .../git/commits`, `PATCH .../git/refs/heads/main` |
| Bulk first load (spike 3) | `POST /graphql` |
| Enumerate tree efficiently | `GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1` |
| Fetch blob contents | `GET /repos/{owner}/{repo}/git/blobs/{file_sha}` |
| Resolve head for consistency | `GET /repos/{owner}/{repo}/git/ref/heads/main` and commit/tree lookup |
| Display commit confirmation | returned Contents API commit metadata |

GitHub uses explicit content permissions for write operations. Request least privilege; do not ask for workflows permission. For the alpha, a fine-grained user PAT should be restricted to the one CRM repo with `Contents: Read and write` and implicit metadata read access. S-02's browser run confirmed these permissions cover every MVP call, including GraphQL and the delete path.

## Workspace snapshot algorithm (candidate)

1. Resolve `refs/heads/main` to a commit and associated tree SHA.
2. Fetch recursive Git tree and filter `.gitcrm/workspace.json`, `data/**`.
3. Retrieve each referenced blob by SHA, or in bulk (see "First-load transport"); validate full content and expected path/type/ID.
4. Expose data only after a coherent snapshot has loaded. If some blobs fail, show an explicit partial-read error and disable unsafe export/write.
5. Cache blob SHA to parsed record in IndexedDB (ADR-017), so later page loads fetch only blobs whose SHA changed.
6. Refresh based on HEAD SHA. If unchanged, don't re-fetch files; if changed, compare paths + blob SHAs and fetch only changed files.

Git Trees has response-size/truncation limits. If `truncated = true`, recursively traverse subtrees or show a controlled unsupported-size error; **never silently omit data**. A first-load API call per document is potentially expensive; performance alternatives must be tested, not assumed.

## Page load with a cached snapshot (ADR-017)

1. Read the PAT from `localStorage`; if absent, show the connect screen.
2. Load the cached snapshot from IndexedDB into the in-memory store, re-validate each record, and render. Save stays disabled until step 3 finishes.
3. Run the connect checks again (`GET /user`, `GET` repo, the write check), so a revoked token or a repo that turned public is caught. Then sync: if `main`'s commit SHA equals the cached one, the cache is current. Otherwise fetch the recursive tree, compare blob SHAs, fetch only new or changed records (GraphQL, by shard folder), and drop deleted ones. An unchanged `main` costs 4 requests in all, with no record downloads.
4. Apply the result to the in-memory store, and to IndexedDB in one transaction, so the cache is always one coherent snapshot. The cache is one IndexedDB entry per workspace (`src/storage/record-cache.ts`).

Saves write to GitHub first, then update the in-memory store and IndexedDB. After a save, clear the cached commit SHA: `main` may now include other people's commits, so the next sync compares blob SHAs. A change to the app's record schema version clears the cache. Unverified: Safari may delete script-written storage for a site unused for 7 days; the app then falls back to a full load.

## First-load transport (spike 3)

Test in this order:

1. **Chunked GraphQL tree walk (the first-load transport; measured in S-04, ADR-022).** First resolve `main` to a commit SHA and fetch the recursive tree. Then send GraphQL queries in which each alias reads one shard folder (`"<commitSha>:data/contacts/d1"`) and returns each file's `name`, `oid` (blob SHA), and blob `text`. Keep each query to about 100 files and run up to 10 in parallel. GitHub allows 60 s of GraphQL server time per minute, estimated from response time; keep the summed response time under 50 s per rolling minute, and wait when it is over (S-04 addendum). GitHub ends any request that takes over 10 seconds with `502` or `504`, and a timeout costs extra rate-limit points for the next hour. A single query timed out somewhere between 500 and 800 files (500 took 6.7 s; 800 failed), so never send one large query; on a 502, split that chunk and retry it once. Pinning every expression to one commit SHA keeps all records from the same commit. Results feed the IndexedDB cache directly. Spike S-01 confirmed browser CORS for GraphQL with an `Authorization` header, and S-02 confirmed the tree walk returns file text and blob SHAs (with an OAuth token). S-02's browser run confirmed GraphQL works with a fine-grained PAT. Unverified: GraphQL response size limits.
2. **Per-blob reads (baseline).** Git Trees plus one blob request per record.
3. **Verified rollup (fallback, ADR-016);** see below.

Ruled out by spike S-01 (`docs/12-RISKS-AND-OPEN-QUESTIONS.md`), because each would need a CORS proxy carrying the PAT and every record, which ADR-004 forbids:

- **A Git clone in the browser** (for example an isomorphic-git shallow clone): GitHub's Git-over-HTTP endpoints send no CORS headers.
- **The repo archive** (`GET /repos/{owner}/{repo}/tarball/{ref}`): it redirects to `codeload.github.com`, which only allows the origin `https://render.githubusercontent.com`.

No choice should require a CRM backend. The verified rollup is the only allowed index, and only as a cache.

## Verified rollup (fallback, ADR-016)

Not built: S-04 showed that chunked GraphQL meets the first-load targets at 2,000 records (ADR-022). The design below stays for a larger scale.

- One summary row per record: `id`, `path`, `blobSha`, and the fields list views need (for example `name`, `companyId`, `stageId`, `archivedAt`, `dueDate`, `related`). Activity bodies stay out; timelines load them on demand.
- Load: resolve `main`, fetch the recursive tree, then the rollup, and validate the rollup's shape. Compare each row's `blobSha` with the tree. Fetch only records that differ, are missing from the rollup, or no longer exist, and validate them as usual.
- The `main` tree is always the truth. A row is trusted only while its `blobSha` matches the tree, so a stale rollup costs extra fetches, not wrong data. Detail views always read the record itself.
- Record saves never write the rollup. The app rewrites it occasionally; a conflict on that write is dropped, not retried.
- Note search and full export still load every record.
- Location: an orphan commit on a separate ref such as `refs/gitcrm/rollup`, replaced on each rewrite. Each device also keeps its own record cache (ADR-017), so the rollup only speeds up a device's first load.
- Open until built: the rewrite rule and versioning of the row format. Unverified: whether a fine-grained PAT can create and force-update a ref outside `refs/heads/`.

## Create record

`PUT .../contents/data/contacts/d1/uuid.json` with `message`, Base64 `content`, and `branch: main`; no `sha` for a new path. On conflict, fetch and report that the record already exists; spike S-02 showed that a create on an existing path returns `422` ("\"sha\" wasn't supplied"). Validate exact path uniqueness before upload.

## Update record

`PUT .../contents/...` with the prior blob `sha`. A stale `sha` returns `409` ("… does not match &lt;sha&gt;", spike S-02). On `409`/`422`, reload the document and offer an explicit compare/resolve flow. Do not overwrite other users by fetching a new SHA and retrying blindly. If the content is byte-for-byte unchanged, send nothing. Unverified: GitHub's answer when the `sha` names a file that someone deleted.

## After a refused or lost write (create and update)

- **`409` or `422`:** read the file again. If it still has the expected blob SHA (none, for a create), it is not a conflict: GitHub refused for another reason, such as branch protection, so show GitHub's error. Otherwise show a conflict with the remote version.
- **No response (network failure):** the write may or may not have landed. Read the file, then compare its blob SHA with the Git blob SHA of the text the app sent, which the browser computes itself. The same SHA means the write landed. The expected SHA means it never arrived, so a retry is safe. Any other SHA is a conflict. If that read also fails, say the outcome is unknown and ask the user to reload first (spec 07).
- Every GET uses `cache: 'no-store'`: GitHub lets browsers cache GETs for 60 seconds, and a cached ref or file would hide other people's saves.

## Delete record (ADR-021)

One commit through the Git Trees/Commits APIs:

1. Read `main`'s commit SHA and its recursive tree (one request). Every file under `data/` must have the blob SHA that the preview read, and no file may be new or missing. If not, show a conflict: a record that changed may link to the deleted record now (spec 06, "Delete rules").
2. `POST /repos/{owner}/{repo}/git/trees` with `base_tree` set to that commit's tree. Entries with `sha: null` delete the record and its related tasks and activities; entries with `content` rewrite linking records without the link.
3. `POST /repos/{owner}/{repo}/git/commits` with that tree and the current commit as parent.
4. `PATCH /repos/{owner}/{repo}/git/refs/heads/main` with the new commit SHA and `force: false`.

If step 4 fails because `main` moved, repeat from step 1 on the new `main`, up to 3 attempts in total. A change outside `data/` does not stop the delete; a change under `data/` is a conflict. After the commit, the app computes each rewritten file's blob SHA from its text, so the next save needs no reload. After an ambiguous network failure in step 4, read `main` first: if it points to the new commit, the delete succeeded. This removes files from `main` only; it does **not** erase historical commits. Spike S-02 showed that a non-fast-forward update returns `422` ("Update is not a fast forward") and that the whole delete path takes about 2 seconds. GitHub's permissions page lists all four endpoints under `Contents` (S-05), and S-02's browser run confirmed the whole path works with a fine-grained PAT that has only `Contents: Read and write`.

## Rate limits and reliability

- Authenticated REST calls have primary and secondary rate limits. Observe `x-ratelimit-*` and `retry-after`; back off instead of hammering GitHub.
- Documented secondary limits (S-05): 100 concurrent requests across REST and GraphQL; 80 content-creating requests per minute and 500 per hour; 60 s of GraphQL server time per minute. Normal use stays far below them. Bulk work, such as CSV import, uses one multi-file commit.
- Keep mutating calls serialized by default (GitHub explicitly warns about conflicting concurrent Contents API create/update/delete calls).
- Avoid unconditional poll loops. Check `main` on page load, on tab focus (at most once every 30 seconds), and on the refresh button; nothing else. A save conflict also reloads `main`, so the rest of the app shows the version in the conflict panel. Built: a check on tab focus is a **background check**. It reads `main` only, so an unmoved `main` costs one request. The connect checks (identity, visibility, write access) run on page load and Refresh only. A failed background check runs a Refresh: a `404` from `main` alone cannot tell lost access from an empty branch, and the connect checks can.
- **Budget guard (ADR-023):** the adapter reads `x-ratelimit-remaining` and `x-ratelimit-reset` on every REST response. A page can read both, and `retry-after` too (S-01 and its addendum). Below 500 remaining, pause background checks until the reset time and show a quiet notice; saves and explicit refreshes still run. If a response has no reset time, the pause lasts until a response shows 500 or more. After a `403` or `429` with `retry-after`, or with `x-ratelimit-remaining: 0` and `x-ratelimit-reset`, the client sends nothing until that time. With neither header, it waits 60 seconds, as GitHub's REST rate-limit page says. Never retry in a loop. Built in `src/storage/github-client.ts` and `src/app/background-check.ts`.
- **One syncing tab (ADR-023):** only one tab per workspace checks `main`, and it shares results with other tabs over `BroadcastChannel`. Pick that tab with the Web Locks API (`navigator.locks.request`); the browser releases the lock when the tab closes, so another tab takes over. Built in `src/app/tabs.ts`:
  - The checking tab answers every request, also when it skips the check, for example within 30 seconds of the last one.
  - A tab that gets no answer in 5 seconds checks `main` itself. The checking tab may be closing, or the browser may have frozen it. In a Chromium test, a tab frozen through DevTools kept its lock.
  - An answer carries the changed files, so the other tabs download nothing.
  - Disconnect in one tab also disconnects the other tabs of that workspace.
  - Messages stay inside the browser, between tabs of one origin. They never carry the token.
- Treat `401` (auth), `403/404` (permission, visibility, or missing), `409` (conflict), `422` (validation/conflict), and `429` (limit) as different user-facing states. S-08 recorded the exact responses: `401` "Bad credentials"; `404` for both a missing repo and no access; `403` "Repository was archived so is read-only." on writes to an archived repo. A `403` on a save passes on GitHub's words and says to Refresh, which runs the connect checks again. The browser tests of each failure are listed in `docs/10`, "Failure paths".
- Never log `Authorization` headers, private response bodies, email addresses, or customer names to telemetry.

## Contract tests

Use a mocked API client to assert request paths, Base64 encoding, `sha` preconditions, branch selection, error-state mapping, and no token leakage. The mock is `src/test/fake-github.ts`: an in-memory repo that answers like the spikes recorded, with real Git blob SHAs and injectable faults (an error response, a lost response, or another user's save first). Vitest serves it through MSW, and Playwright through `page.route`. One optional integration suite should run against a deliberately disposable **private test repository** using explicit credentials configured locally (not embedded in committed fixtures).
