# Spec 04 - Tasks and Manual Activities

**Priority:** MVP

## User stories

- As a user, I want to record a conversation note against a contact/company/opportunity so I can pick up where I left off.
- As a user, I want to set and check off a follow-up task without installing a task queue or reminder service.

## In scope

**Tasks:** title, description, dueDate, optional relation, completedAt; list overdue/upcoming/completed. 

**Activities:** plain-text body, kind `note | call | meeting | email_manual`, occurredAt, optional relation. These are **user-entered records**; `email_manual` does not sync emails.

Each task and each activity is stored in **its own JSON file**. No aggregated company history document or growing nested notes array.

## Acceptance criteria

```gherkin
Scenario: Add activity to a contact
  Given a contact exists
  When I log a note about a conversation
  Then a new activity document is committed
  And the note is visible on the contact detail timeline

Scenario: Create a follow-up task
  Given an opportunity exists
  When I add a due task linked to that opportunity
  Then the task appears in the opportunity's detail and the Tasks list

Scenario: Complete task
  Given a task is open
  When I mark it complete
  Then completedAt is a UTC timestamp
  And the item moves to the Completed filter after commit

Scenario: Overdue task without automation
  Given a task is due on a date before today's local calendar date
  When I open the Tasks screen
  Then it is displayed as overdue
  And no scheduled service was required to mark it overdue

Scenario: Untrusted note markup
  When a note contains literal HTML or scripts
  Then it renders as inert text, not executable markup
```

## Notes

Phase 2 builds everything here except Delete. Phase 3 builds Delete with the cascade preview (spec 06, "Delete rules"). "Add task" and "Log activity" on a contact, company, or opportunity page link the new record to it. An activity with no link shows only in Home's recent activity. A completion shows as pending until the commit lands; a failed one leaves the task open and says why. "Overdue" uses the browser's local date, with no background service.

## Out of scope

Email sending/capture, push notifications, SMS, calendar integrations, recurring tasks, reminders triggered while browser is closed, AI summaries, or automated activity generation.

## Test gate

Date handling across local timezone changes; task completion persistence; relation integrity; XSS tests; activity ordering by `occurredAt` with stable tie-breaking by ID.
