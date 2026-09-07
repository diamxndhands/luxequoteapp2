import { MaterialsSuppliedBy } from './service'
import { UnitType } from './service'

// Rolled up from a Project's rooms + project_line_items at generation time. A Quote is
// a snapshot, same principle as TaggedService's rate_used fields: editing the project
// afterwards (re-tracing a room, correcting a rate) must never silently rewrite a quote
// that's already been sent to a client.
export interface QuoteLineItem {
  // The service's category ("Install", "Consultations"...) or "Custom items" for an
  // ad-hoc line — the PDF's section grouping key. Deliberately category, not room:
  // everywhere else in the app organizes by room (the sidebar, the Services and Pricing
  // steps), but the spec's own Output Format section is explicit that the client-facing
  // document groups "by package/category (e.g. 'Door Retrofit Package,' 'Baseboard &
  // Hardware Package')" — closer to the historical quote template than to how the
  // wizard itself is organized. The room a line belongs to isn't lost, just moved: see
  // `description`. A real "package" curated finer than the 6 catalog categories (the
  // spec's two examples split Install into two separate packages) isn't something this
  // schema has evidence for yet — category is the closest concrete grouping available
  // until the client's real package taxonomy is confirmed.
  section: string
  // Room-scoped lines get their room folded in here ("Standard surface-mount baseboard
  // — Bedroom") since the section above no longer carries it.
  description: string
  quantity: number
  unit: UnitType
  labor_amount: number
  material_amount: number
  total: number
}

export interface Quote {
  id: string
  project_id: string
  // Human-facing document number (Q-2026-001) — absent until the quote is actually
  // issued, since assigning it on every draft edit would burn numbers on quotes never
  // sent.
  number?: string
  title?: string
  client_name?: string
  client_address?: string
  // Snapshot of the project setting that decided whether material_amount columns were
  // even populated for this quote — see Service.material_applicable.
  materials_supplied_by: MaterialsSuppliedBy
  line_items: QuoteLineItem[]
  subtotal: number
  gst: number
  total: number
  notes?: string
  valid_until?: number
  // Overrides BusinessProfile.depositPct for this quote specifically when set — the
  // spec explicitly leaves "should the payment schedule be auto-generated or added
  // manually per project" as an open question for the client to confirm, so this stays
  // per-quote and editable (including down to 0, which drops the deposit line
  // entirely) rather than the app silently committing to one answer.
  deposit_pct?: number
  generated_pdf_url?: string
  status: 'draft' | 'sent' | 'won' | 'lost'
  created_at: number
  sent_at?: number
}
