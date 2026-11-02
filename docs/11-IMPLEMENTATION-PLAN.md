# Implementation Plan

Build in **small vertical slices**. The first meaningful release must prove the core Git persistence model before visual polish. No task requires a new server or database.

## Phase 0 - technical viability (must pass first)

- [x] Create disposable private test repo and repo-restricted fine-grained PAT.
- [x] Verify browser `fetch` to GitHub REST for repo metadata, blob reads, one create, update with SHA, delete with SHA (S-02, OAuth from Node, then a fine-grained PAT in Chrome).
- [x] Verify the PAT route end to end in a real browser (ADR-008; S-02 browser run).
- [x] Check whether GitHub supports URL parameters that pre-fill the fine-grained PAT form (S-07: yes, except repository selection).
- [ ] Verify fine-grained PATs for org members, including the org's PAT approval policy (ADR-018, R-11).
- [x] Read GitHub's current Terms of Service, API terms, and Acceptable Use Policies for storing app data in private repos through the API; record findings in `docs/12-RISKS-AND-OPEN-QUESTIONS.md` (S-05: nothing forbids the design).
- [ ] Validate `private: true`, `main`, branch protection, permission failures. Done (S-02, S-08), except a branch that requires pull requests (needs a paid plan or a public test repo). The repo's `permissions` field shows the user's role, not the token's, so connect uses a write check instead.
- [x] Benchmark initial and incremental load at 100/500/2000 docs (S-04: chunked GraphQL meets the targets; ADR-022; rollup not needed): GraphQL tree walk first, then per-blob (`docs/04-GITHUB-INTEGRATION.md`; the archive is ruled out by S-01). Check results against the targets in `docs/06-SEARCH-AND-PERFORMANCE.md`. Decide whether to build the verified rollup (ADR-016); if yes, test custom-ref create and force-update with a fine-grained PAT.
- [x] Verify a multi-file commit through the Git Trees/Commits APIs with a fine-grained PAT, including a non-forced ref update after `main` has moved (ADR-021). Works with an OAuth token and with a fine-grained PAT that has only Contents: Read and write (S-02).
- [x] Check whether GitHub's Git-over-HTTP endpoints accept browser CORS calls. They don't, so a browser shallow clone is ruled out (S-01).
- [x] Confirm chosen static hosting provider permits intended use (S-05, S-06). GitCRM is non-commercial, so the GitHub Pages SaaS ban does not apply (ADR-015, ADR-025).
- [x] Record P0 spike findings in `docs/12-RISKS-AND-OPEN-QUESTIONS.md` and update ADRs. docs/12 "P0 results" answers the five P0 questions and lists each provider behavior not verified yet. The risk table, the spike follow-ups, and ADR-003, -008, -016, -018, -021, and -023 now cite the spikes. A new check (S-01 addendum) showed that a page can read `x-ratelimit-reset` and `retry-after`.

**Exit:** verified authenticated CRUD in a browser for a private repo, with explicit boundary/limits. Met on 2026-10-28 (S-02 browser run).

## Phase 1 - minimal domain and storage

- [x] Set up the ADR-012 stack (React + TypeScript + Vite) with Vitest, MSW, and Playwright. Other ADR-012 libraries are added when a phase needs them.
- [x] Define versioned record schemas and canonical serializer (`src/core/`; rules in `docs/02-DATA-MODEL.md`).
- [x] Implement path generation, GitHub adapter, and in-memory snapshot reader (`src/storage/`; chunked GraphQL per ADR-022).
- [x] Implement explicit operation state and safe conflict/error mapping (`src/storage/operation-state.ts`).
- [x] Write unit and adapter contract tests first (Vitest against a fake GitHub served through MSW).

**Exit:** a CLI-like developer test page can create/read/edit/delete one contact without data loss. Met on 2026-10-28 against the fake GitHub (`e2e/dev-page.spec.ts`). Still to do: a manual run of `dev.html` against a disposable private repo.

## Phase 2 - onboarding and core CRM

