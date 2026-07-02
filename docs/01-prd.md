# PRD-0001 — TriMatch Procurement Core

- **Status:** accepted
- **Date:** 2026-07-02
- **Owner:** Mohmmed Taysser
- **Related:** [03-domain.md](03-domain.md) · [05-test-plan.md](05-test-plan.md) · [ADR-0002](adr/0002-approval-engine-as-data.md)

## 1. Problem

In any company past ~50 employees, uncontrolled buying leaks money three ways:

1. **Unauthorized spend** — employees order things nobody approved.
2. **Over-billing** — vendors invoice more than what was ordered or delivered
   (duplicate invoices, price creep, short deliveries billed in full).
3. **No audit trail** — when finance asks "who approved this €12k purchase?",
   the answer is a Slack thread.

The industry-standard control is the **procure-to-pay chain with a 3-way match**:
nothing is payable unless the purchase order, the goods receipt, and the vendor
invoice agree within tolerances. TriMatch implements this chain.

## 2. Users & roles

| Role | Cares about | Main screens |
| --- | --- | --- |
| **Requester** (any employee) | "I need a laptop — get it approved fast" | New requisition, My requests |
| **Approver** (lead/head/finance) | "Approve in seconds, with context" | Approval inbox |
| **Purchasing officer** | "Turn approvals into POs with the right vendor" | Requisition queue, PO builder, Vendors |
| **Warehouse staff** | "Record what actually arrived" | Receiving screen |
| **AP clerk** (accounts payable) | "Pay only what matches; resolve what doesn't" | Invoice entry, Match exceptions queue |
| **Admin** | Configure matrix, tolerances, categories, users | Settings |

## 3. The chain (happy path)

```
Requisition → Approval(s) → Purchase Order → Goods Receipt(s) → Vendor Invoice → 3-Way Match → Payable
```

## 4. Functional requirements

IDs are stable and referenced by test cases (TC-xxx in [05-test-plan.md](05-test-plan.md))
and ClickUp stories. Grouped by epic.

### Epic 1 — Requisitions & approval flow (MVP)

- **FR-101** A requester creates a requisition with ≥ 1 line
  (item description, category, quantity, unit-price estimate, currency, needed-by date, justification).
