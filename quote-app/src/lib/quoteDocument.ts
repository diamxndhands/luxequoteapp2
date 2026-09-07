import { Quote, QuoteLineItem } from '../types/quote'
import { BusinessProfile } from '../types/settings'

// One resolved shape that the on-screen document, the PDF, and the email body all read
// from. Without this the three renderers drift: the screen shows a deposit line the PDF
// forgets, or the email totals a cent differently. Anything a customer might compare
// side by side is computed exactly once, here. Adapted from the prototype's
// quoteDocument.ts — same principle, rebuilt against Quote/QuoteLineItem instead of
// QuoteRecord/QuoteLine (labor_amount/material_amount split, no separate Customer
// lookup since client info now lives directly on Quote).

export interface DocumentSection {
  section: string
  lines: QuoteLineItem[]
  subtotal: number
}

export interface QuoteDocument {
  number: string
  issuedOn: number
  validUntil?: number
  business: BusinessProfile
  client: {
    name: string
    address?: string
  }
  title: string
  sections: DocumentSection[]
  subtotal: number
  taxLabel: string
  taxRate: number
  taxAmount: number
  total: number
  depositPct: number
  depositAmount: number
  balanceAmount: number
  notes?: string
  paymentTerms: string
  terms: string
  status: Quote['status']
}

export function currency(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

export function longDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Quantities are measurements, not counts — "44.7 linear ft" reads right, "44.70" and
// "45" both read wrong (one is false precision, the other loses the measurement).
export function quantity(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function groupLines(lines: QuoteLineItem[]): DocumentSection[] {
  const order: string[] = []
  const bySection = new Map<string, QuoteLineItem[]>()
  for (const line of lines) {
    const section = line.section || 'General'
    if (!bySection.has(section)) {
      bySection.set(section, [])
      order.push(section)
    }
    bySection.get(section)!.push(line)
  }
  // "General" is the catch-all, so it reads last regardless of where the first
  // unattached line happened to be.
  order.sort((a, b) => (a === 'General' ? 1 : 0) - (b === 'General' ? 1 : 0))
  return order.map(section => {
    const sectionLines = bySection.get(section)!
    return { section, lines: sectionLines, subtotal: sectionLines.reduce((sum, l) => sum + l.total, 0) }
  })
}

export function buildQuoteDocument(quote: Quote, profile: BusinessProfile): QuoteDocument {
  const sections = groupLines(quote.line_items)
  const subtotal = quote.subtotal
  const taxAmount = quote.gst
  const taxRate = quote.subtotal > 0 ? Math.round((quote.gst / quote.subtotal) * 1000) / 10 : profile.taxRate
  const total = quote.total
  const depositPct = profile.depositPct
  const depositAmount = Math.round(total * (depositPct / 100) * 100) / 100

  return {
    number: quote.number ?? 'DRAFT',
    issuedOn: quote.created_at,
    validUntil: quote.valid_until,
    business: profile,
    client: {
      name: quote.client_name || 'Client',
      address: quote.client_address
    },
    title: quote.title ?? '',
    sections,
    subtotal,
    taxLabel: profile.taxLabel,
    taxRate,
    taxAmount,
    total,
    depositPct,
    depositAmount,
    balanceAmount: Math.round((total - depositAmount) * 100) / 100,
    notes: quote.notes,
    paymentTerms: profile.paymentTerms,
    terms: profile.termsText,
    status: quote.status
  }
}

// A readable fallback for anywhere a rendered document can't go: the OS share sheet,
// an SMS, or an email body when the customer's client strips formatting.
export function documentToText(doc: QuoteDocument): string {
  const out: string[] = []
  out.push(`${doc.business.name} — Quote ${doc.number}`)
  out.push(longDate(doc.issuedOn))
  out.push(`Prepared for ${doc.client.name}`)
  if (doc.title) out.push(doc.title)
  out.push('')
  for (const section of doc.sections) {
    out.push(`${section.section} — ${currency(section.subtotal)}`)
    for (const line of section.lines) {
      out.push(`  ${line.description}: ${quantity(line.quantity)} ${line.unit} = ${currency(line.total)}`)
    }
    out.push('')
  }
  out.push(`Subtotal: ${currency(doc.subtotal)}`)
  if (doc.taxAmount > 0) out.push(`${doc.taxLabel} (${doc.taxRate}%): ${currency(doc.taxAmount)}`)
  out.push(`Total: ${currency(doc.total)}`)
  if (doc.depositPct > 0) out.push(`Deposit to begin (${doc.depositPct}%): ${currency(doc.depositAmount)}`)
  if (doc.validUntil) out.push(`Valid until ${longDate(doc.validUntil)}`)
  return out.join('\n')
}
