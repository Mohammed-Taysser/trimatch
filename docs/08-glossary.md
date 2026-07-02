# Glossary — every term & abbreviation used in this project

> Plain-language explanations of the acronyms and concepts the other docs assume.
> Each entry says what it is, why it exists, and where it lives in this repo.

## 1. Documents & specifications

| Term          | Meaning                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PRD**       | _Product Requirements Document_ — describes **what** the product must do and why, from the user's perspective, before any code: roles, features, business rules with worked examples. Ours: [01-prd.md](01-prd.md).                                                 |
| **FR**        | _Functional Requirement_ — one numbered, testable statement of behavior ("FR-103: submitting moves a requisition to `pending_approval`…"). Numbered `FR-<epic><nn>` so tests and tickets can reference them precisely. Catalog in [PRD §4](01-prd.md).              |
| **NFR**       | _Non-Functional Requirement_ — quality attributes rather than features: security, performance, auditability, i18n. Ours are `NFR-01..06` in [PRD §6](01-prd.md).                                                                                                    |
| **ERD**       | _Entity-Relationship Diagram_ — a picture of the database's tables (entities), their fields, and how they relate (one-to-many etc.). Ours is the Mermaid diagram in [03-domain.md §2](03-domain.md).                                                                |
| **ADR**       | _Architecture Decision Record_ — a short document capturing one irreversible technical decision, its context, and consequences — so future readers know **why**, not just what. Ours live in [adr/](adr/); decisions are superseded by new ADRs, never edited away. |
| **SLA / SLO** | _Service Level Agreement / Objective_ — the promise made to users about availability and speed (SLA) and the internal measurable targets that back it (SLO, e.g. "p95 reads < 400 ms"). Ours: [02-sla.md](02-sla.md).                                               |
| **RPO / RTO** | _Recovery Point / Time Objective_ — after a disaster, how much data may be lost (RPO) and how long recovery may take (RTO). Defined in [02-sla.md](02-sla.md).                                                                                                      |
| **TC**        | _Test Case_ — one numbered scenario in the [test plan](05-test-plan.md), traced to the FRs it proves (`TC-203 ↔ FR-203`). Written before code; integration tests mirror them verbatim.                                                                              |
| **G/W/T**     | _Given / When / Then_ — the acceptance-criteria format on every ClickUp story: Given a starting state, When an action happens, Then an observable outcome follows. Maps 1:1 onto test names.                                                                        |
| **DoD**       | _Definition of Done_ — the checklist a story must pass before it counts as finished (tests mirror AC, docs updated, CI green). Ours: [CONTRIBUTING.md](../CONTRIBUTING.md).                                                                                         |
| **Runbook**   | The operations manual: how to run, migrate, seed, debug, and recover the system. Ours: [07-runbook.md](07-runbook.md).                                                                                                                                              |
| **C4 model**  | A convention for drawing software architecture at four zoom levels (Context, Container, Component, Code). Our [architecture doc](04-architecture.md) shows level 2 (containers).                                                                                    |

## 2. Process & workflow

| Term                     | Meaning                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Epic / story**         | An _epic_ is a large body of work (one ClickUp list, e.g. "Epic 2 — Purchase orders"); a _story_ is one user-visible slice of it ("As a purchasing officer, I want…").                      |
| **Backlog / board**      | The ordered queue of not-yet-started stories; the board tracks each story through `backlog → scoping → in design → ready for development → in development → in review → testing → shipped`. |
| **Scoping**              | Confirming a story's acceptance criteria against the PRD before coding, and splitting it if it exceeds ~1 branch-day.                                                                       |
| **PR / MR**              | _Pull Request / Merge Request_ — proposing a branch's changes for review before merging into `main`. Our flow: branch → push → PR → CI green → merge (see [CLAUDE.md](../CLAUDE.md)).       |
| **CI / CD**              | _Continuous Integration / Delivery_ — every push runs the pipeline (lint → typecheck → tests → build) so breakage is caught immediately. Ours: [ci.yml](../.github/workflows/ci.yml).       |
| **Conventional Commits** | Commit-message format `type(scope): subject` (`feat:`, `fix:`, `docs:`, `chore:`) that machines can parse to derive versions and changelogs. Enforced by commitlint on every commit.        |
| **SemVer**               | _Semantic Versioning_ `MAJOR.MINOR.PATCH`: breaking change / new feature / bug fix. Driven by commit types; releases tagged `vX.Y.Z`.                                                       |
| **Keep a Changelog**     | The [CHANGELOG.md](../CHANGELOG.md) format: human-readable, newest first, grouped Added/Changed/Fixed per release.                                                                          |
| **Coverage gate**        | CI fails if unit-test coverage drops below a threshold (80% here) — keeps untested code out of `main`.                                                                                      |
| **Test pyramid**         | Many fast unit tests, fewer integration tests (real Postgres), few end-to-end tests. Strategy in [05-test-plan.md](05-test-plan.md).                                                        |
| **lint / format hooks**  | ESLint (code correctness/style) and Prettier (formatting) run on every commit via husky + lint-staged, and again in CI.                                                                     |

