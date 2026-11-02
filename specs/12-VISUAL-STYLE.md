# Spec 12 - Visual Style

**Priority:** first after the template distribution (ADR-027, owner decision 2026-11-02)

## User story

As a GitCRM user, I want a compact, data-first look that is dark by default, so that I see more records at once and the app is comfortable to use for long periods.

## The style

The owner chose option C, "Dense and data-first", from three mock-ups of the Contacts page (2026-11-02):

- **Type:** IBM Plex Sans for text, IBM Plex Mono for repository names and commit SHAs. Both are bundled with the app, so no page loads a font from another host.
- **Size:** body text is 13 px. The type scale is smaller: `text-sm` 13 px, `text-lg` 15 px, `text-xl` 16 px, `text-2xl` 18 px, `text-3xl` 22 px. `text-base` stays 16 px, so a phone does not zoom into a field.
- **Colour:** grey surfaces, thin grid lines, one teal accent (`#0F766E`) for primary buttons, the active tab, and focus rings. Small corners (4 px).
- **Shell:** one top bar. It holds the wordmark, the main navigation as tabs, the repository, the sync status, and Refresh. The active tab has an accent line under it. No left navigation column.
- **Themes:** dark and light. Dark is the default.

## In scope

- New theme tokens for both themes, with the same token names as today, so every component changes with them.
- The new shell, on every page inside the app.
- The type scale and the fonts.
- Settings has an "Appearance" card with a choice: Dark or Light. The choice applies at once.
- The choice is stored on this device only while the connection is remembered ("Remember on this device"). Without that, it lasts until the page reloads. Disconnect removes it.
- The Connect and Initialize screens use the stored theme, or dark.
- Out of scope here: sort and filter by any field (docs/11, item 4).

The second slice (2026-11-02):

- Contacts and Companies show their records in a dense table: a header row, grid lines, 32 px rows, and one column per field. The record's name links to its page.
  - Contacts: Name, Company, Email, Phone, Tags, Updated. Email and Phone show the first of each.
  - Companies: Name, Website, Contacts, Tags, Updated.
- The Pipeline list uses the same table style.
- Each stage has a mark: a small coloured square before its name, on the board's column headings and in the Pipeline list. Open stages take one of four colours in pipeline order; Won is green, and Lost is grey. The stage name always shows, so colour is never the only cue (docs/08).
- Tasks stay a list in groups, because the same row shows on Home and on record pages. Each group's rows sit in one box with lines between them.
- On a narrow screen a table scrolls inside its own box; the page never scrolls sideways.

## Acceptance criteria

```gherkin
Scenario: Dark by default
  Given this browser has stored nothing for GitCRM
  When I open GitCRM
  Then the Connect screen is dark
  And after I connect, every page is dark

Scenario: Choose the light theme on a remembered connection
  Given I connected with "Remember on this device" on
  When I choose Light in Settings, Appearance
  Then the page turns light at once
  And after a reload, GitCRM is still light

Scenario: A connection that is not remembered stores no theme
  Given I connected with "Remember on this device" off
  When I choose Light in Settings, Appearance
  Then the page turns light at once
  And GitCRM stores nothing in this browser
  And after a reload, the Connect screen is dark

Scenario: Disconnect removes the theme
  Given a remembered connection with the light theme
  When I disconnect
  Then the Connect screen is dark
  And GitCRM stores nothing in this browser

Scenario: The shell
  Given I am connected
  Then the top bar shows the main navigation as tabs, and the current page's tab is marked as the current page
  And the top bar shows the repository name in a monospace font
  And the page has no left navigation column
  And at 320 px wide no page scrolls sideways

Scenario: Both themes are accessible
  Given the dark theme, and then the light theme
  Then axe finds no WCAG 2.2 AA or best-practice problem on any page
  And every focus indicator and field border reaches 3:1 against what is behind it

Scenario: Contacts as a table
  Given the contacts Ava Bennett, at Acme Corp, with two emails and a phone, and Ben Ortiz
  When I open Contacts
  Then the table "Contacts" has the columns Name, Company, Email, Phone, Tags, and Updated
  And Ava Bennett's row shows "Acme Corp", her first email, her phone, and the date she was last changed
  And her name links to her page

Scenario: Companies as a table
  Given the company Acme Corp, with the website https://acme.example and 2 contacts
  When I open Companies
  Then the table "Companies" has the columns Name, Website, Contacts, Tags, and Updated
  And Acme Corp's row shows "acme.example" and "2"

Scenario: Stage marks
  Given the stages Lead, Qualified, Proposal, Won, and Lost
  Then each column heading on the board starts with a mark in its stage's colour
  And Lead, Qualified, and Proposal have three different colours
  And each row in the Pipeline list shows the same mark before its stage

Scenario: No font from another host
  When GitCRM loads
  Then every font comes from the app's own site
```
