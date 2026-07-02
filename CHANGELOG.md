# Changelog

All notable changes to TriMatch are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [SemVer](https://semver.org) driven by Conventional Commits
(`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major).

## [Unreleased]

### Planned (next)

- Code scaffold: pnpm monorepo (`apps/api` NestJS, `apps/web` React, `packages/shared`),
  docker-compose, husky + commitlint, CI pipeline (ClickUp Epic 0 leftovers)
- Epic 1 first vertical slice: create → submit → approve a requisition (FR-101..107)

## [0.0.1] — 2026-07-02

Docs baseline — everything a new contributor needs to understand *what* is being built,
*why*, and *how it will be verified*, before any code exists.

### Added

- **PRD** (`docs/01-prd.md`): roles, FR-1xx..6xx catalog across 6 epics, NFRs, and
  business rules with worked examples — approval matrix R1–R5, 3-way-match tolerance
  cases A–H, money-in-minor-units, gapless numbering
- **SLA/SLOs** (`docs/02-sla.md`): service tiers, availability/latency targets,
  error budget, Sev-1..3 support matrix, RPO/RTO, restore-drill policy
- **Domain model** (`docs/03-domain.md`): glossary, ER diagram, four lifecycle state
  machines, invariants I-1..I-8, domain event names
- **ADR-0001**: stack — NestJS + PostgreSQL 16 + Sequelize (+ React, BullMQ, pnpm monorepo)
- **ADR-0002**: approval matrix as versioned DB rows; chains snapshotted at submission
- **Architecture** (`docs/04-architecture.md`): modular-monolith container view,
  11-module NestJS map, shared state-machine base, pure-rule-function policy
- **Test plan** (`docs/05-test-plan.md`): pyramid strategy and ~40 test cases (TC-xxx)
  traced to FRs/invariants, mirroring the PRD's worked examples
- **User manual** (`docs/06-user-manual.md`): per-role guide with RBAC matrix and FAQ
- **Runbook** (`docs/07-runbook.md`): operational skeleton (run/migrate/seed, incident
  response, restore-drill log)
- Repo hygiene: README with docs index, CONTRIBUTING (Conventional Commits, DoD),
  PR template, CODEOWNERS, .gitignore

[Unreleased]: ./CHANGELOG.md
[0.0.1]: ./CHANGELOG.md
