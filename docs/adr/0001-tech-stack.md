# ADR-0001: Tech stack — NestJS + PostgreSQL + Sequelize

- **Status:** accepted
- **Date:** 2026-07-02

## Context

TriMatch is a correctness-critical, relational domain (PO lines ↔ receipt lines ↔ invoice
lines; gapless sequences; transactional state transitions — see invariants I-1..I-8 in
[03-domain.md](../03-domain.md)). The stack must support strict transactions, migrations,
and a learning goal: the owner is actively learning NestJS and wants deep practice with it.

## Options considered

| Option           | Trade-off                                                                                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prisma**       | Best TypeScript DX and migration story; but query-builder abstraction hides SQL, and interactive transactions are less natural for row-locking patterns (sequence claims, chain snapshots)                                                                                                                 |
| **TypeORM**      | Most common in NestJS docs; ActiveRecord/DataMapper both possible; migration DX and maintenance history are weak points                                                                                                                                                                                    |
| **Sequelize** ✅ | Mature, battle-tested; explicit `transaction` objects fit the invariant-heavy writes; `sequelize-typescript` + `@nestjs/sequelize` give first-class Nest integration; migrations via `sequelize-cli`/umzug are explicit (up/down) — closer to how enterprise teams manage schema than auto-generated diffs |

## Decision

- **Backend:** NestJS (REST, versioned `/api/v1`), modular monolith (module map in
  [04-architecture.md](../04-architecture.md))
- **Database:** PostgreSQL 16
- **ORM:** **Sequelize** with `sequelize-typescript` and `@nestjs/sequelize`;
  migrations written by hand with `sequelize-cli` (no `sync()` outside tests)
- **Frontend:** React 18 + Vite + TypeScript; TanStack Query for server state
- **Async/jobs:** Redis + BullMQ (notifications; later: scheduled jobs)
- **Monorepo:** pnpm workspaces — `apps/api`, `apps/web`, `packages/shared` (zod contracts)

## Consequences

- Easier: explicit transactions with row locks (`SELECT … FOR UPDATE`) for sequence claims
  and step transitions; hand-written migrations double as schema documentation.
- Harder: Sequelize's TypeScript inference is weaker than Prisma's — mitigated with
  `sequelize-typescript` decorators and zod validation at the API edge.
- Revisit if: query typing pain outweighs transaction ergonomics after Epic 2 (would be
  ADR-000X superseding this one; migration cost contained while the schema is young).
