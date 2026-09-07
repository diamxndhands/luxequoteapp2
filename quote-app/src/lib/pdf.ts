import { QuoteDocument, currency, longDate, quantity } from './quoteDocument'
import { loadImageSize } from './images'

// A quote a customer receives should look like a document, not a screenshot of a web
// page. This draws it directly in PDF primitives — real text, real vectors — so it
// stays crisp at any zoom, prints properly, and is a fraction of the size of a
// rasterised page capture. jsPDF is loaded on demand: it is a large dependency and most
// sessions never export anything. Ported from the prototype's pdf.ts, adjusted for the
// labor/material-split line item (the client-facing table shows one effective unit
// price, same as the historical quote template — the labor/material breakdown is a
// contractor-facing pricing-review concern, not something this document exposes) and
// the simplified client shape (no email/phone — that's CRM scope, out for this pass).

const PAGE = { width: 612, height: 792 } // US Letter, points
const M = { left: 48, right: 48, top: 48, bottom: 56 }
const CONTENT_WIDTH = PAGE.width - M.left - M.right

// Columns are laid out from the right edge inward so the money always lines up, which
// is the one alignment a customer's eye actually checks.
const COL = {
  desc: M.left,
  qty: M.left + 286,
  rate: M.left + 372,
  amountRight: PAGE.width - M.right
}

type RGB = [number, number, number]

const INK: RGB = [26, 25, 23]
const MUTED: RGB = [124, 120, 112]
const HAIRLINE: RGB = [222, 218, 210]
const BAND: RGB = [246, 244, 240]

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const int = parseInt(full, 16)
  if (Number.isNaN(int) || full.length !== 6) return [31, 75, 58]
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

