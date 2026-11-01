# GitCRM - Project Starter

**Status:** Phase 2 is built and tested against a fake GitHub: connecting, setting up a workspace, contacts, companies, the opportunity pipeline, tasks, and activity notes work; other people's changes show when you return to the tab. Phase 3 has begun: Search finds every record type, Settings exports the records as a JSON snapshot or CSV files, and Delete lists every change before one commit removes the record. Browser tests cover each failure path in `docs/10`. The built app runs under a strict Content Security Policy, and each build is audited (docs/07). Browser tests check each page against WCAG 2.2 AA (docs/08). GitCRM is a template repository: each owner deploys their own copy to GitHub Pages, after every test passes (ADR-025, spec 09). There is no central copy. On 2026-11-01 the owner's own copy connected to a real private data repository and initialized it  
**Last reviewed:** 2026-10-31  
**Audience:** solo developers and tiny teams who want a useful CRM without operating a database or backend.

GitCRM is a static, browser-based CRM whose authoritative data lives as **one JSON document per record in a user's private Git repository**. On GitHub, the browser uses authenticated GitHub REST APIs to read and commit records. Searching happens over the current records in browser memory. There is no CRM application server, persistent database, or recurring automation requirement. Users connect with a fine-grained PAT (ADR-008).

> **Scope rule:** If the use case requires a traditional backend, use a different CRM instead of adding infrastructure to GitCRM.

## Set up your own GitCRM

You need a GitHub account and a browser. You need no command line, no server, and no secrets. You make two repositories:

- **The app repository**, a copy of this template. It holds only the app's code, so it can be public. GitHub Pages serves the app from it.
- **The data repository**, private. It holds your CRM records. Your token reaches only this repository.

