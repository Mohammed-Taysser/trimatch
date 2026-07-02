# CLAUDE.md — TriMatch

Enterprise procurement with 3-way matching: requisition → approval → PO → goods
receipt → vendor invoice → **3-way match** → payable. Built solo, run with
enterprise-team process.

## Read first

**[docs/00-onboarding.md](docs/00-onboarding.md)** is the single source of session
context: ClickUp IDs, workflow simulation rules, session-start validation checklist,
and what's next. Run its §5 checklist at the start of every session.

## Locked decisions (do not re-litigate; supersede via new ADR only)

- [ADR-0001](docs/adr/0001-tech-stack.md): NestJS + PostgreSQL 16 + **Sequelize**
  (`@nestjs/sequelize`, hand-written migrations) + React/Vite + BullMQ + pnpm monorepo.
- [ADR-0002](docs/adr/0002-approval-engine-as-data.md): approval matrix rules as
  versioned DB rows; chains snapshotted at submission.

## Workflow rules (summary — full rules in onboarding §3)

- Work is tracked in ClickUp (folder `901212106264`, 7 lists = Epics 0–6).
  Statuses: `backlog → scoping → in design → ready for development → in development
  → in review → testing → shipped`. Move the card as you work.
- ClickUp MCP only loads if the session starts in `/mnt/dev`; otherwise use the REST
  API (`https://api.clickup.com/api/v2`, key in `/mnt/dev/.claude/settings.local.json`
  under `env.CLICKUP_API_KEY`). **Never** print, log, or commit the key.
- **No hardcoded config values, and no silent defaults.** Anything
  environment-dependent (credentials, DB names, ports, hosts, URLs) is read from
  `.env`, and a missing variable must **fail loudly** so every dev notices:
  docker-compose uses `${VAR:?message}` (never `${VAR:-default}`), the api's zod
  env schema has no `.default()`s, the web validates `import.meta.env`. Every new
  variable goes into `.env.example` with a comment.
- Docs-first: update docs/ADRs before or with code, not after.
- Conventional Commits; update [CHANGELOG.md](CHANGELOG.md) per release; tag `vX.Y.Z`.
- **Commit messages: one single line** (`type(scope): what was done`) — no long
  bodies, and **never a `Co-Authored-By`** or any AI-attribution trailer.
- Branches: `feat/<scope>-<desc>`. Acceptance criteria become test names.
- Out-of-scope discoveries → new ClickUp backlog task, never scope creep.
- Remote: `origin` → <https://github.com/Mohammed-Taysser/trimatch> (SSH URL;
  HTTPS auth doesn't work here and `gh` CLI is not installed). Push branches,
  open PRs on the GitHub web UI — self-review counts until CI exists.

## Commands (once the monorepo exists)

- `pnpm install && docker compose up -d && pnpm dev` — api on :3000, web on :5173.
- Env config is validated at startup — the app must refuse to boot on invalid env.

## Key doc contracts

- Business rules + worked numbers: [docs/01-prd.md](docs/01-prd.md) (matrix R1–R5,
  tolerance cases A–H)
- Invariants I-1..I-8: [docs/03-domain.md](docs/03-domain.md)
- TC-xxx ↔ FR-xxx matrix: [docs/05-test-plan.md](docs/05-test-plan.md)
- Monorepo layout: [docs/04-architecture.md](docs/04-architecture.md)
