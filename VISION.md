# Product Vision

## One sentence

**GitCRM is the small CRM you use before you need a big CRM: a clean interface over CRM records you already own as plain files in Git.**

## Problem

Individuals and very small companies need a place to track people, companies, open deals, conversations, and next steps. Traditional CRMs frequently introduce disproportionate setup, database hosting, SaaS limits, custom objects, and vendor-specific data models. For a solo developer or a tiny consultancy, the administration cost can exceed the value of the software.

## Audience

Primary: developers, freelancers, independent consultants, small agencies, and technical founders operating alone or with roughly 2-5 collaborators. They are technical users, comfortable with GitHub, including creating a fine-grained personal access token (ADR-008, ADR-015). They should not have to edit JSON or know Git commands to use the UI.

Not intended for: enterprise sales organizations, call centers, regulated record systems requiring certified retention/erasure, teams needing granular CRM-specific roles, or organizations demanding a full email/sales-automation suite.

## Product promises

1. **Data is yours.** Every CRM entity is a human-inspectable JSON document inside your private repository, with an established portable format.
2. **No data infrastructure.** No server stores or sees your CRM data, and there is no managed database, message queue, or worker. A small, stateless sign-in service may be added later if demand appears; it would never see CRM data (ADR-009, deferred).
3. **Useful immediately.** Contacts, companies, opportunities, pipeline, tasks, notes, search, and export; focused, not an admin platform.
4. **Auditability by default.** Git commits provide history and recovery for ordinary edits.
5. **Easy exit.** Export and file-level interoperability are first-class features, not a paid upgrade.
6. **No feature-growth trap.** When an organization needs sophisticated automation or complex access controls, migration is a success case.

## Non-negotiable principles

- One Git repository per independent workspace / organization, always **private**.
- One immutable-ID-based document per record. No giant `opportunities.json` or centralized records database. A derived, verified rollup used only as a cache is allowed (ADR-016).
- The `main` branch is the authoritative current snapshot for MVP.
- Local client-side queries over the current snapshot; Git history is only for audit/recovery.
- No user data embedded in the publicly hosted frontend or static build artifacts.
- No GitHub Actions requirement for CRM features or automatic follow-ups.
- Git provider dependence is explicit initially; do not build a speculative multi-provider abstraction until needed.
- Prefer a missing feature to extra operational machinery.

## Goals (MVP)

- A first-time technical user can connect an existing private repo and get a useful CRM workspace.
- Core records can be created, edited, linked, searched, archived, deleted from the current snapshot, and exported.
- Changes survive refresh and can be inspected as Git commits.
- A concurrent edit to the same document never silently overwrites another person's update.
- A user can stop using GitCRM and retain usable records without vendor assistance.

## Explicit non-goals

- Email synchronization, sending, tracking, or AI enrichment.
- Webhooks, scheduled CRM automation, GitHub Actions pipelines for business operations.
- Custom objects, formula fields, approvals, workflow builders. (Simple typed custom fields came first after the MVP, ADR-020.)
- Detailed permissions beyond GitHub repository access.
- Mobile native apps, offline write synchronization, attachments, dashboards/forecasting.
- A guarantee of compliance with any particular privacy regulation.

## Positioning

**Working phrase:** "No database. No server. No lock-in." Drop "No server" if the deferred sign-in service (ADR-009) ever ships.

Avoid promising "zero setup" until authentication and onboarding genuinely reach that bar. Avoid promising "guaranteed free forever" because third-party usage policies and quotas can change.

## What success looks like

A solo founder tracks their first 100 contacts and 20 opportunities with minimal setup. Six months later, they either keep using GitCRM happily or migrate to a bigger system with a complete, understandable export. Both are successful outcomes.
