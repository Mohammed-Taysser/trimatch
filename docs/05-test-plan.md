# Test Plan — TriMatch

- **Status:** accepted
- **Date:** 2026-07-02
- **Related:** [01-prd.md](01-prd.md) (FR/NFR + §5 worked examples) · [03-domain.md](03-domain.md) (invariants I-1..I-8)

## 1. Strategy (playbook §5)

| Layer           | Tool                                         | Scope                                                                                               | Notes                                                                |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Unit**        | Jest                                         | Pure rule functions: matrix evaluation, tolerance math, open-qty math, sequence formatting          | **Table-driven**, mirroring PRD §5 tables 1:1 — most tests live here |
| **Integration** | Jest + Testcontainers (real Postgres, Redis) | Repositories, transactions, state machines with the real DB, sequence gaplessness under concurrency | The critical paths                                                   |
| **E2E**         | supertest against the Nest app               | One happy path per epic + authz denials                                                             | Few and stable                                                       |

Rules:

- Acceptance criteria in ClickUp stories **are** the test names.
- Every invariant I-1..I-8 has at least one test that tries to violate it and asserts rejection.
- Coverage gate ~80% on `modules/**`; rule functions effectively 100% via tables.
- No mocks for business rules — if a rule needs a mock, refactor it to a pure function.

## 2. Test-case matrix

IDs are stable; each maps to FRs/invariants. G/W/T = Given / When / Then.

### Epic 1 — Requisitions & approvals

| TC     | Verifies       | G/W/T                                                                                                         |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------- |
| TC-101 | FR-101         | G: authenticated requester · W: creates requisition with 2 lines · T: `draft`, totals computed in minor units |
| TC-102 | FR-101         | W: create with 0 lines · T: `422 VALIDATION_ERROR`                                                            |
| TC-103 | FR-102, NFR-02 | G: draft owned by user A · W: user B edits/deletes · T: `403 FORBIDDEN`                                       |
| TC-104 | FR-103         | G: draft · W: submit · T: `pending_approval`, chain snapshotted, audit row written                            |
| TC-105 | FR-104         | G: pending step · W: approver rejects w/o reason · T: `422 REASON_REQUIRED`                                   |
| TC-106 | FR-105         | G: rejected REQ · W: revise + resubmit · T: new chain round, previous round preserved in history              |
| TC-107 | NFR-03         | G: `approved` REQ · W: submit again · T: `409 INVALID_TRANSITION`                                             |
| TC-108 | FR-107, NFR-02 | G: requester A, B's REQs exist · W: A lists requisitions · T: only A's returned                               |

### Epic 2 — Purchase orders

| TC     | Verifies    | G/W/T                                                                                                                                  |
| ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TC-201 | FR-201      | G: `approved` REQ · W: purchasing converts to PO draft, edits a price · T: PO draft created, price delta audit-logged, REQ `converted` |
| TC-202 | FR-201      | G: REQ `pending_approval` · W: convert · T: `409 INVALID_TRANSITION`                                                                   |
| TC-203 | FR-203, I-6 | W: issue 3 POs concurrently (parallel transactions) · T: numbers `PO-2026-0001..0003`, gapless, no duplicates                          |
| TC-204 | FR-204      | G: issued PO with one receipt · W: cancel · T: `409 CANCEL_BLOCKED_RECEIVED`                                                           |
| TC-205 | FR-205, I-1 | G: issued PO · W: PATCH a line · T: `409 PO_IMMUTABLE`                                                                                 |
| TC-206 | FR-206, I-8 | Table: line 3 × $19.99 → 5997 minor units; PO total = Σ lines exactly                                                                  |

### Epic 3 — Goods receiving

| TC     | Verifies    | G/W/T                                                                                              |
| ------ | ----------- | -------------------------------------------------------------------------------------------------- |
| TC-301 | FR-301/302  | G: issued PO, line qty 100 · W: receive 40 · T: open qty 60, PO `partially_received`, GRN numbered |
| TC-302 | FR-302      | G: open qty 60 · W: receive 60 · T: open qty 0, PO `received`                                      |
| TC-303 | FR-303, I-2 | G: open qty 60 · W: receive 61 · T: `422 OVER_RECEIPT_BLOCKED` (MVP)                               |
| TC-304 | FR-304      | W: receive 40 good + 5 damaged · T: open qty decreases by 40 only; damaged recorded                |

### Epic 4 — Invoices & 3-way match (v1) — mirrors PRD §5.2 cases A–H

