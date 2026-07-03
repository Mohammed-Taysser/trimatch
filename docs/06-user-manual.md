# User Manual — TriMatch

- **Status:** living document — written against the MVP flows; updated every release
- **Date:** 2026-07-02
- **Audience:** end users per role. Screens referenced here are specified by the
  [PRD](01-prd.md) and will match the shipped UI; screenshots land as features ship.

## 1. Who can do what (RBAC matrix)

| Action                                          | Requester |   Approver    | Purchasing | Warehouse | AP  | Admin |
| ----------------------------------------------- | :-------: | :-----------: | :--------: | :-------: | :-: | :---: |
| Create/edit own draft requisition               |    ✅     |       —       |     —      |     —     |  —  |   —   |
| Submit / withdraw own requisition               |    ✅     |       —       |     —      |     —     |  —  |   —   |
| Approve/reject a pending step                   |     —     | ✅ (own step) |     —      |     —     |  —  |   —   |
| Delegate approvals                              |     —     |      ✅       |     —      |     —     |  —  |  ✅   |
| Manage vendors                                  |     —     |       —       |     ✅     |     —     |  —  |  ✅   |
| Convert requisition → PO, issue/cancel PO       |     —     |       —       |     ✅     |     —     |  —  |  ✅   |
| Amend an issued PO (versioned)                  |     —     |       —       |     ✅     |     —     |  —  |  ✅   |
| Approve a total-increasing PO amendment         |     —     |      ✅       |     —      |     —     |  —  |  ✅   |
| Record goods receipt                            |     —     |       —       |     —      |    ✅     |  —  |  ✅   |
| Enter invoices, match, resolve exceptions       |     —     |       —       |     —      |     —     | ✅  |  ✅   |
| Edit approval matrix                            |     —     |       —       |     —      |     —     |  —  |  ✅   |
| Org-wide requisition list (`/requisitions/all`) |     —     |       —       |     —      |     —     |  —  |  ✅   |
| User management (role/manager, audited)         |     —     |       —       |     —      |     —     |  —  |  ✅   |
| Audit-trail browser (`GET /audit`)              |     —     |       —       |     —      |     —     |  —  |  ✅   |

The admin dashboard (web) surfaces all of the above in one place — every
action still calls the same rule-guarded endpoints (RolesGuard + service
rules + audit rows); there is no bypass path. Admins cannot change their own
role (`409 SELF_ROLE_CHANGE`).

## 2. Requester — asking for something

1. **New requisition** → add one line per item: description, category, quantity,
   estimated unit price, currency, needed-by date, and a short justification.
2. **Save as draft** — drafts are private to you; edit or delete freely (FR-102).
3. **Submit** — the system computes who must approve (based on total amount,
   your department, and category) and shows you the chain up front (FR-103).
4. Track progress in **My requests**: each request shows its state and _pending with whom_.
5. If **rejected**, you'll get the reason. Revise the draft and resubmit — the new
   approval round starts fresh, and the old round stays in the history (FR-105).

> Money note: what you enter is an _estimate_; purchasing may negotiate the final price.
> If the total grows past your approval band, it will be re-routed (v1).

## 3. Approver — deciding

1. Open **Approval inbox** — you only see steps that are yours and due now (FR-502).
2. Each card shows: lines, totals, requester's justification, the full chain and where
   you sit in it, and the requester's history.
3. **Approve** (one click) or **Reject** — rejection requires a reason; the requester
   sees it verbatim (FR-104).
4. Going on leave? Set a **delegation window** (v1): a named colleague acts for you;
   the record shows both names forever (FR-503).

## 4. Purchasing officer — turning approvals into orders

1. **Requisition queue** lists everything `approved` and unconverted.
2. **Convert to PO**: pick the vendor (or register one — name, currency, payment terms),
   adjust final unit prices / add vendor SKUs. Edits vs the requisition are logged (FR-201).
3. **Issue** — the PO gets its official number (`PO-2026-NNNN`) and becomes immutable
   (MVP). Send the PDF to the vendor.
4. Cancel is only possible while nothing has been received (FR-204).

## 5. Warehouse — recording what arrived

1. **Receiving** → find the PO (scan/number/vendor).
2. Enter quantity received per line — the screen shows _open quantity_ so short
   deliveries are obvious (FR-301/302). Damaged goods go in the separate damaged field
   and don't count as received (FR-304).
3. Save → a GRN number is issued; the PO advances to _partially received_ or _received_.
4. You cannot receive more than was ordered (MVP, FR-303) — if a vendor over-ships,
   escalate to purchasing.

## 6. AP clerk — paying only what matches (v1)

1. **Invoice entry**: pick the PO, enter the vendor's invoice number, dates, per-line
   quantities and prices, tax. Duplicates (same vendor + number) are rejected (FR-401).
2. On save, TriMatch runs the **3-way match** automatically and shows the verdict
   per line (FR-402):
   - **Matched** — the invoice is payable. Done.
   - **Exception** — it lands in your **Exceptions queue** with the reason
     (`PRICE_VARIANCE`, `QTY_OVER_INVOICED`, …).
3. In the queue, each exception shows PO vs receipt vs invoice **side by side** with the
   deltas highlighted (FR-603). Your options (FR-404):
   - **Accept variance** — requires a written reason; you own that decision (it's audited).
   - **Request credit note** — invoice is held until the credit note arrives.
   - **Reject invoice** — returns to the vendor.
4. Every match verdict stores the tolerances used at the time — "why was this paid?"
   is always answerable (FR-405).

## 7. Admin — configuration (v1)

- **Approval matrix**: edit amount bands, departments, categories, and chains. The editor
  blocks overlapping or gapped bands (FR-505). Changes apply to _new_ submissions only —
  in-flight requests keep their original chain (FR-504).
- **Match tolerances**: per-category overrides of the qty/price/total defaults (PRD §5.2).
- **Users & roles**: assign the roles from §1; a user may hold several (e.g. requester + approver).

## 8. FAQ

- **"My request is stuck — who has it?"** My requests → the state line names the pending
  approver and how long it's been with them.
- **"The vendor shipped 2 fewer units — will they be paid in full?"** No. Invoicing more
  than was received always raises an exception (invariant I-3); within-tolerance
  under-delivery (≤ 2%) matches at the _received_ quantity.
- **"Can I change a PO after issuing?"** MVP: no — cancel (if nothing received) and reissue.
  v1: amendments create a new version and may require re-approval (FR-604).
