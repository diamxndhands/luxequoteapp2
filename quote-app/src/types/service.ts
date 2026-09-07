// The rate table. One row per real thing Luxe sells — the six categories from the
// client's service deck, each a base rate plus a set of optional modifiers that carry
// their own deltas. This one shape covers a $12/ft surface baseboard and a CNC monogram
// feature wall alike; nothing here is a special case.

export type ServiceCategory = 'Consultations' | 'Install' | 'CNC' | 'Supply' | 'Scribing' | 'Refine'

export type UnitType = 'linear_ft' | 'sqft' | 'per_item' | 'flat'

// A rate that has never been entered is `undefined`, not 0 — 0 is a real (if unusual)
// price, and collapsing "no data yet" into it would let an untagged service silently
// price at zero instead of prompting. See lib/pricing.ts for the first-use flow this
// supports.
export type Rate = number | undefined

export interface ServiceModifier {
  id: string
  name: string
  // Supply-category items (Z-channel, concealed hinges, moulding stock...) live here as
  // modifiers on the Install service they belong to, per the spec's pricing rules —
  // they are never their own tagged service.
  labor_delta: Rate
  material_delta: Rate
}

export interface Service {
  id: string
  category: ServiceCategory
  name: string
  unit_type: UnitType
  // Consultations and Refine are project-level (a flat site-visit fee, a
  // discovered-on-site correction) — they never attach to a room, so the tagging UI
  // shouldn't offer them from a room's picker at all. Everything else is room-scoped.
  room_scoped: boolean
  base_labor_rate: Rate
  // Distinct from `base_labor_rate` being unset: a service can be genuinely
  // material-free (e.g. a labour-only consultation) forever, vs. one where a material
  // rate applies but nobody has entered it yet. `material_applicable` is the permanent
  // fact; `base_material_rate` being undefined while this is true is what triggers the
  // first-use prompt.
  material_applicable: boolean
  base_material_rate: Rate
  modifiers: ServiceModifier[]
  // Human-readable provenance for whatever `base_labor_rate`/`base_material_rate*` hold
  // right now — "from the Sep 2026 Hardill condo job" vs. "entered on first use,
  // 2026-09-12". Shown next to the rate in the pricing review step so a number is never
  // presented as more authoritative than it is.
  rate_basis?: string
  rate_updated_at?: number
}

// A project's setting for who supplies major materials changes whether *any* material
// rate applies at all — not just whether it happens to be filled in. Kept here (not on
// Service) because it's a fact about the job, not the catalog: the same Service can
// price differently across two projects.
export type MaterialsSuppliedBy = 'contractor' | 'client'
