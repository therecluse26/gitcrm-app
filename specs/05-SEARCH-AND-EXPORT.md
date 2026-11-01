# Spec 05 - Search and Export

**Priority:** MVP  
**Depends on:** complete validated in-memory workspace snapshot

## User stories

As a user, I want to find a record quickly using a search box and export all my current data without paying, requesting permission, or depending on a running CRM service.

## Search rules

The Search page searches the current records in browser memory (docs/06). It finds each record type by these fields:

| Record type | Found by |
| --- | --- |
| Contact | name, email, phone, tag, company name |
| Company | name, website, tag |
| Opportunity | title, stage name, company name, contact names, amount as shown ("$12,000.00") or as typed ("12000") |
| Task | title, description, the name of its related record |
| Activity | what happened, the name of its related record |

Contacts, companies, and opportunities are also found by their custom field values (spec 10): text, a web address, a number, and the name of a chosen option. A removed field or option is not searched, and neither is a date or a checkbox.

- Every word of the search must appear in the record. The words can match different fields: "ava northwind" finds Ava Bennett at Northwind Traders.
- Case and accents do not matter: "zoe" finds "Zoë".
- Results update as the user types.
- Results come in groups, in this order: Contacts, Companies, Opportunities, Tasks, Activities. A group sorts by name or title, A to Z. Activities come latest first.
- With "All types", each group shows its first 10 results. "Show all" chooses that record type, which shows every result of the type in pages of 50 (spec 08).
- A task shows as it does in other task lists, with its checkbox. Activities have no page of their own, so an activity shows in full, with Edit and Archive, as on a record page.

## Search acceptance criteria

```gherkin
Scenario: Find a contact
  Given a fully loaded workspace with contacts and companies
  When I search for a contact name or email fragment
  Then the contact appears under "Contacts", with its company and first email
  And no request goes to GitHub or another server

Scenario: Search across relationships
  Given the opportunity "Website rebuild" is linked to the company "Northwind Traders"
  When I search for "northwind"
  Then "Northwind Traders" appears under "Companies"
  And "Website rebuild" appears under "Opportunities"

Scenario: Filter by record type
  Given a search that finds a company and an opportunity
  When I choose "Opportunities" as the record type
  Then only the opportunity appears

Scenario: Many results
  Given 12 contacts match the search
  When the record type is "All types"
  Then "Contacts" shows the first 10, and says "Showing 10 of 12 contacts."
  When I select "Show all 12 contacts"
  Then the record type is "Contacts", and all 12 appear
  And focus moves to the "Contacts" heading

Scenario: Archived filtering
  Given a record is archived
  When I search without Archived enabled
  Then it is not included in normal search results
  And the page says "1 archived record hidden."
  When I check "Show archived"
  Then it appears with an "Archived" badge

Scenario: An empty search
  When the search box is empty
  Then no results appear
  And the page says what I can search for

Scenario: Results follow a save
  Given I searched for "ava"
  When I rename Ava Bennett to "Ava Lopez" and go back to Search
  Then the result shows "Ava Lopez"

Scenario: The search stays on this device
  When I type a search
  Then the page address stays "#/search"
  And the search is still there when I open a result and go back
  When I disconnect
  Then the search is cleared
```

## Export rules

Settings has an Export card with two buttons. GitCRM builds each file in the browser and sends nothing to a server (docs/09).

| Button | Downloads | Holds |
| --- | --- | --- |
| Export JSON snapshot | `gitcrm-<workspace>-<date>-snapshot.zip` | `.gitcrm/workspace.json` and every record file under `data/`, at their repository paths, with the same text as on `main` |
| Export CSV | `gitcrm-<workspace>-<date>-csv.zip` | `contacts.csv`, `companies.csv`, `opportunities.csv`, `tasks.csv`, and `activities.csv` |

- Both ZIPs also hold `DATA-DICTIONARY.md` and `schemas/`.
  - `DATA-DICTIONARY.md` gives the repository, the branch, the commit, the export time, the schema versions, the count of each record type, the pipeline stages, the custom fields, every field, and the CSV rules.
  - `schemas/` holds one JSON Schema for each record type and one for the workspace file. GitCRM generates them from its own validation.
- `<workspace>` is the workspace name in lowercase ASCII letters, digits, and hyphens, at most 40 characters. If no letter or digit is left, it is `workspace`. `<date>` is the UTC date (docs/09). No record data goes into a file name.
- Both exports include archived records.
- Export needs the complete, current snapshot:
  - While GitCRM loads the records, the buttons are disabled. The card says "You can export when GitCRM finishes loading the records."
  - If the last check of GitHub failed, the records on screen may be out of date. The buttons are disabled, and the card says "GitCRM could not check GitHub, so these records may be out of date. Refresh, then export."
  - If a file cannot be read, the buttons are disabled. With one file, the card says "1 file cannot be read, so the export would not be complete: <path>". With more, it says "3 files cannot be read, so the export would not be complete. Settings lists them under "Files that need attention"."
  - A broken link does not block export. Every file is complete, and the link stays as it is on `main`.

