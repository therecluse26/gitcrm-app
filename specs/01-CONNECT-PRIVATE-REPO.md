# Spec 01 - Connect Private Repository

**Priority:** P0 + MVP  
**Depends on:** `docs/05-AUTH-AND-ONBOARDING.md`, `docs/04-GITHUB-INTEGRATION.md`

## User story

As a GitHub user, I want GitCRM to connect only to a private repository that I control, so that I can use the CRM without deploying an application backend or database.

## Required behavior

- The connection flow accepts a **fine-grained, repository-restricted PAT** and keeps it in browser storage until Disconnect, unless the user unchecks "Remember on this device" (ADR-017).
- The app checks the authenticated GitHub identity and selected repository metadata.
- A repository must have `private = true`, be accessible with Contents read/write, and have a compatible writable `main` branch.
- The data repository may be empty, with no commits. Connect then offers Initialize, and Initialize makes the first commit (ADR-025, S-09).
- The connect screen is three numbered steps: 1. create the data repository, 2. name it, 3. create and paste the token. Step 1 is the screen's most prominent control, a large button that opens GitHub's new-repository form, filled in as a private repository (owner decision 2026-11-01). On a GitHub Pages site, the owner and the name `gitcrm-data` are filled in from the site address.
- If `.gitcrm/workspace.json` is missing, offer explicit initialization. If present, validate schema version and do not overwrite it.
- Connected status shows owner/repo and a Disconnect control, but not the token value.

## Acceptance criteria

```gherkin
Scenario: Initialize a new private repository
  Given I have authorized access to a private repo with a writable main branch
  And it has no GitCRM workspace config
  When I choose Initialize and give a workspace name
  Then exactly one workspace config is committed to main
  And the app opens an empty CRM

Scenario: Initialize a new, empty data repository
  Given my private data repo has no commits
  And GitHub answers its Git data API with 409 "Git Repository is empty."
  When I connect
  Then the app offers Initialize, not an error
  When I choose Initialize and give a workspace name
  Then the workspace config is the repo's first commit, on its default branch
  And the app opens an empty CRM

Scenario: The connect screen on my GitHub Pages site
  Given my copy of GitCRM runs at https://octo-dev.github.io/gitcrm/
  And this browser has no remembered repository
  When I open the connect screen
  Then Repository holds "octo-dev/gitcrm-data"
  And the large button "Create your data repository" opens github.com/new with name gitcrm-data, owner octo-dev, and visibility private

Scenario: The connect screen on another host
  Given GitCRM runs on a host that is not github.io
  When I open the connect screen
  Then Repository is empty
  And the large button "Create your data repository" opens github.com/new with name gitcrm-data, owner @me, and visibility private
  When I type octo-dev/crm-records
  Then the button's link has name crm-records and owner octo-dev

Scenario: Open an existing workspace
  Given the selected private repo has a valid workspace config
  When I connect
  Then the existing records load without a new initialization commit

Scenario: Reject a public repository
  Given the selected repo is public
  When I attempt to connect or initialize
  Then access is refused with a privacy warning
  And no CRM data is written

Scenario: Missing write permission
  Given my token has Contents read only
  When I connect
  Then I see a clear read-only or incompatible-permission message
  And I cannot use an enabled Save control

Scenario: Archived repository
  Given the selected private repo is archived
  When I connect
  Then I see a read-only message that tells me to unarchive the repo
  And I cannot use an enabled Save control

Scenario: Disconnect
  Given I am connected and records are visible
  When I disconnect
  Then the app deletes the stored token and the record cache
  And protected data is no longer displayed

Scenario: Reload with a remembered token
  Given I connected with "Remember on this device" checked
  And main has not changed since my last load
  When I reload the page
  Then I am connected without entering the PAT
  And no record blobs are downloaded
```

## Failure cases

Expired/revoked token, GitHub 403/404, archived repository, protected branch, repository rename, invalid schema, GitHub outage, and user cancel. No infinite retry and no hidden fallback to public repository access.

## Test gate

Run mocked API contract tests and a manual smoke test against a disposable private GitHub repo. Never store real token in test fixtures. Public release remains gated on documented production auth decision.
