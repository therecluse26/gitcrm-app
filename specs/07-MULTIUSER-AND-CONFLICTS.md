# Spec 07 - Tiny-Team Collaboration and Conflicts

**Priority:** MVP

## Goal

Support a handful of collaborators on the same private repository without silently losing edits. Do not introduce a realtime service, event bus, locks server, or CRM-specific RBAC system.

## Model

- Team workspaces live in a GitHub organization (ADR-018).
- Every collaborator uses their own GitHub-authorized identity/credentials; no shared PATs.
- Repository access is governed by GitHub permissions.
- Writes target `main` with expected old blob SHA for updates/deletes.
- Cache tracks current blob SHA and commit/tree SHA.
- If another user modifies **the same record**, local edits require explicit resolution.
- If users modify different records, serialize and retry safely only as permitted by API semantics; avoid blindly repeating a mutation after an ambiguous network response.

## Acceptance criteria

```gherkin
Scenario: Edit distinct documents
  Given two collaborators have a valid snapshot
  When one edits contact A and another edits opportunity B
  Then both saves can eventually succeed without an app server
  And neither document is overwritten by the unrelated change

Scenario: Edit same document
  Given two collaborators load the same contact SHA
  When collaborator A saves first
  And collaborator B submits a different edit against the old SHA
  Then B is told there is a conflict
  And B can compare their unsaved changes with the latest remote record
  And B must explicitly resolve before a new save

Scenario: Offline save attempt
  Given network access is lost
  When I click Save
  Then the app does not claim the save succeeded
  And the unsaved form remains available in current browser memory

Scenario: Ambiguous network failure
  Given a write request may have reached GitHub but the response is lost
  When the app reconnects
  Then it reads the target document before deciding whether to retry
  And it never creates an unintended duplicate record

Scenario: Repository permission revoked
  Given I lost permission since loading the app
  When I try to save
  Then the operation fails with a clear permission message
  And no alternative credential is silently used
  And the unsaved form remains available
  And after a 403, the message says to Refresh, which runs the connect checks again

Scenario: Low API budget
  Given fewer than 500 REST requests remain this hour
  When the app would run a background check of main
  Then it skips the check and shows a quiet notice
  And saves and the refresh button still work

Scenario: Many open tabs
  Given the same workspace is open in five tabs
  When the tabs gain focus
  Then only one tab checks main
  And the other tabs receive its results
```

## Conflict UI requirements

Show the record type/name, remote updated value, local unsaved value, and actions: Discard mine, Copy mine, and Retry after review. A full three-way text merge tool is unnecessary initially. Preserve edited form values until resolved or the user explicitly discards.

Retry after review saves the remote version with my changed fields on top. Some fields mean something only together. An opportunity's `valueMinor` and `currency` are one group: when I changed one, the retry keeps both of mine, so my amount never gets their currency.

## Limits

This is **low-volume optimistic concurrency**, not realtime collaboration. No live cursors, locks, presence, instant feeds, or cross-repository merges. If a team's operational requirements exceed this model, recommend migration rather than introducing a server.
