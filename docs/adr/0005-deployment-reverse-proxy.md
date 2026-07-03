# ADR-0005: Deployment topology — single-origin nginx reverse proxy

- **Status:** proposed
- **Date:** 2026-07-03

## Context

The web app is a static Vite SPA (ADR-0001): the server only _hosts_ the built files;
the JavaScript _runs in the user's browser_. Every API call therefore originates
client-side and must reach the API over the network — even when web and API are hosted
on the same box. The API is a NestJS process listening on `API_PORT` under the `/api/v1`
prefix (`main.ts`), and there is deliberately **no CORS** configured on it.

Two forces shape the decision:

- **Same-origin is already assumed.** `webEnv.VITE_API_BASE_URL` defaults to `''`
  (`apps/web/src/lib/env.ts`) so the browser emits `/api/v1/...` against whatever origin
  served the page, and the Vite dev server proxies `/api → localhost:3000`
  (`apps/web/vite.config.ts`). The absence of `enableCors` means a split public origin
  would break every request until CORS was added.
- **The backend should not be publicly reachable.** `app.listen(port)` currently binds
  all interfaces (`0.0.0.0`); a proper topology exposes only the proxy.

Terminology (a **reverse** proxy, not a forward one): a forward proxy fronts _clients_
and hides the client from the server (corporate egress, VPN); a reverse proxy fronts
_servers_ and hides the backends from the client (nginx, load balancers, API gateways).
The same software can do either — the difference is which side it stands in front of.
TriMatch needs the reverse form: one public door that fronts the SPA and the API.

## Options considered

| Option                                                                 | Trade-off                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split public origins (`app.example.com` + `api.example.com`)           | Two DNS names + two TLS certs; **CORS becomes mandatory** on the API; the backend is publicly exposed; every non-simple request pays a preflight round-trip                                  |
| Serve static files from the NestJS process itself                      | One process, but couples web and API lifecycles, loses nginx's caching/compression/TLS offload, and muddies the modular-monolith boundary; acceptable only for throwaway demos               |
| **Same-origin nginx reverse proxy (serves `dist`, proxies `/api`)** ✅ | One origin ⇒ **no CORS**; backend bound to `127.0.0.1` (no public port); one TLS cert; matches the empty `VITE_API_BASE_URL` default and makes prod the permanent twin of the Vite dev proxy |

## Decision

- **nginx** (or Caddy) is the single public entry point, terminating TLS on `:443`.
- It **serves the built SPA** from `apps/web/dist`, with an SPA fallback so client-side
  routes resolve: `try_files $uri $uri/ /index.html`.
- It **reverse-proxies `/api/`** to `http://127.0.0.1:3000`. `proxy_pass` carries **no
  trailing slash**, so the original path is preserved and the `/api/v1` prefix reaches
  the API intact (a trailing slash would strip the prefix and 404 every route).
- The API **binds to `127.0.0.1`** via a new `API_HOST` env var (no default, per the
  no-silent-config rule), so it has no public port — reachable only through the proxy.
- `VITE_API_BASE_URL` stays `''` (same-origin). The Vite dev proxy is the development
  twin of this production block, keeping dev/prod behaviour symmetric.
- The proxy forwards `X-Request-Id` so the API's existing correlation id survives the hop.
- Config lives in the repo (`deploy/nginx/trimatch.conf`) and is versioned like code.

## Consequences

- Easier: no CORS code to write or drift; a single certificate; the backend is not
  internet-exposed; dev and prod behave the same (Vite proxy ↔ nginx). Static assets get
  nginx compression + long-lived immutable caching (Vite's hashed filenames make this safe).
- Harder: we now own an nginx/Caddy config and a deploy step that copies `dist` into the
  server root; TLS certificate management (certbot) unless we use Caddy (auto-TLS).
- Revisit if: web and API must scale independently across hosts, the SPA moves behind a
  CDN, or we go multi-region — any of which may reintroduce a split origin (with CORS) or
  an edge topology and would supersede this ADR.
