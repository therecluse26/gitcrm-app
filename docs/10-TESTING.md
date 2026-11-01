# Test Strategy and Quality Gates

## Test pyramid

**Unit:** schema parsing, validation, field transformations, path derivation, immutable ID logic, relationship integrity, search, money/date formatting, export serialization.

**Contract:** mocked GitHub API request/response sequences; handling changed SHA, missing repo, public visibility, missing scopes, rate limit, invalid tree, truncated tree, and partial fetch. No real GitHub credentials in source control.

**E2E:** browser user flows against the fake GitHub (`src/test/fake-github.ts`), so the real adapter runs in the browser. The tests run against the built app (`vite build`, then `vite preview`), so the Content Security Policy applies, and a policy violation fails the test (docs/07). Only the developer page's test uses the dev server. The `github-pages` project serves the same build from `/GitCRM/` with no custom headers, the way GitHub Pages serves a project site, and runs the journey, security, and hosting specs (spec 09). In CI, `E2E_BUILD=dist` makes the tests serve the folder that then deploys. An optional separate suite against a **disposable private GitHub repo** tests real API semantics, never production CRM data.

**Tools (ADR-012):** Vitest for unit and contract tests, MSW to mock the GitHub API, Playwright for E2E, and axe-core inside Playwright for the accessibility checks (docs/08). Run them with `npm test` and `npm run test:e2e`.

## Core test cases

1. A UUID record is written at the expected sharded path and re-parses identically.
2. A contact linked to a company appears on both detail views.
3. An opportunity with 250000 minor units USD displays $2,500.00, independent of binary float rounding.
4. Moving a deal stage produces exactly one record mutation and remains after reload.
5. A task becomes overdue based on its calendar date (test around timezone boundaries).
6. Two clients editing the same old SHA cause an explicit conflict; one cannot erase the other's update silently.
7. Two users editing separate files can each save, with appropriate retries for GitHub branch-level conflicts.
8. A public repository fails connection and cannot receive any CRM record writes.
9. Invalid JSON or unknown version prevents a "complete" export.
10. Untrusted note HTML is displayed as text, never executed.
11. Deleting a record deletes its related tasks and activities and unlinks other records in one commit, after a preview; no dangling links remain, and a moved `main` never causes a silent overwrite.
12. JSON and CSV exports round-trip expected fields and relations.
13. Token never appears in console output, URLs, cookies, or the static build; it is stored only under its one browser-storage key and deleted on Disconnect.
14. `Disconnect` removes private data from view and app caches.
15. A GitHub API rate-limit response respects `retry-after` and does not trigger a tight retry loop.
16. Each user action makes a bounded, expected number of GitHub requests (contract tests count them). With several tabs open, only one tab checks `main`; below 500 remaining requests, background checks pause (ADR-023).
17. A save keeps the custom field values that its form cannot show. Two users who change different custom fields of one record both keep their change (spec 10).
18. A save from one Settings card keeps a loaded change from the other card. A loaded change to the card's own part is a conflict (spec 10, "Error handling").
19. Connect to an empty data repo, with no commits, offers Initialize, and Initialize makes the repo's first commit (spec 01, S-09).
20. A newer template release shows the update banner on a copy's GitHub Pages site, with no token in the request. The update becomes one commit on `main` with the template's files, except `.github/workflows/`, and the run summary lists the workflow files to copy by hand (spec 11).

## Failure paths

Each failure has a browser test against the fake GitHub. "New" marks the tests in `e2e/failures.spec.ts`. The fake's responses follow the spikes (S-02, S-08) unless the row says "unverified".

