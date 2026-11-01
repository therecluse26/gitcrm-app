# Search and Performance

## Principle

Git stores the truth. The **current checked-out logical snapshot on `main`** is the query dataset. Never search Git history to answer a normal CRM query; never introduce a hosted search index.

## Search behavior

- Search contacts by name, email, phone, tags, and company name.
- Search companies by name and website.
- Search opportunities by title, stage, linked contact/company, and exact/filtered value.
- Search tasks and activities by title/body and associated record.
- Case-insensitive, trimmed, forgiving matching. A local fuzzy-search library is optional.
- Results must update after a successful write and must not expose archived records by default.

## Implementation sequence

1. Load a complete validated workspace snapshot.
2. Build in-memory lookup maps by record ID and relations.
3. Implement basic text filtering plus structured filters and sorting.
4. Measure latency at 100, 500, and 2,000 entities before adding a search package.
5. Add MiniSearch/FlexSearch only if results show basic filtering is inadequate.

A "flat file search engine" is a legitimate optimization, but the most likely expensive operation is downloading thousands of distinct blobs from GitHub. Focus early measurement there.

## Transport measurement spike

With a private disposable repository, generate datasets of approximately 100, 500, and 2,000 documents, with realistic average note lengths. Record:

| Measurement | Why |
| --- | --- |
| First load wall-clock | Onboarding experience |
| Requests per initial load | GitHub rate limits |
| Bytes transferred | Mobile and slow network cost |
| Search latency | Validates local-only query assumption |
| Refresh latency after one edit | Confirms incremental approach |
| Concurrent update result | No silent data loss |
| Browser memory peak | Avoid bloated client state |

Measure the GraphQL tree walk first, then per-blob fetching (`docs/04-GITHUB-INTEGRATION.md`). The archive download is ruled out (spike S-01).

### Targets (spike pass criteria, agreed 2026-10-27)

| Measurement | Target |
| --- | --- |
| Page load with a warm cache | Under 1 second |
| Save one record | Under 2 seconds |
| First load on a new device, 500 records | Under 10 seconds |
| Two people save the same record | Always an explicit conflict, never a silent overwrite |

If first load misses the target at 2,000 records, use a faster transport or the verified rollup (ADR-016); the rest of the design stays.

**Search latency, measured 2026-10-30** (spec 05): Chromium through Playwright on the development machine, against the fake GitHub. One run per size; each number is the median of 7 keystrokes, from the input event until React has drawn the results. Filtering is fast (S-04: about 0.15 ms at 2,000 records). Drawing the result rows is the cost.

| Search | 100 records | 500 records | 2,000 records |
| --- | --- | --- | --- |
| "e" (matches every record), every row drawn | 53 ms | 116 ms | 737 ms |
| "e", the first 10 per group (built) | 32 ms | 31 ms | 37 ms (slowest 47 ms) |
| "ava bennett", the first 10 per group | 5 ms | 10 ms | 27 ms |

After "Show all", one record type draws every result. At 2,000 records, "e" took 29 ms for 600 contacts, 255 ms for 500 tasks, and 318 ms for 400 activities. A task or activity row costs about 0.5 to 0.8 ms. Building each date formatter once halved the activity time but not the task time, so that change was not kept. No search package: the filter is not the slow part.

**Export time, measured 2026-10-30** (spec 05): the same setup, three exports at each size, from the click until the browser starts the download. The records are 15% companies, 30% contacts, 10% opportunities, 25% tasks, and 20% activities with notes of about 380 characters. fflate's `zipSync` builds the ZIP on the page.

| Export | 100 records | 500 records | 2,000 records |
| --- | --- | --- | --- |
| JSON snapshot | 50–60 ms, 50 KiB | 63–97 ms, 220 KiB | 155–175 ms, 860 KiB |
| CSV | 26–46 ms, 13 KiB | 37–50 ms, 34 KiB | 49–62 ms, 113 KiB |

**Delete time, measured 2026-10-30** (spec 06): the fake GitHub in the browser, three runs at each size. The deleted company has 2 tasks and 3 activities, and 3 contacts and 2 opportunities link to it. "Preview" is from the click on Delete until the page lists the changes. "Delete" is from the click on "Delete company" until the Companies list shows. Real GitHub adds about 2 s for the commit (spike S-02).

| Delete | 100 records | 500 records | 2,000 records |
| --- | --- | --- | --- |
| Preview | 50–56 ms | 41–42 ms | 37–43 ms |
| Delete, with the fake GitHub | 114–118 ms | 119–122 ms | 167–212 ms |

**Measured in spike S-04** (Node, OAuth token, one run each; see `docs/12-RISKS-AND-OPEN-QUESTIONS.md`):

