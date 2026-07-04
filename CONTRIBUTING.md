# Contributing to TriMatch

Solo project, team rules — the process is the point. Distilled from the
[Enterprise Playbook](../ENTERPRISE_PLAYBOOK.md).

## Workflow

```
pick story (ClickUp) → branch → adjust PRD if rules changed → tests for the rule
→ implement → update docs touched → PR (template + checklist) → CI green → squash-merge
```

- **Trunk-based:** `main` is always releasable. Branches live < 2–3 days.
- No branch without a ClickUp story; no story without acceptance criteria.
- Slice work **vertically** (thin end-to-end path), never layer-by-layer.

## Branch naming

```
feat/<scope>-<short-desc>     e.g. feat/requisitions-submit-flow
fix/<scope>-<short-desc>
docs/<scope>-<short-desc>
chore/<short-desc>
```

## Documentation map (single sources — extend per story, never fork)

Docs are organized by **concern, not by epic**. As each story lands, grow the
canonical doc it touches; never create a parallel per-epic FR/ERD file — it drifts
from the code and from the other copy the moment it exists.

| What you're adding                    | Canonical home                                     |
| ------------------------------------- | -------------------------------------------------- |
| A functional requirement (FR-xxx)     | [docs/01-prd.md](docs/01-prd.md)                   |
| A business rule / worked number       | docs/01-prd.md §5 (with the worked example)        |
| An entity, field, or relationship     | [docs/03-domain.md](docs/03-domain.md) (ERD)       |
| A domain invariant (I-x)              | docs/03-domain.md                                  |
| A test case (TC-xxx ↔ FR-xxx)         | [docs/05-test-plan.md](docs/05-test-plan.md)       |
| An architecture / layout note         | [docs/04-architecture.md](docs/04-architecture.md) |
| A significant, hard-to-reverse choice | [docs/adr/](docs/adr/) — new ADR, supersede        |
| End-user behavior                     | docs/06-user-manual.md (+ 09 Arabic)               |

Epic-specific scope lives in the **ClickUp epic/task**, not a doc. SLOs are defined
in [docs/02-sla.md](docs/02-sla.md); they are verified against measurements (Epic 17
observability), not per task.

## Commit convention — Conventional Commits

```
<type>(<scope>): <imperative summary ≤ 72 chars>

<body: what & why — not how>

BREAKING CHANGE: <description, if any>
```

- **Types:** `feat` `fix` `refactor` `test` `docs` `chore` `perf` `ci` `build`
- **Scope = module/area:** `requisitions`, `purchasing`, `receiving`, `matching`,
  `approvals`, `prd`, `sla`, `adr`, `release`…
- One logical change per commit; each commit should pass CI on its own.
- Enforced by commitlint + husky once `package.json` exists (tracked in Epic 0).

## Local integration tests

`pnpm test:integration` runs against your local Postgres (not a throwaway DB), so
data accumulates across runs. Assertions are written to tolerate that (scoped
queries, `\d{4,}` doc-number patterns, `collectAcrossPages`), so repeated local
runs stay green. If you ever want a pristine slate matching CI, reset the local
DB in one command:

```bash
pnpm --filter @trimatch/api db:reset   # undo all migrations → migrate → seed
```

Note: this **wipes** the local DB (it is shared with `pnpm dev`).

## Definition of Done

- [ ] Acceptance criteria of the story are met (and are now test names)
- [ ] Tests cover the business rules touched (table-driven for calculations)
- [ ] Docs updated if behavior or design changed (PRD / domain / ADR / manual)
- [ ] CHANGELOG `[Unreleased]` section updated for user-visible changes
- [ ] CI green; verified locally by running the actual flow
- [ ] **Verification result recorded** — the PR states what was run and its outcome
      ("How verified"), and the ClickUp task carries that evidence when it moves
      `testing → shipped`. DoD is not "tests exist" but "here is the result."
- [ ] No secrets, no debug logging, migrations included

## ADRs

Any decision you argue with yourself about for more than 10 minutes gets an ADR in
[docs/adr/](docs/adr/) using the template in the playbook (context → options →
decision → consequences). Supersede, never edit, accepted ADRs.
