# Spec 09 - Deployment

**Priority:** MVP. Rewritten on 2026-10-31 for the template repository (ADR-025).

GitCRM is a GitHub template repository. Each owner makes their own app repository from it, and the workflow in that repository deploys the app to its GitHub Pages site. There is no central copy. CRM data lives in a separate private data repository (ADR-025, docs/05).

## User stories

- As an owner, I want my site to run the code in my own repository, after it passed every test, so I trust no one else's deploy.
- As an owner, I want my site deployed without secrets and without a command line, after one Pages setting.
- As an owner, I want search engines to leave my site out, and other sites to be unable to frame it.
- As a self-hoster on another static host, I want the same build to run from a folder, with or without custom headers.

## In scope

- One GitHub Actions workflow in the template, `.github/workflows/deploy.yml`. On each push to `main`, it runs every check, builds once, deploys that build to the repository's GitHub Pages, and checks the live site.
- The workflow uses no secrets. The deploy job gets the workflow's own token with `pages: write` and `id-token: write`, and nothing else.
- `<meta name="robots" content="noindex">` in `index.html`. The build audit checks it.
- A `_headers` file in the build, for hosts that read one, such as Cloudflare Pages. It sends the Content Security Policy as a header, with `frame-ancestors 'none'`. GitHub Pages serves it as a plain file. The build audit checks it.
- A browser test that serves the same build from `/GitCRM/` with no custom headers, the way GitHub Pages serves a project site.

Out of scope: a central copy (ADR-025), turning on Pages from the workflow, a custom domain, and preview copies of branches or pull requests. The workflow cannot turn on Pages: `actions/configure-pages` needs a token other than the workflow's own token for that (docs/12, S-09).

## Acceptance criteria

```gherkin
Scenario: Pages is not turned on yet
  Given a new repository made from the template
  And its Pages source is not "GitHub Actions"
  When the workflow runs
  Then the checks run, and the deploy job fails at "Configure Pages"
  And the README tells the owner to set Settings → Pages → Source to "GitHub Actions", then run the workflow again

Scenario: Only a build that passed every check deploys
  Given a push to main
  When lint, the type check, a unit test, the build audit, or a browser test fails
  Then nothing deploys
  When every check passes
  Then the deploy job deploys that same dist/ folder to the repository's GitHub Pages

Scenario: Only main deploys
  Given someone runs the workflow by hand on another branch
  Then the checks run, and nothing deploys

Scenario: The template itself never deploys
  Given the repository is marked as a template
  When the workflow runs on main
  Then the checks run, and nothing deploys

Scenario: The live check reads the site after each deploy
  Given the deploy is done
  Then the site address from the deploy serves every built file byte for byte
  When a request still fails, or a file still differs, after 6 tries, 10 seconds apart
  Then the workflow fails

Scenario: Search engines leave the site out
  Given I run npm run build
  Then index.html has <meta name="robots" content="noindex">
  And the build audit fails without it

Scenario: The build carries the header policy for hosts that read _headers
  Given I run npm run build
  Then dist/_headers has one rule, for "/*"
  And the rule sends Content-Security-Policy: the policy from index.html, then "; frame-ancestors 'none'"
  And the rule also sends X-Robots-Tag: noindex

Scenario: The build audit refuses a wrong headers file
  Given dist/_headers is missing
  Or its policy is not the policy from index.html with "frame-ancestors 'none'"
  Or another rule changes or removes the Content-Security-Policy header
  Or a line is longer than 2,000 characters (the Cloudflare limit)
  When the build audit runs
  Then the build fails, and the audit names the problem

Scenario: The same build runs from a folder, with no custom headers (the GitHub Pages shape)
  Given the build is served from /GitCRM/ with no custom headers
  When I connect, create a company, a contact, an opportunity, a note, and a task
  Then each step works under the policy in index.html
  And every request goes to /GitCRM/ or to api.github.com
  And the app refuses to run inside a frame
```

## Notes

- GitHub Pages sends no custom headers. The browser enforces the `<meta>` policy. Only a header can set `frame-ancestors`, so on GitHub Pages the app's own frame check is the frame defense (docs/07).
- The deploy job runs no project code. It deploys the build artifact that the build job made. The live check runs in a third job, with only `contents: read`.
- If the live check fails, the new deployment is already live. Revert the commit on `main`. The workflow then deploys the reverted build.
- A copy runs this workflow on its owner's Actions minutes. A public repository runs it at no cost.
- The deploy status of the first run in a new copy is not verified yet: GitHub may or may not run the workflow on the commit that the template creates (docs/12, "Not verified yet").
- The template guard is verified: on the merge of PR #21 (2026-11-01, 00:02 EDT), the build job passed, and the deploy and check jobs were skipped.
- On GitHub Pages, `_headers` is a plain public file that holds only the policy and the `noindex` line.
