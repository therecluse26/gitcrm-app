# Risks, Open Questions, and Feasibility Spikes

These are **real unresolved dependencies**, not minor TODOs. The docs deliberately avoid claiming they have been solved.

| ID | Impact | Question / risk | Required validation | Fallback |
| --- | --- | --- | --- | --- |
| R-01 | High | PAT setup friction limits adoption by less technical users | Usability test of the PAT setup instructions with target users | Accepted for now (ADR-008); GitHub App sign-in through a broker if demand appears (ADR-009, deferred) |
| R-02 | High | First load of thousands of JSON files may consume excessive GitHub requests | Benchmark the GraphQL tree walk and Git Trees + blob fetches (archive ruled out, S-01); incremental SHA caching | Measured (S-04): chunked GraphQL loads 2,000 records in ~5 s. Fallbacks: verified rollup (ADR-016), then a published size limit |
| R-03 | Low | GitHub Pages says sites shouldn't be used for sending passwords, and users enter a PAT on GitCRM's page (S-05). Its commercial SaaS ban does not apply, because GitCRM is non-commercial (ADR-015) | Accepted by each owner for their own copy (ADR-025). The advice is about trust in a site, and each owner deploys their own code | Host-agnostic build (ADR-010): an owner can deploy the same build to another static host |
| R-04 | High | Small concurrent edits can conflict | SHA behavior done (S-02): `409` for a stale blob SHA, `422` for a stale ref update. Still to do: two browsers saving to one real repo | Conflict UI, built (spec 07); serialize/retry nonoverlapping writes conservatively |
| R-05 | High | User may accidentally expose repository or token | Built: connect refuses a public repo (S-08), the PAT link asks for Contents only, and onboarding says to select one repo (S-07). A strict CSP and the build audit guard the page (docs/07). Still to do: the auth and security review before release (docs/10) | Fail closed; disclose and direct to rotate/restrict |
| R-06 | High | Delete != full erasure from Git | Validate history rewrite workflow against a disposable repo and support policy. Not in the MVP (ADR-011) | Keep history purge out of MVP; accurately label deletion. Built: the delete page warns that Git history keeps the record |
| R-07 | Medium | Limited account/org policies block PATs or branch writes | Collaborators: answered (S-05). Branch protection exists only on paid plans and public repos (S-08). Still to do: the org approval flow (S-03), and a branch that requires pull requests | Clear unsupported-state messaging, no hidden privilege escalation |
| R-08 | Medium | GitHub API rate limits and provider terms can change | Monitor current docs; conservative API usage | Budget guard and one syncing tab (ADR-023); publish bounded scale expectations |
| R-09 | Medium | Multiuser data becomes inconsistent during partial refresh | Built: the first load reads one commit (ADR-022), and a sync compares blob SHAs. A truncated tree stops the load (docs/10) | Abort partial load, manual refresh |
| R-10 | Medium | CRM migration CSV can lose relationships/notes | Built (spec 05): the JSON snapshot holds each file with the same text, and the CSV export reads back to the same records (`src/core/export.test.ts`) | Raw JSON always available |
| R-11 | High | Fine-grained PATs cannot be used by outside or repository collaborators (GitHub docs, S-05), so collaborators on a personal repo cannot use GitCRM | Answered by S-05. S-03 still checks the org approval flow live | Decided: team workspaces live in a GitHub organization, and every teammate is an org member (ADR-018); never ask users for classic or shared PATs |
| R-12 | Closed | Each Cloudflare Pages deployment of the central copy stayed reachable at its own address, `<hash>.gitcrm.pages.dev` | Closed 2026-10-31: the central copy is taken down (ADR-025). The owner deletes the Cloudflare project, with every deployment | None needed |
| R-13 | Medium | Anyone who can push to `main` in an owner's app repository, or who controls an action the workflow uses, can change that owner's page and read the PAT typed into it | Done (spec 09): no secrets in the workflow; the deploy job runs no project code; actions are pinned to commit SHAs; the live check compares the site with the tested build. A template update deploys only when the owner runs it, and a revert undoes it (ADR-026) | If the PAT leaks: revoke it on GitHub, and make a new one. It reaches only the data repository |

## P0 results

The five P0 questions (`CLAUDE.md`, docs/11 Phase 0), as of 2026-10-31:

| P0 question | Answer | Spikes | Still open |
| --- | --- | --- | --- |
| 1. Browser access to GitHub REST with a narrow token | Yes. A fine-grained PAT with only `Contents: Read and write` on one repo does every MVP call from a browser page: REST reads and writes, the Git Trees/Commits path, and GraphQL. A read-only token gets `403` from the write check | S-01, S-02, S-08 | Nothing for a personal repo |
| 2. The auth flow | The PAT route works end to end in a browser (ADR-008). A link fills in the PAT form, except the repository (S-07). Outside and repository collaborators cannot use fine-grained PATs, so teams use an organization (ADR-018) | S-02, S-05, S-07 | The org approval flow, live (S-03) |
| 3. Loading 100, 500, and 2,000 records | Chunked GraphQL loads 2,000 records in 5–9 s; per-blob REST takes 48 s (ADR-022). With a warm cache, one ref check takes about 0.2 s. The verified rollup is not needed (ADR-016) | S-04; the app's own times are in docs/06 | Times from other networks: every S-04 run came from one home connection |
| 4. Concurrent updates to one file | GitHub refuses a stale blob SHA with `409`, and a non-forced ref update after `main` moved with `422`. Two racing runs overwrote nothing | S-02 | Two browsers saving to one real repo (the manual run in docs/11) |
| 5. A safe static host | Each owner deploys their own copy to GitHub Pages (ADR-025). GitHub Pages says its sites shouldn't take passwords (R-03); each owner accepts that for their own site | S-05, S-06, S-09 | Read the GitHub Pages terms again before the public release |

The Phase 0 exit, "verified authenticated CRUD in a browser for a private repo", was met by the S-02 browser run on 2026-10-28.

### Not verified yet

No spike has checked these provider behaviors. For each one, GitCRM works with either answer.

| Behavior | Where it matters | What GitCRM does now | How to check |
| --- | --- | --- | --- |
| The org approval flow for a fine-grained PAT | ADR-018, R-07, R-11 | Onboarding explains a pending token (docs/05) | S-03 in `spikes/README.md`. It needs a second person's GitHub account |
| The error for a write to a branch that requires pull requests | ADR-003, R-07 | A refused write shows GitHub's message, and the form stays (docs/10) | Needs a paid plan, or a public test repo |
| API calls to the old name of a renamed repo | S-08 | Treats a failed call like any other | Rename a spike repo, then call the old name from a page |
| Whether API commits count toward "6 pushes per minute" | S-05 | Each save is one user action. A bulk change is one commit | Many quick saves to a spike repo |
| Whether the S-07 link fills in `Contents: Read and write` | S-07 | Onboarding tells users to check that Contents is set to Read and write | Open the link while signed in to GitHub |
| Save prompts for the PAT in browsers and password managers | docs/05 | The PAT field is a real password field | By hand, in each major browser |
| A Contents API PUT to an empty repo, with a fine-grained PAT | S-09, spec 01 | Initialize sends it as the first commit; a refusal shows GitHub's message, and the form stays | Initialize on a new empty data repo |
| What a read-only fine-grained PAT gets from the write check on an empty repo | S-09, spec 01 | A `409` counts as writable, so a read-only token learns at Initialize | Connect a read-only token to an empty spike repo |
| Whether `github.com/new` accepts an organization as `owner` | Spec 01 | The link fills in the typed owner | Open the link with an organization's name |
| Whether GitHub runs the deploy workflow on the commit that the template creates | Spec 09 | The README tells the owner to run the workflow after turning on Pages | Make a repo from the template |
| The template update in a real copy: the push to `main` and the Deploy start, with the workflow's own token | Spec 11 | Unit tests run the script against local repositories | Release v0.3.0, then click **Update GitCRM** in a copy that runs 0.3.0's workflow |
| First-load times from other networks | S-04 | The GraphQL time budget slows a large load instead of failing (ADR-022) | Run `spikes/bench-load.js` from another network |

## P0 spike record template

For each spike, write: **Date; hypothesis; exact repo/config; documented API behavior; reproduction steps; timings/results; threat/privacy assessment; decision; follow-up tests.** Avoid vague "looks feasible" conclusions.

## P0 spike records

### S-01: Browser CORS for bulk-read transports