- [x] Connection screen; private repo validation and initialization. Includes the remembered token and record cache (ADR-017) and Disconnect.
- [x] Contacts and companies CRUD + links. Includes archive and restore, list search and sort, the conflict compare panel (spec 07), the warning before leaving an unsaved form, and the `broken-link` check. Delete stays in Phase 3.
- [x] Background checks of `main` on tab focus, the rate-limit budget guard, and one syncing tab (ADR-023). Disconnect also reaches the other open tabs.
- [x] Opportunity CRUD + pipeline stage board/list + stage editor (ADR-019). Includes archive and restore, moves by menu and by drag and drop, opportunities on company and contact pages, open opportunities by stage on Home, and the unknown-stage check. Delete stays in Phase 3.
- [x] Tasks and manual activities with relational display. Includes complete and reopen, archive and restore, task and activity cards on contact, company, and opportunity pages, and tasks due and recent activity on Home. Delete stays in Phase 3.
- [x] Responsive navigation, save feedback, and validation UX (spec 08). Includes the skip link, focus on the page heading after a page change, a page for unknown addresses, a form message while another save runs, and field errors on the connect and setup screens.

**Exit:** full "company -> contact -> opportunity -> note -> follow-up task" user journey works. Met on 2026-10-29 against the fake GitHub (`e2e/journey.spec.ts`). On 2026-11-01 the owner's real data repo saved its first record, a company. Still to do: the rest of the journey against a real private repo.

## Phase 3 - portability and hardening

- [x] Search over current fully loaded snapshot (spec 05). Includes the Search page in the main navigation, every record type, the record type filter, archived records on request, and the first 10 results per group. Measured at 100, 500, and 2,000 records (docs/06); no search package.
- [x] Full JSON snapshot ZIP, per-entity CSV, data dictionary. Includes the Export card in Settings, CSV cells safe from formulas, generated JSON Schemas, and no export while a file cannot be read or the records may be out of date. Measured at 100, 500, and 2,000 records (docs/06).
- [x] Delete with a cascade preview in one commit (ADR-021). Includes a delete page for each record type and for activities, the "Also deleted" and "Unlinked" lists, the history warning, a conflict when any file under `data/` changed after the preview, and no delete while a file cannot be read. Measured at 100, 500, and 2,000 records (docs/06). Archive is built in Phase 2.
- [x] Browser and GitHub adapter failure-path E2E tests. `docs/10` lists each failure, what GitCRM does, and its test. `e2e/failures.spec.ts` adds 14: a truncated tree, query timeouts, newer or invalid workspace settings, a revoked token or lost write access during a session, a rate-limited save, a GitHub error on a save, lost responses, a write refused for another reason, a save beside another user's commit, two delete failures, and blocked browser storage. A `403` on a save now says to Refresh. Not tested: a renamed repository and a branch that requires pull requests (`docs/12`).
- [x] CSP and static bundle audits. The built `index.html` carries a strict policy with Trusted Types; `npm run build` audits `dist/` for weaker policies, inline code, source maps, token-shaped strings, real email addresses, and unreviewed hosts (docs/07). Every browser test now runs against the built app, and a policy violation fails it. `e2e/security.spec.ts` adds 3. The `frame-ancestors` header comes with the deployment.
- [x] Accessibility pass. `e2e/accessibility.spec.ts` adds 24 tests: axe's WCAG 2.2 AA and best-practice rules on 20 pages and 8 states, focus indicators and field borders at 3:1, and the keyboard-only path. Three theme tokens are darker: `--destructive`, `--input`, and `--ring`. The "Delete" button and fields with errors now show the usual focus ring. Reflow is checked at 320 pixels. Still to do by a person: a screen reader run, text at 200%, and Windows contrast themes (docs/08).
- [x] Deploy the same build to a static host (ADR-010). From 2026-10-28 to 2026-10-31 this was a central copy on Cloudflare Pages (ADR-024); "Template distribution" below replaced it.
- [x] Performance optimization based on recorded measurements only. `e2e/bench.spec.ts` measured 100, 500, and 2,000 records, also with a 4 times slower CPU and on the central copy over slow 4G (docs/06, "Measured in the browser"). At 2,000 records, completing a task on Tasks missed the 2 s save target. Lists now come in pages of 50 (spec 08), rows are memos, and a new snapshot keeps each unchanged record. Every target now passes with room to spare.

