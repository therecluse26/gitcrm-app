# Spec 06 - Archive, Delete, Restore, and Future Purge

**Priority:** Archive and current-snapshot delete in MVP; full history purge explicitly later.

## User stories

As a user, I want records to stop cluttering the active workspace. If I decide to remove one, I want the product to clearly distinguish deleting it from the current state versus permanently erasing its historical content.

## MVP lifecycle

- **Archive:** set `archivedAt` to UTC timestamp; retain same file and UUID; default lists hide it.
- **Restore from archive:** set `archivedAt` to `null` using SHA-aware update.
- **Delete from current state (ADR-021):** one commit through the Git Trees/Commits APIs removes the record file, deletes tasks and activities related to it, and unlinks contacts, companies, and opportunities that point to it. Archived records count. A preview lists every change and warns that historical commits may still contain the data.
- **Undo current-state delete:** not an instantaneous transactional undo. Restore by retrieving a historical file version through Git history (explicit manual/advanced future feature). A newly created replacement must not accidentally reuse a deleted ID without deliberate restoration.
- **Inbound relations:** handled by the cascade above; a delete never leaves a dangling link.

## Delete rules (ADR-021)

Contact, company, opportunity, and task pages have Delete next to Edit and Archive. Each activity has Delete next to its Edit and Archive. Delete opens a page that lists every change first, such as `#/contacts/<id>/delete`. The address holds only the ID (docs/07).

| Delete | Also deletes | Unlinks |
| --- | --- | --- |
| Contact | its tasks and activities | each opportunity that lists it: the contact leaves `contactIds` |
| Company | its tasks and activities | each contact and opportunity that has it as the company: `companyId` becomes `null` |
| Opportunity | its tasks and activities | nothing |
| Task | nothing | nothing |
| Activity | nothing | nothing |

- "Its tasks and activities" are those whose `related` link names the record. Archived records count. An unlinked record keeps its file, and its `updatedAt` changes.
- The page heading is "Delete <name>?". For an activity, it is "Delete the note from <date and time>?".
- One sentence gives the counts, such as "This deletes the contact, 1 task, and 2 activities, and unlinks 1 opportunity."
- A list under "Also deleted" names each task and activity that goes with the record. A list under "Unlinked" names each record that loses its link. An empty list is not shown. An archived record has the Archived badge.
- The page says: "Delete removes these records from the current data. Previous Git versions remain: anyone who can read the repository can still find them in its history." It suggests Archive to hide a record and keep it.
- Cancel goes back to the record, or for an activity, to its related record.
- "Delete contact" (or company, opportunity, task, activity) makes one commit. Then the app opens the list for that record type: Contacts, Companies, Pipeline, or Tasks. After an activity, it opens the activity's related record, or Home. The banner says "Deleted · View commit".
- While a file cannot be read, GitCRM cannot tell whether that file links to the record. The button is then disabled. With one file, the page says "1 file cannot be read, so GitCRM cannot tell whether it links to this record: <path>". With more, it gives the count and points to "Files that need attention" in Settings.
- A save, a load, or read-only access disables the button too. The page says why, in the same words as a form: "You can delete when the other save finishes.", "You can delete when GitCRM finishes checking GitHub.", or "GitCRM is read-only here, so nothing can be deleted."
- Before the commit, GitCRM compares every file under `data/` on `main` with the records the page listed. If a file changed, appeared, or disappeared, nothing is deleted: a record may link to this record now. GitCRM loads the latest records, and the page says "Someone changed the records after this page listed them. The lists now show the latest records. Check them, then delete again."

## Acceptance criteria

```gherkin
Scenario: Archive and restore
  Given an active company
  When I archive it
  Then the file remains with archivedAt set
  And the company leaves default lists
  When I restore it
  Then archivedAt is null and its UUID is unchanged

Scenario: Delete from current snapshot
  Given an unreferenced contact
  When I choose Delete
  Then the page warns that previous Git versions remain
  When I confirm
  Then one commit removes the contact's JSON file from main
  And the Contacts list no longer shows it, and the banner says "Deleted"

Scenario: Delete with a cascade preview
  Given a contact has 2 activities and 1 task
  And an opportunity lists the contact
  When I choose Delete
  Then the page says "This deletes the contact, 1 task, and 2 activities, and unlinks 1 opportunity."
  And it names each of these records
  When I confirm
  Then one commit removes the contact, the 2 activities, and the task
  And the same commit removes the contact's ID from the opportunity

Scenario: Delete a company
  Given a contact and an opportunity have the company
  When I delete the company
  Then the same commit sets companyId to null in the contact and in the opportunity

Scenario: Archived records count
  Given an archived activity relates to a contact
  When I delete the contact
  Then the archived activity is deleted in the same commit

Scenario: Delete an activity
  Given a contact page shows an activity
  When I choose Delete on the activity and confirm
  Then one commit removes the activity's file
  And the contact page opens without the activity

Scenario: Concurrent deletion
  Given the delete page lists the changes
  And another user then adds a task related to the contact
  When I confirm Delete
  Then nothing is deleted, and the page says why
  And the lists now include the new task
  When I confirm again
  Then the same commit also deletes the new task

Scenario: A file that cannot be read
  Given a file under data/ is not valid JSON
  When I choose Delete on any record
  Then the Delete button is disabled, and the page names the file
```

## Future `purge-history` utility (NOT MVP)

A separately installed local CLI could:

1. Verify the target stable path and list all references to the record, including activity content.
2. Require explicit full repo backup, clone/collaborator inventory, and destructive confirmation.
3. Run `git-filter-repo --sensitive-data-removal --invert-paths --path <record_path>` against a fresh local clone, for all affected refs/paths.
4. Verify intended objects are unreachable from rewritten refs before a coordinated force-push.
5. Explain required collaborator re-clones/rebases and GitHub Support/cache limitations.

It must **never promise guaranteed universal erasure** of private clones, forks, exported files, or caches. See `docs/07-SECURITY-PRIVACY-AND-DELETION.md` and GitHub's referenced documentation.
