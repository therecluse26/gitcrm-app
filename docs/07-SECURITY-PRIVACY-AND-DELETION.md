# Security, Privacy, and Deletion

## Threat assumptions

CRM records contain personal or commercially sensitive information. A private repo helps restrict access; it is **not encryption**, a compliance guarantee, or proof that deleted data no longer exists. The browser and everyone authorized for the private GitHub repo are inside the trust boundary.

## Threats and mitigations

| Threat | Minimum mitigation |
| --- | --- |
| Public repo exposure | Refuse public repos; recheck visibility at connection and refresh; never publish data as static assets |
| Credential theft via JS/XSS | No inline unsafe HTML, strict CSP (see below), no third-party analytics/scripts, one-repo short-expiry PAT; host features that inject scripts stay off (S-06) |
| Clickjacking (another site frames the app) The app refuses to render inside a frame. On a host that reads `_headers`, also a `frame-ancestors 'none'` header (spec 09) |
| Stored PAT and records on a shared or lost device | "Remember on this device" opt-out; Disconnect deletes both, and also disconnects the other open tabs of the workspace; one-repo short-expiry PAT. A fully compromised machine is out of scope (ADR-017) |
| Records passed between open tabs (ADR-023) | `BroadcastChannel` reaches only tabs of the same origin in the same browser, which can already read the record cache; messages never carry the token |
| Overbroad token scope | Fine-grained repo-restricted token; instructions to expire/revoke |
| Unauthorized collaborator access | GitHub repo permissions; onboarding explains collaborator access |
| Accidental overwrite | Blob SHA preconditions, conflict UI |
| Malformed or malicious JSON | Runtime schema checks, size caps, treat text as text rather than trusted HTML; a `website` must be `http` or `https`, so a stored `javascript:` link is refused |
| Corrupt/partial export | Validate all files and fail closed on partial snapshot |
| Sensitive information in history | Ordinary delete vs. purge distinction, clear warnings |
| Exposure through logs/telemetry | No third-party analytics by default; redact payloads and bearer tokens |
| CRM data in browser history | Browsers keep URLs in history, and some sync it to the browser vendor. URLs hold record IDs only, never names, emails, or search text; the page title stays "GitCRM" |
| Supply-chain compromise | Lockfiles, dependency review, CI scans, static-host integrity checks; `.npmrc` installs only versions at least 14 days old, and any exception is pinned and explained there |
| Compromised auth broker (only if ADR-009 is revived) | Stateless, no database; holds only the client secret; logs no codes or tokens; small reviewed codebase; secret rotation plan |

## Data boundaries

- The public static hosting origin serves **application assets only**.
- All business data comes from the user's selected private GitHub repo through authenticated API calls.
- No CRM data is sent to GitCRM-operated servers, AI APIs, crash reporters, or analytics by default. If the deferred auth broker (ADR-009) ever ships, it would see GitHub authorization codes and tokens in transit, plus request metadata such as IP addresses; never CRM records.
- No service worker should precache authenticated API responses or sensitive records.
- `Disconnect` deletes the stored token and the record cache (ADR-017); deleting browser storage cannot guarantee recovery-resistant erasure.
- Keep repo initialization and writes within `.gitcrm/` and `data/`.

## Delete, archive, purge: three different operations

1. **Archive (MVP):** record remains as a JSON file, marked `archivedAt`. Hidden from default views; can be restored.
2. **Delete from current snapshot (MVP):** commit removes the record file from `main`. Old Git commits still contain it. The same commit deletes related tasks and activities and unlinks other records (ADR-021); a preview lists every change first.
3. **Purge Git history (later, separate maintenance tool):** a dangerous rewrite may remove a record's file path from reachable repository history using `git-filter-repo`. It changes commit hashes, requires a coordinated force-push and all collaborators to reconcile their clones. It does **not** guarantee erasure from forks, other clones, GitHub caches, or PR refs. GitHub Support may only remove cached sensitive data under its documented conditions. Do not promise automatic total erasure.

Because filenames are stable UUIDs, a file's historical path is targetable. But other records, commits, exported CSV files, backups, activity notes, and the verified rollup (if built, ADR-016) may contain copies of the same PII; a path purge alone is insufficient for a subject-access or deletion request.

## Content Security Policy and build audit

The built `index.html` carries this policy in a `<meta>` tag, right after the charset and before every script and stylesheet (ADR-010). `scripts/csp.ts` holds it.

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'none'` | Anything not listed below is blocked: frames, workers, plugins, media, and images |
| `script-src` | `'self'` | The app's own bundle only: no inline script, no `eval`, no script from another site |
| `style-src` | `'self'` | The app's own stylesheet only |
| `font-src` | `'self'` | The IBM Plex font files in the build (spec 12) |
| `connect-src` | `https://api.github.com` | The PAT and CRM data can reach no other site |
| `base-uri` | `'none'` | A planted `<base>` tag cannot move the relative asset paths |
| `form-action` | `'none'` | No form submits natively; the app handles every form in script |
| `require-trusted-types-for` | `'script'` | Trusted Types: a string can never become HTML or a script address, the usual way into an XSS |
| `trusted-types` | `'none'` | GitCRM creates no Trusted Types policy, so no code can make an exception |