- **Date:** 2026-10-27, 22:24 EDT.
- **Hypothesis:** GitHub's Git-over-HTTP endpoints and archive host block browser CORS calls; `api.github.com` REST and GraphQL allow them.
- **Config:** Chromium via Playwright; page origin `https://example.com`; public repo `octocat/Hello-World`; no valid token. A private repo would add auth, which cannot replace a missing CORS header.
- **Documented behavior:** GitHub documents CORS for the REST API (`docs/13-SOURCES.md`). Our sources document no CORS for Git HTTP or `codeload.github.com`.
- **Steps:** `fetch()` from the page to each endpoint. A blocked request throws `TypeError: Failed to fetch`, and the console names the CORS cause.
- **Results:**

| Endpoint | Result |
| --- | --- |
| `GET api.github.com/repos/{repo}` | Readable (200); `x-ratelimit-remaining` is exposed to the page |
| `POST api.github.com/graphql` with `Authorization` and a JSON body (preflighted) | Readable (401 for the invalid token), so the preflight passes |
| `GET github.com/{repo}.git/info/refs?service=git-upload-pack` | Blocked: no `Access-Control-Allow-Origin` header |
| `POST github.com/{repo}.git/git-upload-pack` | Blocked: the preflight has no `Access-Control-Allow-Origin` header |
| `GET api.github.com/repos/{repo}/tarball/master`, redirected to `codeload.github.com` | Blocked: codeload sends `Access-Control-Allow-Origin: https://render.githubusercontent.com` only |
| `GET codeload.github.com/{repo}/tar.gz/refs/heads/master` | Blocked: same header |

- **Threat/privacy assessment:** no token or private data was used.
- **Decision:** a Git clone in the browser and the archive download both need a proxy, which ADR-004 rules out. GraphQL stays the first bulk-read transport; per-blob reads are the baseline.
- **Follow-up:** done. The S-02 browser run used GraphQL with a fine-grained PAT on a private repo (`spikes/p0-crud.html`), and S-04 measured GraphQL load times at 100/500/2000 records.

#### S-01 addendum: rate-limit headers (2026-10-31, 14:06 EDT)

- **Question:** can a page read `x-ratelimit-reset` and `retry-after`? The budget guard uses them (ADR-023).
- **Config:** headless Chrome 146 via Playwright; page origin `https://example.com`; no token. A Node `fetch` with `Origin: https://example.com` read the CORS headers.
- **Results:**
  - `GET api.github.com/repos/octocat/Hello-World`: the page read `x-ratelimit-reset` and `x-ratelimit-remaining`.
  - The REST and GraphQL answers both list `Retry-After` and every `X-RateLimit-*` header in `Access-Control-Expose-Headers`. So a page can read each of them when GitHub sends it.
  - A GraphQL `401` for an invalid token sent no rate-limit headers.
- **Decision:** the budget guard can use the reset time. The pause for an answer with no reset time stays.

### S-02: REST CRUD, conflicts, multi-file commit, and GraphQL

- **Date:** 2026-10-27, 22:30 EDT.
- **Hypothesis:** Contents API writes enforce blob-SHA preconditions; the Git Trees/Commits path rejects a non-forced ref update after the branch moved; GraphQL returns file text for a folder.
- **Config:** `therecluse26/gitcrm-spike` (private, default branch `main`, created for this spike). Node 24.15 via `spikes/run-node.js`. Token: the `gh` CLI OAuth token (`repo` scope), **not** a fine-grained PAT.
- **Steps:** `GITCRM_SPIKE_TOKEN=… node spikes/run-node.js therecluse26/gitcrm-spike`. The run writes under `spike/` and removes it at the end.
- **Results (14 of 14 checks passed):**

| Check | Result | Time |
| --- | --- | --- |
| Create (Contents PUT, no `sha`) | 201 | 812 ms |
| Read back | 200, same blob SHA | 294 ms |
| Update with current `sha` | 200 | 706 ms |
| Update with stale `sha` | **409**: "… does not match &lt;sha&gt;" | 288 ms |
| Create on an existing path without `sha` | **422**: "\"sha\" wasn't supplied" | 236 ms |
| Multi-file commit (get ref, get commit, tree, commit, ref update) | 200 | 1,963 ms |
| Non-forced ref update after the branch moved | **422**: "Update is not a fast forward" | 296 ms |
| GraphQL tree walk of `spike/`, pinned to a commit SHA | 200, text and `oid` for 2 files | 335 ms |
| `x-ratelimit-remaining` readable | Yes | |
| Cleanup | `spike/` removed in one commit | 1,594 ms |

