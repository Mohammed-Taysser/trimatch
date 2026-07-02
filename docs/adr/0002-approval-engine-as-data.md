# ADR-0002: Approval matrix as data, chains as snapshots

- **Status:** accepted
- **Date:** 2026-07-02

## Context

Approval routing (PRD §5.1, FR-501..505) varies by amount, department, and category, and
admins must edit it without deployments. Meanwhile in-flight requisitions must be immune
to rule edits (FR-504) — an auditor asks "which rule routed this?" months later.

## Options considered

| Option                                       | Trade-off                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Rules in code (strategy per range)           | Type-safe but every policy change is a deployment; violates the admin-editable requirement                               |
| Generic rules engine / DSL library           | Overkill; opaque evaluation, hard to validate gaps/overlaps                                                              |
| **Rules as DB rows + snapshot on submit** ✅ | Admin-editable, validatable (no gaps/overlaps per department), and snapshotting gives audit-proof in-flight immutability |

## Decision

- `approval_matrix_rules` table: `(amount_min_minor, amount_max_minor, department_id?,
category_id?, chain JSONB [ordered role list], priority, active)`.
- Evaluation: most-specific active rule wins (category+department > department > generic);
  appended-role rules (like R5/CISO) compose on top.
- On submit, the computed chain is **copied** into `approval_chains`/`approval_steps`
  owned by the requisition; the rule id + rule version used are stored on the chain.
- Rule edits are versioned rows (soft-close old, insert new), so historical chains can
  always point at the exact rule text that produced them.
- The same engine shape is reused later for match tolerances per category (PRD §5.2).

## Consequences

- Easier: admin UI is CRUD + validation; auditability is a join, not archaeology;
  policy tests are seed-data driven (table-driven tests mirror PRD §5.1 examples).
- Harder: rule validation (gap/overlap detection per department) is our code to write
  and test (FR-505); JSONB chain needs a zod schema guard at the boundary.