- The dev server sends no policy, because Vite's dev client needs inline scripts and a WebSocket.
- The browser tests run against the built app, so they run under the policy. Any policy violation fails the test (`e2e/fixtures.ts`). Only the developer page's test uses the dev server.
- Zod compiles validators with `new Function` unless `jitless` is on. `src/app/zod-config.ts` turns it on before any parse, so Zod never tries `eval`.
- A `<meta>` policy cannot set `frame-ancestors`. On a host that reads the build's `_headers` file, such as Cloudflare Pages, it sends the same policy as a header, with `frame-ancestors 'none'` (spec 09). GitHub Pages sends no custom headers, so there the app's own frame check refuses to run inside a frame.
- A browser without Trusted Types ignores those two directives; the others still apply. The browser tests run in Chromium only.
- The browser tests pass with no Trusted Types policy because GitCRM never renders raw HTML or a `<script>` element. If a new library needs a policy, ask the owner first.

`npm run build` runs the build audit (`scripts/check-build.ts`) on `dist/`. Any finding fails the build. The audit refuses:

- an `index.html` without `<meta name="robots" content="noindex">`;
- any file other than `index.html`, `_headers`, and the `.js`, `.css`, and `.woff2` files in `assets/`, so no source map and no developer page;
- no `_headers` file; a `/*` rule that does not send the `<meta>` policy, then `; frame-ancestors 'none'`; another rule that changes or removes that header; or a line over 2,000 characters, the Cloudflare limit (spec 09);
- a link to a source map;
- an `index.html` with no policy, with the policy after a script or stylesheet, or with a weaker policy: another `default-src`, `script-src`, or `connect-src`, no Trusted Types, or any `'unsafe-…'` keyword;
- an inline script, an inline style, or an event handler attribute in `index.html`;
- anything shaped like a GitHub token (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, or `github_pat_`);
- an email address outside the reserved example domains (RFC 2606, RFC 6761), because a real address could be customer data from a fixture;
- a host that nobody reviewed. `scripts/check-build.ts` lists each reviewed host with its reason.

The audit is a text scan, so it cannot find a name or a phone number. The fixtures and the fake GitHub stay out of the build because no app code imports `src/test/`.

## Deployment

GitCRM is a template repository with no central copy (ADR-025). Each owner's app repository deploys to its own GitHub Pages site with `.github/workflows/deploy.yml` (spec 09). So each owner runs code from their own repository, and nobody else's deploy can change the page where they type their PAT.

- The workflow has no secrets. The build job runs lint, the unit tests, `npm run build` with the audit, and every browser test against `dist/`. Then it hands `dist/` to the deploy job.
- The deploy job has only `pages: write` and `id-token: write`. It runs no project code: it deploys the artifact from the build job. Each action is pinned to a commit SHA, because a tag can move.
- Anyone who can push to `main` in the app repository can change the page where its owner types the PAT. The PAT reaches only the separate data repository, so a leaked PAT cannot change the app (ADR-025).
- `index.html` has `<meta name="robots" content="noindex">`, and `_headers` also sends `X-Robots-Tag: noindex`. Each site is a front end to private data, so search engines leave it out.
- After the deploy, `scripts/check-deploy.ts` reads the live site. Every file in `dist/` must match byte for byte. A failed request also counts as a problem. The check tries 6 times, 10 seconds apart.
- If the live check fails, the new deployment is already live. Revert the commit on `main`, and the workflow deploys the reverted build.
- GitHub Pages sends no custom headers, so no `frame-ancestors`. The app's own frame check refuses to run inside a frame. A host that reads `_headers`, such as Cloudflare Pages, also sends the header.

Template updates (spec 11) never deploy on their own. The owner starts each one: the app's **Update GitCRM** button opens the workflow, and the owner runs it. The workflow runs only the copy's own code, before any template file is in its working tree. It commits the release to `main` and starts Deploy. A release changes the page where the owner types the PAT, so running the update trusts the template's maintainer. "What's new" links to the release notes, and the commit shows each change. To undo an update, revert its commit. The app's release request has no token and no CRM data.

One-time setup by each owner: Settings → Pages → Source: "GitHub Actions". The workflow cannot turn on Pages with its own token (S-09).

From 2026-10-28 to 2026-10-31 a central copy ran at `https://gitcrm.pages.dev/` on Cloudflare Pages (ADR-024, superseded). ADR-025 removes it: the owner deletes the Cloudflare project and its two repository secrets.

## Security tests required

- Static bundle scan contains no token, secret, or example real customer data: the build audit, above.
- The built page blocks a script from another site, an inline script, HTML from a string, `eval`, and a request to any site but `api.github.com`. Inside a frame, the app does not run (`e2e/security.spec.ts`). These tests also run with the build served from a folder with no custom headers (spec 09).
- After each deploy, the owner's site serves the tested build byte for byte (`scripts/check-deploy.ts`).
- XSS payload in contact name or activity note is rendered harmlessly.
- Public repository is rejected; protected branch is not silently bypassed.
- `401/403/404` state produces no sensitive leaks in the UI/console.
- Same-file write conflict is not silently resolved by overwriting.
- All API/network errors preserve form data in memory until user acknowledges.

## Privacy statement scope

A future public privacy policy must separately disclose what the static host sees (GitHub Pages serves the app's files, so GitHub sees visitors' IP addresses for asset requests; the PAT and CRM data go only to `api.github.com`), what an auth broker would see if one ships (codes and tokens in transit, IP addresses), what GitHub stores and when GitHub staff may access private repo content (security, scanning for malware or terms violations, support, service integrity, and legal obligations; S-05), what the browser processes, and whether any third-party telemetry is enabled. Do not claim compliance with GDPR, HIPAA, or other specialized regimes without a separate assessment.