- **Threat/privacy assessment:** test data only; the token was never printed or stored.
- **Decision:** the write model works as designed. Blob-SHA preconditions stop silent overwrites (spec 07), and the non-forced ref update protects the ADR-021 delete. Single saves (0.7–0.8 s) meet the 2-second target. A cascade delete takes about 2 seconds, so the delete UI should show progress.
- **Follow-up:** repeat from the browser page with a fine-grained PAT that has only Contents: Read and write. That confirms the Git Data API and GraphQL work with that permission, and that `PUT` and `PATCH` preflights pass. Done on 2026-10-28 (below). S-04 ran the load benchmark. S-03 is still open.

#### S-02 browser run with a fine-grained PAT

- **Date:** 2026-10-28, 18:19 EDT. Chrome 148 on Linux, `spikes/p0-crud.html` served from `127.0.0.1`. The owner ran it.
- **Token:** fine-grained PAT, resource owner `therecluse26`, only `gitcrm-spike`, `Contents: Read and write` (metadata read comes with it), 7-day expiry. Created from the S-07 link.
- **Results:** 14 of 14 checks passed, with the same responses as the OAuth run: `409` for a stale `sha`, `422` for a create on an existing path, `422` "Update is not a fast forward". A single save took 1.0–1.2 s, and a multi-file commit 2.1 s.
- **Findings:**
  - A browser can do every MVP call with this token: REST reads and writes, the Git Trees/Commits delete path (the ref update returned `200`), and GraphQL. The `PUT`, `PATCH`, and `POST` preflights pass.
  - `PATCH git/refs` does not need the Workflows permission for ordinary files. `Contents: Read and write` is enough.
  - The repo's `permissions` field showed `admin: true` for a token with only Contents. It shows the user's role on the repo, not the token's permissions, so it cannot detect a read-only token.
  - First try: the token had the repo selected but no permissions, and `GET repo` returned `404`. Onboarding must name this cause next to "repo not selected".
  - Second try: **Run checks** was clicked twice, and the two runs raced on `main`. GitHub refused each stale ref update with `422` and nothing was overwritten. The page now allows one run at a time.
- **Decision:** the PAT route works end to end in a browser (ADR-008). The docs' permission request, `Contents: Read and write` only, is enough.
- **Read-only run (18:36 EDT):** the same token with `Contents: Read-only`. Reads passed. The write check (`POST git/blobs`) returned `403` "Resource not accessible by personal access token", and the Contents `PUT` returned `403`. Nothing was written.
- **Decision (connect check):** after the repo metadata, send the write check once. `201` means the token can write. `403` means a read-only token, so show the read-only screen. Check `archived` first, because an archived repo answers the write check with `404` (S-08). The check stores one small blob that no file or branch uses.
- **Follow-up:** unverified: whether browsers offer to save the PAT as a password.

### S-04: First-load transport benchmark (spike 3)

- **Date:** 2026-10-27, 22:39–22:41 EDT.
- **Hypothesis:** a GraphQL tree walk loads a full snapshot much faster, and with far fewer rate-limited requests, than per-blob REST reads.
- **Config:** `therecluse26/gitcrm-spike`, branches `bench-100`, `bench-500`, `bench-2000` made by `spikes/gen-dataset.js` (deterministic; 10% companies, 25% contacts, 10% opportunities, 15% tasks, 40% activities; note bodies 100–1,500 characters). 2,000 records are about 1.2 MB of JSON. Node 24.15 via `spikes/bench-load.js`, `gh` OAuth token, one run per setting, from one home connection.
- **Steps:** for each branch, resolve the head commit, then load the full snapshot four ways. Times include resolving the head (about 0.4 s).
- **Results (full snapshot, wall-clock):**

| Transport | 100 records | 500 records | 2,000 records |
| --- | --- | --- | --- |
| GraphQL, one query for everything | 3.2 s | 6.7 s | **Fails:** HTTP 502 after ~10.4 s |
| GraphQL, one query per type, in parallel | 1.4 s | 6.0 s | **Fails** for activities (800 records): 502 after ~10.8 s |
| GraphQL, 100 shard folders per query, 3 in parallel | 3.3 s | 5.8 s | 15.4 s (10 queries) |
| GraphQL, 50 folders per query, 8 in parallel | — | 3.8 s | 9.1 s (19 queries) |
| **GraphQL, 25 folders per query, 10 in parallel** | — | **3.1 s** | **5.1 s** (38 queries, slowest 2.1 s) |
| Per-blob REST, 8 in parallel | 3.4 s (104 requests) | 12.5 s (504) | 47.7 s (2,004 requests) |