export async function renderQuotePdf(doc: QuoteDocument): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const accent = hexToRgb(doc.business.accentColor)

  // Resolved before drawing starts: addImage needs real dimensions to avoid stretching
  // a logo, and decoding is async.
  let logo: { dataUrl: string; width: number; height: number } | null = null
  if (doc.business.logo) {
    try {
      const size = await loadImageSize(doc.business.logo)
      const maxW = 150
      const maxH = 46
      const scale = Math.min(maxW / size.width, maxH / size.height, 1)
      logo = { dataUrl: doc.business.logo, width: size.width * scale, height: size.height * scale }
    } catch {
      // A logo that won't decode is not a reason to fail the export.
      logo = null
    }
  }

  let y = 0
  let pageCount = 1

  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2])
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2])
  const setDraw = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])

  function text(value: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' } = {}) {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    pdf.setFontSize(opts.size ?? 9.5)
    setText(opts.color ?? INK)
    pdf.text(value, x, yy, { align: opts.align ?? 'left' })
  }

  function rule(yy: number, color: RGB = HAIRLINE, width = 0.6) {
    setDraw(color)
    pdf.setLineWidth(width)
    pdf.line(M.left, yy, PAGE.width - M.right, yy)
  }

  function drawPageFurniture() {
    // The accent bar is the only thing carried onto every page — it is what makes a
    // three-page quote read as one document.
    setFill(accent)
    pdf.rect(0, 0, PAGE.width, 5, 'F')
  }

  function startPage() {
    drawPageFurniture()
    y = M.top + 16
  }

  // Reserves vertical space, breaking to a new page when the block won't fit. Every
  // block-drawing helper below calls this first, which is what keeps a room's header
  // from stranding at the bottom of a page away from its rows.
  function ensure(height: number) {
    if (y + height <= PAGE.height - M.bottom) return
    pdf.addPage()
    pageCount += 1
    startPage()
  }

  startPage()

  // ---- Letterhead -------------------------------------------------------------
  const headTop = y
  if (logo) {
    pdf.addImage(logo.dataUrl, imageFormat(logo.dataUrl), M.left, y, logo.width, logo.height)
    y += logo.height + 8
  }
  text(doc.business.name, M.left, y + 2, { size: logo ? 10.5 : 17, bold: true })
  y += logo ? 12 : 20

  const contactLines = [
    doc.business.tagline,
    doc.business.address,
    [doc.business.phone, doc.business.email].filter(Boolean).join('  ·  '),
    doc.business.website,
    doc.business.licenseNumber ? `Lic. ${doc.business.licenseNumber}` : ''
  ].filter(Boolean)
  for (const line of contactLines) {
    text(line, M.left, y, { size: 8.2, color: MUTED })
    y += 11
  }

  // Right-hand document identity, drawn from the same top edge as the letterhead.
  const rightX = PAGE.width - M.right
  text('QUOTE', rightX, headTop + 14, { size: 21, bold: true, align: 'right', color: accent })
  let metaY = headTop + 32
  const meta: [string, string][] = [
    ['Quote no.', doc.number],
    ['Issued', longDate(doc.issuedOn)]
  ]
  if (doc.validUntil) meta.push(['Valid until', longDate(doc.validUntil)])
  for (const [label, value] of meta) {
    text(label, rightX - 92, metaY, { size: 8.2, color: MUTED, align: 'right' })
    text(value, rightX, metaY, { size: 9, bold: true, align: 'right' })
    metaY += 13
  }

  y = Math.max(y, metaY) + 10
  rule(y)
  y += 22

  // ---- Prepared for -----------------------------------------------------------
  text('PREPARED FOR', M.left, y, { size: 7.6, color: MUTED, bold: true })
  text('PROJECT', COL.qty, y, { size: 7.6, color: MUTED, bold: true })
  y += 14
  text(doc.client.name, M.left, y, { size: 12, bold: true })
  text(doc.title || '—', COL.qty, y, { size: 10 })
  y += 13
  if (doc.client.address) {
    text(doc.client.address, M.left, y, { size: 8.5, color: MUTED })
    y += 11
  }
  y += 14

  // ---- Line item table --------------------------------------------------------
  function drawTableHead() {
    ensure(26)
    text('DESCRIPTION', COL.desc, y, { size: 7.6, color: MUTED, bold: true })
    text('QTY', COL.qty, y, { size: 7.6, color: MUTED, bold: true })
    text('RATE', COL.rate, y, { size: 7.6, color: MUTED, bold: true })
    text('AMOUNT', COL.amountRight, y, { size: 7.6, color: MUTED, bold: true, align: 'right' })
    y += 7
    rule(y, HAIRLINE, 0.8)
    y += 4
  }

  drawTableHead()

  for (const section of doc.sections) {
    ensure(46)
    // Section band: the whole reason the quote is grouped at all is so a customer can
    // see what each room (or project-level category) costs without adding up rows.
    setFill(BAND)
    pdf.rect(M.left, y, CONTENT_WIDTH, 20, 'F')
    setFill(accent)
    pdf.rect(M.left, y, 2.5, 20, 'F')
    text(section.section, M.left + 10, y + 13.5, { size: 9.5, bold: true })
    text(currency(section.subtotal), COL.amountRight - 6, y + 13.5, { size: 9.5, bold: true, align: 'right' })
    y += 27

    for (const line of section.lines) {
      const descWidth = COL.qty - COL.desc - 14
      const wrapped = pdf.splitTextToSize(line.description, descWidth) as string[]
      const rowHeight = Math.max(wrapped.length * 11, 13) + 7
      ensure(rowHeight)
      const rowTop = y
      // One effective unit price for the client-facing table — the labor/material split
      // that drives it is a contractor-side pricing-review concern, not shown here.
      const effectiveRate = line.quantity > 0 ? line.total / line.quantity : line.total
      wrapped.forEach((chunk, i) => text(chunk, COL.desc, rowTop + i * 11, { size: 9.2 }))
      text(`${quantity(line.quantity)} ${line.unit}`, COL.qty, rowTop, { size: 9.2, color: MUTED })
      text(currency(effectiveRate), COL.rate, rowTop, { size: 9.2, color: MUTED })
      text(currency(line.total), COL.amountRight, rowTop, { size: 9.2, align: 'right' })
      y = rowTop + rowHeight
    }
    y += 4
  }

  // ---- Totals -----------------------------------------------------------------
  ensure(120)
  y += 6
  const totalsLeft = PAGE.width - M.right - 250
  setDraw(HAIRLINE)
  pdf.setLineWidth(0.6)
  pdf.line(totalsLeft, y, PAGE.width - M.right, y)
  y += 16

  function totalRow(label: string, value: string, opts: { bold?: boolean; size?: number; color?: RGB } = {}) {
    text(label, totalsLeft, y, { size: opts.size ?? 9.5, color: opts.color ?? MUTED, bold: opts.bold })
    text(value, COL.amountRight, y, { size: opts.size ?? 9.5, bold: opts.bold ?? true, align: 'right', color: opts.color ?? INK })
    y += 16
  }

  totalRow('Subtotal', currency(doc.subtotal))
  if (doc.taxAmount > 0) totalRow(`${doc.taxLabel} (${doc.taxRate}%)`, currency(doc.taxAmount))

  y += 2
  setFill(BAND)
  pdf.rect(totalsLeft, y - 12, 250, 28, 'F')
  text('Total', totalsLeft + 10, y + 6, { size: 11, bold: true })
  text(currency(doc.total), COL.amountRight - 10, y + 6, { size: 13, bold: true, align: 'right', color: accent })
  y += 34

  if (doc.depositPct > 0) {
    totalRow(`Deposit to begin (${doc.depositPct}%)`, currency(doc.depositAmount), { color: INK })
    totalRow('Balance on completion', currency(doc.balanceAmount))
  }
  y += 12

  // ---- Notes, terms, signature ------------------------------------------------
  function block(title: string, body: string, size = 8.4) {
    if (!body.trim()) return
    const wrapped = pdf.splitTextToSize(body, CONTENT_WIDTH) as string[]
    ensure(wrapped.length * (size + 2.6) + 26)
    text(title, M.left, y, { size: 7.6, color: MUTED, bold: true })
    y += 13
    wrapped.forEach(chunk => {
      text(chunk, M.left, y, { size, color: MUTED })
      y += size + 2.6
    })
    y += 12
  }

  block('NOTES', doc.notes ?? '')
  block('PAYMENT TERMS', doc.paymentTerms)
  block('TERMS AND CONDITIONS', doc.terms, 7.6)

  ensure(70)
  y += 6
  text('ACCEPTED BY', M.left, y, { size: 7.6, color: MUTED, bold: true })
  y += 30
  setDraw(HAIRLINE)
  pdf.setLineWidth(0.6)
  pdf.line(M.left, y, M.left + 230, y)
  pdf.line(M.left + 260, y, M.left + 400, y)
  y += 12
  text('Signature', M.left, y, { size: 7.8, color: MUTED })
  text('Date', M.left + 260, y, { size: 7.8, color: MUTED })

  // Footers last: the page total isn't known until every page exists.
  const total = pdf.getNumberOfPages()
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page)
    const footY = PAGE.height - 30
    text(`${doc.business.name} · Quote ${doc.number}`, M.left, footY, { size: 7.6, color: MUTED })
    text(`Page ${page} of ${total}`, PAGE.width - M.right, footY, { size: 7.6, color: MUTED, align: 'right' })
  }

  return pdf.output('blob')
}

export function quoteFileName(doc: QuoteDocument): string {
  const client = doc.client.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
  return `Quote-${doc.number}${client ? `-${client}` : ''}.pdf`
}

// Triggering the save through a temporary object URL rather than handing jsPDF the
// filename keeps one download path for every browser, including the iOS case where the
// blob has to be opened rather than saved.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoked on the next tick: revoking synchronously races the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