| Failure | What GitCRM does | Test |
| --- | --- | --- |
| Public repository | Refuses it and writes nothing | `connect.spec.ts`, `dev-page.spec.ts` |
| Repository the token cannot see (`404`) | Lists every cause | `connect.spec.ts` |
| Read-only token, or an archived repository | Opens read-only and says why | `connect.spec.ts`, and each record spec |
| Token revoked, found on page load | Forgets the token and asks to connect again | `connect.spec.ts` |
| GitHub unreachable on page load | Keeps the cached records on screen, read-only | `connect.spec.ts` |
| The tree is truncated on the first load | Stops, says why, and writes nothing | New |
| A GraphQL query times out (`502`, `504`) on the first load | Retries it once, split in two; a second timeout stops the load and says why; Connect again loads the records | New |
| Workspace settings from a newer GitCRM, or not valid | Shows the blocked screen and writes nothing | New |
| A record file that cannot be read | Names the file; export and delete wait | `contacts-companies.spec.ts`, `export.spec.ts`, `delete.spec.ts` |
| Offline save | Keeps the form, and does not claim the save succeeded | `contacts-companies.spec.ts` |
| Token revoked during a session | The save fails with "The token expired or was revoked"; one request, no other credential | New |
| Write access lost during a session (`403`) | The save passes on GitHub's words and says to Refresh; Refresh opens read-only | New; message in `operation-state.test.ts` |
| Rate limit on a save | Says when to try again; a Save before then sends nothing | New; checks in `sync.spec.ts` |
| GitHub error (`5xx`) on a save | Keeps the form and sends one request; the next Save works | New |
| Create response lost, file on `main` | Reads the file, counts the save once, and makes no duplicate | New |
| Response lost, and the read gets no answer | Says the change may or may not be saved, and to reload | New |
| A write refused for another reason, such as a branch rule (response unverified) | Passes on GitHub's words; one request; the form stays | New |
| Same record changed by someone else | Conflict panel; nothing overwritten | `contacts-companies.spec.ts`, `opportunities.spec.ts` |
| Another record changed by someone else | The save works, and both changes stay on `main` | New |
| Delete: ref update response lost | Reads `main`, and reports the delete once | New |
| Delete: `main` moves on every attempt | Stops after 3 attempts and deletes nothing | New |
| Delete: a record changed after the preview | Deletes nothing and reloads the lists | `delete.spec.ts` |
| A failed focus check | Runs the connect checks before it reports a problem | `sync.spec.ts` |
| Fewer than 500 requests left | Pauses focus checks; saves and Refresh still work | `sync.spec.ts` |
| Browser storage blocked (private window, site data off) | Connects for this tab only; a reload asks again | New |

No spike recorded GitHub's response for a branch that requires pull requests, or for a renamed repository (`docs/12`). The branch-rule test uses a stand-in response. A renamed repository has no test.

## Nonfunctional probes

- Prototype at 100/500/2000 generated records; measure time, requests, bytes, memory. `e2e/bench.spec.ts` times the built app at each size against the fake GitHub, five runs each (docs/06, "Measured in the browser"). It runs only on request: `BENCH=1 npx playwright test --project bench`.
- Verify responsive UI on a modest laptop and throttled connection. In the bench, `BENCH_CPU=4` makes the CPU 4 times slower, and `BENCH_NETWORK=1` adds a slow 4G network. `BENCH_URL=https://<owner>.github.io/<repo>/` times a deployed copy. Playwright turns off the HTTP cache while a route is on, so with `BENCH_NETWORK` the warm page load runs with no route and `api.github.com` blocked.
- Audit accessibility: keyboard-only contact creation, Kanban stage movement, and errors. `e2e/accessibility.spec.ts` does this, and checks each page against WCAG 2.2 AA (docs/08, "Accessibility checks").
- Scan production static artifact for real data, developer tokens, and unsafe embed configuration. `npm run build` runs the build audit, and `e2e/security.spec.ts` checks the policy and the frame refusal (docs/07). After each deploy, `scripts/check-deploy.ts` checks the live copy (docs/07, "Deployment").

## Release gate

No MVP release without passing functional acceptance criteria, conflict tests, a documented auth/security review, and a demonstration that the chosen static host permits the intended use.
