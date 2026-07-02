# 00 — Onboarding & Session Handoff

> **Purpose:** the single file that brings any new contributor — or a new Claude Code
> session — to full context. Read this first; everything else is linked from here.
> Updated at every milestone (last: 2026-07-02, v0.0.1).

## 1. What this project is

**TriMatch** — enterprise procurement with 3-way matching (idea #5 of the
[enterprise track](../../ENTERPRISE_PROJECT_IDEAS.md)):
requisition → approval matrix → purchase order → goods receipt → vendor invoice →
**3-way match** → payable. Built solo but run with multinational-team process
([Enterprise Playbook](../../ENTERPRISE_PLAYBOOK.md)).

## 2. Current state (scaffold merged — 0.1.0-dev)

- Git repo at `/mnt/dev/side-projects/trimatch/`, branch `main`, tag `v0.0.1`,
  clean tree; remote `origin` → <https://github.com/Mohammed-Taysser/trimatch>.
  **Monorepo scaffold shipped 2026-07-02** (ClickUp `869dz0ff5`):
  `pnpm install && docker compose up -d && pnpm dev` → api :3000 (`/api/v1`),
  web :5173. Host ports overridable via `.env` (`POSTGRES_HOST_PORT`/`REDIS_HOST_PORT`)
  when 5432/6379 are taken. Root `CLAUDE.md` exists for Claude Code sessions.
- Full docs pack exists — see the [README index](../README.md). Key contracts:
  - Business rules with worked numbers: [PRD §5](01-prd.md) (matrix R1–R5, tolerance cases A–H)
  - Invariants I-1..I-8: [domain doc §4](03-domain.md)
  - TC-xxx ↔ FR-xxx test matrix: [test plan](05-test-plan.md)
- **Decisions locked** (do not re-litigate; supersede via new ADR if needed):
  - [ADR-0001](adr/0001-tech-stack.md): NestJS + PostgreSQL 16 + **Sequelize**
    (`@nestjs/sequelize`, hand-written migrations) + React/Vite + BullMQ + pnpm monorepo
  - [ADR-0002](adr/0002-approval-engine-as-data.md): matrix rules as versioned DB rows;
    chains snapshotted at submission

## 3. ClickUp — our Jira-equivalent

| Thing            | Value                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Team (workspace) | `9012205641` ("Dev")                                                                                                     |
| Space            | "Side Projects" — `90128172532`                                                                                          |
| Folder           | "TriMatch" — `901212106264`                                                                                              |
| Lists            | 7, one per epic (Epic 0..6)                                                                                              |
| Tasks            | 35 stories with Given/When/Then acceptance criteria referencing FR/TC IDs                                                |
| Status workflow  | `backlog → scoping → in design → ready for development → in development → in review → testing → shipped` (+ `cancelled`) |
| Tags             | `setup`, `mvp`, `v1`                                                                                                     |

**Workflow simulation rules** (how we move cards, like an enterprise team):

1. Pick the top item of the current epic's `backlog` (MVP epics first: 0 → 1 → 2 → 3).
2. `scoping`: confirm acceptance criteria against the PRD; split if > ~1 branch-day of work.
3. `in design` (only if the story needs a design note/ADR) → `ready for development`.
4. `in development`: create branch `feat/<scope>-<desc>`; acceptance criteria become test names.
5. `in review`: open PR (template checklist); self-review counts, CI must be green.
6. `testing`: run the flow end-to-end (verify, not just tests) → `shipped` on merge.
7. Anything discovered mid-task that isn't in scope → **new backlog task**, not scope creep.
8. Bugs found later → task tagged `bug` in the owning epic's list, with repro steps as G/W/T.

## 4. Tooling & environment notes

- **ClickUp MCP:** config at `/mnt/dev/.mcp.json` (moved there 2026-07-02 — Claude Code
  only reads project MCP config from the project root). Credentials + enablement in
  `/mnt/dev/.claude/settings.local.json`. MCP servers load at **session start** — in a
  fresh session the `clickup` tools should be available via ToolSearch.
- **Fallback:** the ClickUp REST API works with the same key
  (`Authorization: <pk key>`, base `https://api.clickup.com/api/v2`) — proven working;
  a resume-safe setup script pattern exists from the kickoff session.
- The API key is a secret: never commit it, never echo it into logs or docs.

## 5. Session-start validation checklist

Run these before doing work in a new session:

1. **Repo state:** `git -C /mnt/dev/side-projects/trimatch log --oneline -3` →
   HEAD is `chore(release): 0.0.1 docs baseline` (or later); `git status` clean;
   `git tag` contains `v0.0.1`.
2. **MCP loaded:** ToolSearch for "clickup" returns tools. If not → check
   `/mnt/dev/.mcp.json` exists and session was started in `/mnt/dev`; fall back to REST.
3. **ClickUp reachable:** list the "TriMatch" folder (`901212106264`) → 7 lists, 35 tasks
   (5 shipped in Epic 0).
4. **Docs render:** README table links resolve (spot-check one).

## 6. What's next (in order)

1. **Epic 1 / "submit my requisition so approval starts"** (FR-103, TC-104): submit
   transition, chain snapshot (MVP: requester's manager), audit row — first use of the
   state-machine base.
2. Then follow the board (approver inbox FR-104, revise/resubmit FR-105, …).

Every release: update [CHANGELOG](../CHANGELOG.md), tag `vX.Y.Z`
(semantic-release takes over once CI exists).

## 7. Kickoff prompt for a new Claude Code session

Paste this to start the next session:

```text
Continue the TriMatch project. Read /mnt/dev/side-projects/trimatch/docs/00-onboarding.md
first — it has full context, ClickUp IDs, validation checklist, and workflow rules.
Then: (1) run the session-start validation checklist, (2) confirm the ClickUp MCP tools
are loaded, (3) pick up the next backlog task from Epic 0 (monorepo scaffold) and move it
through the ClickUp workflow statuses as you work, exactly per the simulation rules in §3.
Work docs-first per the playbook; conventional commits; update the CHANGELOG.
```
