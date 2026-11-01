# Spec 02 - Contacts and Companies

**Priority:** MVP  
**Depends on:** `docs/02-DATA-MODEL.md`, `docs/03-REPOSITORY-LAYOUT.md`

## User stories

As a solo consultant, I want to maintain contacts and companies, with lightweight relationships and notes, so that I remember whom I work with without administrative overhead.

## In scope

- Contacts: create, view, edit name/email(s)/phone(s)/tags/company association, archive, unarchive, and safe current-snapshot deletion.
- Companies: create, view, edit name/website/tags, archive, unarchive, and safe deletion.
- Detail views show related records and recent manual activities.
- List views support filters, search, and sensible sort (name, recently updated).
- Custom fields are in spec 10. No deduplication engine, enrichment, or email integration.

## Acceptance criteria

```gherkin
Scenario: Create a contact
  Given I am connected to a writable private workspace
  When I save a contact named "Ava Bennett" with an email address
  Then a new UUID-named JSON document exists under data/contacts/<shard>/
  And the document validates against schema version 1
  And the contact appears after a fresh reload

Scenario: Associate a company
  Given a company exists
  When I assign that company to a contact
  Then the contact stores the company UUID
  And the company detail lists the contact

Scenario: Edit contact
  Given I load a contact at a known Git blob SHA
  When I update the email and save
  Then the update commit uses the expected blob SHA
  And no unrelated contact file changes

Scenario: Invalid email
  When I enter a malformed nonempty email
  Then I see a field error and cannot save

Scenario: Archived contact
  Given a contact is archived
  When I visit the standard contacts list
  Then it is hidden until Archived is enabled
  And it can be restored without changing its UUID
```

## Notes

Phase 2 builds everything here except Delete. Phase 3 builds Delete with the cascade preview (spec 06, "Delete rules"). Detail views list related opportunities; tasks and activities follow when those screens exist. Exports, and their test, come in Phase 3. A save that meets a conflict shows the compare panel from spec 07.

Duplicate contacts are allowed for MVP. Warn on exact duplicate email if trivial, but do not silently merge. Deleting a company unlinks its contacts and opportunities and deletes its related tasks and activities, in one commit after a preview (ADR-021). Note entry creates a separate Activity document, not a growing notes array on the contact file.

## Test gate

Domain validation tests; mock GitHub adapter; E2E create/edit/association/archival; verify that contact and company exports preserve their relationships.
