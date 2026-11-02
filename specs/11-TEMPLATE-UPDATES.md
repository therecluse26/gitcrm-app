# Spec 11 - Template updates

**Priority:** Post-MVP (ADR-026)  
**Depends on:** spec 09, ADR-025

A repository made from a template has no link back to it (S-09), so fixes in the template never reach a copy on their own. Each page load of a copy's site asks GitHub for the template's latest release. When it is newer than the app, an update banner shows an **Update GitCRM** button. The button opens the copy's Template update workflow on GitHub. The owner runs it, and it updates `main` and deploys.

Owner decision 2026-11-01: the owner starts each update with a button, and no pull request needs a merge. Before that, a weekly workflow opened a pull request.

## User stories

- As an owner, I want to see in my app when GitCRM has a new release, so my copy gets its fixes.
- As an owner, I want to update with a button, not with Git or a pull request.
- As an owner, I want nothing to change on my site until I start the update.

## In scope

- The update banner, on the connect screen and in the app shell.
- `.github/workflows/template-update.yml` and `scripts/template-update.ts`.
- A release is a GitHub release in the template, with a tag `vMAJOR.MINOR.PATCH`. The `version` in `package.json` at that tag is `MAJOR.MINOR.PATCH`. A copy's version is the `version` in its `package.json`; the build puts it in the app.
- The release request has no token. The template is public, and the PAT goes only to the data repository.
- The workflow runs only the copy's own code. It runs the script before it changes any file, so the template's files never run in a job with write access.

Out of scope: starting the workflow from the app (GitHub has no link that starts a workflow, and an API call needs a token with access to the app repository), drafts and pre-releases (`releases/latest` leaves them out), changing `.github/workflows/` (the workflow's own token cannot, S-09), and a banner on a host other than GitHub Pages.

## Acceptance criteria

```gherkin
Scenario: A newer release shows the update banner
  Given my site runs at https://octo-dev.github.io/gitcrm/ and the app's version is 0.3.0
  And the template's latest release is v0.4.0
  When I open the site
  Then the banner says "GitCRM v0.4.0 is available" and "This site runs 0.3.0."
  And "What's new" links to the release v0.4.0 in the template
  And the "Update GitCRM" button opens https://github.com/octo-dev/gitcrm/actions/workflows/template-update.yml
  And the banner says to click "Run workflow" twice on GitHub, then reload in about 5 minutes
  And the release request has no Authorization header

Scenario: The banner stays after connect
  Given the banner shows on the connect screen
  When I connect
  Then the app shell shows the same banner, with no second release request

Scenario: No banner
  Given the latest release is the app's version or older, or GitHub refuses or fails the request, or its tag is in another form
  When I open the site
  Then no banner shows, and the app works as before

Scenario: Off GitHub Pages
  Given the app runs on another host, such as localhost
  When I open it
  Then the app sends no release request and shows no banner

Scenario: Run the update
  Given my copy's package.json has version 0.3.0
  And the template's latest release is v0.4.0
  When I run Template update on my default branch
  Then it commits "Update GitCRM to v0.4.0" on my default branch
  And every file is the template's file at v0.4.0, except .github/workflows/
  And a file that the template does not have at v0.4.0 is deleted, except in .github/workflows/
  And it starts the Deploy workflow on my default branch
  And the run summary says what changed, with a link to the release notes

Scenario: The update changes workflow files
  Given the template changed or added a file in .github/workflows/ by v0.4.0
  When the update runs
  Then my copy's workflow files stay as they are
  And the run shows a warning, and its summary lists each such file, with a link to it at v0.4.0

Scenario: Nothing to do
  Given my copy's version is the same as the latest release, or newer
  Or the repository is the template itself
  When the workflow runs
  Then it pushes nothing and starts nothing

Scenario: A release with the wrong version
  Given the release tag is v0.4.0, and package.json at that tag has another version
  When the workflow runs
  Then the workflow fails with one error annotation that names both versions, and pushes nothing

Scenario: Another branch
  Given I run the workflow from a branch other than my default branch
  Then the workflow fails, and pushes nothing

Scenario: A release tag in another form
  Given the latest release tag is not vMAJOR.MINOR.PATCH
  When the workflow runs
  Then the workflow fails and names the tag

Scenario: The template cannot be read
  Given the template is private, or has no release
  When the workflow runs
  Then the workflow fails, and says that the template must be public with at least one release
```

## Notes

- To release: change `version` in `package.json` on the template's `main`, then create a GitHub release with the tag `v<version>`.
- An update replaces the owner's own changes to the template's files. To undo an update, revert its commit on `main`; the push deploys the old version.
- A push with the workflow's own token starts no workflow, so the update job starts Deploy itself (`actions: write`).
- The release request counts against GitHub's limit for requests with no token: 60 per hour for each IP address. One page load sends at most one.
- Verified in the owner's copy on 2026-11-01 (docs/12, S-09): the push to `main` and the Deploy start with the workflow's own token, and the refusal of a release with another version. The update took about 2.5 minutes from the click to the live site.
- The release `v0.2.0` has version `0.1.0` in `package.json`. The workflow refuses it, so the first release that copies can take is `v0.3.0`.
