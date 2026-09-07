import { MaterialsSuppliedBy, Rate, Service, ServiceModifier } from '../types/service'
import { AdHocItem, SelectedModifier, TaggedService } from '../types/project'

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function needsRatePrompt(rate: Rate): boolean {
  return rate === undefined
}

export interface MissingRate {
  target: 'base'
  field: 'labor' | 'material'
}

export interface PricingResult {
  labor: number
  material: number
  total: number
  // Non-empty when a rate this calculation depended on has never been entered — the
  // caller's cue to run the first-use prompt (spec: "prompt inline for a rate, then
  // save it into the rate table for all future quotes") before showing this number as
  // real. Pricing still returns a number (treating the missing rate as 0) so the running
  // total in the summary sidebar never breaks; the UI is what turns missingRates into a
  // visible "needs a rate" state instead of a silent zero.
  missingRates: MissingRate[]
}

// The one place a tagged service's price gets computed, so the pricing-review screen,
// the running summary sidebar, and the final quote agree with each other by
// construction. selectedModifiers must already be resolved (see resolveModifierDelta) —
// this function only ever reports a *base* rate as missing, never a modifier's, because
// a modifier can't be "selected" without a delta to select.
export function priceService(
  service: Service,
  quantity: number,
  selectedModifiers: SelectedModifier[],
  materialsSuppliedBy: MaterialsSuppliedBy
): PricingResult {
  const missingRates: MissingRate[] = []

  const laborRate = service.base_labor_rate
  if (needsRatePrompt(laborRate)) missingRates.push({ target: 'base', field: 'labor' })
  let laborTotal = laborRate ?? 0

  // Materials only cost the business anything when it's the one buying them — a
  // labour-and-consumables-only job (client supplies materials) carries no material
  // line at all, matching the one historical quote this schema is modelled on.
  const pricesMaterial = service.material_applicable && materialsSuppliedBy === 'contractor'
  let materialTotal = 0
  if (pricesMaterial) {
    const materialRate = service.base_material_rate
    if (needsRatePrompt(materialRate)) missingRates.push({ target: 'base', field: 'material' })
    materialTotal = materialRate ?? 0
  }

  for (const sel of selectedModifiers) {
    laborTotal += sel.labor_delta
    if (pricesMaterial) materialTotal += sel.material_delta
  }

  return {
    labor: round2(laborTotal * quantity),
    material: round2(materialTotal * quantity),
    total: round2((laborTotal + materialTotal) * quantity),
    missingRates
  }
}

// An ad-hoc item carries its own rate outright — never a lookup, never a missing-rate
// prompt, since there's no catalog entry behind it to prompt against. Materials still
// respect the project's supplied-by toggle: a client-supplies-materials job doesn't
// charge for an ad-hoc item's material rate any more than it would a catalog one.
export function priceAdHoc(item: AdHocItem, quantity: number, materialsSuppliedBy: MaterialsSuppliedBy): PricingResult {
  const labor = item.labor_rate * quantity
  const material = materialsSuppliedBy === 'contractor' ? (item.material_rate ?? 0) * quantity : 0
  return { labor: round2(labor), material: round2(material), total: round2(labor + material), missingRates: [] }
}

// Turns a catalog modifier into a line-item-ready SelectedModifier, or null when either
// delta it needs has never been entered — the config step's cue to prompt for a rate
// (spec: "when a service *or modifier* is tagged with no rate on file yet"), resolve it,
// and only then let the modifier be selected.
export function resolveModifierDelta(modifier: ServiceModifier, materialsSuppliedBy: MaterialsSuppliedBy): SelectedModifier | null {
  const needsMaterial = materialsSuppliedBy === 'contractor'
  if (needsRatePrompt(modifier.labor_delta)) return null
  if (needsMaterial && needsRatePrompt(modifier.material_delta)) return null
  return {
    modifier_id: modifier.id,
    labor_delta: modifier.labor_delta ?? 0,
    material_delta: needsMaterial ? modifier.material_delta ?? 0 : 0
  }
}