| Other measurement | Result |
| --- | --- |
| Warm cache, `main` unchanged (`GET` ref) | ~0.2 s |
| Sync after one edit (ref, commit, recursive tree, one blob) | ~0.8–1.0 s |
| Recursive tree at 2,000 records | 0.28 s, 741 KB, not truncated |
| In-memory search at 2,000 records | ~0.15 ms per search |
| GraphQL rate-limit cost | 1 point per query |
| Bytes for 2,000 records | ~2.2 MB via GraphQL, ~2.9 MB per-blob (base64) |

- **Threat/privacy assessment:** generated data only; the token was never printed or stored.
- **Decision (ADR-022, accepted 2026-10-28, revised by the addendum below):** load the first snapshot with chunked GraphQL, at about 100 files per query (from the recursive tree) and up to 10 queries in parallel, all pinned to one commit. Keep the summed GraphQL response time under 50 s per rolling minute. Per-blob REST is fine for small syncs. Per-blob REST is not viable for first loads: at 2,000 records it takes 48 s and spends 40% of the hourly 5,000-request limit. The verified rollup (ADR-016) is not needed at the target scale. Any single GraphQL query must stay well under ~10 s of server time; on a 502 the app splits that chunk and retries once.
- **Follow-up:** the S-02 browser run confirmed GraphQL with a fine-grained PAT in a browser. The second run (addendum below) showed large variance between runs. Every run came from one home connection, so times from other networks are not known.

#### S-04 addendum: GraphQL server time (2026-10-28, 07:46 EDT)

GitHub allows 60 s of GraphQL server time per minute, and says to estimate it from total response time (S-05). A second run recorded the sum of all query times:

| Setting | Records | Wall-clock | Sum of query times | Queries |
| --- | --- | --- | --- | --- |
| 25 shard folders per query, 10 in parallel | 500 | 4.8 s | 27.6 s | 16 |
| 25 shard folders per query, 10 in parallel | 2,000 | 8.5 s | 70.6 s | 38 |
| 25 shard folders per query, 4 in parallel | 2,000 | 18.1 s | 65.1 s | 38 |
| 50 shard folders (~100 files) per query, 10 in parallel | 2,000 | 6.9 s | 46.8 s | 19 |

- Wall-clock varies a lot: the same setting took 5.1 s on the first run and 8.5 s on the second.
- A 2,000-record first load uses 47–71 s of response time in under 10 s. That is close to, or over, the 60-second limit. No request was rate-limited.
- Fewer, larger queries use less total time. Parallelism changes the wall-clock, not the total.
- Response time includes network time, so it overestimates server time. A budget of 50 s per rolling minute keeps a margin.
- With that budget, a first load above about 2,000 records slows down instead of failing.

### S-05: GitHub terms and documented limits

- **Date:** 2026-10-28, 07:45 EDT. A reading of GitHub's current docs, not a test run.
- **Question:** do GitHub's terms allow GitCRM's use of the API, private repos, Pages, and fine-grained PATs? Which documented limits apply?
- **Sources:** Terms of Service (sections E and H), Acceptable Use Policies, Additional Product Terms (Pages, Actions), Pages limits, the REST and GraphQL rate-limit pages, the PAT page, the fine-grained PAT permissions page, and repository limits. Links are in `docs/13-SOURCES.md`.
- **Findings:**

