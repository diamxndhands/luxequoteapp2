// Everything that makes a quote look like it came from a business rather than from a
// tool: the letterhead, the money rules that apply to every quote, and the boilerplate
// that has to appear on a document a customer might sign. Ported unchanged from the
// prototype — this is business configuration, not CRM scope.
export interface BusinessProfile {
  name: string
  tagline: string
  // A data URL. Kept small on purpose (see downscaleImage in lib/images) because it is
  // embedded in every PDF and lives in the same localStorage budget as the floor plans.
  logo?: string
  email: string
  phone: string
  website: string
  address: string
  licenseNumber: string
  accentColor: string
  taxLabel: string
  taxRate: number // percent, e.g. 8.875
  depositPct: number // percent of the total due up front
  quoteValidDays: number
  paymentTerms: string
  termsText: string
}

export const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Luxe Finishing Ltd.',
  tagline: 'Interior finishing and millwork',
  email: '',
  phone: '',
  website: '',
  address: '',
  licenseNumber: '',
  accentColor: '#1f4b3a',
  taxLabel: 'GST',
  taxRate: 5,
  depositPct: 50,
  quoteValidDays: 30,
  paymentTerms: 'Deposit due on acceptance. Balance due on completion.',
  termsText:
    'Quoted amounts cover labour and standard materials for the scope described above. ' +
    'Changes to scope after acceptance are quoted separately before any work proceeds. ' +
    'Measurements taken from the supplied floor plan are verified on site before ordering.'
}
