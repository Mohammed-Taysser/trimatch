# Changelog

All notable changes to TriMatch are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [SemVer](https://semver.org) driven by Conventional Commits
(`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major).

## [Unreleased]

### Changed

- **Health checks use real driver pings via @nestjs/terminus (Epic 20 · 869dzr3jw)**:
  `/health/readiness` now proves each dependency actually answers rather than that a
  TCP port is open — Postgres via Terminus's `SequelizeHealthIndicator` (`SELECT 1`)
  and Redis via a real `PING` over BullMQ's connection; the queue check is unchanged.
  The `{ status, checks: { postgres, redis, queue } }` response contract and the 503
  degraded behaviour are unchanged, so orchestrator probes keep working.

### Security

- **Restrict WebSocket CORS origin (Epic 16 · 869dzymvy)**: the notifications
  gateway no longer reflects any origin. The production Socket.IO server now
  enforces an allow-list from a required `WS_CORS_ORIGIN` env var (comma-separated
  origins — the Vite origin in dev, the public site origin in prod; never `*`) via
  `RedisIoAdapter`, so a browser handshake from any other origin is rejected. This
  closes the last open security-review follow-up. New var added to `.env.example`
  / `.env.ci`.
- **Trust proxy for correct per-IP rate limiting (Epic 16 · 869dzymvw)**: the API
  bootstrap now sets Express `trust proxy` from a required `TRUST_PROXY` env var
  (number of reverse-proxy hops — 1 behind the ADR-0005 nginx proxy, 0 for
  direct/local). Without it, every request behind the proxy shares the proxy's IP
  and the throttler buckets them together; with it, the limiter reads the real
  client IP from `X-Forwarded-For`. New var added to `.env.example` / `.env.ci`.

### Added

- **Session invalidation via token versioning (Epic 16 · 869dzymvv)**: JWTs now
  carry a `tv` claim backed by a new `users.token_version` counter, which
  `JwtAuthGuard` checks on every authenticated request. Bumping it — on **password
  change** (signs out all sessions, including the current one), **password reset**
  (kills any lingering/stolen session), and **deactivation** — instantly revokes
  every previously-issued token (`TOKEN_REVOKED` / `ACCOUNT_DEACTIVATED`) with no
  server-side session store. Closes the last soft-delete gap: a deactivated user's
  live token dies immediately, not at expiry. Documented in
  [docs/03-domain.md](docs/03-domain.md) §4.2.
- **User soft-delete / deactivation (ADR-0007, Epic 20)**: `users.active` mirrors
  `vendors.active` — a deactivated user cannot authenticate (login returns
  `ACCOUNT_DEACTIVATED`, checked _after_ the password so account state never leaks;
  password reset silently no-ops) and is excluded from approver pools (named titles
  filter `active:true`; a deactivated manager fails `NO_APPROVER`). Admins deactivate
  or reactivate via `PATCH /users/:id { active }` — reversible, audited
  (`user.deactivated`/`user.reactivated`), and an admin cannot deactivate themselves.
  Every historical record still resolves the real actor, and a hard `DELETE` of a
  referenced user stays refused by the FK (`NO ACTION`). Deletion tiers documented in
  [docs/03-domain.md](docs/03-domain.md) §4.1 (I-9).

### Changed

- **DB index audit (Epic 20)**: FK/join columns were already indexed; this closes
  three hot-path gaps found by reviewing the list queries — `invoices(status,
  created_at)` for the AP exceptions queue, `requisitions(status, created_at)` for
  the admin/"approved" lists, and folding `created_at` into the audit-log browser
  index (`audit_log(entity_type, entity_id, created_at)`, replacing the redundant
  two-column prefix). Verified with `EXPLAIN` (the exceptions query now does an
  index scan, filter + sort covered).

### Security

- **Application security review + hardening (Epic 16)**: an app-wide pass
  (authorization/IDOR, injection, secrets, transport) found **no confirmed
  vulnerabilities** — owned resources (requisitions, notifications, delegations,
  approval steps) are caller-scoped; procurement resources are role-gated as
  intended; all raw SQL is parameterized; the OTP and other secrets never appear
  in logs, responses, or the JWT. Hardening applied: **helmet** security headers
  in `setupApp` (with a test asserting them), a CI **`audit`** job
  (`pnpm audit --prod --audit-level=high`), and the exceptions `reason` filter is
  now a **parameterized** JSONB predicate (`Op.contains`) instead of an inlined
  `literal()`. Findings and three defence-in-depth follow-ups are recorded in
  [docs/security-review.md](docs/security-review.md).

### Added

- **Authenticated password change (Epic 16)**: `POST /auth/change-password` lets a
  signed-in user rotate their own password — the **current password must match**
  before the new hash is set, and a confirmation is emailed out-of-band via the
  outbound channel (a security heads-up, no secret). The route carries the
  stricter auth rate limit. Completes the account-security set (login · reset ·
  change).

- **Self-service password reset with OTP (Epic 16)**: `POST /auth/forgot-password`
  issues a single-use, 10-minute OTP (generated with **otplib**) and **always acks
  the same** whether or not the email exists (no account enumeration).
  `POST /auth/reset-password` verifies the code and rotates the password hash; the
  OTP is single-use, expires, and locks after 5 failed guesses. The code is
  delivered out-of-band via the outbound channel (Epic 9) and is **never persisted
  in clear text nor logged** — only its bcrypt hash is stored (`password_reset_otps`
  table). Both endpoints are `@Public` and carry the **stricter auth rate limit**.
  otplib is pinned to **v12** (CJS) — v13 is an ESM-only rewrite the CJS toolchain
  doesn't support yet.

- **Rate limiting (Epic 16)**: a global `@nestjs/throttler` guard runs **before**
  auth, so even unauthenticated requests are throttled per IP. Two limits, both
  from env (fail-loud, no defaults): a lenient global limit on every route, and a
  **stricter limit on credential endpoints** (login) applied via a
  `@SensitiveThrottle()` marker + the throttler's `skipIf`. Counters live in
  **Redis** (`@nest-lab/throttler-storage-redis`, reusing `REDIS_URL`) so limits
  hold across instances. Exceeding a limit returns **429** in the fixed error
  envelope (`code: TOO_MANY_REQUESTS`). New env: `THROTTLE_TTL`/`THROTTLE_LIMIT`
  and `THROTTLE_AUTH_TTL`/`THROTTLE_AUTH_LIMIT` (documented in `.env.example`; CI
  uses high limits so the suite runs, with a dedicated spec proving the 429).

- **Real-time notification delivery over WebSocket (Epic 9)**: a Socket.IO
  `NotificationsGateway` authenticates each handshake with the caller's JWT and
  joins the socket to a room named by their user id — so a socket only ever
  receives its **own** notifications. The queue worker, after persisting a
  notification, pushes it to the recipient's room; the web notification center
  subscribes and updates the badge/panel **live**, so the client no longer polls
  (react-query focus-refetch stays as a backstop). A Redis adapter
  (`@socket.io/redis-adapter`, reusing `REDIS_URL`) fans room emits out across
  instances. Verified in-browser: an out-of-band hand-off moved the unread badge
  with no user interaction. The web proxies `/socket.io` (handshake + ws upgrade)
  to the api in dev.

- **Outbound notification channel + daily digest (Epic 9)**: a pluggable
  `OutboundChannel` behind a DI token, selected by `NOTIFICATIONS_CHANNEL` — a
  **no-op default** (`none`, out-of-app delivery disabled cleanly) and one
  concrete **`webhook`** channel that POSTs each recipient's digest to
  `NOTIFICATIONS_WEBHOOK_URL`. Partial config **fails the boot** (webhook without
  a URL is rejected by the env schema), honouring the no-silent-defaults rule. A
  `NotificationsDigestService` batches every recipient's unread notifications into
  one digest (delivery failures isolated per recipient); it runs as a **repeatable
  BullMQ job** (daily 08:00) that is only scheduled when a channel is configured,
  so the feature adds no cost — and never touches Redis — when disabled. New env:
  `NOTIFICATIONS_CHANNEL` (required), `NOTIFICATIONS_WEBHOOK_URL` (required iff
  `webhook`); both documented in `.env.example`.

- **Notification center in the web app shell (Epic 9)**: a 🔔 bell in the shared
  header carries a live unread-count badge (clamped `99+`) and opens a dropdown
  panel listing notifications newest-first. Unread rows are visually marked (dot
  + tint); clicking a notification marks it read and deep-links to the entity —
  role-aware, falling back to the recipient's accessible list where no detail
  page exists yet. Built on `@tanstack/react-query`, so the count refetches on
  window focus (plus a 30s poll) for free; the panel dismisses on outside-click
  or Escape. Unread count comes from `GET /notifications?unread=true` `meta.total`
  (no dedicated count endpoint needed). Frontend component tests await the
  test-infra work in Epic 18; verified in-browser.

- **Notifications emitted on every workflow hand-off (Epic 9)**: silent hand-offs
  now push. A resilient `NotificationsProducer` enqueues a job on each transition,
  always **after the triggering transaction commits** (a rolled-back change is
  never announced) and **never failing the business op** (emission errors are
  swallowed + logged). Recipients: requisition submitted → the first approver;
  step approved → the next approver in the chain; fully approved / rejected → the
  requester; invoice match exception → every AP user; PO amendment needing
  re-approval → the requisition's approvers; delegation created → the delegate.
  Two new domain events (`po.reapproval_required`, `delegation.created`) join the
  contract in docs/03-domain.md §5. Each hand-off has an integration test
  asserting one notification lands with the right recipient.

- **In-app notification center (Epic 9)**: per-user notifications are now
  persisted (`notifications` table: recipient, type, entity ref, message, read
  flag) and exposed. `GET /api/v1/notifications` is paginated with an optional
  `?unread=true|false` filter and returns **only the caller's own** rows
  (scoped to the JWT `sub`); `PATCH /api/v1/notifications/:id/read` marks one
  read — another user's row is indistinguishable from a missing one (404, no
  existence leak). The BullMQ worker now validates a notification job payload
  and persists it, so a hand-off just enqueues a job. Notification `type` is the
  canonical domain-event name from docs/03-domain.md §5 (the contract the
  emit-on-hand-offs task fires).

- **BullMQ notifications foundation (Epic 9)**: a `NotificationsModule` stands up
  the async queue that ADR-0001 provisioned but nothing used yet — the Redis
  connection is parsed from the existing `REDIS_URL` env (no new config), a
  `notifications` queue is registered, and a `WorkerHost` processor drains it.
  Health readiness gained a third `queue` check (alongside postgres and redis),
  so `/api/v1/health/readiness` reports `degraded` if the queue's Redis
  connection is not ready. A smoke integration test enqueues a job and awaits it
  via `QueueEvents` to prove the enqueue → worker path end to end. This is the
  substrate the notification model, hand-off emitters and outbound channel build
  on.

### Added

- **UX friendliness pass (Epic 21)**: destructive actions (Cancel PO, Delete
  requisition, Reject invoice) now ask for inline confirmation via a reusable
  `ConfirmButton` (no accidental clicks); list loads show shimmer `Skeleton`
  placeholders instead of a bare "Loading…"; and on every route change the
  page region takes focus so keyboard/screen-reader users land at the top of
  the new page. Completes Epic 21 (UI refinement & multi-page app).

### Added

- **Purchase-order detail page + breadcrumbs (Epic 21)**: a focused,
  deep-linkable `/purchase-orders/:id` page (vendor, status, version, totals,
  and the full lines table with received/open per line), reachable via a
  **View** link on every PO card. `AppShell` gained a reusable `breadcrumbs`
  prop (e.g. Purchase orders → PO-2026-NNNN, the trail linking back to the
  role's list). This completes the entity-detail/deep-link task alongside the
  URL-driven filters; the same pattern extends to requisition/invoice detail.

### Added

- **Deep-linkable list filters (Epic 21)**: list filters, sort and pagination
  now live in the URL query (`useUrlState` over react-router's
  `useSearchParams`) — the exceptions queue (`?reason=&sort=`), the admin
  requisitions list (`?status=&page=`) and the admin audit browser
  (`?entityType=&entityId=&page=`). A filtered view is now shareable,
  bookmarkable and survives a refresh.

### Added

- **Invoices split into dedicated pages (Epic 21)**: the ~620-line AP screen was
  split into `/invoices` (invoice entry + the invoice list with match / mark
  payable / apply-credit-note) and `/invoices/exceptions` (the exceptions
  worklist with per-reason counts, sort/filter and resolutions), under an
  `InvoicesLayout` with the routed section nav. With admin and purchasing
  already split, every tab-crammed role screen is now a real multi-page,
  deep-linkable area.

### Added

- **Purchasing as a multi-page area (Epic 21)**: the purchasing screen's two
  tabs became nested routes — `/purchasing/orders` and `/purchasing/vendors`
  (index redirects to orders) — under a `PurchasingLayout` with the routed
  section nav, matching the admin pattern. Both sections are now deep-linkable.

### Added

- **Navigation shell + admin as a multi-page area (Epic 21)**: `AppShell` gained
  a role-aware section nav (routed `NavLink` tabs with active-state highlighting),
  and the admin dashboard's five tabs became real nested routes —
  `/admin/requisitions`, `/admin/purchase-orders`, `/admin/vendors`,
  `/admin/users`, `/admin/audit` (index redirects to requisitions). Each section
  is now deep-linkable and bookmarkable instead of ephemeral tab state.

### Added

- **Client-side routing (Epic 21)**: the web app moved from a role→single-
  component switch to real routes (react-router 7). Each role has a home route
  (`/requisitions`, `/approvals`, `/purchasing`, `/warehouse`, `/invoices`,
  `/admin`); `/` redirects to the role's home; routes are role-guarded (a role
  hitting another's route is redirected home); unknown paths render a 404 page.
  URLs are now real and deep-linkable — the foundation for splitting the
  tab-crammed screens into dedicated pages.

### Added

- **Step-level approval audit (Epic 8)**: every approval-step decision now
  writes its own audit row (`approval.step_approved`/`approval.step_rejected`,
  keyed to the requisition, naming round + step and preserving the delegation
  dual-identity), not only the final step that completes the chain. A
  requisition's audit timeline now shows each approver's decision in order,
  then the requisition-level outcome. Closes Epic 8 (workflow completion).

### Added

- **Close a settled PO (Epic 8, received → closed)**: `POST
  /purchase-orders/:id/close` (purchasing/admin) — the second unwired
  lifecycle transition. Only a received PO closes, and only once every invoice
  against it is settled (payable or rejected) — an open invoice → 409
  `PO_HAS_OPEN_INVOICES`, a non-received PO → 409 `INVALID_TRANSITION`; audit
  `po.closed`. Close PO button on the purchasing screen.

### Fixed

- **A closed PO is now sealed**: `closed` was still in the invoiceable states,
  so (once closing became reachable) a closed PO could be invoiced — removed it,
  and an integration test proves a closed PO refuses new invoices.

### Added

- **Credit-note completion (Epic 8, FR-404)**: `POST
  /invoices/:id/apply-credit-note` — an invoice held in `awaiting_credit_note`
  had no way forward; now the vendor's credit note (amount + reference) is
  applied and reconciled at the total level (net payable = invoice total −
  credit vs the PO-expected payable). Within tolerance → a new append-only
  match record, invoice `awaiting_credit_note → matched → payable`, dual audit
  rows; a credit that doesn't reconcile → 422 `CREDIT_NOTE_INSUFFICIENT`
  (or `CREDIT_NOTE_EXCESSIVE` if it tops the invoice) and the invoice stays
  held; applying to an invoice not held → 409. Apply control on the AP screen

### Changed

- **TypeScript 6** (ticket 869dzkqna, closing Dependabot PR #53): typescript
  ^6.0.3 across api/web/shared + typescript-eslint bumped to the TS-6-aware
  8.62; ts-jest 29.4 unchanged. Two migration items surfaced and were handled:
  TS 6 no longer auto-includes `@types/jest` globals, so the two spec-typechecked
  packages now declare `types` explicitly (api `[node, jest]`, shared `[jest]`);
  and the deprecated `moduleResolution: node10` is silenced with
  `ignoreDeprecations: "6.0"` — the real modern-resolution change is deferred to
  the eventual TS 7 (native-compiler) migration, which is the deadline TS itself
  cites. Lint/typecheck/tests/build green

### Changed

- **Jest 30** (ticket 869dzk7q5, closing the loop on Dependabot PR #46): jest
  30.4 + @types/jest 30 + ts-jest 29.4 bumped together in BOTH jest consumers
  (apps/api and packages/shared — leaving shared on 29 made pnpm hoist jest
  30's runtime against jest 29's mock and every suite crashed in CI); both
  suites pass unchanged. Jest 30 counts branches more strictly, which surfaced two real
  coverage gaps the old counting masked: `chain.service.ts` joined the
  DB-bound exclusion list like its siblings, and `matrix.controller.ts` got
  the standard delegation spec it was missing — branch coverage now 89.5%
  against the 80% gate

- **Vite 8 (Rolldown) + @vitejs/plugin-react 6** (ticket 869dzk7pe, closing the
  loop on Dependabot PR #42): production build drops from ~3.3s to ~0.8s;
  typecheck/build/dev-server/proxy and the linked-CJS shared-package
  pre-bundle all verified in the browser

### Added

- **Arabic user manual (دليل المستخدم بالفصحى)**: `docs/09-user-manual-ar.md` —
  Modern Standard Arabic manual mirroring the English one against current
  shipped behavior, opening with an English ↔ فصحى ↔ familiar-term glossary
  (goods → البضائع, PO → أمر الشراء «الأوردر», …); linked from the README docs
  index and the English manual

### Fixed

- **Dependabot jobs unstuck (869dz36n8)**: the failing `npm_and_yarn` runs were
  security-update attempts against transitive-only deps it cannot bump —
  multer was already patched via the existing workspace override; the open
  uuid advisory (< 11.1.1, via sequelize 6 which pins `^8.3.2`) is remediated
  with a scoped `sequelize>uuid: ^11.1.1` override (first patched version,
  still ships CJS; full suite green). New explicit `.github/dependabot.yml`:
  weekly npm + github-actions version updates, minor/patch grouped into one
  PR, sequelize-stack majors ignored per ADR-0001

## [0.6.0] — 2026-07-03

Epic 7 complete — the last planned epic. The web app runs on a real design
system (tokens, shared components, app shell, Intl formatting, pagination,
a11y basics) and admins get a dashboard that sees everything: org-wide
requisitions, purchase orders, vendors, audited user management and a
read-only audit browser — all behind the same server-side rules as before.

### Added

- **Superadmin dashboard (Epic 7)**: admin routes to a new dashboard —
  org-wide requisitions (`GET /requisitions/all`, status filter), purchase
  orders (reusing the full purchasing tab incl. amendments), vendors, user
  management (`GET/PATCH /users`: role/manager changes audit-logged as
  `user.role_changed`/`user.manager_changed`; changing your own role refused
  with 409 `SELF_ROLE_CHANGE`) and a read-only audit browser (`GET /audit`,
  filterable by entity type/id/actor, newest first). All new endpoints are
  `@Roles('admin')` — non-admins get 403; every action reuses the existing
  rule-guarded endpoints, no bypasses
- **PO list server-side status filter** (`GET /purchase-orders?status=a,b`),
  closing the worklist gap tracked as ticket 869dza4zp

- **Web design system & visual refresh (Epic 7)**: design tokens
  (`styles/global.css`: color incl. status semantics, spacing, type scale,
  radii) + shared components (`Button`, `StatusBadge`, `Card`, `Field`,
  `Alert`, `Loading`, `EmptyState`, `Pagination`) replace all ad-hoc inline
  styles across the 8 screens; consistent app shell (brand header, role badge,
  sign-out) replaces per-page header copies; one color language for every
  document status; money via `Intl.NumberFormat` (currency-aware) and dates
  via `Intl.DateTimeFormat`; pagination controls on the main lists driven by
  the envelope `meta` (new `apiFetchPaged`); keyboard/a11y basics (labels on
  every input, `:focus-visible` rings, `aria-pressed` filter chips);
  responsive at laptop widths

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