## 3. Architecture & code concepts

| Term                         | Meaning                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo / workspace**     | One repository holding several packages (`apps/api`, `apps/web`, `packages/shared`) managed together by pnpm workspaces — shared code without publishing.                                                       |
| **Modular monolith**         | One deployable API with strict internal module boundaries (requisitions, approvals, purchasing…) — the seams where a future split into services would happen. See [04-architecture.md](04-architecture.md).     |
| **DTO**                      | _Data Transfer Object_ — the typed shape of a request/response body. Ours are generated from shared zod schemas via `createZodDto` ([ADR-0003](adr/0003-nestjs-zod-swagger.md)).                                |
| **zod schema**               | A runtime validator that also produces the TypeScript type — one definition in `packages/shared` validates on the server **and** in the browser.                                                                |
| **ORM**                      | _Object-Relational Mapper_ — maps database rows to code objects. Ours is Sequelize ([ADR-0001](adr/0001-tech-stack.md)).                                                                                        |
| **Migration**                | A versioned, ordered script that changes the database schema (`up`) and can undo it (`down`). Always generated with sequelize-cli, never hand-created (see [CLAUDE.md](../CLAUDE.md)).                          |
| **Seed**                     | A script inserting known demo data (our 8 demo users) — idempotent, safe to re-run.                                                                                                                             |
| **State machine**            | An explicit list of allowed status transitions (`draft → pending_approval`…). Anything not listed is rejected with `409 INVALID_TRANSITION`. One implementation (`common/state-machine`) serves all lifecycles. |
| **Invariant (I-1..I-8)**     | A rule that must **never** be false, regardless of code path — e.g. I-7 "audit rows are never updated or deleted" (enforced by a DB trigger). Catalog: [03-domain.md §4](03-domain.md).                         |
| **Audit trail**              | The append-only `audit_log` table: who did what, when, from→to state, with the reason. Answers "why was this paid?" forever.                                                                                    |
| **Gapless numbering**        | Document numbers (`PO-2026-0001`) with no holes or duplicates even under concurrency — claimed inside the issuing transaction so a rollback releases the number (I-6).                                          |
| **Minor units**              | Money stored as integer cents (`59_97` = $59.97) so arithmetic is exact — floats lose pennies (I-8). Comparisons use _basis points_ (1 bp = 0.01%).                                                             |
| **Response envelope**        | Every API success is `{ data, meta?, message, timestamp, requestId }`; every error `{ code, message, details?, timestamp, requestId, path }`. The `requestId` links a response to its log line.                 |
| **Pagination**               | List endpoints return one page at a time (`?page=&pageSize=`) plus `meta { total, totalPages, … }` — never unbounded lists.                                                                                     |
| **RBAC**                     | _Role-Based Access Control_ — what each role (requester, approver, purchasing, warehouse, ap, admin) may do, enforced by guards on every endpoint. Matrix in [06-user-manual.md](06-user-manual.md).            |
| **JWT**                      | _JSON Web Token_ — a signed token carrying the user's id/role, sent as `Authorization: Bearer …`; the API verifies the signature instead of keeping sessions.                                                   |
| **OpenAPI / Swagger**        | A machine-readable description of every endpoint, generated from the code; browsable UI at `/api/docs`.                                                                                                         |
| **Idempotent**               | An operation safe to run twice with the same result (our seeds; a good goal for APIs).                                                                                                                          |
| **CRUD**                     | Create, Read, Update, Delete — the four basic operations on a resource.                                                                                                                                         |
| **e2e / integration / unit** | Unit = one function in isolation; integration = modules together against real infrastructure (our Postgres suite); e2e = the whole system through its public surface (our browser verifications).               |

## 4. Domain terms (procurement)

The full domain glossary — REQ, PO, GRN, INV, 3-way match, tolerance, open quantity,
payable, approval chain/round/step, exception — lives in
[03-domain.md §1](03-domain.md). The one-liner: an employee raises a **REQ**uisition,
approvals produce a **P**urchase **O**rder to a vendor, the warehouse records what
arrived as a **G**oods **R**eceipt **N**ote, the vendor bills with an **INV**oice, and
the **3-way match** (PO ≈ GRN ≈ INV within tolerances) is the control that decides
whether the invoice becomes **payable**.
