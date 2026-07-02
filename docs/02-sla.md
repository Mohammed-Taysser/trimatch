# SLA & SLOs — TriMatch

- **Status:** accepted (aspirational until production; the practice is the point)
- **Date:** 2026-07-02
- **Related:** [01-prd.md](01-prd.md) (NFR-04) · [07-runbook.md](07-runbook.md)

> SLI = what we measure. SLO = the internal target. SLA = the external promise
> (looser than the SLO, with remedies). This doc defines all three so the system is
> designed and monitored against explicit numbers, the way enterprise software is sold.

## 1. Service tiers

| Tier              | Endpoints                                                  | Rationale                   |
| ----------------- | ---------------------------------------------------------- | --------------------------- |
| **T1 critical**   | approvals (act on step), invoice matching, receipt posting | blocks other humans / money |
| **T2 standard**   | requisition CRUD, PO issue, queues/lists                   | daily work                  |
| **T3 background** | reports, audit queries, notifications                      | tolerates delay             |

## 2. SLOs (internal targets, measured per calendar month)

| SLI                                       | T1     | T2     | T3    |
| ----------------------------------------- | ------ | ------ | ----- |
| Availability (successful non-5xx / total) | 99.9%  | 99.5%  | 99.0% |
| Latency p95 (read)                        | 300 ms | 400 ms | 2 s   |
| Latency p95 (write)                       | 600 ms | 800 ms | —     |
| Latency p99 (any)                         | 1.5 s  | 2 s    | 5 s   |

- **Error budget** at 99.9% ≈ **43.8 min/month** of T1 unavailability. Budget spent →
  feature work pauses in favor of reliability work (the Google SRE rule, applied honestly).
- Async jobs: notification fan-out delivered < 60 s after the triggering event, p99.
- Match computation (FR-402) is synchronous and included in the invoice-save write SLO.

## 3. SLA (what we'd promise customers)

| Metric                | Promise                                                              | Remedy (illustrative)                   |
| --------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| Monthly uptime, T1+T2 | 99.5%                                                                | 10% service credit < 99.5%, 25% < 99.0% |
| Scheduled maintenance | ≤ 4 h/month, announced ≥ 72 h ahead, outside 06:00–20:00 UTC Sun–Fri | excluded from uptime if announced       |
| Data durability       | RPO ≤ 15 min                                                         | —                                       |
| Disaster recovery     | RTO ≤ 4 h                                                            | —                                       |

## 4. Support tiers & response times

| Severity  | Definition                                               | First response   | Workaround/fix target |
| --------- | -------------------------------------------------------- | ---------------- | --------------------- |
| **Sev-1** | system down or money at risk (wrong match auto-approved) | 30 min, 24×7     | 4 h                   |
| **Sev-2** | core flow broken, workaround exists                      | 4 business hours | 2 business days       |
| **Sev-3** | degraded UX, cosmetic, questions                         | 1 business day   | next release          |

Business hours: Sun–Thu 09:00–18:00 Africa/Cairo.

## 5. Backup & recovery

- PostgreSQL: WAL archiving + nightly base backup → **RPO ≤ 15 min**.
- Quarterly restore drill documented in the runbook — a backup that was never restored
  does not count as a backup.
- Audit rows and match records: retained ≥ 7 years (financial-control convention),
  never in scope for deletion jobs.

## 6. How SLOs are measured (once live)

- SLIs from Prometheus histograms per route template + status (playbook §8);
  availability from the same series (`5xx` = failure; `4xx` = success — client errors
  don't burn the budget).
- Burn-rate alerts: page at 14.4× (1 h window), warn at 6× (6 h window).
- A monthly SLO report is generated and linked in the CHANGELOG release notes.
