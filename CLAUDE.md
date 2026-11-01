# Claude Code Instructions - GitCRM

## Objective

Build GitCRM as a clean, deliberately limited CRM. Respect the product vision rather than turning it into a conventional SaaS architecture.

**Review status:** ChatGPT generated the original docs. On 2026-10-27 the owner reviewed every ADR in `docs/01-TECHNICAL-DECISIONS.md`; entries marked **accepted** are binding. Details elsewhere in the docs that no ADR covers are still proposals: when one blocks a good option, say so and ask the owner. Provider facts in the docs (GitHub auth, limits, terms, `docs/13-SOURCES.md`) stay unverified until a spike or source check confirms them.

## Mandatory reading order

1. `README.md`
2. `VISION.md`
3. `PRODUCT_REQUIREMENTS.md`
4. `ARCHITECTURE.md`
5. `docs/01-TECHNICAL-DECISIONS.md`
6. The relevant `specs/*.md` acceptance cases for the feature being implemented

## Engineering approach

- Work **spec-first and test-first**. For each issue: refine acceptance criteria, write failing unit/contract tests, implement the smallest solution, refactor.
- Keep domain logic pure and deterministic; GitHub REST access behind a typed adapter.
- Explicitly model loading, unsaved, saving, committed, conflict, unauthorized, rate-limited, and failed states.
- Validate every record read from Git, even if GitCRM originally created it.
- Produce human-readable canonical JSON; no generated binary record database.
- Prefer native browser functionality and existing small libraries to new abstractions.
- Keep the static build host-agnostic (ADR-010): hash URLs, relative asset paths, CSP in a `<meta>` tag, no host-specific features.
- Keep the code readable to humans and agents; remove redundant helpers and speculative options.

## Prohibitions

Accepted ADRs back most of these. If one blocks a good option, raise it with the owner instead of working around it.

- No server API, worker, queue, cron, background processor, hosted database, or sync service. ADR-004 allows one stateless auth broker in principle (token exchange only, never CRM data), but it is deferred (ADR-009); do not build it without an owner decision.
- No GitHub Actions for CRM functionality (ADR-006, accepted); CI and static app deployment are allowed as software development tasks.
- No user CRM data in application source, public assets, telemetry, or logs.
- No embedded GitHub client secrets or private keys. The user's PAT may persist in browser storage until Disconnect (ADR-017), never in cookies, URLs, or logs.
- No hidden last-write-wins behavior and no unbounded API retry loops.
- No feature creep into advanced roles, integrations, email sync, complex dashboards, or workflow engines.

## P0 sequence

Before designing the finished onboarding UI, validate: (1) browser-to-GitHub REST access with a narrowly scoped token; (2) exact feasibility of desired auth flow; (3) loading 100/500/2000 small private JSON docs; (4) concurrent same-file updates; (5) safe static deployment host. See `docs/12-RISKS-AND-OPEN-QUESTIONS.md`.

## Work completion checklist

- Relevant spec and decision log updated.
- Unit, contract, and E2E tests cover happy and negative paths.
- No secrets in fixtures or commits; the user's PAT is the only secret in browser storage (ADR-017).
- Core code remains serverless and portable.
- All public-facing claims about privacy, cost, or deletion are accurate.
- Any unresolved provider behavior is flagged as unverified, not asserted.
