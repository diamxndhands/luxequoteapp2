import { Project, Room, TaggedService } from '../types/project'
import { Service } from '../types/service'
import { BusinessProfile } from '../types/settings'
import { Quote, QuoteLineItem } from '../types/quote'
import { round2 } from './pricing'

export interface QuoteOverrides {
  title?: string
  clientName?: string
  clientAddress?: string
  notes?: string
  // undefined = use the business profile's default deposit percentage; 0 = no deposit
  // line at all. See Quote.deposit_pct for why this stays per-quote and editable rather
  // than a fixed system default.
  depositPct?: number
}

function lineFor(t: TaggedService, catalog: Service[], room: Room | undefined): QuoteLineItem {
  const service = t.service_id ? catalog.find(s => s.id === t.service_id) : undefined
  const name = t.ad_hoc?.name ?? service?.name ?? 'Unknown service'
  const unit = t.ad_hoc?.unit_type ?? service?.unit_type ?? 'per_item'
  return {
    section: t.ad_hoc ? 'Custom items' : service?.category ?? 'General',
    description: room ? `${name} — ${room.label}` : name,
    quantity: t.quantity,
    unit,
    labor_amount: t.computed_labor_price,
    material_amount: t.computed_material_price,
    total: t.computed_total
  }
}

// Rolls up every tagged service on the project — room-scoped and project-level alike —
// into the flat, category-sectioned line list a Quote actually carries. The one place
// this happens, so however many times a quote gets regenerated during a project (a rate
// corrected, a room re-measured), the rollup logic can't drift from itself.
export function buildQuote(project: Project, catalog: Service[], profile: BusinessProfile, overrides: QuoteOverrides = {}): Quote {
  const lineItems: QuoteLineItem[] = [
    ...project.rooms.flatMap(room => room.tagged_services.map(t => lineFor(t, catalog, room))),
    ...project.project_line_items.map(t => lineFor(t, catalog, undefined))
  ]

  const subtotal = round2(lineItems.reduce((sum, l) => sum + l.total, 0))
  const gst = round2(subtotal * (profile.taxRate / 100))
  const total = round2(subtotal + gst)

  return {
    id: crypto.randomUUID(),
    project_id: project.id,
    // Not a real sequential document-numbering scheme (that needs a backend/counter to
    // stay unique across projects, which is still an open decision — see the audit) —
    // just enough to give a generated PDF a stable-looking identifier for now.
    number: `Q-${new Date().toISOString().slice(0, 10)}-${project.id.slice(0, 4).toUpperCase()}`,
    title: overrides.title,
    client_name: overrides.clientName || project.client_name,
    client_address: overrides.clientAddress || project.address,
    materials_supplied_by: project.materials_supplied_by,
    line_items: lineItems,
    subtotal,
    gst,
    total,
    notes: overrides.notes,
    deposit_pct: overrides.depositPct,
    status: 'draft',
    created_at: Date.now()
  }
}
