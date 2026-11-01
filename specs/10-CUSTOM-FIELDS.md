# Spec 10 - Custom Fields

**Priority:** first after the MVP (ADR-020, FR-14)

## User story

As a small team, I want a few fields of my own on contacts, companies, and opportunities, such as "Lead source" or "LinkedIn", without a schema migration or a database.

## In scope

- Settings has a "Custom fields" card with one list each for contacts, companies, and opportunities.
- Add a field with a name and a type: Text, Number, Date, Checkbox, Web address, or Choice list.
- Rename a field, and move it up or down. A field's type never changes; to change it, add a new field.
- Remove a field. Its values stay in each record file, hidden, and Restore shows them again.
- A Choice list has options: add, rename, remove, and restore an option. A removed option's values stay hidden in the same way.
- Edits stay in a draft until "Save custom fields" writes `.gitcrm/workspace.json` in one commit.
- The contact, company, and opportunity forms show each field after the built-in fields, in its list order.
- The record page shows each field with its value, or "None". A checkbox shows "Yes" or "No".
- Search finds the values of Text, Number, Web address, and Choice list fields.
- Out of scope (docs/02): required fields, defaults, formulas, multi-select, record-link fields, and per-field permissions. Also out of scope for now: list columns, sort, and filters by a custom field, and reordering options.

## Acceptance criteria

```gherkin
Scenario: Add fields
  Given the workspace has no custom fields
  When I add the contact field "LinkedIn" as a Web address
  And I add the contact field "Lead source" as a Choice list with options "Conference" and "Referral"
  And I save the custom fields
  Then only .gitcrm/workspace.json changes, in one commit
  And it stores the fields with IDs "linkedin" and "lead-source", and schemaVersion 2

Scenario: Fill in a contact's fields
  Given the contact fields "LinkedIn" and "Lead source"
  When I edit Ava Bennett, enter "linkedin.com/in/ava", and choose "Referral"
  Then her file stores "customFields": { "lead-source": "referral", "linkedin": "https://linkedin.com/in/ava" }
  And her page shows "LinkedIn" as a link and "Lead source" as "Referral"

Scenario: A value that does not fit is refused
  Given the contact field "Employees" is a Number
  When I enter "1,200" and save
  Then the form says "Enter a number with a period for decimals, such as 1200 or 3.5."
  And nothing is written

Scenario: Remove and restore a field
  Given Ava Bennett has a "Lead source"
  When I remove the field "Lead source" and save the custom fields
  Then her form and her page no longer show it
  And her file still stores "lead-source": "referral"
  When I restore the field and save the custom fields
  Then her page shows "Lead source" as "Referral" again

Scenario: An unrelated save keeps hidden values
  Given Ava Bennett's file has a value for a removed field and for a removed option
  When I change her phone number and save
  Then both values are still in her file

Scenario: Two people change different custom fields
  Given I am editing Ava Bennett's "LinkedIn"
  And someone else changes her "Lead source" and saves first
  When I save, review the conflict, and retry
  Then her file has my "LinkedIn" and their "Lead source"

Scenario: A stored value that does not fit
  Given Ava Bennett's file stores "employees": "many" for the Number field "Employees"
  When the workspace loads
  Then Settings lists the contact's file under "Files that need attention"
  And the contact page shows the stored value with "Not a valid number"
  And the record still loads, and nothing rewrites the value

Scenario: An older GitCRM opens the workspace
  Given .gitcrm/workspace.json has custom fields, so it has schemaVersion 2
  When a GitCRM that knows only version 1 opens the workspace
  Then it says a newer version of GitCRM set up the workspace, and it writes nothing

Scenario: Both Settings cards have unsaved changes
  Given I renamed a stage and added a custom field, and saved neither
  When I save the stages, then save the custom fields
  Then both saves succeed, one commit each
  And .gitcrm/workspace.json has the new stage name and the new field

Scenario: Someone else changed the custom fields first
  Given I have unsaved custom field changes
  And someone else saved other custom field changes
  When I save
  Then nothing is saved, and the card asks me to load the latest custom fields
```

## Notes

- **IDs:** a field ID comes from its first name, such as "Lead source" → `lead-source`, the same as a stage ID (docs/02). A number is added when the ID is taken, also by a removed field. An option ID comes from the option's first name in the same way. IDs never change.
- **Names:** a name must not be blank. Two fields of one record type cannot have the same name, ignoring case; a removed field counts. Two options of one field follow the same rule.
- **Stored values** (`customFields` in the record file, keyed by field ID, sorted):

  | Type | Stored as | The form |
  | --- | --- | --- |
  | Text | A string, trimmed | A text box |
  | Number | A JSON number | A text box. A period for decimals, an optional minus, and at most 15 digits, so the stored number is exact. "1,200" is refused |
  | Date | `YYYY-MM-DD` | A date box |
  | Checkbox | `true` | A checkbox. Unchecked removes the value |
  | Web address | An `http` or `https` URL, the same rule as a company website | A text box. `https://` is added when no scheme is typed |
  | Choice list | The option ID | A list with "None" and each option that is not removed |

- **Empty:** a cleared value is removed from the file. A file that stores `null` for a field means "no value".
- **Unchanged values:** a save writes only the custom fields that the form changed. Each other value stays as stored, even one the form cannot show, such as a removed field or option, or a value that does not fit.
- **Conflicts:** each custom field counts as its own field (spec 07). A retry keeps someone else's change to a field that I did not change.
- **Issues:** a stored value for a field ID that the record type does not have, or a value that does not fit its field, is a `custom-field` issue in Settings. The record still loads, the same as a `broken-link` issue. A removed field or option still counts as defined. When the workspace settings file cannot be read, values are not checked.
- **Settings file:** definitions are in `customFields` in `.gitcrm/workspace.json` (docs/02). The file says `schemaVersion: 2` when it has custom fields, and `1` when it has none. A version 1 app then refuses a version 2 file as newer (docs/02, "Schema evolution"). This app reads both.
- **Read-only access:** the card lists each field and its type, and offers no edits.
- **Export:** the JSON snapshot holds the settings file as stored. In CSV, `customFields` stays one cell of JSON text (spec 05). `DATA-DICTIONARY.md` lists each field with its ID, name, type, and options, and gives both schema versions.

## Error handling

Two Settings cards save `.gitcrm/workspace.json`. The stage card owns `pipelineStages`, and the custom fields card owns `customFields`. Say the file changed after a card's draft began, but not in the card's own part. Then the card saves against the newer file, so the other change stays. Say the card's own part changed. Then the save is a conflict and saves nothing: the card asks to load the latest custom fields, the same as the stage editor (spec 03). A change that this browser has not loaded yet is a conflict too, because GitHub refuses the old blob SHA. A failed save keeps the draft and says why. A form never sends a value that does not fit its field.

## Test gate

ID and name rules, each type's form rules, hidden values kept on save, the per-field conflict merge, the `custom-field` issue, version 1 and 2 settings files, and browser tests for Settings, the three forms, the record pages, and search.
