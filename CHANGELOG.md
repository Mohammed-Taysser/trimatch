# Changelog

All notable changes to TriMatch are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [SemVer](https://semver.org) driven by Conventional Commits
(`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major).

## [Unreleased]

### Changed

- **API contract**: every success response now uses the fixed envelope
  `{ data, meta?, message, timestamp, requestId }` and every error
  `{ code, message, details?, timestamp, requestId, path }`; all list endpoints
  are paginated (`?page=&pageSize=`, defaults 1/20, max 100) with
  `meta { page, pageSize, total, totalPages }` — web client unwraps centrally

### Added

- **Requisition → PO link (FR-107/FR-201)**: requisition views embed the linked
  PO (`po { id, poNumber, status }`) once converted; requesters see the live PO
  number and status on their card
- **PO lifecycle rules (FR-204/FR-205)**: `POST /purchase-orders/:id/cancel`
  (draft/issued → cancelled with audit row; blocked with `CANCEL_BLOCKED_RECEIVED`
  once receipts exist — guard activates with Epic 3), issued POs are immutable —
  line edits return 409 `PO_IMMUTABLE` (I-1); web Cancel button
- **Gapless PO numbering on issue (FR-203/I-6)**: `sequences` table + claim upsert
  inside the issuing transaction (`common/sequences`), `POST /purchase-orders/:id/issue`
  assigns `PO-YYYY-NNNN` and moves draft → issued with an audit row; TC-203 proves
  gaplessness under 3 concurrent issues; web Issue button
- **Convert requisition → PO draft (FR-201)**: `purchase_orders` + `po_lines` tables
  (CLI-generated migration), PO lifecycle map per FR-204,
  `POST /purchase-orders/from-requisition` — approved REQ → `converted` + PO draft
  inheriting lines, vendor must be active; draft line edits (price/SKU/qty) audit-log
  the delta; `GET /requisitions/approved` purchasing queue; web Purchasing screen with
  convert flow and PO list
- **Vendor registry (FR-202)**: `vendors` table + CRUD under `/api/v1/vendors`
  (purchasing/admin roles), unique names (409 `DUPLICATE_VENDOR`), active flag with
  `?active=true` filter and `assertActive` guard (409 `VENDOR_INACTIVE`) ready for PO
  creation; web Vendors screen for the purchasing role

### Planned (next)

- Epic 2 — purchase orders: vendors registry (FR-202), convert approved REQ → PO
  (FR-201), gapless PO numbering (I-6), issue/cancel/close lifecycle

## [0.1.0] — 2026-07-02

MVP requisition flow, end to end: a requester drafts and submits, the manager
approves or rejects with a reason, rejections can be revised into a new approval
round, and every transition is captured in a tamper-proof audit trail — behind a
JWT-authenticated API with Swagger docs, structured logging, an 80%-gated CI
pipeline, and a React front end for both roles.

### Added

- **Immutable audit trail (FR-106/I-7)**: database trigger refuses UPDATE/DELETE on
  `audit_log`; TC-901 suite walks the full lifecycle asserting exactly one row per
  transition (who/when/from/to/comment)
- **Status tracking (FR-107)**: requisition cards show "pending with `approver`" and
  a per-round chain timeline (approver, decision, timestamp); TC-108 assertions
- **Structured request logging** (nestjs-pino): one JSON line per request on stdout
  with `X-Request-Id` (honored or generated, echoed as response header),
  `Authorization` redacted, health checks excluded, pretty dev output (runbook §4)
- **Revise & resubmit (FR-105)**: `POST /requisitions/:id/revise` (rejected → draft),
  resubmit opens a new approval round while earlier rounds stay in history; web
  "Revise & edit" button jumps straight into the prefilled form
- **Approver inbox (FR-104)**: `GET /approvals/inbox` + approve/reject endpoints in a
  new `approvals` module — reject requires a reason (422 `REASON_REQUIRED`, TC-105),
  decisions lock rows and advance the requisition (approved when no pending steps
  remain in the round); requisition views now include chain steps with the decision
  reason verbatim; web: role-routed approver inbox screen, requesters see rejection
  reasons on their drafts
- **Submit for approval (FR-103)**: `POST /requisitions/:id/submit` — state-machine
  base (`common/state-machine`, lifecycle per domain §3.1, 409 `INVALID_TRANSITION`),
  approval-chain snapshot (`approval_steps` with rounds, MVP approver = requester's
  manager), append-only `audit_log` row — one atomic transaction; web Submit button,
  non-drafts read-only
- **Draft requisitions (FR-101/102)**: `requisitions` + `requisition_lines` tables,
  CRUD under `/api/v1/requisitions` with ownership checks (403 `FORBIDDEN`),
  draft-only edit/delete (409 `INVALID_TRANSITION`), pure totals function in integer
  minor units (I-8); web login + "My requisitions" screen (create/edit/delete drafts,
  TanStack Query + shared schemas); integration tests mirror TC-101..103
- **OpenAPI & DTO bridge (ADR-0003)**: nestjs-zod `createZodDto` over the shared zod
  schemas + global validation pipe (same 422 `VALIDATION_ERROR` contract); Swagger UI
  at `/api/docs`, `openapi.json` export script + CI artifact
- **Identity & database foundation**: Sequelize wired via `@nestjs/sequelize`
  (hand-written migrations, sequelize-cli `migrate`/`seed` scripts), `users` table
  with 7-demo-user seed (runbook §1), JWT auth (`POST /api/v1/auth/login`,
  `GET /api/v1/auth/me`), global `JwtAuthGuard`/`RolesGuard` with `@Public()`/
  `@Roles()`, zod-validated bodies (422 `VALIDATION_ERROR`), real integration
  suite against Postgres in CI (migrate+seed step)
- **Guardrails & CI**: husky hooks (pre-commit lint-staged, commit-msg commitlint
  conventional), ESLint 9 flat config (typescript-eslint strict + stylistic,
  react-hooks) + Prettier, GitHub Actions pipeline
  lint→format→typecheck→unit(80% coverage gate)→integration→build with
  postgres/redis services; multer security override
- **Monorepo scaffold** (pnpm workspaces): `apps/api` (NestJS 11, zod-validated env —
  refuses to boot on invalid config, `/api/v1/health/liveness|readiness`),
  `apps/web` (React 19 + Vite 7 + TanStack Query health dashboard),
  `packages/shared` (zod schemas consumed by both apps),
  `docker-compose.yml` (postgres:16, redis:7 with healthchecks; credentials, db
  name and host ports driven by env, no hardcoded values), `.env.example`;
  Jest suites mirror the story's acceptance criteria
- **CLAUDE.md**: session guide for Claude Code (context pointers, locked decisions,
  workflow rules, ClickUp REST fallback)
- **Onboarding & session handoff** (`docs/00-onboarding.md`): current state, locked
  decisions, ClickUp IDs and workflow-simulation rules, session-start validation
  checklist, and the kickoff prompt for continuing work in a new session

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
