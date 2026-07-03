# ADR-0006: Zero-downtime deployment (atomic swap + graceful reload)

- **Status:** proposed
- **Date:** 2026-07-03

## Context

Shipping a new build must not drop requests or serve a broken, half-updated app. A naive
"stop, overwrite, start" causes visible downtime and lost in-flight work. Three concrete
risks apply to TriMatch's topology (single host, nginx front — ADR-0005):

- **Web:** overwriting `dist` in place while users are mid-load can serve a mix of old and
  new files. Vite's content-hashed filenames mostly prevent broken chunks, but the
  `index.html` → asset mapping must flip atomically, not file-by-file.
- **API:** restarting the NestJS process drops in-flight HTTP requests and interrupts
  BullMQ jobs unless the old process is drained first.
- **Migrations:** a schema change that the _old_ running code can't tolerate breaks the
  app during the swap window (e.g. dropping a column the old build still selects).

This is a pilot-scale, single-server target (NFR-04), so the aim is _near_-zero downtime
without orchestration — not a full multi-instance rollout.

## Options considered

| Option                                                                | Trade-off                                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Stop → replace → start (naive)                                        | Trivial, but real downtime, dropped requests, and interrupted jobs; unacceptable even at pilot scale                                     |
| **Atomic symlink swap (web) + graceful reload (API), single host** ✅ | Near-zero downtime with no orchestration; nginx reload is graceful; instant rollback by repointing the symlink; fits one box             |
| Blue/green or rolling behind a load balancer (2+ API instances)       | True zero-downtime + canary + instant rollback, but needs a second instance, an LB, and shared/stateless session handling — overkill now |
| Container orchestration (k8s/ECS rolling)                             | Industry standard at scale; far too heavy for a solo pilot; revisit only if we outgrow one host                                          |

## Decision

Single-host, atomic-swap deploy driven by a versioned `deploy/` script:

- **Web (atomic symlink):** build into `releases/<build-id>/`, then repoint a `current`
  symlink atomically (`ln -sfn releases/<id> current`) and `nginx -s reload`. nginx serves
  the new directory on the _next_ request; in-flight page loads finish against the old one.
  Hashed asset filenames let old and new bundles coexist, so a client mid-session never
  requests a chunk that has vanished. Keep the previous `releases/*` dir for rollback.
- **API (graceful reload):** run under a process manager (systemd or pm2) that starts the
  new process, lets it begin accepting connections, and **drains** the old one — finishing
  in-flight requests before exit. Enable NestJS `app.enableShutdownHooks()`; BullMQ workers
  finish the current job and stop pulling new ones on `SIGTERM`. Sequence claims already run
  in short transactions (ADR-0001), so they tolerate the overlap.
- **Migrations (expand/contract):** additive/backward-compatible changes deploy _before_
  the code that needs them; destructive changes (drop column/constraint) wait until a
  _later_ release, after no running code references them. **Never** ship a breaking
  migration in the same release as the code that depends on it — the old and new versions
  must both work against the intermediate schema during the swap window.
- **Gate + rollback:** a health check + smoke test must pass before the symlink flip / before
  the old API drains; rollback is repointing `current` to the prior release and reloading.

## Consequences

- Easier: near-zero downtime on one machine; instant rollback via symlink; no orchestration
  platform to run; deploy is a readable shell script under version control.
- Harder: destructive schema changes now span **two** releases (expand then contract), which
  requires discipline and is easy to forget; we must configure systemd/pm2 graceful reload
  and Nest shutdown hooks; the deploy script owns release retention and symlink management.
- Revisit if: we move beyond one host — multiple API instances behind the ADR-0005 proxy
  unlock true blue/green and canary releases and would supersede the single-host mechanism
  here (the expand/contract migration discipline carries over unchanged).
