# Security Review — TriMatch API

Scope: an application-wide security pass (ClickUp 869dzpp4y) covering
authorization/IDOR, injection, secrets handling, transport hardening, and CI
scanning. Dated 2026-07-04, against `main` after the auth/rate-limit/reset work.

## Posture

The API is default-deny for authentication and validation: `JwtAuthGuard`,
`RolesGuard`, `AppZodValidationPipe`, and `HttpExceptionFilter` are registered
globally (`app.module.ts`). Rate limiting (`ThrottlerGuard`) runs first, before
auth. Every request body/param is validated by a zod schema, which also strips
unknown keys (mass-assignment is mitigated).

## Findings

### 1. Authorization / IDOR — no issues found

Every **owned** resource enforces caller-scoping in the service layer:

| Resource       | Owner     | `:id` scoping                                                                    |
| -------------- | --------- | -------------------------------------------------------------------------------- |
| requisitions   | requester | `findOwn`/`assertOwnedDraft` throw `FORBIDDEN` when `requesterId !== caller.sub` |
| notifications  | recipient | `where: { id, recipientId }` (404, no existence leak)                            |
| delegations    | delegator | `revoke` throws `FORBIDDEN` when `delegatorId !== caller.sub`                    |
| approval steps | approver  | `decide` requires the step's approver **or** an active delegation                |

Procurement resources (purchase orders, invoices, GRNs, vendors, users, audit,
matrix) are authorized by `@Roles(...)` — any user with the role may act on any
record, which is the intended model (a purchasing user works the whole PO queue).
No route is missing an intended `@Roles`, and no owned resource is reachable
cross-user.

### 2. Injection — no issues found (one filter hardened)

All raw SQL (`sequelize.query`) uses bound `replacements`; no request value is
interpolated. All `literal()` usages are static constants (UUID defaults, sort
expressions, correlated-subquery fragments).

**Hardened in this change:** the exceptions `reason` filter in
`matching.service.ts` previously interpolated the (enum-validated) reason into a
`literal()` JSONB `@>` predicate. It was safe only because the value is a strict
zod enum. It now uses a **parameterized** `{ reasons: { [Op.contains]: [...] } }`
predicate, so it stays safe even if the enum is later loosened — defense in depth.

### 3. Secrets — no issues found

- The password-reset **OTP is never logged** and never stored in clear text —
  only its bcrypt hash (`password_reset_otps.code_hash`). Both outbound channels
  log the recipient only.
- No hardcoded secrets: everything is read via `ConfigService.getOrThrow` from an
  env schema with no defaults (fail-loud). `JWT_SECRET` is `min(16)`.
- 500s are generic (`INTERNAL_ERROR` / "Unexpected error") — no stack traces or
  internals in responses.
- No password hash appears in any response or the JWT (payload is
  `{ sub, email, role }`; user serializations never map `passwordHash`).

### 4. Transport hardening — added

- **Security headers**: `helmet` is applied in the shared `setupApp` (CSP
  disabled so the Swagger UI keeps working; nosniff, frame, HSTS, referrer, and
  the `X-Powered-By` removal are on). Asserted by
  `test/security-headers.integration-spec.ts`.
- **Dependency scanning**: a CI `audit` job runs
  `pnpm audit --prod --audit-level=high`, failing the pipeline on high/critical
  advisories in the production tree. Static analysis is covered by the `lint` job.

## Hardening follow-ups (filed, not blocking)

These are defence-in-depth improvements, not confirmed vulnerabilities:

- **869dzymvv** — invalidate existing JWTs on password change/reset (token
  versioning); today a pre-existing token survives a reset until it expires.
- **869dzymvw** — set Express `trust proxy` in production so per-IP rate limiting
  works behind the nginx reverse proxy (ADR-0005).
- **869dzymvy** — restrict the WebSocket gateway CORS origin in production
  (currently reflects any origin, fine for same-origin dev).
