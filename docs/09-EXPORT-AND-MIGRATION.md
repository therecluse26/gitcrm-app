# Export, Portability, and Migration

## Design objective

Exiting GitCRM should be straightforward. The data format itself is portable, and a browser-driven export must work without backend storage or vendor permission.

## Required MVP export formats

1. **Complete JSON snapshot**: a locally downloaded ZIP of `.gitcrm/workspace.json` plus all current JSON documents, preserving paths. This is a snapshot of `main`, not a history archive; `git clone` remains the history-preserving path.
2. **CSV per entity type**: contacts, companies, opportunities, tasks, and activities. Use stable headers, UTF-8, proper CSV quoting, and IDs for relationships.
3. **Data dictionary**: include a generated Markdown or JSON schema manifest specifying schemaVersion, export date, counts, and field definitions.

**Built (spec 05):** Settings has "Export JSON snapshot" and "Export CSV". Each one downloads a ZIP that also holds `DATA-DICTIONARY.md` and generated JSON Schemas in `schemas/`. Spec 05, "Export rules", gives the file names, the CSV rules, and when export is blocked.

CSV exports must keep relationships through IDs (e.g. opportunity `companyId` and semicolon-separated `contactIds`, with escaping rules documented). Avoid silently dropping nested fields. The JSON archive remains the authoritative lossless export.

## Safe browser export

- Export only a **fully loaded validated snapshot**. On invalid/missing blobs, produce a clear error rather than an incomplete file labeled complete.
- Data is assembled and downloaded in the browser; never uploaded to third-party services.
- Filename includes workspace-safe name and UTC date, not a contact's PII.
- Test export with commas, quotes, newlines, Unicode, nulls, long notes, and large datasets.
- Spreadsheet CSV formula injection: escape cells beginning with `=`, `+`, `-`, or `@` in spreadsheet-targeted exports, and document the transformation. Provide raw JSON for exact fidelity. Built: OWASP also lists the full-width forms of these four, a tab, a carriage return, and a line feed (docs/13). Each of these, and `'`, gets a `'` in front.

## Data ownership and migration

- A user can clone the private repo and parse the JSON without GitCRM.
- CSV is the common-denominator migration format for other CRMs; direct HubSpot/Salesforce/Attio mappings are **later** and are not needed for MVP.
- Future exporters should be pure offline transforms of the documented repository snapshot.
- No cloud migration service, recurring sync, or vendor account linkage is necessary.

## Import (later)

A CSV importer is not part of MVP. If added, require column mapping, dry-run validation, duplicate review, and explicit confirmation before potentially hundreds of commits. Bulk import should use a reviewed and bounded Git commit strategy rather than hammering the Contents API.

## Exit acceptance criteria

- JSON export is re-readable with no loss of known fields.
- CSV export includes every current entity and stable linking IDs.
- Export works after GitCRM UI is detached from its repo (via local JSON/CSV processing tools), demonstrating portability.
- A documented future importer for other CRMs can be built without contacting GitCRM's operators.
