import { Service, ServiceModifier } from '../types/service'
import { SERVICE_CATALOG_SEED } from './serviceCatalogSeed'

// The rate table itself, as opposed to serviceCatalogSeed.ts's starting values — this
// is what the app actually reads and writes as it's used. Seeded once from the known
// historical rates; every first-use prompt after that writes straight back here, which
// is what makes the catalog "self-building through normal use" per the spec rather than
// something that has to be fully populated up front.

const CATALOG_KEY = 'luxequote:serviceCatalog:v1'
const SEEDED_FLAG = 'luxequote:serviceCatalogSeeded:v1'

export function loadCatalog(): Service[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY)
    if (raw) return JSON.parse(raw) as Service[]
  } catch {
    // Fall through to seeding — a corrupt or inaccessible catalog is no worse than an
    // empty one.
  }
  // Seeds once, and never again — including after the user later empties the catalog,
  // which is a deliberate choice they shouldn't have to keep undoing.
  try {
    if (localStorage.getItem(SEEDED_FLAG)) return []
  } catch {
    // No localStorage at all (private browsing): seed in memory every load, since
    // there's nowhere to remember that it already happened.
  }
  saveCatalog(SERVICE_CATALOG_SEED)
  try {
    localStorage.setItem(SEEDED_FLAG, '1')
  } catch {
    // Worst case it seeds again next load on a browser that can't persist the flag.
  }
  return SERVICE_CATALOG_SEED
}

export function saveCatalog(services: Service[]): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(services))
  } catch {
    // Private browsing or quota exceeded — the in-memory catalog stays correct for this
    // session even though a first-use rate won't survive a reload.
  }
}

export function updateService(catalog: Service[], serviceId: string, patch: Partial<Service>): Service[] {
  return catalog.map(s => (s.id === serviceId ? { ...s, ...patch } : s))
}

export function updateModifier(catalog: Service[], serviceId: string, modifierId: string, patch: Partial<ServiceModifier>): Service[] {
  return catalog.map(s =>
    s.id === serviceId ? { ...s, modifiers: s.modifiers.map(m => (m.id === modifierId ? { ...m, ...patch } : m)) } : s
  )
}
