# ADR-0004 — Money representation: migrate from integer minor units to DECIMAL

- **Status:** accepted
- **Date:** 2026-07-03
- **Related:** [03-domain.md](../03-domain.md) (invariant I-8) · [ADR-0001](0001-tech-stack.md) ·
  Epic 10 (Multi-currency & FX) · Epic 20 (implementation task `869dzn2n3`)

## Context

Money has been stored as **integer minor units** (`59_97` = \$59.97) since the MVP,
formalized as invariant **I-8**: all money arithmetic in integer minor units, all
comparisons in basis points (`abs(delta) * 10000 ≤ bp * base`). This is exact, maps
onto JS `number` (safe to ~90 trillion dollars in cents), survives JSON round-trips,
and keeps the 3-way-match tolerance engine pure integer math.

Its limitation surfaced while scoping Epic 10: the fixed ÷100 assumption does not
hold for currencies with other than two decimal places (KWD/BHD/OMR use 1000 fils),
for sub-cent unit prices, or for FX rates (which need six or more decimal places).
Integer minor units can absorb these with currency-scaled integers, but that pushes
per-currency exponent bookkeeping into every call site.

The owner weighed keeping integer minor units (with currency-scaled integers for the
multi-decimal cases) against adopting `NUMERIC`/DECIMAL, and chose to migrate to
DECIMAL so precision and scale are carried by the type system and the database rather
than by convention.

## Options considered

1. **Keep integer minor units**, add currency-driven exponents + separately-scaled
   integer FX rates in Epic 10. No refactor; arithmetic stays pure integer; the
   cost is per-currency scale bookkeeping and no native sub-unit support.
2. **Migrate to Postgres `NUMERIC` + a decimal library** (chosen). Precision/scale
   are explicit in the schema; multi-decimal currencies and FX rates are native; the
   cost is a decimal library across the app and string-at-the-JS-boundary handling.

## Decision

Adopt **Postgres `NUMERIC` for all money, with a decimal library** (decimal.js or
big.js) in the application layer. This **amends invariant I-8** — arithmetic moves
from integer minor units to decimal, comparisons stay basis-point but are evaluated
in decimal.

- **Storage:** monetary amounts as `NUMERIC(19, 4)` (four fractional digits cover
  2- and 3-decimal currencies and common sub-cent unit prices); FX rates at a higher
  scale (e.g. `NUMERIC(19, 10)`) under Epic 10.
- **App layer:** money handled as decimal instances, never JS floats;
  `node-postgres` already returns `NUMERIC` as a string, so parse at the repository
  edge into the decimal type and never through `Number()`.
- **Transport:** the response envelope carries money as **strings** (or a
  `{ amount, currency }` object), not `number`, to preserve precision across JSON;
  the shared zod schemas change from `z.number().int()` to a validated decimal
  string, and the web `lib/format` consumes strings.
- **Tolerance engine:** the PRD §5.2 cases A–H are reproduced exactly in decimal;
  the basis-point rule becomes a decimal comparison with an explicit rounding mode.

## Consequences

- **This is a reversal**, executed as one cross-cutting Epic 20 task (`869dzn2n3`),
  not incrementally: every money column, every money zod schema, the match engine,
  the web formatting, and all money tests change together, behind a data migration
  that converts existing minor-unit values.
- **Gained:** native multi-decimal currencies and FX rates without per-call scale
  math; precision guaranteed by the column type; the domain model reads in real
  currency amounts.
- **Given up:** the simplicity of pure-integer arithmetic and free JSON numeric
  transport; a decimal dependency now sits in the hot path, and every money value
  crosses the API as a string, which downstream consumers must parse.
- **I-8** is updated in [03-domain.md](../03-domain.md) when the Epic 20 task lands
  (per the "extend canonical docs per story" rule); until then it carries a
  forward-reference to this ADR so the doc matches the current integer code.
- Supersede this ADR (never edit) if a later decision revisits the representation.
