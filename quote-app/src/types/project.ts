import { MaterialsSuppliedBy, UnitType } from './service'

export interface ScaleCalibration {
  pixelLength: number
  realLength: number
  unit: 'ft' | 'in'
}

export interface SelectedModifier {
  modifier_id: string
  // Snapshot of the modifier's delta at the moment it was applied — same reasoning as
  // labor_rate_used/material_rate_used below: a later rate-table edit must not silently
  // reprice a line someone already reviewed.
  labor_delta: number
  material_delta: number
}

// One service, tagged once, priced. Whether it's sitting in a Room's list or a
// Project's project_line_items list, the shape is identical — a project-level
// Consultations line and a room's baseboard run are both just a TaggedService.
// A one-off item with no catalog entry — a bespoke ask the rate table has never seen
// and never will again. The old prototype supported this (CustomItemForm) and real jobs
// need it; forcing every line through the catalog would make the tagging flow a wall
// between the user and something they need to quote right now. When present, this
// entirely bypasses lib/pricing.ts's rate lookup — the numbers here are what the user
// typed, not a rate table entry.
export interface AdHocItem {
  name: string
  unit_type: UnitType
  labor_rate: number
  material_rate: number | null
}

export interface TaggedService {
  id: string
  // Exactly one of service_id or ad_hoc is set, never both — enforced by however this
  // gets constructed (the tagging UI), not by the type itself.
  service_id?: string
  ad_hoc?: AdHocItem
  quantity: number
  // 'auto' when geometry produced the number (perimeter/area/opening count off the
  // plan); 'manual' when typed in. Shown in the pricing review so an auto quantity that
  // looks off (spec's anomaly flag) can be told apart from one the user already vetted
  // by hand.
  quantity_source: 'auto' | 'manual'
  modifiers_selected: SelectedModifier[]
  // Rates are copied onto the line at tag time, not looked up live at render time — the
  // same "a quote is a snapshot" principle the spec's Quote/PDF step depends on.
  // Otherwise correcting a rate table entry after the fact would silently rewrite every
  // quote that ever used it, including ones already sent.
  labor_rate_used: number
  material_rate_used: number | null
  computed_labor_price: number
  computed_material_price: number
  computed_total: number
  // Set when the auto-quantity falls well outside the typical range for this service
  // type — the spec's "flag anomalies... for a second look rather than silently
  // trusting the auto-calc." Human-readable, not a boolean, so the pricing screen can
  // show *why* without a lookup table of its own.
  anomaly_flag?: string
}

export interface Room {
  id: string
  // From the floor plan's own printed label when OCR found one, or user-entered
  // otherwise — either way this is what the quote PDF groups by.
  label: string
  // 'traced' = the user drew the outline by hand; 'ocr_detected' = read off a printed
  // "W x H" dimension on the plan and accepted from a suggestion list. Both produce the
  // same polygon/area/perimeter; this just records which path it came from, mirroring
  // the distinction already proven out in the prototype (manual trace vs. printed-label
  // detection — see the audit notes on the spec's "magic wand" question).
  source: 'traced' | 'ocr_detected'
  floor_plan_polygon: number[] // flattened [x1,y1,x2,y2,...] image-pixel coordinates
  area_sqft?: number
  perimeter_ft?: number
  tagged_services: TaggedService[]
}

export interface Project {
  id: string
  client_name?: string
  address?: string
  materials_supplied_by: MaterialsSuppliedBy
  floor_plan_image_url?: string
  scale?: ScaleCalibration
  rooms: Room[]
  // Consultations, Refine, and any other non-room-scoped service tagged at the project
  // level — see Service.room_scoped.
  project_line_items: TaggedService[]
  status: 'draft' | 'quoted' | 'won' | 'lost'
  created_at: number
  updated_at: number
}
