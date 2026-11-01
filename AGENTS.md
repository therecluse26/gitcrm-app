# Agent Guide

All coding agents should read [CLAUDE.md](CLAUDE.md) and the linked product/architecture documents before changing this project.

**Review status:** the owner reviewed every ADR on 2026-10-27; see the review-status note in `CLAUDE.md`.

Rules (backed by accepted ADRs; raise conflicts with the owner):

1. Do not add a backend, persistent database, or GitHub Actions CRM automations. ADR-004 allows a stateless auth broker in principle, but it is deferred (ADR-009); do not build it without an owner decision.
2. The private Git repository is authoritative; one JSON document per entity.
3. Never assume a browser OAuth client secret is safe; verify auth behavior independently.
4. Write tests from `specs/` before feature implementation.
5. Document substantial tradeoffs and defer non-MVP ideas.
