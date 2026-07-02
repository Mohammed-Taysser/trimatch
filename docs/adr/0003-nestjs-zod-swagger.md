# ADR-0003 — DTOs & OpenAPI: nestjs-zod bridging shared zod schemas to Swagger

- **Status:** accepted
- **Date:** 2026-07-02
- **Related:** [ADR-0001](0001-tech-stack.md) · [04-architecture.md §3](../04-architecture.md)

## Context

The architecture commits to zod schemas in `packages/shared` as the single source of
truth typing both the api and the React client, plus OpenAPI generated from code
(NFR-05). The api initially validated bodies with a hand-rolled per-route
`ZodValidationPipe`. The owner asked whether to switch to class-validator +
class-transformer + `@nestjs/swagger` — the NestJS-native stack — which would provide
Swagger UI but break schema sharing with the web app (decorated DTO classes don't
travel to the browser without dragging `reflect-metadata`/class-validator along, and
types would be duplicated).

## Decision

Keep zod in `packages/shared`; adopt **nestjs-zod** (5.x, zod 4 + swagger 11 peers)
as the bridge:

- DTO classes via `createZodDto(SharedSchema)` — `@nestjs/swagger` reads them.
- One **global** validation pipe from `createZodValidationPipe`, with a custom
  exception preserving the existing error contract:
  `422 { code: 'VALIDATION_ERROR', message, details[] }`.
- Swagger UI at `/api/docs` (public, bearer-auth scheme registered), JSON at
  `/api/docs-json`, mounted via `setupOpenApi` — shared by `main.ts`, the export
  script and the integration tests.
- `openapi.json` exported by `pnpm --filter @trimatch/api openapi:export` and
  published as a CI artifact (`docs/api/` stays untracked — generated, not committed).

## Consequences

- Web keeps importing the same runtime schemas; no duplicated types.
- New endpoints must define DTOs with `createZodDto` from shared schemas — no
  class-validator decorators, no per-route pipes.
- class-validator/class-transformer remain absent; `@nestjs/swagger` lists them as
  loose (`*`) peers, which is fine without them.
