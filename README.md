# TriMatch — Procurement & Purchase Orders with 3-Way Matching

> **Status:** `v0.1.0` — MVP requisition flow shipped · **Stage:** Epic 2 (purchase orders)
> **Stack (decided, see ADR-0001):** NestJS · PostgreSQL · Sequelize · React · Redis/BullMQ

## Getting started

```bash
# prerequisites: node 22.12+, pnpm 10+, docker
cp .env.example .env
pnpm install
docker compose up -d   # postgres:16, redis:7
pnpm dev               # api on :3000 (/api/v1), web on :5173
```

The web app at <http://localhost:5173> shows live api + infrastructure health.
`pnpm test` / `pnpm typecheck` / `pnpm build` run across the workspace.

TriMatch is an enterprise procurement system: employees raise **purchase requisitions**,
approvals route through an **amount/department-based approval matrix**, purchasing issues
**purchase orders**, the warehouse records **goods receipts**, and finance only approves a
vendor invoice for payment when the **3-way match** holds:

```text
Purchase Order  ≈  Goods Receipt  ≈  Vendor Invoice     (within configured tolerances)
```

The 3-way match is the control that blocks over-billing and fraud in every real ERP
(it is SAP's most-used workflow). This project implements it end-to-end with auditable
state machines and data-driven business rules.

## Why this project exists

Part of the [enterprise track](../ENTERPRISE_PROJECT_IDEAS.md) (idea #5): business-logic-heavy
systems built with the working practices of multinational teams — docs before code,
ADRs, Conventional Commits, versioned releases, and work tracked in ClickUp.
The process rules live in the [Enterprise Playbook](../ENTERPRISE_PLAYBOOK.md).

## Documentation

| Doc                                                | What's in it                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [docs/00-onboarding.md](docs/00-onboarding.md)     | **Start here** — session handoff, ClickUp workflow rules, validation checklist     |
| [docs/01-prd.md](docs/01-prd.md)                   | Product requirements — roles, FR/NFR catalog, business rules with worked examples  |
| [docs/02-sla.md](docs/02-sla.md)                   | Service levels — availability & latency SLOs, error budget, support tiers, RPO/RTO |
| [docs/03-domain.md](docs/03-domain.md)             | Domain model — glossary, entities, invariants, lifecycle state machines            |
| [docs/04-architecture.md](docs/04-architecture.md) | Architecture — container view, NestJS module map, data flow                        |
| [docs/05-test-plan.md](docs/05-test-plan.md)       | Test strategy & test-case matrix (TC ↔ FR traceability)                            |
| [docs/06-user-manual.md](docs/06-user-manual.md)   | User manual per role (requester, approver, purchasing, warehouse, AP)              |
| [docs/07-runbook.md](docs/07-runbook.md)           | Operations runbook (run, seed, debug, recover)                                     |
| [docs/adr/](docs/adr/)                             | Architecture decision records                                                      |
| [CHANGELOG.md](CHANGELOG.md)                       | All notable changes, per version                                                   |
| [CONTRIBUTING.md](CONTRIBUTING.md)                 | Commit convention, branching, definition of done                                   |

## Roles at a glance

| Role               | Does                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| Requester          | Raises purchase requisitions                                              |
| Approver           | Approves/rejects per the approval matrix                                  |
| Purchasing officer | Converts approved requisitions into POs, manages vendors                  |
| Warehouse staff    | Records goods receipts against PO lines                                   |
| AP clerk           | Enters vendor invoices, resolves 3-way-match exceptions, releases payment |

## Versioning & releases

- **SemVer**, driven by **Conventional Commits**: `feat:` → minor, `fix:` → patch,
  `BREAKING CHANGE:` → major.
- Every release gets a dated section in [CHANGELOG.md](CHANGELOG.md)
  ([Keep a Changelog](https://keepachangelog.com) format).
- Releases are tagged `vX.Y.Z`. Once code and CI exist, semantic-release automates this
  from the commit history.

## Work management

Work is tracked in **ClickUp** → space _Side Projects_ → folder _TriMatch_:
one list per epic, tasks are user stories with Given/When/Then acceptance criteria
that mirror the FR-xxx IDs in the PRD. No branch without a story.

## Roadmap (scope ladder)

- **MVP (0.x):** requisition → single approval → PO → goods receipt; manual invoice entry
- **v1:** approval matrix engine, partial receipts, 3-way match with tolerances + exception queue
- **Stretch:** RFQ/vendor quote comparison, PO amendments with versioning, vendor scorecards, multi-tenancy