| Topic | What GitHub's docs say | Effect on GitCRM |
| --- | --- | --- |
| API use | "Abuse or excessively frequent requests" can suspend API access. "You may not share API tokens to exceed GitHub's rate limitations." | Normal use is allowed. Supports no shared PATs (ADR-018) and the budget guard (ADR-023) |
| Bulk activity | The AUP bans "excessive automated bulk activity" and placing "undue burden on our servers through automated means" | User-driven saves and loads are not bulk activity. A bulk import must be one commit |
| Private repos | Content is confidential. GitHub staff may access it for security, scanning for malware or terms violations, support, service integrity, and legal obligations | The privacy statement must say this (docs/07) |
| Pages | Not for "commercial software as a service (SaaS)". Sites "shouldn't be used for sensitive transactions like sending passwords or credit card numbers" | GitCRM is non-commercial (ADR-015), so the SaaS ban does not apply. A PAT is a password-like secret, so Pages is a gray area for the official copy. Self-hosters on Pages get this caveat (ADR-010) |
| Actions | Not for a burden "disproportionate to the benefits provided to users", for example "as part of a serverless application" | Confirms ADR-006 |
| Secondary limits | 100 concurrent requests (REST and GraphQL together); 80 content-creating requests per minute and 500 per hour; 900 points per minute per REST endpoint and 2,000 for GraphQL; 60 s of GraphQL server time per minute | Normal use is far below these. The GraphQL time limit shapes first loads (S-04 addendum, ADR-022) |
| GraphQL timeout | A request over 10 s returns `502` or `504`. A timeout also costs extra primary rate-limit points for the next hour | Matches the S-04 failures. Keep queries small |
| Fine-grained PAT gaps | Fine-grained PATs cannot be used to contribute to repos "where the user is an outside or repository collaborator" | Answers R-11: teammates must be organization members (ADR-018). Personal-repo collaborators and outside collaborators cannot use GitCRM, because it never asks for a classic PAT |
| Org PAT approval | If the org requires approval, a new token stays `pending` and can read only public resources. Org owners are approved automatically. Orgs can set a maximum token lifetime | Onboarding must explain a pending token (docs/05) |
| PAT permissions | Every Git endpoint GitCRM uses (`GET git/ref`, `git/trees`, `git/commits`, `git/blobs`, `PATCH git/refs`) is listed under `Contents`. `PATCH git/refs` is also listed under `Workflows` | Confirmed live (S-02 browser run): a PAT with only `Contents: Read and write` does every call, `PATCH git/refs` too, for files that are not workflow files |
| Repo limits (recommended, not enforced) | Directory width 3,000 entries; single object 1 MB; 6 pushes per minute per repository | Shards stay far below 3,000 entries, and records far below 1 MB. Unverified: whether API commits count as pushes |

- **Decision:** nothing in GitHub's terms forbids GitCRM's design. The limits are: no shared tokens, no bulk automation, no commercial SaaS on Pages, and staying inside the documented rate limits.
- **Follow-up:** confirm the PAT permissions live (done in the S-02 browser run). Check the terms of the static host chosen for the official copy (done in S-06). Read these pages again before the public release.

### S-06: Cloudflare Pages terms

**History.** This record served the central copy, which ADR-025 removed on 2026-10-31. It stays for an owner who deploys to Cloudflare Pages.

- **Date:** 2026-10-28, 17:38 EDT. A reading of Cloudflare's current docs, not a test run.
- **Question:** do Cloudflare's terms allow the official GitCRM copy on Cloudflare Pages? What must the deployment do or avoid?
- **Sources:** Self-Serve Subscription Agreement (updated 2025-09-12), Developer Platform Service-Specific Terms (updated 2026-09-28), Pages limits, Pages headers, and the Privacy Policy (effective 2025-11-04). Links are in `docs/13-SOURCES.md`.
- **Findings:**

| Topic | What Cloudflare's docs say | Effect on GitCRM |
| --- | --- | --- |
| Free plan | Cloudflare may end a free service "in our sole discretion", with no liability | Allowed. If Cloudflare ends it, move the build to another host (ADR-010) |
| Credentials | No clause about entering passwords. Free plans may not "process or collect personal or business credit card information". "The use of the Services for phishing schemes is prohibited" | Entering a PAT is allowed. GitCRM collects no card data. The page must never look like a GitHub page |
| Project names | Subdomains with "names of other businesses, organizations, or individuals" are prohibited | Name the project `gitcrm`; never put `github` in it |
| Content | No malware or unlawful content, and nothing that "discloses sensitive personal information". Free plans may not "store or transmit any 'protected health information'" without consent | The host serves app assets only (ADR-014). CRM data goes from the browser to GitHub and never reaches Cloudflare (ADR-004) |
| Subdomain changes | Cloudflare "may change Cloudflare Workers/Pages subdomain names" on `pages.dev` "for any or no reason", with about one week's notice. Custom domains are exempt | The PAT and the record cache belong to the page's origin (ADR-017). A changed subdomain makes every user reconnect and reload; no CRM data is lost. A custom domain avoids this |
| Content changes | Depending on the features enabled, Cloudflare may "add scripts to your pages" and cookies. It promises a way to turn such features off | Keep script-injecting features, such as Web Analytics, off. The strict CSP blocks injected scripts anyway |
| Headers | A `_headers` file sets response headers on static assets: up to 100 rules, 2,000 characters per line | Send the CSP as a real header, with `frame-ancestors 'none'`. Keep the `<meta>` CSP for other hosts |
| Free-plan limits | 20,000 files, 25 MiB per file, 500 builds per month, 1 build at a time | A Vite build is far below these |
| Visitor data | Cloudflare processes visitors' "IP addresses, traffic routing data" and similar traffic data | The privacy statement must say this (docs/07). The PAT and CRM data go to `api.github.com`, never to Cloudflare |
| Undue burden | Cloudflare may temporarily limit requests that put an "undue burden" on its network | Static assets only; not a concern |