- **FR-102** A draft requisition is editable/deletable only by its requester.
- **FR-103** Submitting moves it `draft → pending_approval` and computes the approval chain
  (MVP: single approver = requester's manager; v1: matrix per FR-501).
- **FR-104** An approver can **approve** or **reject with a mandatory reason**;
  the requester is notified either way.
- **FR-105** A rejected requisition can be revised and resubmitted (new approval round, history kept).
- **FR-106** Every state change is audit-logged: who, when, from-state, to-state, comment.
- **FR-107** Requesters see the live status and pending-with-whom of their requisitions.

### Epic 2 — Purchase orders (MVP)

- **FR-201** Purchasing converts an `approved` requisition into a PO for exactly one vendor;
  requisition lines may be edited (final price, vendor SKU) before issue, with the delta logged.
- **FR-202** Vendor registry: name, contact, currency, payment terms (e.g. NET 30), active flag.
- **FR-203** A PO gets a sequential number `PO-YYYY-NNNN` on issue (gapless per year).
- **FR-204** PO states: `draft → issued → partially_received → received → closed | cancelled`
  (cancel only while nothing has been received).
- **FR-205** An issued PO is immutable in MVP (amendments are v1, FR-604).
- **FR-206** PO totals: line totals = qty × unit price; PO total = Σ lines; all money in
  integer minor units in the vendor currency.

### Epic 3 — Goods receiving (MVP)

- **FR-301** Warehouse records a goods receipt against an issued PO, per line:
  quantity received (≤ open quantity by default), date, note.
- **FR-302** A receipt updates each PO line's open quantity; PO becomes
  `partially_received`/`received` accordingly.
- **FR-303** Over-receipt (more than ordered) is blocked in MVP (v1: allowed within tolerance, FR-401).
- **FR-304** Damaged/rejected quantities can be recorded separately and do not count as received.

### Epic 4 — Vendor invoices & 3-way match (v1)

- **FR-401** AP records a vendor invoice against a PO: invoice number, date, per-line quantity and
  unit price, tax, total. Duplicate detection: same vendor + invoice number is rejected.
- **FR-402** On invoice save, the system computes the **3-way match** per line and overall
  (see §5.2 for rules and tolerances).
- **FR-403** Match outcomes: `matched` (auto-approved as payable) or `exception`
  (routed to the exceptions queue with machine-readable reasons per line).
- **FR-404** AP resolves exceptions by: accepting the variance (with reason, logged),
  requesting a credit note (recorded, invoice held), or rejecting the invoice.
- **FR-405** A match record is immutable and stores: the tolerance values used, each comparison,
  and the outcome — "why was this paid?" must be answerable forever (audit).
- **FR-406** Nothing is payable without a `matched` or `accepted-variance` match record. **Hard invariant.**

### Epic 5 — Approval matrix engine (v1)

- **FR-501** Approval chains are computed from **data-driven rules** (DB rows, not code):
  match on amount range + department + category → ordered list of approver roles (see §5.1).
- **FR-502** Multi-step chains execute sequentially; each approver sees only their pending step.
- **FR-503** **Delegation:** an approver can delegate to a peer for a date range;
  the audit log records both identities.
- **FR-504** Changing the matrix never affects requisitions already in flight
  (chain is snapshotted at submission).
- **FR-505** Admin UI to view/edit matrix rules with validation (no gaps/overlaps in amount ranges per department).

### Epic 6 — Exceptions & partial deliveries (v1)

- **FR-601** Partial receipts: one PO may have many receipts over time (extends FR-301/302).
- **FR-602** Partial invoices: a vendor may invoice a PO across several invoices;
  matching runs against **cumulative received/invoiced** quantities.
- **FR-603** The exceptions queue is filterable by vendor, age, and reason; each exception
  shows the three documents side by side with the deltas highlighted.
- **FR-604** PO amendments: quantity/price changes create version N+1, require re-approval
  if the total increases, and keep all versions visible.

## 5. Business rules — with worked examples

> Rule of the repo: **if a rule has no worked example here, it doesn't exist.**
> Unit tests mirror these tables 1:1 (see test plan).

### 5.1 Approval matrix (v1; MVP uses single-approver)

Default ruleset shipped as seed data (amounts in USD-equivalent at requisition time):

| # | Amount range | Department | Category | Approval chain (in order) |
| --- | --- | --- | --- | --- |
| R1 | ≤ 500 | any | any | Team Lead |
| R2 | 500.01 – 5,000 | any | any | Team Lead → Department Head |
| R3 | 5,000.01 – 25,000 | any | any | Team Lead → Department Head → Finance Director |
| R4 | > 25,000 | any | any | Team Lead → Department Head → Finance Director → CEO |
| R5 | any | IT | Software licenses | + CISO appended to the chain from R1–R4 |

**Worked examples:**

- Requisition total **$430**, Marketing, office supplies → R1 → chain = [Team Lead]. One approval → `approved`.
- Requisition total **$4,999.99**, Engineering, hardware → R2 → chain = [Team Lead, Department Head]. Lead approves → still `pending_approval` (step 2 of 2); Head rejects → `rejected` (chain stops).
- Requisition total **$7,200**, IT, software licenses → R3 + R5 → chain = [Team Lead, Department Head, Finance Director, CISO].
- **Boundary:** exactly **$500.00** matches R1 (ranges are inclusive upper bounds); **$500.01** matches R2.
- **Snapshot rule (FR-504):** requisition submitted under R2; admin then changes R2's range. The in-flight requisition keeps its original [Lead, Head] chain.

### 5.2 3-way match tolerances (v1)

Defaults (admin-configurable per category; stored on the match record when applied):

| Dimension | Tolerance | Compared |
| --- | --- | --- |
| **Quantity** | invoiced ≤ received, and within **−2%** under-delivery of ordered | per line, cumulative |
| **Price** | invoice unit price within **±1%** of PO unit price | per line |
| **Total** | invoice total within **±$25 absolute** of (received qty × PO price) + tax | per invoice |

**Worked examples** (PO line: 100 units @ $50.00 = $5,000.00):

| Case | Received | Invoiced | Invoice price | Result | Why |
| --- | --- | --- | --- | --- | --- |
| A | 100 | 100 | $50.00 | ✅ matched | exact |
| B | 100 | 100 | $50.49 | ✅ matched | price +0.98% ≤ 1% |
| C | 100 | 100 | $50.51 | ❌ exception `PRICE_VARIANCE` | +1.02% > 1% |
| D | 98 | 98 | $50.00 | ✅ matched | qty −2% within tolerance, invoiced = received |
| E | 97 | 97 | $50.00 | ❌ exception `QTY_UNDER_DELIVERY` | −3% > 2% under-delivery |
| F | 100 | 102 | $50.00 | ❌ exception `QTY_OVER_INVOICED` | invoiced > received — never allowed |
| G | 50 | 50 | $50.00 (partial, FR-602) | ✅ matched | cumulative invoiced ≤ cumulative received |
| H | 100 | 100 | $50.00 + $30 shipping not on PO | ❌ exception `TOTAL_VARIANCE` | +$30 > $25 absolute |

Rounding: all comparisons in integer minor units; percentage thresholds evaluated as
`abs(delta) * 10000 ≤ threshold_bp * base` (basis points, no floats).

### 5.3 Money

- Store integer **minor units** + ISO 4217 currency code. No floats anywhere.
- A PO and its receipts/invoices are all in the **vendor's currency**; the requisition's
  USD-equivalent (for matrix routing) uses the FX rate at submission, stored on the requisition.

### 5.4 Numbering

- `REQ-YYYY-NNNN`, `PO-YYYY-NNNN`, `GRN-YYYY-NNNN`, `INV-` (vendor's own number).
- Sequences are **gapless per year per type** (a real audit requirement — DB sequence
  claimed inside the issuing transaction).

## 6. Non-functional requirements

- **NFR-01 Auditability:** every state change and every match decision is queryable
  (who/when/what/before/after); audit rows are append-only.
- **NFR-02 Authorization:** role-based; requesters see only their own requisitions;
  approvers see only their pending steps; RBAC enforced server-side per endpoint.
- **NFR-03 Integrity:** state transitions and sequence claims run in DB transactions;
  invalid transitions are rejected with typed errors (`INVALID_TRANSITION`).
- **NFR-04 Performance:** see [SLA doc](02-sla.md) — p95 < 400 ms reads, < 800 ms writes at pilot scale.
- **NFR-05 API contract:** OpenAPI generated from code; uniform error body with
  machine-readable `code` per business rule (playbook §7).
- **NFR-06 i18n-ready:** all user-facing strings keyed (English only shipped in MVP).

## 7. Scope

### MVP (target: v0.x releases)

Epics 1–3 with **single-approver** flow: requisition → manager approves → PO → receipt.
Vendors CRUD. Audit log. No invoices/matching yet — the payable side is v1.

**MVP is done when:** a requester can raise a requisition, the manager approves it,
purchasing issues a PO, the warehouse records a full receipt, and every step shows in
the audit trail — all through the React UI.

### v1 (target: 1.0.0)

Epics 4–6: invoices + 3-way match with tolerances, approval matrix engine with delegation,
partial receipts/invoices, exceptions queue, PO amendments.

### Out of scope (explicitly)

- Payments execution / bank integration (we stop at "payable")
- RFQ / vendor quote comparison, vendor scorecards, catalogs & punch-out (stretch)
- Multi-entity / multi-tenant (stretch — see ideas doc note)
- OCR of invoice PDFs; email-in invoices
- Budget checking against cost centers (stretch)
