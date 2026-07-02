# Runbook — TriMatch

- **Status:** skeleton — sections marked ⏳ are filled in as the code lands
  (tracked in ClickUp Epic 0). The structure exists now so operational knowledge
  has a home from day one.
- **Date:** 2026-07-02
- **Related:** [02-sla.md](02-sla.md) · [04-architecture.md](04-architecture.md)

## 1. Run locally

```bash
# prerequisites: node 22.12+, pnpm 10+, docker
cp .env.example .env        # api validates env at startup; refuses to boot if invalid
pnpm install
docker compose up -d        # postgres:16, redis:7
pnpm dev                    # api :3000 (/api/v1), web :5173
```

⏳ Coming with Epic 1 (DB wiring):

```bash
pnpm --filter @trimatch/api migrate   # sequelize-cli migrations
pnpm --filter @trimatch/api seed      # demo org: users per role, matrix R1-R5, categories
```

Demo logins (after seed): `requester@demo`, `lead@demo`, `head@demo`, `purchasing@demo`,
`warehouse@demo`, `ap@demo`, `admin@demo` — password documented in the seed script.

## 2. Migrations ⏳

- Create: `pnpm --filter api migration:new <name>` (hand-written up/down — ADR-0001).
- Apply: `migrate` (local) / explicit `migrate deploy` step in the pipeline (playbook §6).
- **Never** `sequelize.sync()` outside tests.
- Rollback: every migration's `down` is tested in CI against a seeded DB.

## 3. Seeds & fixtures ⏳

- `seed` = minimal demo org (idempotent, safe to re-run).
- Test fixtures live with the tests; TC data mirrors PRD §5 examples exactly.

## 4. Logs, health, metrics ⏳

- Structured JSON logs on stdout, one request-id per line
  (`X-Request-Id` accepted or generated). Filter a request:
  `docker logs api | grep <requestId>`.
- Health: `GET /api/v1/health/liveness` (process),
  `GET /api/v1/health/readiness` (PG+Redis reachable — TCP check until Sequelize/BullMQ
  land, then real driver pings; 503 with a `degraded` body when a check fails).
- Metrics: `GET /metrics` (Prometheus) — see business series list in the SLA doc §6.

## 5. Common operational tasks ⏳

| Task                                                            | How                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Replay a failed notification job                                | BullMQ UI / `queue.retryJobs()` — jobs are idempotent                                 |
| Investigate a match verdict                                     | `match_records` row stores tolerances + comparisons; join `audit_log` on entity id    |
| Unstick a requisition (approver unavailable, pre-v1 delegation) | Admin reassigns the step — writes an audit row with both identities                   |
| Fix a wrong receipt                                             | Never edit — post a correcting GRN (negative adjustment), same as accounting practice |

## 6. Backup & restore (SLA §5)

- Nightly base backup + WAL archiving → RPO ≤ 15 min. ⏳ script + schedule
- **Quarterly restore drill:** restore latest backup into a scratch container, run the
  smoke e2e suite against it, record the date + duration here:

| Drill date | Restore time | Result | Notes                              |
| ---------- | ------------ | ------ | ---------------------------------- |
| —          | —            | —      | first drill due after first deploy |

## 7. Incident response (SLA §4)

1. Classify severity (Sev-1: down or money at risk — e.g. wrong match auto-approved).
2. Sev-1: stop the bleeding first — feature-flag off invoice matching (`MATCHING_ENABLED=false`
   holds all new invoices in `entered`; nothing becomes payable — fail-closed by design, I-4).
3. Timeline in the incident doc as you go; post-mortem within 48 h, blameless,
   action items become ClickUp tasks.