- **Decision:** Cloudflare's terms permit the official copy on Cloudflare Pages. The owner chose it on 2026-10-28 (ADR-010). The same Developer Platform terms cover Workers, so a later move to Workers static assets changes nothing here.
- **Follow-up:** the owner chose a `pages.dev` subdomain for now (2026-10-28, ADR-010). If Cloudflare announces a rename, consider a custom domain. Read these pages again before the public release.
- **2026-10-31:** wrangler 4.151.1 calls Pages "now part of Cloudflare Workers". When an AI agent runs it, it makes a new project on Workers unless `--force` is set. The official copy stays on Pages (ADR-010, docs/07 "Deployment"). A move to Workers static assets needs an owner decision; the terms above already cover Workers.

### S-07: Pre-filled fine-grained PAT form

- **Date:** 2026-10-28, 18:06 EDT. A reading of GitHub's current docs, not a test run.
- **Question:** can a link open GitHub's fine-grained PAT form with GitCRM's settings already filled in?
- **Source:** "Pre-filling fine-grained personal access token details using URL parameters" on the PAT page (`docs/13-SOURCES.md`).
- **Findings:** yes. The form is `https://github.com/settings/personal-access-tokens/new`. All parameters are optional, and the form validates them:
  - `name`: at most 40 characters. `description`: at most 1,024 characters.
  - `target_name`: the user or organization that owns the repos. Without it, the current user.
  - `expires_in`: 1 to 366 days, or `none`. Without it, 30 days, or less if the owner has a token lifetime policy.
  - A permission and level, such as `contents=write`. Write includes read, and contents comes with metadata read.
  - No parameter selects repositories.
- **Decision:** the connection screen builds the link from the `owner/repo` the user typed: `?name=GitCRM+<repo>&description=<text>&target_name=<owner>&contents=write&expires_in=90`. The user must still choose "Only select repositories" and pick the repo; onboarding says so. The owner chose 90 days on 2026-11-01: fewer new tokens than the 30-day default, with a longer window for a leaked token. An org's policy can make it shorter.
- **Follow-up:** the owner created the S-02 browser-run token from this link (2026-10-28). The token first ended up with no permissions; it is not known whether the link failed to fill in Contents. Onboarding therefore tells users to check that Contents is set to Read and write.

### S-08: Repo checks and permission failures

- **Date:** 2026-10-28, about 18:00 EDT. Node, with the OAuth token from `gh` (scope `repo`), against `therecluse26/gitcrm-spike` on a free personal account.
- **Question:** what does the API return for visibility, the default branch, bad tokens, missing repos, an archived repo, and branch protection?
- **Method:** `spikes/repo-checks.js`. It archives the repo and tries to protect `main`, then restores both.
- **Results:**

| Check | Result |
| --- | --- |
| Repo metadata | `200`: `private: true`, `visibility: "private"`, `default_branch: "main"`, `owner.type: "User"`, every `permissions` flag `true` |
| Public repo (`octocat/Hello-World`) | `200`: `private: false`, `visibility: "public"` |
| Bad token, on `/user` and on the repo | `401` "Bad credentials" |
| No token, private repo | `404` "Not Found" |
| Repo that does not exist | `404` "Not Found", the same as no access |
| Write check: `POST git/blobs` | `201`. It stores an unreferenced blob and changes no branch |
| Archived repo: metadata | `200`: `archived: true`, but `permissions.push` stays `true` |
| Archived repo: Contents GET | `200` |
| Archived repo: Contents PUT | `403` "Repository was archived so is read-only." |
| Archived repo: write check | `404` "Not Found" |
| Archive, then unarchive, with `PATCH /repos/...` | `200` both |
| `GET branches/main` | `200`: `protected: false` |
| `GET rules/branches/main` | `403` "Upgrade to GitHub Pro or make this repository public to enable this feature." |
| Branch protection or a ruleset on this private repo | `403`, the same message |

