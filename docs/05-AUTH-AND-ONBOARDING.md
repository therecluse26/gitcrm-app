# Authentication and Onboarding

## The hard problem

A normal static SPA cannot securely embed an OAuth client secret or GitHub App private key. As of the checked GitHub documentation (2026-10-26), its OAuth web application token exchange lists `client_secret` as required even when PKCE is used. The GitHub OAuth endpoints also present cross-origin constraints. **Do not claim that PKCE magically makes GitHub login fully browser-only until an end-to-end secure flow is actually verified.**

## PAT route: user-supplied fine-grained PAT (accepted, ADR-008, ADR-017)

A GitHub-savvy user creates a fine-grained PAT with:

- Only the selected private CRM repository authorized.
- `Contents: Read and write` repository permission (metadata read implicit).
- A reasonable expiration set by the user.

The token is pasted into a clear connection screen. The app validates identity and repository access using the GitHub REST API, then keeps the token in `localStorage` (ADR-017) unless the user unchecks "Remember on this device". Disconnect deletes it. Never place the token in URL parameters, logs, analytics, cookies, or a service-worker cache.

Treat the PAT as a password. The connection screen is a real form: `owner/repo` is the username field and the PAT uses `<input type="password" autocomplete="current-password">`, so browsers and password managers offer to save and autofill it. Onboarding recommends a short expiry and a single repository. On `401`, explain that the token expired or was revoked, link to create a new one, and remind the user to update the saved entry. Unverified: save prompts across major browsers and common password managers.

This is the supported route for the alpha and the public release (ADR-008). Its onboarding friction is accepted, so clear token-creation instructions are a product feature, not an afterthought. Browser compromise or malicious extensions can still steal a live token; communicate that risk and minimize third-party scripts.

## Supported setup flow

1. Open the static application over HTTPS.
2. Select "Connect existing private GitHub repository".
3. Enter `owner/repo`. On a GitHub Pages site, the field starts as `<site owner>/gitcrm-data`. A link opens GitHub's new-repository form, filled in with that name and owner, private (ADR-025, S-09). Unverified: whether the form accepts an organization as `owner`. The app then shows a link to GitHub's token form, filled in for that owner with `Contents: Read and write` (S-07). The link cannot select the repo, so the instructions say to choose "Only select repositories" and pick it.
4. Paste the new PAT.
5. Verify repo `private = true` and `archived = false`, read its `default_branch` (any name, ADR-003), and confirm that content read/write is possible. `permissions.push` stays `true` on an archived repo (S-08). `permissions` shows the user's role on the repo, not the PAT's permissions (S-02 browser run), so it cannot detect a read-only token. Instead, send one write check, `POST git/blobs`: it stores a small blob that no file or branch uses. `201` means the token can write; `403` means a read-only token (S-02 read-only run).
6. Check for `.gitcrm/workspace.json`. If absent, show an explicit Initialize action.
7. Enter workspace display name, write config, and open CRM.
8. Show a readable "Connected to owner/repo" indicator and a Disconnect action that deletes the stored token and the record cache.

Do not automatically initialize arbitrary repositories just because a user has permission.

## Failure UX

- Repo public: **refuse** to initialize or write; explain how to create a private repository. If visibility later becomes public, stop and prominently warn (old public commits may already have leaked data). Built: every page load and refresh runs the connect checks again, and a repo that turned public hides its records behind a warning. Background checks on tab focus read `main` only (ADR-023), so a repo that turns public while a tab is open is caught at the next page load or Refresh.
- Expired or revoked token: prompt to reconnect; never retry indefinitely. Built: on a page load, the app deletes the stored token and shows the connect screen with the repo name filled in. The record cache stays until Disconnect.
- GitHub unreachable or rate-limiting on a page load: the app keeps showing the cached records, read-only, with a notice. Refresh retries.
- Repo with no commits: Connect offers Initialize, and Initialize makes the first commit through the Contents API. GitHub answers the Git data API, and so the write check, with `409` "Git Repository is empty." (S-09). Connect treats that `409` as an empty repo, not as a refusal, and does not know yet whether the token can write: the Initialize write decides. A `404` for the default branch of a repo with commits still says the branch has no commits. Unverified: a Contents API PUT to an empty repo with a fine-grained PAT.
- "Remember on this device" unchecked: the app stores neither the token nor records, and it clears any record cache this browser already had.
- Missing write permission: read-only screen with explanation.
- Archived repo (`archived = true`): read-only screen that says to unarchive the repo. Writes return `403` "Repository was archived so is read-only." (S-08).
- Repo returns `404`: GitHub gives the same answer for a missing repo and a repo the token cannot see (S-08). The token also cannot see a repo it includes if it has no permissions (S-02 browser run). The message covers all three: check the name, that the token includes the repo, and that Contents is set to Read and write.
- Unsupported default branch / protected `main`: show an actionable compatibility error, not a spin loop. Show it when a write fails, not from an up-front check: `protected: true` alone is compatible, because default protection only blocks force pushes and deletion. GitHub Free cannot protect private repos at all (S-08). Unverified: the error for a write to a branch that requires pull requests.
- Personal repo owned by someone else (repo `owner.type` is `User` and differs from the token's user): explain that team workspaces must live in a GitHub organization (ADR-018). Built as a refusal. A fine-grained PAT cannot reach another user's personal repo anyway (S-05), so this mainly catches other token types.
- Org repo returns `404` for a valid token: say the token may be waiting for an org owner's approval, or may not include this repo. A pending token can read only public resources (S-05). Outside collaborators cannot use fine-grained PATs at all; tell them to ask for org membership.
- Invalid workspace version: offer export/read-only diagnostics but no automatic destructive rewrite.
- GitHub outage/rate limit: preserve current unsaved form and allow later manual retry.

## GitHub App sign-in (deferred, ADR-009)

Not planned. Build it only if real demand appears; the PAT route is the supported path. If it is revived, the design is:

- A GitHub App with repository-scoped user authorization. The user installs it on the one CRM repository; the install screen provides the repository picker. Request only `Contents: Read and write` (metadata read is implicit).
- A **stateless auth broker** holds the client secret, exchanges the authorization code (with PKCE), and refreshes tokens. It has no database, logs no codes or tokens, and never receives CRM data (ADR-004).
- The refresh token stays in an encrypted `HttpOnly` cookie set by the broker; page scripts hold only the short-lived access token.
- The PAT route stays available. Device flow is skipped unless a spike shows its endpoints accept browser CORS calls.

Unverified: user-token and refresh-token lifetimes, PKCE behavior on the GitHub App flow, broker host limits and terms, and organization policies that block app installs.

## Permissions / identity

GitHub determines who can access or modify a repo; GitCRM has no independent identity provider, user table, or team membership registry. Team workspaces live in a GitHub organization, and each member creates their own fine-grained PAT with the organization as resource owner; the organization may require owner approval (ADR-018). Every teammate must be an org member: GitHub does not let outside or repository collaborators use fine-grained PATs (S-05). The organization may also set a maximum token lifetime. Check `GET /user` identity when a token is submitted; do not trust the user-supplied repository name as evidence of authorization.
