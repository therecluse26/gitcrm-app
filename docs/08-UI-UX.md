# UI and UX Specification

## Experience

Professional, minimal, and fast. Users should see CRM concepts, not Git internals. The UI must not require entering raw JSON. GitHub connectivity is setup and diagnostics, not the main user experience.

## Navigation

Primary: Home, Contacts, Companies, Pipeline, Tasks, Search, Settings. A unified record view includes tabs/sections for details, linked records, activities, and related tasks.

Built (spec 12): one top bar holds the main navigation as tabs, the repository, the sync status, and Refresh. The current page's tab has an accent line under it. There is no left navigation column.

Built (spec 08): on a phone, the main navigation wraps into rows, with no menu button. An address that matches no page shows "Page not found" inside the app.

Built (spec 08): no page draws a long list at once. Each list that can grow comes in pages of 50, with "Previous page" and "Next page": Contacts, Companies, Tasks, the Pipeline list and each board column, Search for one record type, and the lists on a record page. Home's "Tasks due" shows the first 10. List rows are memos, so a save draws again only the row that changed (docs/06).

## Screen behaviors

### Home

- Counts for active contacts/companies/opportunities.
- Open opportunities by stage (compact summary, no advanced forecasting).
- Due/overdue tasks and recent manual activity.
- Connection status and refresh affordance.

### Contacts and companies

- Searchable sortable list, create/edit form, detail view.
- Built (spec 12): the list is a dense table. Contacts: Name, Company, Email, Phone, Tags, Updated. Companies: Name, Website, Contacts, Tags, Updated.
- Contact may belong to a company; company detail shows associated contacts/opportunities.
- A notes/activity timeline, adding each note as a new activity record.

### Opportunities

- Kanban columns from workspace pipeline config; drag/drop and accessible menu/button move.
- Opportunity card shows title, linked company/contact, amount when present.
- Detail form edits stage, amount, expected close date, relations.
- Terminal stages visually distinct; no automatic downstream workflow.
- Built (spec 12): each stage has a coloured mark before its name, on the board and in the list. Open stages take four colours in pipeline order; Won is green, and Lost is grey.

### Tasks

- List grouped by overdue, upcoming, complete.
- Manual create/edit/complete and related entity linking.
- Date-aware visibility when the UI is open; no background reminders promised.

### Search

- Search across all loaded current records with entity-type filter.
- Keyboard-accessible results; never show archived records unless requested.
- Built (spec 05): a Search page in the main navigation. Results come in groups by record type; with "All types", each group shows its first 10, and one record type shows in pages of 50. The search text stays in memory, never in the page address.

### Settings

- Workspace name, connected GitHub repo, private status, connection health.
- Built (spec 12): an "Appearance" card with the theme, Dark or Light. Dark is the default. The choice is stored only while the connection is remembered.
- Export complete snapshot / CSV.
- Built (spec 05): an Export card with "Export JSON snapshot" and "Export CSV". It waits for a complete, current snapshot, and says why when it waits.
- Disconnect and token safety guidance.
- Pipeline stage editor: rename, reorder, add, and remove-when-unused; Won and Lost always present (ADR-019).
- Built (spec 10): a "Custom fields" card. It adds, renames, reorders, removes, and restores the fields of each record type, and the options of a choice list. It saves `.gitcrm/workspace.json` in one commit.

## Important system states

| State | UX requirement |
| --- | --- |
| No repo | Explain connection steps and privacy requirement |
| Loading | Progress, cancellation affordance where possible |
| Unsaved form | Clearly identify unsaved edits and warn before navigation |
| Saving | Disable duplicate submit; optimistic visual changes only with rollback |
| Committed | Show quiet success and optionally a GitHub commit link |
| Conflict | Show local vs current remote values; user decides retry/discard/merge |
| Rate limited | Explain delay; retain user changes |
| Invalid record | Explicit diagnostic, no silent omission from exported dataset |
| Disconnected | Clear loaded private data from UI, require reconnect |

## Accessibility

- All actions available with keyboard; accessible drag/drop alternative.
- Label inputs and validation errors; focus management on dialogs.
- Sufficient contrast; honor reduced motion; avoid color-only stage cues.
- Provide a list view alternative to Kanban for keyboard users and narrow screens.
- Built (spec 08): a "Skip to main content" button, and focus on the page heading after each page change. Each form error is linked to its field, and focus moves to the first field with an error.

### Accessibility checks

The target is WCAG 2.2 AA (PRODUCT_REQUIREMENTS). `e2e/accessibility.spec.ts` checks each page, and these states: the connect screen with field errors, workspace setup, a form with field errors, a failed save, the conflict panel, and a read-only workspace.

- **axe:** axe-core's WCAG 2.2 A and AA rules, and its best-practice rules, find no problem.
- **Focus indicator:** each control that Tab reaches shows a ring or an outline. Its contrast against the background behind it is at least 3:1 (WCAG 1.4.11 and 2.4.7). axe does not check this.
- **Field borders:** each field, select, and checkbox border has at least 3:1 contrast against the background behind it (WCAG 1.4.11). axe does not check this either.
- **Keyboard only:** with Tab, Enter, typing, and arrow keys only, a user creates a contact, fixes an empty Name on the way, and moves an opportunity to the next stage.
- **No motion:** no CSS animation runs on any page. Hover colors fade in 150 ms; nothing moves. So reduced motion needs no change.
- **Reflow:** at 320 pixels wide, no page scrolls sideways (WCAG 1.4.10, spec 08 "Phone width").

Things that need no check: GitCRM has no dialogs, because a delete is its own page; so no focus trap is needed. The stage always shows as text: the column heading on the board, and the Stage column in the list. The stage marks (spec 12) only add colour next to that text; each mark reaches 3:1 in both themes.

Every page is checked in both themes, dark and light (spec 12). The tokens in `src/index.css` that these checks depend on:

| Token | Light | Dark | Why |
| --- | --- | --- | --- |
| `--input` | `#6b7280`, 4.8:1 on `--background` | `#6b7280`, 4.0:1 on `--background` | Field borders |
| `--ring` | `#0f766e`, 5.5:1 | `#2dd4bf`, 10.4:1 | Focus rings, drawn at full strength. At 50%, the old strength, teal on white is only 2.1:1 |
| `--destructive` | `#b91c1c` | `#f87171` | The "Delete" button, and the border of a field with an error. In dark, that border was drawn at 50% (2.5:1); now it is full strength |
| `--muted-foreground` | `#4b5563`, 7.6:1 | `#9ca3af`, 7.6:1 | Secondary text |

The "Delete" button uses the same focus ring as every other button. A field with an error shows a red border and the error text; focus shows the usual ring.

Not checked yet: a screen reader run (NVDA, VoiceOver), text at 200%, and Windows contrast themes. These need a person.

## Copywriting tone

- "Save contact" not "Commit blob".
- "Your data is stored in a private GitHub repository" in onboarding.
- "Delete removes these records from the current data. Previous Git versions remain" on the delete page. The page also lists every related task and activity it deletes and every record it unlinks (ADR-021, spec 06).
- Avoid exaggerated privacy, compliance, or guaranteed-free marketing claims.