- **Decision:**
  - At connect, refuse `private: false`, and treat `archived: true` as read-only. `permissions.push` does not show that a repo is archived.
  - A `404` cannot tell a missing repo from one the token cannot see, so one message covers both.
  - GitHub Free allows branch protection and rulesets only on public repos (GitHub docs), so free users never meet a protected `main`. Default protection only blocks force pushes and branch deletion, which GitCRM never does, so `protected: true` alone is compatible.
  - Do not check protection up front: on a free private repo, `GET rules/branches/...` returns `403` without any permission problem. Show the compatibility error when a write fails.
- **Follow-up:**
  - The S-02 browser run showed that `permissions` reflects the user's role, not a fine-grained PAT's permissions. A read-only fine-grained PAT gets `403` from the write check, so the write check detects it.
  - Not tested: the error for a write to a branch that requires pull requests (needs a paid plan or a public test repo), and an empty repo with no commits.
  - Not tested: a renamed repository. Whether API calls to the old name still work from the browser is unverified. Until a spike checks it, GitCRM treats a failed call like any other.

### S-09: Template distribution, sign-in, and empty repos

- **Date:** 2026-10-31, evening EDT. Read-only API calls, browser preflights, and a reading of GitHub's docs.
- **Question:** can each owner's copy set itself up without a command line? Can it sign in without a PAT? What does an empty data repo return?
- **Results:**

| Check | Result |
| --- | --- |
| Empty repo (`therecluse26/gitcrm-spike-live`, before its README): Git data API | `409` "Git Repository is empty." The write check (`POST git/blobs`) also gets this |
| Empty repo: Contents API | `404` "This repository is empty." |
| Empty repo: `GET branches/main` | `404` |
| OAuth web flow | The token exchange needs `client_secret`, also with PKCE (GitHub docs) |
| Browser preflight to `github.com/login/oauth/access_token` and `github.com/login/device/code` | `404`, with no `access-control-allow-origin` header. `api.github.com` sends `access-control-allow-origin: *` |
| `actions/configure-pages` with `enablement: true` | Needs "a token other than `GITHUB_TOKEN`" (the action's README) |
| `https://github.com/new` | Takes `name`, `visibility`, `owner`, and `description` as URL parameters. No parameter adds a README, so the new repo is empty |
| A repo made from a template | Starts with one commit, with history unrelated to the template's (GitHub docs) |

- **Decision:**
  - Sign-in without a PAT needs a server for the token exchange (ADR-009). A shared server would see every user's token. So the PAT stays (ADR-008).
  - Each owner turns on Pages once by hand (ADR-025).
  - Setup links to a pre-filled `github.com/new` form for the private data repo. Initialize must then work on an empty repo: Connect treats the write check's `409` as "empty", not as a refusal.
- **Follow-up:** check a Contents API PUT to an empty repo with a fine-grained PAT, in the first run of the new setup ("Not verified yet").

## Most important product decision

Decided 2026-10-27 (ADR-004, ADR-008, ADR-009, ADR-015): GitCRM is a product for other people, and users connect with a fine-grained PAT in both the alpha and the public release. A stateless auth broker is allowed in principle but deferred until real demand appears.

## Commercial deployment check

Read on 2026-10-28 (S-05): GitHub Pages forbids commercial SaaS and advises against sending passwords through Pages sites. The Actions terms forbid using Actions as part of a serverless application. Treat these as provider contract boundaries, not technical limitations to evade. GitCRM is non-commercial (ADR-015, 2026-10-28), so the Pages SaaS ban does not apply; check this section again if that changes. From 2026-10-28 to 2026-10-31 a central copy used Cloudflare Pages (S-06). Since ADR-025, each owner deploys their own copy to GitHub Pages and accepts the advice on passwords for their own site (R-03).
