import { MaterialsSuppliedBy } from './service'
import { UnitType } from './service'

// Rolled up from a Project's rooms + project_line_items at generation time. A Quote is
// a snapshot, same principle as TaggedService's rate_used fields: editing the project
// afterwards (re-tracing a room, correcting a rate) must never silently rewrite a quote
// that's already been sent to a client.
export interface QuoteLineItem {
  // Room label for a room-tagged service, or the service's category (e.g.
  // "Consultations") for a project-level one — this is the PDF's section grouping key.
  section: string
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
  generated_pdf_url?: string
  status: 'draft' | 'sent' | 'won' | 'lost'
  created_at: number
  sent_at?: number
}