**Exit:** MVP acceptance criteria pass, exports validate, no critical security issues remain.

## Right after the MVP

- [x] Typed custom fields (ADR-020, spec 10). Settings has a "Custom fields" card. The contact, company, and opportunity forms and pages show the fields, and search finds their values. A save keeps the values its form cannot show, and a conflict compares each field on its own. `.gitcrm/workspace.json` is `schemaVersion` 2 when it has fields. No list columns, sort, or filters yet. The stage card and the custom fields card each own one part of that file. A save keeps a loaded change to the other part.

### Template distribution

Owner decision 2026-10-31, after the first run against a real repository (ADR-025, ADR-026).

- [x] 1. Distribution. Each copy of the template deploys to its own GitHub Pages site with no secrets (spec 09). The central copy, its Cloudflare deploy, and `deploy/` are removed. The README is the setup guide.
- [x] 2. The setup screen (spec 01). On `<owner>.github.io`, Repository starts as `<owner>/gitcrm-data`. A link opens a pre-filled, private `github.com/new` form, then the token link follows. An empty data repository loads as an empty snapshot, and Initialize makes its first commit: Connect treats the `409` "Git Repository is empty." as an empty repository (S-09).
- [x] 3. Template updates (spec 11). `.github/workflows/template-update.yml` runs each Monday and by hand. For a newer release it pushes `template-update/<tag>` with the template's files, except `.github/workflows/`, and opens a pull request, or an issue when Actions may not open one. The copy's history is unrelated to the template's, so the update compares files, not commits. The template must be public for copies to read its releases.
- [x] 4. A manual run on the owner's own copy, from "Use this template" to the first record. Done on 2026-11-01 (docs/12, S-09 "Live run"). The owner found no rough spots.
- [x] 5. The update button (spec 11, owner decision 2026-11-01). On a copy's GitHub Pages site, the app reads the template's latest release with no token. When it is newer, a banner shows **Update GitCRM**, which opens the copy's Template update workflow. The workflow now runs only by hand, commits the release to `main`, and starts Deploy. No pull request, no schedule. A release whose `package.json` has another version is refused.

### Styling and CRM features

Owner request 2026-11-02: the app needs styling, and standard CRM features.

- [x] 1. Visual style, first slice (spec 12, ADR-027). Option C, "Dense and data-first", from three mock-ups. New theme tokens, IBM Plex fonts, a smaller type scale, one top bar with tabs. Dark by default; Settings, Appearance offers Light. Every page passes the accessibility checks in both themes.
- [x] 2. Visual style, second slice (spec 12). Contacts and Companies are dense tables with a column per field; the Pipeline list uses the same style. Each stage has a coloured mark next to its name. Task groups sit in boxes; they stay lists, because the same row shows on Home and on record pages.
- [ ] 3. More built-in contact fields.
- [ ] 4. List sort and filter by any field.
- [ ] 5. A public lead form. Needs an owner decision first: a browser cannot write to a private repo without a token (ADR-004).

## Future considerations (not promises)

- GitHub App sign-in through a stateless auth broker, only if real demand appears (ADR-009, deferred; design in `docs/05-AUTH-AND-ONBOARDING.md`).
- Offline-only export/import utilities and dedicated CRM import mappers.
- Local, explicit history-purge CLI with separate operator confirmation.
- Restrained visual improvements.

## Suggested issue order

1. P0 proof with the PAT route (ADR-008).
2. Record schema + deterministic paths + validation tests.
3. GitHub content adapter with compare-and-swap save.
4. Snapshot loader + performance benchmark.
5. Private repo onboarding.
6. Contacts/companies slice.
7. Pipeline and opportunity slice.
8. Tasks/activities slice.
9. Search and export.
10. Deletion, failure hardening, accessibility, release checks.

At every phase, update acceptance criteria before implementation and avoid adding speculative abstractions.