CSV rules:

- UTF-8 with a byte order mark, so spreadsheet apps read accents correctly. A comma separates the cells, and CRLF ends each row.
- The first row is the header. The columns are the fields of the JSON file, in the same order, so the header is the same in every export. A table with no records has only the header.
- Every cell is in double quotes. A double quote in a value is written twice.
- An empty cell is `null`, an empty list, or an empty task description.
- A list (`emails`, `phones`, `tags`, `contactIds`) is one cell, with `;` between items. In an item, `\` is written `\\`, and `;` is written `\;`.
- `related` becomes two columns, `relatedType` and `relatedId`.
- `customFields` is one cell of JSON text. It is empty when the record has no custom fields.
- `opportunities.csv` has two more columns at the end: `stageLabel`, the stage's label in the workspace file, and `value`, the amount with all its decimal places, such as `12000.00`.
- Spreadsheet safety (OWASP, "CSV Injection"): a cell that begins with `=`, `+`, `-`, `@`, `＝`, `＋`, `－`, `＠`, a tab, a carriage return, a line feed, or `'` gets a `'` in front. Then a spreadsheet shows the cell as text, not as a formula. To read the value back, remove that one `'`. The JSON snapshot keeps the original value. A phone number such as `+1 555 0100` becomes `'+1 555 0100`.

## Export acceptance criteria

```gherkin
Scenario: Download lossless JSON snapshot
  Given a fully loaded, valid workspace
  When I select "Export JSON snapshot"
  Then "gitcrm-example-studio-<date>-snapshot.zip" downloads
  And it holds .gitcrm/workspace.json and every record file at its repository path, with the same text as on main
  And DATA-DICTIONARY.md gives the commit and the count of each record type
  And the JSON files parse again to the same number of records
  And no request goes to GitHub or another server

Scenario: Download CSV
  Given contacts, companies, opportunities, tasks, and activities exist
  When I select "Export CSV"
  Then "gitcrm-example-studio-<date>-csv.zip" downloads, with one CSV per record type
  And each CSV starts with the same header row in every export
  And IDs keep the links between tables: companyId, contactIds, relatedType, and relatedId

Scenario: Formula-like string
  Given a contact name begins with an equals sign
  When I export CSV
  Then the name's cell begins with a single quote, so a spreadsheet shows it as text
  And the JSON snapshot keeps the name unchanged

Scenario: Incomplete snapshot
  Given one record file fails validation
  When I open Settings
  Then both export buttons are disabled
  And the Export card names the file that cannot be read
  And no incomplete archive is labeled a complete backup

Scenario: Records that may be out of date
  Given GitCRM is loading the records, or its last check of GitHub failed
  When I open Settings
  Then both export buttons are disabled, and the Export card says why
```

## Implementation notes

Search can begin with simple in-memory normalization/filtering. Do not include a persistent database, hosted search service, or Git-history scans. Download generation is client-side. The ZIP is a **current snapshot**, not a `.git` history backup. Document CSV flattening rules in the generated dictionary.

Search notes:

- The search text stays in memory. It is never in the page address (docs/07), and Disconnect clears it.
- No search package (docs/06). The search text of each record is built once per snapshot, and each keystroke filters it.
- The first 10 per group keep typing fast. At 2,000 records, drawing every result of a one-letter search took 0.7 s per keystroke. With the limit, it took 47 ms at most (docs/06).
- Out of scope: a keyboard shortcut to Search, a search box on every page, matching with typos, ranking by relevance, and searching Git history.

Export notes:

- The JSON snapshot copies the text that GitCRM loaded from `main`, so a hand-edited file keeps its own layout. After a save, the file holds the text that GitCRM committed.
- fflate's `zipSync` builds each ZIP on the page, with no Web Worker. At 2,000 records, the JSON snapshot took 155–175 ms from the click to the download, and the CSV export took 49–62 ms (docs/06).
- After a save from this browser, the commit in `DATA-DICTIONARY.md` is "Not known" until GitCRM reads `main` again.
- Out of scope: import (docs/09, later), a history backup (clone the repository instead), and mappings for other CRMs.

## Test gate

Round-trip JSON and CSV; Unicode, quote, CRLF and long note cases; partial-load failure; no network request to a third-party export endpoint.
