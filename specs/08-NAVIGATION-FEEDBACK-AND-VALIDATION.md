# Spec 08 - Navigation, Save Feedback, and Validation

**Priority:** MVP

These rules apply to every page (docs/08). They close the Phase 2 item "Responsive navigation, save feedback, and validation UX" (docs/11).

## User stories

- As a keyboard or screen reader user, I want to skip the navigation, and to know which page I am on after each page change.
- As a user on a phone, I want to reach every page without a sideways scroll.
- As a user, I want to know when a save is running, when it is done, and why it failed.
- As a user, I want each form problem shown at the field that has it.
- As a user with a long list, I want it in pages, so that each page opens at once.

## In scope

- A skip link, focus after a page change, the current page in the main navigation, a page for unknown addresses, and phone width.
- The save states from docs/08 on every control that saves.
- Field errors on every form, including the connect and setup screens.
- Long lists in pages of 50.

Out of scope: page titles that name a record (docs/07: the title stays "GitCRM"), a menu button for the navigation, and checks while the user types.

## Acceptance criteria

```gherkin
Scenario: Skip the navigation
  Given I just opened GitCRM
  When I press Tab
  Then "Skip to main content" has focus and is visible
  When I press Enter
  Then the next Tab goes to the first control in the page, not to the navigation

Scenario: Focus after a page change
  Given I am on a page
  When I follow a link, save a form, or go back
  Then focus moves to the main heading of the new page
  And the focus move does not change the scroll position

Scenario: The current page in the navigation
  Given I am on a contact's page
  Then "Contacts" in the main navigation is marked as the current page

Scenario: An address that matches no page
  Given I open an address that matches no page
  Then the page says "Page not found" and links to Home
  And the main navigation is still there

Scenario: Phone width
  Given a window 320 pixels wide (the reflow width in WCAG 1.4.10)
  When I open each main page, a record page, and a form
  Then no page scrolls sideways
  And the main navigation shows every link, without a menu
  And every link in the main navigation is at least 24 by 24 pixels

Scenario: One save at a time
  Given a save is running
  Then the control that started it says "Saving…"
  And the other controls that save are disabled: Save buttons, task checkboxes, Move to stage menus, Archive and Restore, and Refresh
  And a form says that it can save when the other save finishes

Scenario Outline: A required field is empty
  Given the <form>
  When I submit it with "<field>" empty
  Then "<field>" is marked invalid
  And a screen reader reads "<error>" with the field
  And focus moves to "<field>"

  Examples:
    | form             | field                              | error                                                         |
    | new contact      | Name                               | Enter a name.                                                 |
    | new company      | Name                               | Enter a name.                                                 |
    | new opportunity  | Title                              | Enter a title.                                                |
    | new task         | Title                              | Enter a title.                                                |
    | activity form    | What happened                      | Enter what happened.                                          |
    | stage editor     | New stage name                     | Enter a stage name.                                           |
    | connect screen   | Repository                         | Enter the repository as owner/repo, for example octo-dev/crm. |
    | connect screen   | Fine-grained personal access token | Paste the token from GitHub.                                  |
    | workspace setup  | Workspace name                     | Enter a name for the workspace.                               |
```

```gherkin
Scenario: A long list comes in pages of 50
  Given 120 active contacts
  When I open Contacts
  Then the list shows contacts 1 to 50
  And the page says "Showing 1–50 of 120 contacts"
  When I select "Next page"
  Then the list shows contacts 51 to 100
  And focus moves to the list
  When I select "Next page" again
  Then the page says "Showing 101–120 of 120 contacts"
  And "Next page" is disabled

Scenario: A changed view starts at the first page
  Given I am on page 2 of Contacts
  When I change the search text, "Sort by", or "Show archived"
  Then the list shows its first page

Scenario: Back to the list keeps the page
  Given I am on page 3 of Contacts
  When I open a contact, then go back
  Then the list still shows page 3

Scenario: A list that gets shorter
  Given I am on the last page of Tasks, and it has one task
  When I complete that task
  Then the list shows the new last page

Scenario: A short list has no pages
  Given 12 active contacts
  When I open Contacts
  Then the list shows all 12, and the page says "12 contacts"
  And there is no "Next page"

Scenario: Home shows the first 10 tasks due
  Given 14 tasks are due today or overdue
  When I open Home
  Then "Tasks due" shows the first 10
  And it says "Showing 10 of 14 tasks due." and links to all tasks
```

Specs 02, 03, 04, and 07 already cover these save states: "Saving…" on the control, "Saved · View commit" after a commit, a failed save that keeps the form, and the conflict panel.

## Notes

- Focus moves only on a change to another page, not on the first load. On the first load, the first Tab still reaches the skip link.
- The focus move does not scroll. A new page starts at the top. Back returns to the old scroll position. The test cannot prove the first sentence: in Chromium, the old position comes back after the focus move either way.
- The skip link is a button. With hash addresses, a link to `#main` would change the page address and show "Page not found".
- An error stays until the next Save, as on GOV.UK forms. The page does not change while the user types, and focus does not jump.
- Pages of 50 apply to Contacts, Companies, Tasks, the Pipeline list, each Pipeline board column, Search after "Show all" (spec 05), and the lists on a record page: activity, tasks, opportunities, and a company's contacts. A page draws its rows only, so a page change and a save stay fast at 2,000 records (docs/06, "Measured in the browser").
- The page number of a main list stays in memory with its search text and sort, never in the page address. A board column and a list on a record page start at page 1 each time the page opens.
- After "Next page" or "Previous page", focus moves to the list, so a screen reader reads the new rows. The status above the list says which rows show.
- On a phone, the main navigation wraps into two rows. GitCRM is usable on mobile web, but it is not mobile-first (PRODUCT_REQUIREMENTS), so there is no menu button.
