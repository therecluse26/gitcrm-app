# Data Model and Invariants

## General rules

- **JSON, UTF-8, pretty-printed, deterministic property ordering**, newline at EOF.
- One file per document. No arrays of all contacts/opportunities in a single file.
- `id` is an immutable RFC 4122 UUID v4 (from `crypto.randomUUID()`); never use names/emails as IDs or paths.
- `schemaVersion: 1`, `type`, `id`, `createdAt`, `updatedAt`, and `archivedAt` are common fields. Timestamps are UTC ISO 8601 strings; `archivedAt` is `null` when active.
- Unknown schema versions or malformed documents trigger a visible validation issue; do not silently discard them from exports.
- Optional references MUST refer to same-workspace IDs; dangling references are surfaced and cannot be created through UI.
- No HTML strings stored as rich text in MVP; activity bodies are plain text.
- Monetary values are integer minor units (e.g. cents), not binary floating-point currency.

## Validation and canonical form (Phase 1, not yet reviewed)

`src/core/schemas.ts` and `src/core/record-file.ts` implement these rules. No ADR covers them, and the owner has not reviewed them yet.

- The canonical file is `JSON.stringify(record, null, 2)` plus a final newline. Keys follow the order in the examples below, and `customFields` keys are sorted. Arrays put one item per line, unlike the compact arrays in the examples.
- Every key in the examples is required; an empty value is `null` or `[]`. Only `customFields` may be left out.
- An unknown key makes the file invalid. A hand-added field then shows up as an issue, instead of disappearing on the next save.
- IDs are lowercase UUID v4. Timestamps are written to the second (`2026-10-26T16:00:00Z`). A timestamp with an offset, such as `+01:00`, is invalid.
- `website` must be an `http` or `https` URL with a domain name, so a `javascript:` link cannot be stored.
- Names, titles, and activity bodies must not be blank. A task `description` may be an empty string.
- `related` points only to a contact, a company, or an opportunity.
- Stage IDs and custom field IDs use lowercase letters, digits, `-`, and `_`, up to 64 characters.
- A file over 100 KiB is an issue and is not parsed (the size cap in `docs/07`).
- Issue codes: `too-large`, `invalid-json`, `unsupported-version` (a newer `schemaVersion`), `invalid-record`, `path-mismatch` (the type or ID differs from the path), `unrecognized-path` (a file under `data/` outside the layout), `broken-link`, and `custom-field`.
- `broken-link` (`src/core/links.ts`): a `companyId`, `contactIds` entry, or `related` link names no record of that type in the snapshot. An archived record counts as present. The record still loads, and Settings lists the issue. The UI offers only existing records, so it cannot create a broken link.
- `broken-link` also covers an opportunity whose `stageId` is not in `.gitcrm/workspace.json`. The pipeline shows it in an "Unknown stage" column until someone moves it. This can happen when one person removes a stage while another moves an opportunity into it.
- `custom-field` (`src/core/custom-fields.ts`): a stored custom field value that does not fit its field, or that has no field of its record type. The record still loads, and Settings lists the issue (spec 10).

## Workspace configuration

Path: `.gitcrm/workspace.json`

```json
{
  "schemaVersion": 1,
  "workspaceId": "f81d4fae-7dec-4c1d-ae0c-0d04ef1a7291",
  "name": "Example Studio",
  "defaultCurrency": "USD",
  "pipelineStages": [
    { "id": "lead", "label": "Lead", "position": 0 },
    { "id": "qualified", "label": "Qualified", "position": 1 },
    { "id": "proposal", "label": "Proposal", "position": 2 },
    { "id": "won", "label": "Won", "position": 3 },
    { "id": "lost", "label": "Lost", "position": 4 }
  ]
}
```

`schemaVersion` is 2 when the file has `customFields` ("Custom fields" below), and 1 when it has none.

Users edit stages in Settings (ADR-019): rename, reorder, add, and remove. Stage IDs never change; a new stage gets a lowercase ID derived from its first label, with a numeric suffix on collision. A stage can be removed only when no opportunity uses it. Exactly one `won` and one `lost` terminal stage always exist; they can be renamed but not removed. Workflow configuration itself is not an automation system.

Built rules (`src/core/stages.ts`): a new stage goes before the first terminal stage. Its ID base is cut to 56 characters, so a suffix such as `-12` stays within 64. Positions are written as 0 to n-1 on every save. Two stages cannot have the same name, ignoring case and outer spaces.

Money (`src/core/money.ts`): the decimal places come from the currency through `Intl`, for example 2 for USD, 0 for JPY, and 3 for KWD. The form accepts a period for decimals, and commas only between thousands. It refuses a negative amount and extra decimal places, and never uses binary floating point.

## Contact

```json
{
  "schemaVersion": 1,
  "type": "contact",
  "id": "d13d0f69-0a4c-4192-9009-9e36a51c42c0",
  "name": "Ava Bennett",
  "emails": ["ava@example.test"],
  "phones": [],
  "companyId": "a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf",
  "tags": ["referral"],
  "createdAt": "2026-10-26T16:00:00Z",
  "updatedAt": "2026-10-26T16:00:00Z",
  "archivedAt": null
}
```

`name` required; email format optional but validated when present. `companyId` optional/null. No password, secret, or sensitive custom fields.

## Company

```json
{
  "schemaVersion": 1,
  "type": "company",
  "id": "a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf",
  "name": "Example Studio",
  "website": "https://example.test",
  "tags": [],
  "createdAt": "2026-10-26T16:00:00Z",
  "updatedAt": "2026-10-26T16:00:00Z",
  "archivedAt": null
}
```

