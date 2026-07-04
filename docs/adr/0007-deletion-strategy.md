# ADR-0007: Deletion strategy (soft-delete master data, no cross-entity cascade)

- **Status:** accepted (implemented — user soft-delete, 869dzr8xe)
- **Date:** 2026-07-03 (accepted 2026-07-04)

## Context

"Delete a user" (or a vendor) must never silently erase the business and audit trail
built around them. In a 3-way-match system the actors are woven through every record:
requisitions reference their requester, POs and GRNs their creator, approval steps their
approver, `audit_log` and `match_records` the acting user. If deleting a user cascaded to
those rows it would destroy financial history and violate **I-7** (audit rows are never
updated or deleted) and **I-6** (gapless document numbers).

An audit of the current schema (all migrations) shows the behaviour today is _mostly_
right, but by accident rather than by decision:

- **Every FK that references `users` — except one — specifies no `onDelete`**, so Postgres
  defaults to `NO ACTION`. A hard `DELETE` of a referenced user therefore _errors_ rather
  than cascading. Safe, but implicit, undocumented, and ungraceful (a raw FK violation, not
  a domain response).
- **`users.manager_id → users` uses `SET NULL`** — correct for an optional self-reference.
- **All `CASCADE`s are aggregate-internal** (parent → owned child rows): `requisition_lines`
  → `requisitions`, `invoice_lines` → `invoices`, `po_lines` → `purchase_orders`,
  `grn_lines` → `grns`, `approval_steps` → `requisitions`. Deleting a _draft_ aggregate
  legitimately removes its own lines. This is correct and stays.
- **The lone cross-entity user cascade is `notifications.recipient_id → users CASCADE`**
  (added in the notification-center work). Defensible for personal, ephemeral, derived data
  (it supports right-to-erasure), but it is the only one of its kind and must be justified,
  not left as an inconsistency.
- **There is no soft-delete for `users`.** `vendors` has an `active` flag (FR-202); `users`
  has nothing. So a user cannot be removed _gracefully_ in either direction: a hard delete
  is blocked by `NO ACTION` once referenced, and there is no "deactivate" path. Offboarding
  a leaver is currently impossible without breaking history.

## Options considered

| Option                                                          | Trade-off                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status quo (implicit `NO ACTION`)                               | Protects history, but undocumented, ungraceful (raw FK error), and offers no way to offboard a user at all                                                                                 |
| Hard delete + `CASCADE` to business records                     | Never acceptable — destroys financial + audit history, violates I-6/I-7                                                                                                                    |
| Hard delete + `SET NULL` on actor FKs                           | Preserves the row but loses _who_ acted — an anonymised audit trail is a broken audit trail                                                                                                |
| **Soft-delete master data + codify no-cross-entity-cascade** ✅ | Actors/master data are deactivated, never removed, so history always resolves the real actor; cascade stays inside aggregates only; the implicit rule becomes an explicit, tested contract |

## Decision

Adopt an explicit deletion policy with three tiers:

1. **Master data & actors (`users`, `vendors`) are soft-deleted, never hard-deleted.**
   Removal means _deactivation_: a user gains an `active`/deactivation marker (mirroring
   `vendors.active`); a deactivated user cannot authenticate and is excluded from
   approver/assignee pools, but every historical record still resolves the real actor.
   Deactivation is reversible; the row is never physically removed.

2. **FKs never `CASCADE` across an aggregate/entity boundary.** References to master data,
   actors, or append-only audit tables use `RESTRICT`/`NO ACTION` (or `SET NULL` only where
   the reference is genuinely optional, as `manager_id` already does). This makes today's
   implicit `NO ACTION` an explicit, intentional constraint. Append-only tables
   (`audit_log`, `match_records`, `po_amendments`) are never the target of a cascade — this
   is the enforcement mechanism for **I-7**.

3. **`CASCADE` is permitted only within an aggregate** — a parent row and the child rows it
   exclusively owns (a requisition and its lines, an invoice and its lines). This is
   existing, correct behaviour and is retained.

**Personal, derived, ephemeral data** (currently only `notifications`) MAY cascade on the
rare event of true user erasure (e.g. a GDPR right-to-erasure purge), because it is not
business or audit history. Because users are soft-deleted, this cascade is effectively
dormant in normal operation. The implementation task reconciles `notifications.recipient_id`
against this rule (keep `CASCADE` with this justification recorded, or switch to `RESTRICT`
for uniformity — decided during implementation).

## Consequences

- Offboarding becomes a first-class, reversible operation instead of an impossible or
  destructive one. History, audit, and gapless numbering are structurally protected.
- A hard `DELETE` of referenced master data continues to fail — now _by documented design_,
  and callers get a domain-level "deactivate instead" response rather than a raw FK error.
- Implemented as an Engineering-patterns task (Epic 20): add the user soft-delete column +
  auth/pool exclusion, make the actor-FK `RESTRICT` explicit where it is currently implicit,
  reconcile the `notifications` cascade, and add tests (cannot hard-delete a referenced
  user; a deactivated user cannot log in; historical rows still resolve their actor).
- Sequelize `paranoid` mode (a `deletedAt` column that turns `destroy()` into an `UPDATE`)
  is the likely mechanism for entities that need query-time hiding; evaluated during
  implementation against the simpler `active` flag already used for vendors.
- Supersede only via a new ADR.

## Implementation notes (869dzr8xe, 2026-07-04)

Tier 1 shipped: `users.active` (migration `20260704142905`, mirrors `vendors.active`),
login blocked for deactivated accounts (`ACCOUNT_DEACTIVATED`, checked after the password so
state never leaks), password reset silently no-ops for them, chain resolution excludes
inactive approvers (named titles filter `active:true`; hierarchy titles fail `NO_APPROVER`),
and admin deactivate/reactivate via `PATCH /users/:id { active }` (audited, self-deactivation
refused). Tests cover: deactivated login blocked + reversible, audit trail, self-guard,
history still resolves the actor, referenced user cannot be hard-deleted, pool exclusion.

Two decisions taken during implementation:

- **FK explicitness (tier 2): keep `NO ACTION`, do not rewrite to explicit `RESTRICT`.**
  `NO ACTION` already refuses the delete (verified by test), and because users are now
  soft-deleted the hard-delete path is unreachable in normal operation. Rewriting ~8 actor
  FKs to `RESTRICT` is a semantic no-op, so the intent is captured in docs/tests rather than
  churned into the schema.
- **`notifications.recipient_id` (tier 3): keep `CASCADE`.** It is the one sanctioned
  cross-entity cascade — personal, derived, ephemeral data that supports right-to-erasure —
  and it is dormant while users are soft-deleted. Recorded, not removed.

Not in scope (existing tickets): revoking a deactivated user's already-issued JWT is the
session-invalidation follow-up (869dzymvv) — until then a live token survives until it
expires; login is blocked immediately.
