# Changelog

All notable changes to TriMatch are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [SemVer](https://semver.org) driven by Conventional Commits
(`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major).

## [Unreleased]

### Planned (next)

- Epic 7 — UI refinement/design system + superadmin dashboard

## [0.5.0] — 2026-07-03

Exceptions & partial deliveries complete (Epic 6): a PO accumulates receipts
and invoices over time with cumulative matching (I-2/I-3 hold across any
split), amendments version the PO with an approval gate on increases, and the
exceptions queue became a real worklist — sorted, counted per reason, and
updating live as AP resolves.

### Added

- **Exceptions queue drives daily work (FR-603)**: `GET /exceptions` gains
  `sort=oldest|newest|vendor|reason`; new `GET /exceptions/summary` returns the
  total and counts per reason (vendor/age filters honoured; an invoice carrying
  two reasons counts toward both); AP screen shows clickable reason-count
  chips + a sort selector, and both the queue and the counts refresh live on
  match runs and resolutions

- **PO amendments with versioning (FR-604/TC-603)**: `POST
  /purchase-orders/:id/amend` changes quantity/price on issued or partially
  received POs — the superseded version is snapshotted into append-only
  `po_amendments` (DB trigger refuses UPDATE/DELETE) and the PO becomes version
  N+1; a total increase parks the PO in the new `pending_reapproval` state
  (receiving and invoicing blocked) until an approver posts
  `:id/approve-amendment`; quantity may never drop below what was already
  received (422 `AMEND_BELOW_RECEIVED`, I-2); `GET /purchase-orders/:id/versions`
  keeps every version readable; amended values are the new 3-way-match
  baseline; amend form, versions list and admin approve button on the
  purchasing screen

- **Partial invoices matched cumulatively — proven (FR-602/TC-602/I-3)**:
  integration tests — invoices of 50 then 60 against 100 received raise
  `QTY_OVER_INVOICED` (cumulative 110 > 100) on the second; 50 then 50 settles
  the PO with both invoices payable; rejected invoices are excluded from the
  cumulative

- **Receipt history per PO (FR-601/TC-601)**: `GET /receipts?poId=` (warehouse/
  admin, paginated, oldest first) — proof that one PO accumulates many receipts:
  40/30/30 against a qty-100 line ends at open qty 0 and PO `received`, and a
  further receipt is refused; receipt history shown under the selected PO on the
  warehouse screen

## [0.4.0] — 2026-07-03

The approval matrix engine is live: chains are computed from versioned,
validated rules at submission and snapshotted (ADR-0002) — sequential
multi-step approval, delegation windows with dual-identity audit, and proof
that editing the rules never touches an in-flight chain (I-5).

### Added

- **In-flight chain immunity proven (FR-504/TC-505/I-5)**: integration test —
  a requisition submitted under the default ruleset keeps and completes its
  snapshotted three-step chain after the matrix is replaced, while an identical
  new submission gets the new single-step chain
- **Delegation (FR-503/TC-504)**: `delegations` table + CRUD (approver delegates to
  a peer by email for a date range; self-delegation and backwards windows refused);
  within the window the delegate sees and works the delegator's queue, and the
  audit row records both identities ("on behalf of …"); delegation form + list on
  the approver inbox
- **Sequential multi-step chains (FR-502/TC-503)**: an approver sees a step only
  when it is their turn (lowest pending step of the current round, requisition
  still pending); out-of-turn decisions → 409 `STEP_NOT_CURRENT`; a rejection at
  any step stops the chain
- **Matrix chain computation (FR-501/TC-501/TC-502)**: submission now computes the
  approval chain from the active ruleset — most-specific base rule + matching
  append rules (pure `computeChain`, PRD §5.1 examples reproduced exactly incl.
  the $500.00/$500.01 boundary); titles resolve via the reporting hierarchy
  (Team Lead, Department Head) or `users.job_title` (Finance Director, CEO,
  CISO — three new seeded approvers); users gained `department`/`job_title`;
  unresolvable titles → 409 `NO_APPROVER`; multi-step chains snapshot one step
  per approver (sequential gating lands next)
- **Matrix rules as versioned data (FR-501/505, ADR-0002)**: `matrix_rules` table —
  immutable rows, every admin save creates version N+1; base rules (amount range ×
  department × category → ordered chain of titles) + append rules (R5: CISO for
  IT/Software licenses); pure overlap validator (422 `MATRIX_OVERLAP`, TC-506);
  default R1–R5 seeded as version 1; admin `GET/POST /matrix-rules`

## [0.3.0] — 2026-07-02

The 3-way match is live end to end: AP enters the vendor's invoice (duplicate-
protected), runs the match against PO and receipts — pure integer/basis-point
rules mirroring PRD §5.2 cases A–H — and either the invoice auto-advances to
payable or lands in a filterable exceptions queue with the three documents side
by side, where AP accepts the variance (reason audit-logged), holds for a credit
note, or rejects. Nothing becomes payable without a match record (I-4).

### Added

- **Hard payable gate (FR-406/I-4/TC-405)**: `POST /invoices/:id/payable` — an
  unmatched invoice answers 409 `MATCH_REQUIRED`; accepted variances advance to
  payable; TC-404 completed (match-record DELETE refused like UPDATE); web
  Mark-payable button
- **Exception resolution (FR-404/TC-403)**: `accept-variance` (reason mandatory →
  `variance_accepted`, reason verbatim in audit), `request-credit-note` (invoice
  held in `awaiting_credit_note`), `reject` (returned to vendor); invoice
  lifecycle aligned with domain §3.4 (`variance_accepted`/`awaiting_credit_note`
  states added; exception no longer jumps straight to payable); resolution
  controls on the exception cards
- **Exceptions queue (FR-403/FR-603)**: `GET /exceptions` (ap/admin, paginated)
  filterable by vendor, reason and age; every item carries the match record's
  side-by-side comparisons (ordered/received/invoiced, PO vs invoice price,
  per-line verdicts, total delta); AP screen renders the three-document deltas
  with mismatches highlighted
- **The 3-way match (FR-402/403/405/406)**: pure tolerance rules in integer minor
  units / basis points (no floats — TC-406) mirroring PRD §5.2 cases A–H 1:1;
  per-line checks (price ±1%, cumulative invoiced ≤ received per I-3, final-invoice
  under-delivery −2%) + invoice-level total variance ($25 abs); immutable
  `match_records` (DB trigger, FR-405) storing tolerances, comparisons and
  machine-readable reasons; `POST /invoices/:id/match` — matched auto-advances to
  payable (FR-406 hard gate), failures route to exception; `invoices.is_final`
  flag (close-short) disambiguates cases E vs G; web Run-match button with verdicts

### Changed

- **Invoice entry records the vendor's total as-is**: the `TOTAL_MISMATCH` entry
  guard was removed — an unlisted extra (case H shipping) must be enterable so the
  match can flag it as `TOTAL_VARIANCE`

- **Vendor invoice entry (FR-401)**: `invoices` + `invoice_lines` tables, unique
  vendor+number (409 `DUPLICATE_INVOICE`, TC-401), exact-total validation
  (422 `TOTAL_MISMATCH`, I-8), audit row `invoice.entered`; AP-role web screen
  entering invoices against POs

## [0.2.0] — 2026-07-02

MVP complete: the full procurement loop runs end to end through the UI — a
requester raises and submits, the manager approves or rejects with a reason,
purchasing converts to a numbered PO for an active vendor, and the warehouse
receives against it with open-quantity and damaged-goods tracking — all
state-machine-guarded, audit-trailed, gapless-numbered, and seeded for demo.

### Changed

- **API contract**: every success response now uses the fixed envelope
  `{ data, meta?, message, timestamp, requestId }` and every error
  `{ code, message, details?, timestamp, requestId, path }`; all list endpoints
  are paginated (`?page=&pageSize=`, defaults 1/20, max 100) with
  `meta { page, pageSize, total, totalPages }` — web client unwraps centrally

### Added

- **Seeded demo org (runbook §1)**: idempotent flow seeder — 3 vendors (one
  inactive), a requisition in every lifecycle state (live inbox step, rejection
  with reason), an issued PO partially received with damaged units; reserved 9xxx
  number band with sequences bumped via GREATEST; users seeder now upsert-based
- **Damaged goods (FR-304/TC-304)**: GRN lines record `damagedQuantity` separately —
  damaged units never count as received (open qty decreases by good units only);
  damage is queryable on GRNs and PO detail lines; warehouse screen gains a
  damaged input
- **Over-receipt blocking formalized (FR-303/TC-303)**: receiving beyond the open
  quantity returns 422 `OVER_RECEIPT_BLOCKED` with full rollback; exact-boundary
  receipts succeed; multi-line GRNs are atomic (one overflowing line rejects all)
- **Goods receiving (FR-301/302)**: `grns` + `grn_lines` tables, gapless
  `GRN-YYYY-NNNN` numbers, `POST /receipts` (warehouse role) with per-line
  open-quantity math (I-2, over-receipt refused), PO → partially_received /
  received transitions with audit rows; PO detail exposes received/open
  quantities; TC-204 activated — received POs return `CANCEL_BLOCKED_RECEIVED`;
  web Goods-receiving screen for the warehouse role
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
