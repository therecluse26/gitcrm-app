# Primary Research References

**Checked:** 2026-10-26; terms, limits, and PAT pages read again on 2026-10-28 (S-05); Cloudflare terms read on 2026-10-28 (S-06); Cloudflare Pages deployment pages and GitHub's plans read on 2026-10-31 (spec 09); OAuth, Pages workflow, and template pages read on 2026-10-31 (S-09). Provider documentation evolves; validate again before implementing or publishing hard promises. Links are references, not substitutes for an end-to-end security test.

## GitHub API

- [REST repository contents - create/update/delete, SHA, per-directory listing limits](https://docs.github.com/en/rest/repos/contents)
- [REST Git trees - recursive listing truncation and limits](https://docs.github.com/en/rest/git/trees)
- [REST API authentication](https://docs.github.com/en/rest/authentication)
- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [REST API best practices - serialized writes, throttling](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [Using CORS with GitHub REST API](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)
- [GitHub repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
- [GraphQL rate limits, timeouts, and node limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- [Permissions required for fine-grained PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
- [Endpoints available for fine-grained PATs](https://docs.github.com/en/rest/authentication/endpoints-available-for-fine-grained-personal-access-tokens)

## Identity and token security

- [OAuth authorization flows - GitHub docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [OAuth app best practices - documented client secret requirement](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)
- [GitHub App best practices - secrets and token types](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)
- [GitHub's 2025 PKCE support announcement](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/)
- [RFC 10017: OAuth 2.0 for Browser-Based Applications](https://www.rfc-editor.org/rfc/rfc10017.html)
- [Personal access tokens - GitHub docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (includes pre-filling the fine-grained PAT form with URL parameters, S-07)

## Hosting, usage, and erasure

- [GitHub Terms of Service - sections E (private repos) and H (API terms)](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
- [GitHub Acceptable Use Policies - bulk activity and bandwidth](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)
- [GitHub Pages limits - commercial SaaS restriction](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [GitHub Additional Product Terms - Pages/Actions](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- [About protected branches - plan availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [About rulesets - plan availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Archiving repositories - read-only for all users](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories)
- [Removing sensitive data from Git history - caveats and GitHub Support](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [GitHub Pages public sites even from private repositories](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Authorizing OAuth apps - the token exchange needs `client_secret`; the device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [actions/configure-pages - `enablement` needs a token other than `GITHUB_TOKEN`](https://github.com/actions/configure-pages)
- [Using custom workflows with GitHub Pages - `pages: write`, `id-token: write`](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Creating a repository from a template - one commit, unrelated history](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)
- Cloudflare pages below served the central copy, which ADR-025 removed. They stay for owners who deploy there.
- [Cloudflare Self-Serve Subscription Agreement - restrictions and acceptable use](https://www.cloudflare.com/terms/)
- [Cloudflare Developer Platform Service-Specific Terms - Pages](https://www.cloudflare.com/service-specific-terms-developer-platform/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare Pages headers - `_headers` file](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Pages serving - default headers, single-page fallback](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Pages preview deployments - each deployment's own address, public by default](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Cloudflare Pages Direct Upload with CI - API token with Pages: Edit](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [GitHub's plans - Pages in private repositories needs GitHub Pro or Team](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- [Cloudflare Privacy Policy - End User data](https://www.cloudflare.com/privacypolicy/)

## Export

- [OWASP: CSV Injection - dangerous first characters, and the fix](https://owasp.org/www-community/attacks/CSV_Injection) (read 2026-10-30; it now redirects to community.owasp.org)
- [GHSA-px8p-9vwx-vf98: fflate `unzipSync` can loop on a malformed ZIP64 archive; fixed in 0.8.3](https://github.com/advisories/GHSA-px8p-9vwx-vf98) (read 2026-10-30; GitCRM pins 0.8.3 and only writes ZIPs)

## Notes

- GitHub supports PKCE, but the current official OAuth app code-exchange docs still describe `client_secret` as required. Treat this as a **production auth feasibility question**, not a solved browser-only OAuth recipe.
- CORS for REST API access is different from CORS for GitHub's OAuth/token endpoints. Test both.
- GitHub Pages' static-hosting capabilities do not imply permission to run a commercial SaaS there.
- Force-pushing rewritten history does not guarantee erasure of all copies or cached references.
