import { Service } from '../types/service'

// The rate table seeded from the one real historical quote (Luxe Finishing Ltd.,
// Vancouver condo job — labour-and-consumables-only, client supplied major materials).
// Everything else starts with base_labor_rate/base_material_rate left undefined; the
// first-use prompt (lib/pricing.ts) fills those in as the app is actually used. This is
// deliberately NOT a full reproduction of the spec's Install category list (doors,
// window casings, architectural millwork, mirrors, flush outlets, faux beams, etc.) —
// the spec itself says that list isn't exhaustive and the full item list is "available
// on request." Inventing rates or line items beyond what's evidenced would be guessing;
// this seeds only what the historical quote actually shows, plus the two modifier
// examples the spec spells out explicitly. Expect this file to grow once the promised
// handful of additional historical quotes and the real intake taxonomy arrive.
//
// Three categorization calls below are genuinely ambiguous from the source material and
// are flagged inline rather than silently resolved — confirm with the client before
// treating them as settled.

export const SERVICE_CATALOG_SEED: Service[] = [
  // ---- Consultations (project-level) ----
  {
    id: 'svc-onsite-assessment',
    category: 'Consultations',
    name: 'On-site assessment',
    unit_type: 'flat',
    draw_mode: 'none',
    room_scoped: false,
    material_applicable: false,
    base_labor_rate: undefined, // no flat/site-visit fee appears in the one historical quote on file
    base_material_rate: undefined,
    modifiers: []
  },

  // ---- Install: doors ----
  // draw_mode 'span' for every door below: the canvas captures a door's opening width by
  // clicking both edges, same as the prototype's door/window handling.
  {
    id: 'svc-door-standard-swing',
    category: 'Install',
    name: 'Standard swing door retrofit (1/4" reveal)',
    unit_type: 'per_item',
    draw_mode: 'span',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 650,
    base_material_rate: undefined, // job was labour-only; no material rate was ever billed separately
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },
  {
    id: 'svc-door-interior-quarter-reveal',
    category: 'Install',
    // AMBIGUOUS: the historical quote lists this as a separate line from
    // "Standard swing door retrofit (1/4" reveal)" above at the identical $650 rate.
    // Kept as its own service to match the source document literally, but this may
    // just be the same line item named twice — confirm with the client whether these
    // are actually distinct scopes of work before merging or keeping separate.
    name: 'Interior-only 1/4" reveal',
    unit_type: 'per_item',
    draw_mode: 'span',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 650,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },
  {
    id: 'svc-door-double-pivot-set',
    category: 'Install',
    name: 'Double pivot door set',
    unit_type: 'per_item',
    draw_mode: 'span',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 1800,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },
  {
    id: 'svc-door-master-pivot-entry',
    category: 'Install',
    name: 'Master pivot entry',
    unit_type: 'per_item',
    draw_mode: 'span',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 1500,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },
  {
    id: 'svc-door-pocket',
    category: 'Install',
    name: 'Pocket door (jamb mod + shadow reveal)',
    unit_type: 'per_item',
    draw_mode: 'span',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 750,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },
  {
    id: 'svc-door-exterior-pivot-closet',
    category: 'Install',
    name: 'Exterior pivot (closet)',
    unit_type: 'per_item',
    draw_mode: 'span',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 1200,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },

  // ---- Install: baseboards ----
  {
    id: 'svc-baseboard-surface-mount',
    category: 'Install',
    name: 'Standard surface-mount baseboard',
    unit_type: 'linear_ft',
    draw_mode: 'line',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 12,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },
  {
    id: 'svc-baseboard-recessed',
    category: 'Install',
    name: 'Recessed baseboard',
    unit_type: 'linear_ft',
    draw_mode: 'line',
    room_scoped: true,
    material_applicable: true,
    // No standalone rate for a plain recessed baseboard appears in the historical
    // quote — only "Recessed baseboard, scribed to floor" at $45/ft (seeded separately
    // below, under Scribing). See that entry's comment for the open question this
    // raises about whether these two are the same line item under two names.
    base_labor_rate: undefined,
    base_material_rate: undefined,
    modifiers: [
      {
        id: 'mod-baseboard-zchannel-drywall-cutback',
        // Named directly from the spec's own example: "a Z-channel + drywall cutback
        // modifier adding its own labor/material delta." No dollar figure was given for
        // the modifier itself — first-use prompt fills it in.
        name: 'Z-channel + drywall cutback',
        labor_delta: undefined,
        material_delta: undefined
      }
    ]
  },

  // ---- Scribing ----
  {
    id: 'svc-scribing-baseboard-to-floor',
    category: 'Scribing',
    // AMBIGUOUS: this is the historical quote's literal line item, priced as a single
    // $45/linear ft rate. It could equally be read as the Install "Recessed baseboard"
    // base rate (above) with scribing/floor-fit bundled into the price rather than
    // billed separately — the spec defines Scribing as its own category ("custom-
    // cutting baseboards... to hug uneven walls/floors, linear-ft based, room-tagged")
    // but this specific historical line doesn't say which bucket the client meant.
    // Confirm before either merging this into svc-baseboard-recessed or treating both
    // as real, separately billable line items.
    name: 'Recessed baseboard, scribed to floor',
    unit_type: 'linear_ft',
    draw_mode: 'line',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 45,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },

  // ---- Install: feature walls ----
  {
    id: 'svc-featurewall-accent',
    category: 'Install',
    name: 'Feature wall (accent wall)',
    unit_type: 'sqft',
    draw_mode: 'polygon',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: undefined, // not in the one historical quote on file
    base_material_rate: undefined,
    modifiers: [
      { id: 'mod-featurewall-raised-panels', name: 'Raised panels', labor_delta: undefined, material_delta: undefined },
      { id: 'mod-featurewall-recessed-panels', name: 'Recessed panels', labor_delta: undefined, material_delta: undefined },
      { id: 'mod-featurewall-stain-grade-millwork', name: 'Stain-grade millwork', labor_delta: undefined, material_delta: undefined },
      { id: 'mod-featurewall-cnc-monogram', name: 'CNC monogram pattern', labor_delta: undefined, material_delta: undefined }
    ]
  },

  // ---- Install: bathroom hardware ----
  {
    id: 'svc-bathroom-hardware-install',
    category: 'Install',
    name: 'Bathroom hardware install',
    unit_type: 'flat',
    // Billed per room, not traced — tagging this just means "this room gets it."
    draw_mode: 'none',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 150,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only), billed per room',
    rate_updated_at: Date.parse('2026-09-04')
  },

  // ---- Install: stair stringer Z-channel ----
  {
    id: 'svc-stair-stringer-zchannel',
    // AMBIGUOUS, and a real conflict with the spec's own pricing rule: the spec states
    // Z-channel is a Supply item that should be "folded in as a modifier on the
    // relevant Install service, not tagged separately" — but the historical quote bills
    // "Stair stringer Z-channel" as its own standalone $45/linear ft line, and no
    // "stair stringer install" (or similar) Install service exists to hang it off of as
    // a modifier. Seeded here as a standalone Install-category service to match how it
    // was actually billed, but this should be reconciled with the spec's modifier rule
    // once it's clear what Install service (if any) a stair stringer belongs under.
    category: 'Install',
    name: 'Stair stringer Z-channel',
    unit_type: 'linear_ft',
    draw_mode: 'line',
    room_scoped: true,
    material_applicable: true,
    base_labor_rate: 45,
    base_material_rate: undefined,
    modifiers: [],
    rate_basis: 'Sep 2026 Hardill Vancouver condo job (labour-and-consumables-only)',
    rate_updated_at: Date.parse('2026-09-04')
  },

  // ---- Refine (project-level) ----
  {
    id: 'svc-refine-deficiency-correction',
    category: 'Refine',
    // Unit type is a guess (spec: "typically discovered on-site rather than planned
    // from a floor plan," no rate structure given) — flat per occurrence seems closest
    // to how these actually get billed, but confirm rather than assume.
    name: 'Deficiency correction (dutchman patch / hardware fix)',
    unit_type: 'flat',
    draw_mode: 'none',
    room_scoped: false,
    material_applicable: true,
    base_labor_rate: undefined,
    base_material_rate: undefined,
    modifiers: []
  }

  // CNC category intentionally has no seeded services yet: the spec describes it only
  // as "custom curves/patterns/handles via CNC" with no named sub-items or rates to
  // seed from. Add real entries once the client's intake answers name specific items.
]
