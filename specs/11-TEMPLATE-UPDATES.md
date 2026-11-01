# Spec 11 - Template updates

**Priority:** Post-MVP (ADR-026)  
**Depends on:** spec 09, ADR-025

A repository made from a template has no link back to it (S-09), so fixes in the template never reach a copy on their own. A workflow in each copy, `.github/workflows/template-update.yml`, checks the template's latest release once a week, and also on a manual run. When the release is newer than the copy, it proposes the update for the owner to review.

## User stories

- As an owner, I want to hear when GitCRM has a new release, so my copy gets its fixes.
- As an owner, I want to review each update before it reaches my site, so nobody else's code deploys without my merge.

## In scope

- The workflow and `scripts/template-update.ts`.
- A release is a GitHub release in the template with a tag `vMAJOR.MINOR.PATCH`. The copy's version is `version` in its `package.json`.
- The workflow runs only the copy's own code. It runs the script before it changes any file, so the template's files never run in a job with write access.

Out of scope: drafts and pre-releases (`releases/latest` leaves them out), changing `.github/workflows/` (the workflow's own token cannot, S-09), and merging for the owner.

## Acceptance criteria

```gherkin
Scenario: A newer release opens a pull request
  Given my copy's package.json has version 0.1.0
  And the template's latest release is v0.2.0
  When the workflow runs
  Then it pushes the branch template-update/v0.2.0
  And on that branch every file is the template's file at v0.2.0, except .github/workflows/
  And a file that the template does not have at v0.2.0 is deleted, except in .github/workflows/
  And it opens the pull request "Update GitCRM to v0.2.0" against my default branch

Scenario: The pull request lists the workflow files to copy by hand
  Given the template changed or added a file in .github/workflows/ by v0.2.0
  Then my copy's workflow files stay as they are on the branch
  And the pull request lists each such file, with a link to it at v0.2.0

Scenario: GitHub Actions may not open pull requests in my copy
  Given "Allow GitHub Actions to create and approve pull requests" is off (GitHub's default)
  When the workflow runs for a newer release
  Then it still pushes the branch
  And it opens the issue "Update GitCRM to v0.2.0", with the same text and a link that creates the pull request

Scenario: Nothing to do
  Given my copy's version is the same as the latest release, or newer
  Or the branch for the latest release exists already
  Or the repository is the template itself
  When the workflow runs
  Then it pushes nothing and opens nothing

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
- An update replaces the owner's own changes to the template's files. The pull request says so; the owner sees each change in its diff.
- After the merge, the Deploy workflow deploys the new version (spec 09).
- GitHub turns off scheduled workflows in a public repository after 60 days with no activity. A manual run, or any push, turns the schedule on again.
- Unverified: the push of the update branch, and the pull request or issue, with the workflow's own token in a copy (docs/12, "Not verified yet").