`name` required, `website` nullable and validated as a URL when present.

## Opportunity

```json
{
  "schemaVersion": 1,
  "type": "opportunity",
  "id": "e8c756c7-f1b2-4c47-9d3d-26457c6b0979",
  "title": "Website rebuild",
  "stageId": "proposal",
  "companyId": "a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf",
  "contactIds": ["d13d0f69-0a4c-4192-9009-9e36a51c42c0"],
  "valueMinor": 250000,
  "currency": "USD",
  "expectedCloseDate": "2026-11-30",
  "createdAt": "2026-10-26T16:00:00Z",
  "updatedAt": "2026-10-26T16:00:00Z",
  "archivedAt": null
}
```

`title` and valid `stageId` required; `companyId` nullable; `contactIds` possibly empty. `valueMinor` nullable nonnegative integer; dates ISO `YYYY-MM-DD` (local calendar intent, not UTC instant). CRM can show won/lost based on `stageId`; no second conflicting status field.

## Task

```json
{
  "schemaVersion": 1,
  "type": "task",
  "id": "9b8b4d79-75d6-450c-a492-1e0638d49cd8",
  "title": "Follow up on proposal",
  "description": "Ask about next steps",
  "dueDate": "2026-11-02",
  "completedAt": null,
  "related": { "type": "opportunity", "id": "e8c756c7-f1b2-4c47-9d3d-26457c6b0979" },
  "createdAt": "2026-10-26T16:00:00Z",
  "updatedAt": "2026-10-26T16:00:00Z",
  "archivedAt": null
}
```

`related` may be null. Task completion is manual; due dates are displayed, not scheduled in the background.

Built rules (`src/features/tasks/task-list.ts`, `src/core/local-time.ts`): a task is overdue when its `dueDate` is before today's date in the browser's time zone. A task due today is not overdue. "Today" moves on at local midnight while the page is open. Complete sets `completedAt` to the UTC time, to the second; Reopen sets it to null. The task form never changes `completedAt`.

## Activity

```json
{
  "schemaVersion": 1,
  "type": "activity",
  "id": "bf80abe2-aeda-4aec-8fc4-75f44e55d04b",
  "kind": "note",
  "body": "Discussed timeline and budget.",
  "occurredAt": "2026-10-26T16:15:00Z",
  "related": { "type": "contact", "id": "d13d0f69-0a4c-4192-9009-9e36a51c42c0" },
  "createdAt": "2026-10-26T16:16:00Z",
  "updatedAt": "2026-10-26T16:16:00Z",
  "archivedAt": null
}
```

Allowed `kind` values: `note`, `call`, `meeting`, `email_manual`. Activity is **manual documentation**, not automated email capture. Each item gets its own document so a record can be targeted by a future purge tool.

Built rules (`src/features/activities/`): `occurredAt` is entered in local time and stored in UTC, to the second. A timeline shows the latest activity first; activities at the same moment are ordered by ID. The body is plain text. The UI never renders it as HTML, so markup in a note shows as typed.

## Custom fields (built; ADR-020, spec 10)

Contacts, companies, and opportunities have an optional `customFields` object, from field ID to value. Users define the fields in Settings, with the same ID-plus-label pattern as pipeline stages. Spec 10 has the user rules and how each type is stored.

```json
// .gitcrm/workspace.json, with "schemaVersion": 2
"customFields": {
  "contact": [
    { "id": "linkedin", "label": "LinkedIn", "type": "url", "position": 0, "archived": false, "options": [] },
    { "id": "lead-source", "label": "Lead source", "type": "select", "position": 1, "archived": false,
      "options": [{ "id": "conference", "label": "Conference", "archived": false },
                  { "id": "referral", "label": "Referral", "archived": false }] }
  ],
  "company": [],
  "opportunity": []
}

// a contact file
"customFields": { "lead-source": "referral", "linkedin": "https://linkedin.com/in/ava" }
```

- Types: `text`, `number`, `date`, `checkbox`, `url`, `select` (one choice).
- A field's type never changes; to change type, create a new field.
- Removing a field or a select option sets `archived` to `true`. Record values stay in place, hidden, and return on restore.
- A value that does not fit its definition is a `custom-field` issue, never silently dropped.
- Out of scope: required fields, defaults, formulas, multi-select, record-link fields, per-field permissions.

Built rules (`src/core/custom-fields.ts`):

- `contact`, `company`, and `opportunity` are always present. `options` is always present, and it is `[]` unless the type is `select`.
- In one list, field IDs and positions are unique. In one field, option IDs are unique. An option ID comes from its first name, the same as a field ID.
- Active fields come first, by position, then removed fields. Positions are written as 0 to n-1 on every save.
- A record save writes only the custom fields that its form changed. Other values stay as stored.
- `null` means no value. A `null` value for an unknown field ID is not an issue.

## Schema evolution

Any change to persisted shape MUST include versioned schema validation, migration tests, and an export compatibility statement. `schemaVersion` is required per record and in workspace config; unknown newer versions should open in read-only/error mode, not be rewritten by older clients.

Built (spec 10): custom fields took `.gitcrm/workspace.json` to version 2. A settings file without custom fields stays at version 1, so a workspace that never uses them still opens in an older GitCRM. That older GitCRM refuses a version 2 file as newer and writes nothing. Record files stay at version 1, because v1 already reserved `customFields`. The export says both versions in `DATA-DICTIONARY.md`.
