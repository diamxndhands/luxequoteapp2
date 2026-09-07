import { MaterialsSuppliedBy, Rate, Service, ServiceModifier } from '../types/service'
import { SelectedModifier } from '../types/project'

function round2(n: number): number {
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
