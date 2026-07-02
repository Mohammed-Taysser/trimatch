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

## Definition of Done

- [ ] Acceptance criteria of the story are met (and are now test names)
- [ ] Tests cover the business rules touched (table-driven for calculations)
- [ ] Docs updated if behavior or design changed (PRD / domain / ADR / manual)
- [ ] CHANGELOG `[Unreleased]` section updated for user-visible changes
- [ ] CI green; verified locally by running the actual flow
- [ ] No secrets, no debug logging, migrations included

## ADRs

Any decision you argue with yourself about for more than 10 minutes gets an ADR in
[docs/adr/](docs/adr/) using the template in the playbook (context → options →
decision → consequences). Supersede, never edit, accepted ADRs.
