# LuxeQuote — quoting flow rebuild

Rebuild of the core quoting flow (Upload -> Rooms -> Services -> Pricing -> Quote) from
`luxe-quote-app-spec.md`, starting from the data schema per the agreed build order.
Budgeting/CRM/pipeline are out of scope for this pass.

## Where this code came from

Two prior prototypes exist in `diamxndhands/LuxeQuoteApp`:
- `main` — a small scaffold: freehand floor-plan markup + a flat placeholder pricing table.
- PR #3 (`claude/deployment-error-udoy4r`, unmerged) — a much fuller build matching the
  dashboard/CRM screenshots: Job-as-container with Overview/Budget/Floor plan/Tasks/Bills
  tabs, OCR-based room detection from printed dimensions, a real jsPDF quote renderer,
  and a rate-learning engine that reads won/lost quotes for pricing suggestions.

This rebuild keeps the mechanics proven out in both (calibration, the tracing/measuring
canvas, the OCR pipeline, PDF rendering) but replaces the pricing data model. PR #3 built
pricing around a cost+markup catalog with assemblies; the spec wants a base-rate +
modifiers model with an explicit labor/material split, because the client's real rate
table and the "who supplies materials" project toggle both depend on that split — the
catalog+markup shape has no way to represent it. See `src/types/service.ts`,
`src/types/project.ts`, `src/types/quote.ts` for the schema, and `src/lib/pricing.ts`
for how a price is computed and how the first-use rate prompt is meant to work.

## What's real vs. deferred

**Real (this step):**
- `src/types/service.ts` / `project.ts` / `quote.ts` — the schema
- `src/lib/pricing.ts` — pricing math and first-use-rate semantics (pure functions, no
  storage or UI yet)
- `src/lib/serviceCatalogSeed.ts` — the rate table seeded from the one real historical
  quote on file, with three ambiguous categorizations flagged inline for the client to
  confirm rather than silently resolved
- `src/lib/measurement.ts` — geometry utilities, carried over unchanged from the
  prototype (this part was already solid)
- `db/schema.sql` — Postgres DDL mirroring the TypeScript types exactly (not wired to a
  backend yet — same as the prototype, the app still runs on browser storage for now)

**Deferred to the next step (UI wiring):**
- The tracing/calibration canvas, the OCR dimension/schedule/room-detection banners, and
  the PDF renderer all need porting over from the prototype as close-to-unchanged
  reusable plumbing.
- The five-step wizard shell, the room/service tagging screens, the pricing review
  screen, and the first-use rate prompt's actual UI.
- A decision on the storage layer (still open — see the audit).

## Open questions carried over from the audit

- Three seed-data categorization calls need the client's confirmation (see comments in
  `serviceCatalogSeed.ts`): whether "Interior-only 1/4\" reveal" is distinct from
  "Standard swing door retrofit," whether "Recessed baseboard, scribed to floor" is one
  line item or two (Install + Scribing), and what Install service (if any) "Stair
  stringer Z-channel" should be a modifier on, per the spec's Supply-items-are-modifiers
  rule.
- Whether floor plans reliably carry the printed dimensions the OCR room-detection
  depends on, or whether manual tracing needs to stay the primary path rather than a
  fallback — still open, same as the audit noted.
- Whether the payment schedule is auto-generated or added manually per quote — still
  open, nothing in either prototype resolves this.

## Run it

```
npm install
npm run build
```

There's no dev flow worth running yet — `App.tsx` is a placeholder proving the schema
compiles, not a real screen.