| Measurement | Target | Result |
| --- | --- | --- |
| Page load with a warm cache | Under 1 s | ~0.2 s (one `GET` of the ref) |
| Save one record | Under 2 s | 0.7–0.8 s (S-02) |
| First load, 500 records | Under 10 s | 3.1–4.8 s with chunked GraphQL (two runs); 12.5 s per-blob |
| First load, 2,000 records | (none) | 5.1–8.5 s with chunked GraphQL (two runs); 47.7 s per-blob |
| Same-record conflict | Explicit, never silent | `409` on a stale SHA (S-02) |

**Measured in the browser, 2026-10-31** (`e2e/bench.spec.ts`, docs/10): the built app in Chromium through Playwright, against the fake GitHub, five runs at each size. Each number is the median. The records are the export mix above. "Slow CPU" makes the CPU 4 times slower through Chrome DevTools, for a modest laptop. The fake GitHub answers at once, so each number is the app's own time; GitHub's time comes from S-02 and S-04.

Against the targets, at 2,000 records with the slow CPU:

| Target | App's own time | GitHub's time | Total |
| --- | --- | --- | --- |
| Page load with a warm cache, under 1 s | 590 ms; 598 ms on the central copy over slow 4G | None: the cached records show first, then the ref check runs (~0.2 s, S-04) | About 0.6 s |
| Save one record, under 2 s | 313 ms from the contact form; 327 ms to complete a task on Tasks | 0.7–0.8 s (S-02) | About 1.1 s |
| First load on a new device, 500 records, under 10 s | 1.86 s for the Connect screen over slow 4G, then 299 ms from Connect | 3.1–4.8 s (S-04) | About 5–7 s, plus typing the token |

Before this change, every list drew every row: 600 contacts and 500 tasks at 2,000 records. Completing one task drew the whole Tasks list two times, once for "Saving…" and once for the commit. Each save also built every record as a new object, so no row could skip a draw. And each task row's link filtered all 2,000 records again. Completing a task took 2.5 s of app time with the slow CPU, so with GitHub the save missed its 2 s target.

The changes:

- Lists come in pages of 50, and Home's "Tasks due" shows the first 10 (spec 08).
- List rows are memos (`React.memo`) with stable props. The save callbacks stay the same function between draws.
- A new snapshot keeps the object of each file with the same blob SHA (`keepUnchanged` in `src/storage/snapshot.ts`). So after a save or a refresh, only the changed rows draw again.
- The record lists of each type, and the lookup for links, are built once per snapshot.

The same steps on `main` and with the change, measured one after the other, at 2,000 records:

| Step | Development machine | Slow CPU |
| --- | --- | --- |
| Open Contacts | 66 → 32 ms | 306 → 157 ms |
| Open Tasks | 336 → 37 ms | 1,990 → 200 ms |
| Open Pipeline | 118 → 69 ms | 506 → 376 ms |
| Complete one task on Tasks | 450 → 65 ms | 2,457 → 327 ms |
| Next page on Tasks | 30 ms (new) | 155 ms (new) |

The other steps stayed within the noise between runs: the Connect screen, the first load, the warm page load, and the contact save.

Other results:

- Bytes from the host on a new device: 197 KB, compressed with Brotli by Pages. A warm visit gets about 1 KB: Pages sends `Cache-Control: public, max-age=0, must-revalidate` for every file, so the browser asks again for each one. The warm load still meets its target, so `_headers` has no caching rule.
- JavaScript heap after the first load: 5 MB at 100 records, 6 MB at 500, and 7 MB at 2,000.
- The central copy on Cloudflare Pages (removed by ADR-025) over slow 4G (150 ms, 1.6 Mbit/s down) with the slow CPU: the Connect screen in 1.73–1.86 s, and the warm page load in 467 ms (100 records) to 598 ms (2,000). These runs used `main` at `9d05d51`, before this change.
- The Pipeline board has pages of 50 in each column. At 2,000 records, a column has about 40 cards, so the board still draws about 200: 376 ms with the slow CPU.
- The Base UI checkbox costs about 1 ms per draw with the slow CPU. With 50 rows on a page, that cost is small, so the checkbox stays.

## Caching

- Treat git blob SHA and tree/commit SHA as the cache keys.
- Records are cached in IndexedDB, keyed by blob SHA (ADR-017). The cache hydrates the in-memory store at startup; see `docs/04-GITHUB-INTEGRATION.md`. Disconnect deletes the cache; nothing sensitive goes into static assets or service-worker caches.
- If HEAD SHA is unchanged, reuse the current snapshot.
- If HEAD moves, fetch a new tree and only changed blobs, then rebuild affected indexes.
- The verified rollup (ADR-016, `docs/04-GITHUB-INTEGRATION.md`) is not built: S-04 showed that chunked GraphQL meets the targets (ADR-022).
- Never mix record versions from different snapshots without visibly reporting partial/inconsistent load.

## Intended scale

Small teams, hundreds or a few thousand records, low write volume. Not designed for tens of thousands of rapidly edited records, real-time activity streams, or daily bulk imports. Prefer an honest documented scale boundary to complex backend indexing.