1. On this repository's page, click **Use this template**, then **Create a new repository**. Choose any name, such as `gitcrm`. Public is fine.
2. In the new repository, open **Settings → Pages**. Set **Source** to **GitHub Actions**. The workflow cannot turn this on itself.
3. Open the **Actions** tab. GitHub runs **Deploy** on your copy's first commit. If that run failed at **Configure Pages**, because Pages was not on yet, open it and click **Re-run all jobs**. Wait until every job passes, about 3 minutes.
4. Create the data repository: [github.com/new](https://github.com/new?name=gitcrm-data&visibility=private&owner=@me&description=GitCRM+records). Keep it **Private**. It may stay empty: GitCRM's Initialize step makes its first commit.
5. Open your site: `https://<your-user>.github.io/<app-repository>/`. The connect screen also links to the form from step 4.
6. **Repository** starts as `<your-user>/gitcrm-data`; change it if you chose another name. Then follow the link to GitHub's token form. On GitHub's form, choose **Only select repositories**, and pick the data repository. Check that **Contents** is **Read and write**. Create the token.
7. Paste the token, then **Connect**. GitCRM offers to initialize the workspace.

Your site is public, but your records are not: the app reads them only with your token. Search engines leave the site out (`noindex`). The workflow runs on your Actions minutes; a public repository runs it at no cost.

Updates (ADR-026, spec 11): when this template has a newer release, your site shows **GitCRM v… is available**.

1. Click **Update GitCRM**. GitHub opens your copy's **Template update** workflow.
2. Click **Run workflow**, then the green **Run workflow** button.
3. Reload your site in about 5 minutes.

The workflow commits the release to `main`, then deploys it. To undo an update, revert its commit. The workflow cannot change files in `.github/workflows/`: when a release changes one, the run shows a warning, and its summary lists each file to copy by hand.

To release a new version of the template: change `version` in `package.json` on `main`, then create a GitHub release with the tag `v<version>`.


## Read these first

1. [VISION.md](VISION.md) - product purpose, audience, promises, and anti-goals.
2. [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) - MVP behavior and definition of done.
3. [ARCHITECTURE.md](ARCHITECTURE.md) - deployment boundaries and runtime data flow.
4. [docs/12-RISKS-AND-OPEN-QUESTIONS.md](docs/12-RISKS-AND-OPEN-QUESTIONS.md) - items requiring spikes *before* building the whole UI.
5. [docs/11-IMPLEMENTATION-PLAN.md](docs/11-IMPLEMENTATION-PLAN.md) - implementation sequence and test gates.

## Documentation map

| Area | Files |
| --- | --- |
| Product | `VISION.md`, `PRODUCT_REQUIREMENTS.md`, `docs/08-UI-UX.md` |
| Persistence | `docs/02-DATA-MODEL.md`, `docs/03-REPOSITORY-LAYOUT.md`, `docs/04-GITHUB-INTEGRATION.md` |
| Access | `docs/05-AUTH-AND-ONBOARDING.md`, `docs/07-SECURITY-PRIVACY-AND-DELETION.md` |
| Performance & portability | `docs/06-SEARCH-AND-PERFORMANCE.md`, `docs/09-EXPORT-AND-MIGRATION.md` |
| Delivery | `docs/10-TESTING.md`, `docs/11-IMPLEMENTATION-PLAN.md`, `docs/01-TECHNICAL-DECISIONS.md` |
| Functional acceptance | `specs/*.md` |
| Agent instructions | `CLAUDE.md`, `AGENTS.md` |

## Core user journey

1. Open your own copy of the **static application** on GitHub Pages (app code is public; CRM records are not).
2. Supply authorized access to an existing **private GitHub repository**.
3. Connect, validate, and initialize `.gitcrm/workspace.json` if not present.
4. Create contacts, companies, opportunities, tasks, and activity notes.
5. View a pipeline, search current records, and export at any time.
6. Eventually migrate to another CRM without needing GitCRM to retrieve the raw data.

## Important feasibility constraints

- **Authentication is the top product spike.** GitHub's documented OAuth code exchange requires a client secret; PKCE by itself does not remove that documented requirement. A static SPA must never embed an OAuth client secret or GitHub App private key. Users supply a repository-restricted fine-grained PAT, stored in browser storage until Disconnect (ADR-017). GitCRM uses this PAT route for the alpha and the public release (ADR-008); GitHub App sign-in through a broker is deferred until real demand appears (ADR-009).
- **The build runs on any static host (ADR-010).** Each owner's copy uses GitHub Pages (ADR-025). See "Other static hosts" below.
- **Do not use GitHub Actions for CRM jobs (ADR-006).** The browser does all reads, writes, and aggregation. Actions may be used for software testing/builds/deployments of the GitCRM codebase, not as the CRM's general-purpose workflow runtime.
- **A private repository does not guarantee permanent erasure.** Git history, other clones, caches, and pull request references matter. A future purge utility must state these limitations.
- **Free is a target, not an unconditional guarantee.** Respect host limits, provider terms, and GitHub API limits.

## Spec conventions

- **MUST**: required for the MVP or a safety invariant.
- **SHOULD**: preferred default, may be deferred with an explicit decision.
- **MAY**: optional and not assumed implemented.
- **P0**: must be validated before the main feature build.
- **MVP**: minimum usable release, not a production-ready multi-tenant SaaS.

## Development

Requires Node 24 or later. Keep this code repository separate from end users' private data repositories (ADR-014). On NixOS, run `nix-shell` first: `shell.nix` provides Node and the libraries Playwright's Chromium needs.

```sh
npm install
npx playwright install chromium   # once, for the browser tests
npm test            # unit and contract tests (Vitest, against a fake GitHub)
npm run test:e2e    # browser tests (Playwright, against the built app and the same fake)
npm run dev         # the app at http://localhost:5173/, the developer page at /dev.html
npm run build       # the static app in dist/, then the build audit (docs/07)
```

`dev.html` is the developer page from Phase 1. It connects to a repo with a fine-grained PAT and creates, reads, edits, and deletes one contact. The token stays in that tab's memory. Writes go straight to the repo's default branch, so use a disposable private repo. The dev server serves the page; `npm run build` leaves it out.

## Other static hosts

`npm run build` makes `dist/`, a folder of static files. Publish it as is on any static host, at the root or in a folder. A browser test runs the same build from `/GitCRM/` with no custom headers, the way GitHub Pages serves it (spec 09).

- `dist/_headers` is for hosts that read one, such as Cloudflare Pages. Other hosts, GitHub Pages too, serve it as a plain file that holds only the policy and a `noindex` line.
- If your host can send headers, send the policy from `_headers`, with `frame-ancestors 'none'`. Without it, the app still refuses to run inside a frame.
- GitHub says Pages sites shouldn't take passwords (R-03), and GitCRM asks for a PAT. Decide that for your own copy.