// Applies a rate the user just entered (via the first-use prompt) to a Service, and
// stamps the provenance so the pricing screen can show where the number came from.
// Returns a new Service — persisting it into whatever the rate table store ends up being
// is the caller's job, deliberately kept out of this file (see lib/pricing's module
// note: storage is a wiring-step decision, not a schema one).
export function recordRate(service: Service, field: 'labor' | 'material', rate: number, basis = 'entered on first use'): Service {
  const stamp = { rate_basis: basis, rate_updated_at: Date.now() }
  return field === 'labor' ? { ...service, base_labor_rate: rate, ...stamp } : { ...service, base_material_rate: rate, ...stamp }
}

export function recordModifierRate(modifier: ServiceModifier, field: 'labor' | 'material', rate: number): ServiceModifier {
  return field === 'labor' ? { ...modifier, labor_delta: rate } : { ...modifier, material_delta: rate }
}

// Physical-plausibility bounds, not a learned "typical for this job" baseline — there
// isn't enough quote history on file yet to know what's typical (the audit flagged this
// explicitly: a handful more historical quotes are expected, and this should be
// revisited once they're in). What this catches is cruder but still useful: a linear-ft
// run shorter than a doorway or longer than almost any single room, a traced area
// smaller than a closet or bigger than a great room, an item count nobody would tag by
// hand. Good enough to be worth a second look; not a claim about the client's business.
const PLAUSIBLE_RANGES: Partial<Record<Service['unit_type'], [number, number]>> = {
  linear_ft: [2, 150],
  sqft: [4, 600],
  per_item: [1, 20]
}

function detectAnomaly(unitType: Service['unit_type'], quantity: number): string | undefined {
  const range = PLAUSIBLE_RANGES[unitType]
  if (!range) return undefined
  const [min, max] = range
  if (quantity < min) return `${quantity} seems short for a single run — worth a second look`
  if (quantity > max) return `${quantity} seems long for a single room — worth a second look`
  return undefined
}

// Turns a priced catalog service into the TaggedService that actually gets stored on a
// Room or a Project — the one place this happens, so the tagging UI's "quick add" path
// (no missing rates, no modifiers to configure) and its config-panel path (rates just
// entered, modifiers just picked) can't drift into computing a line item two different
// ways. Assumes the caller has already resolved every rate this service and its
// selected modifiers need — priceService's missingRates is empty going in.
export function tagService(
  service: Service,
  quantity: number,
  quantitySource: 'auto' | 'manual',
  selectedModifiers: SelectedModifier[],
  materialsSuppliedBy: MaterialsSuppliedBy
): TaggedService {
  const result = priceService(service, quantity, selectedModifiers, materialsSuppliedBy)
  const pricesMaterial = service.material_applicable && materialsSuppliedBy === 'contractor'
  return {
    id: crypto.randomUUID(),
    service_id: service.id,
    quantity,
    quantity_source: quantitySource,
    modifiers_selected: selectedModifiers,
    labor_rate_used: service.base_labor_rate ?? 0,
    material_rate_used: pricesMaterial ? service.base_material_rate ?? 0 : null,
    computed_labor_price: result.labor,
    computed_material_price: result.material,
    computed_total: result.total,
    anomaly_flag: detectAnomaly(service.unit_type, quantity)
  }
}

// Same idea for an ad-hoc item — never has a missing rate to resolve (the user typed it
// directly), so there's no config-panel/quick-add split to reconcile.
export function tagAdHoc(item: AdHocItem, quantity: number, materialsSuppliedBy: MaterialsSuppliedBy): TaggedService {
  const result = priceAdHoc(item, quantity, materialsSuppliedBy)
  return {
    id: crypto.randomUUID(),
    ad_hoc: item,
    quantity,
    quantity_source: 'manual',
    modifiers_selected: [],
    labor_rate_used: item.labor_rate,
    material_rate_used: materialsSuppliedBy === 'contractor' ? item.material_rate : null,
    computed_labor_price: result.labor,
    computed_material_price: result.material,
    computed_total: result.total,
    anomaly_flag: detectAnomaly(item.unit_type, quantity)
  }
}
