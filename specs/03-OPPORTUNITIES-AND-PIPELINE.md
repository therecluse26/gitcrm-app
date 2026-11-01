# Spec 03 - Opportunities and Pipeline

**Priority:** MVP

## User story

As a solo founder, I want to track opportunities across a small set of stages and see what needs attention without a sophisticated sales platform.

## In scope

- Create opportunity: title (required), stage, amount (optional), currency, expected close date, associated company, associated contacts.
- Show a Kanban board and an accessible list-view alternative.
- Move between configured stages; changes persist as a record commit.
- Defaults: Lead, Qualified, Proposal, Won, Lost.
- Edit stages in Settings: rename, reorder, add, and remove a stage no opportunity uses. Won and Lost always exist (ADR-019).
- Show active pipeline (excluding Won/Lost by default when user chooses Open filter) and optional archived items.
- No complex forecast probabilities, tax calculation, product catalog, or quote generation.

## Acceptance criteria

```gherkin
Scenario: Create opportunity
  Given workspace stages are valid
  When I create "Website rebuild" in Proposal with value $2500.00 USD
  Then its document stores stageId "proposal" and valueMinor 250000
  And it appears in the Proposal column

Scenario: Move stage
  Given an opportunity is in Lead
  When I move it to Qualified
  Then exactly that opportunity's document is updated in main
  And its new stage persists after refresh

Scenario: Move via keyboard
  Given I cannot use drag and drop
  When I use the opportunity's Move to stage menu
  Then I can select an allowed stage without a mouse

Scenario: Rename a stage
  Given opportunities exist in Proposal
  When I rename Proposal to "Quote sent"
  Then only .gitcrm/workspace.json changes, in one commit
  And those opportunities appear in the "Quote sent" column

Scenario: Remove a stage in use
  Given an opportunity is in Qualified
  When I try to remove Qualified
  Then the removal is blocked with the count of opportunities in it

Scenario: Terminal stages stay
  When I try to remove Won or Lost
  Then the removal is not offered

Scenario: Missing relation
  Given I select a contact UUID that is not in the workspace
  When I try to save
  Then the association is rejected with a clear validation message

Scenario: Financial values
  When I enter a value with decimal currency units
  Then the app converts to integer minor units using currency-aware rules
  And preserves exact value through save and export
```

## Notes

Phase 2 builds everything here except Delete. Phase 3 builds Delete with the cascade preview (spec 06, "Delete rules"). Export, and its test, also come in Phase 3. A move shows as "Moving…" in its new stage until the commit lands. A failed move puts the card back and says why. One move runs at a time. Stage edits stay in a draft until "Save stages"; if someone else changed the stages first, nothing is saved until the latest stages are loaded. A loaded change to another part of the settings file, such as the custom fields, does not block the save (spec 10, "Error handling").

Amounts use a period for decimals, so "2.500,00" is refused with a message rather than read another way.

## Error handling

Invalid pipeline stage, stale record SHA, rate limit, and outdated company/contact relations cannot silently mutate data. Keep unsaved stage movement visible as pending until committed; restore the previous position on failure.

## Test gate

Money conversion edge cases, negative values rejected, stage membership checks, drag + keyboard paths, concurrent stage edit conflicts.