| TC      | Verifies    | G/W/T (PO line: 100 @ $50.00)                                                                                                  |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TC-401  | FR-401      | W: second invoice with same vendor + invoice number · T: `409 DUPLICATE_INVOICE`                                               |
| TC-402A | FR-402/403  | Case A — exact → `matched`, payable                                                                                            |
| TC-402B | "           | Case B — $50.49 (+0.98%) → `matched`                                                                                           |
| TC-402C | "           | Case C — $50.51 (+1.02%) → `exception PRICE_VARIANCE`                                                                          |
| TC-402D | "           | Case D — 98/98 → `matched` (−2% within tolerance)                                                                              |
| TC-402E | "           | Case E — 97/97 → `exception QTY_UNDER_DELIVERY`                                                                                |
| TC-402F | I-3         | Case F — invoiced 102 > received 100 → `exception QTY_OVER_INVOICED`                                                           |
| TC-402G | FR-602      | Case G — partial 50/50 cumulative → `matched`                                                                                  |
| TC-402H | FR-402      | Case H — +$30 unlisted shipping → `exception TOTAL_VARIANCE` (> $25 abs)                                                       |
| TC-403  | FR-404      | G: exception · W: AP accepts variance with reason · T: `variance_accepted`, reason in audit                                    |
| TC-404  | FR-405, I-7 | G: match record · W: UPDATE/DELETE attempt · T: rejected; record stores tolerances used                                        |
| TC-405  | FR-406, I-4 | G: invoice `entered` (no match) · W: mark payable · T: `409 MATCH_REQUIRED` — **the invariant test**                           |
| TC-406  | I-8         | Property test: for random qty/price/tolerance in minor units, evaluator never uses floats and is symmetric around the boundary |

### Epic 5 — Approval matrix (v1) — mirrors PRD §5.1 examples

| TC     | Verifies    | G/W/T                                                                                                      |
| ------ | ----------- | ---------------------------------------------------------------------------------------------------------- |
| TC-501 | FR-501      | Table: $430 → [Lead]; $4,999.99 → [Lead, Head]; $7,200 IT/software → [Lead, Head, FinDir, CISO]            |
| TC-502 | FR-501      | Boundary: $500.00 → R1; $500.01 → R2                                                                       |
| TC-503 | FR-502      | G: 2-step chain, step 1 approved · W: step-2 approver rejects · T: REQ `rejected`, chain stops             |
| TC-504 | FR-503      | G: delegation window active · W: delegate approves · T: approved; audit shows delegator + delegate         |
| TC-505 | FR-504, I-5 | G: REQ in flight under R2 · W: admin edits R2 · T: in-flight chain unchanged; new submissions use new rule |
| TC-506 | FR-505      | W: admin saves rules with overlapping ranges for one department · T: `422 MATRIX_OVERLAP`                  |

### Epic 6 — Exceptions & partials (v1)

| TC     | Verifies    | G/W/T                                                                                                    |
| ------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| TC-601 | FR-601      | 3 receipts (40/30/30) against qty-100 line → open qty 0, PO `received`                                   |
| TC-602 | FR-602, I-3 | Invoices 50 then 60 against 100 received → second → `exception QTY_OVER_INVOICED` (cumulative 110 > 100) |
| TC-603 | FR-604      | G: issued PO $5k · W: amend to $6k · T: version 2 created, re-approval required, v1 still readable       |

### Cross-cutting

| TC     | Verifies    | G/W/T                                                                                             |
| ------ | ----------- | ------------------------------------------------------------------------------------------------- |
| TC-901 | NFR-01, I-7 | Every TC above that changes state → assert exactly one audit row per transition, append-only      |
| TC-902 | NFR-02      | RBAC matrix sweep: each role × each endpoint → allowed/denied as per manual §1                    |
| TC-903 | NFR-05      | Error responses conform to the uniform error schema (code, message, requestId)                    |
| TC-904 | NFR-03      | Transition + audit + sequence commit atomically: kill the transaction mid-way → nothing persisted |

## 3. Non-functional testing

- **Concurrency:** TC-203 (gapless sequences) and a double-approve race on one step
  (two parallel approvals → exactly one wins, `409` for the other).
- **Performance smoke (pre-1.0):** k6 script hitting T1/T2 endpoints at pilot load;
  compare against [SLA §2](02-sla.md) targets.
- **Restore drill:** per [SLA §5](02-sla.md), quarterly, scripted in the runbook.

## 4. Definition of test-done per story

A story is testable-complete when: its acceptance criteria appear as test names,
the FRs it implements have their TCs green, and any new rule got a worked example
added to the PRD **and** a mirroring table test.
