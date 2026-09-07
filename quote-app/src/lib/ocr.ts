import { createWorker, PSM } from 'tesseract.js'

// Reads two kinds of things architects/measurers print directly on a floor plan:
//  - dimension labels (e.g. `12'-6" X 10'-0"` next to a room, or a lone `8'-0"` next
//    to a wall) — so the user can pick one as a calibration reference instead of
//    guessing a known length, and so a traced room can be cross-checked against what
//    the plan itself claims.
//  - a door/window schedule (a row like `D1  2'-8" X 6'-8"  (2)` or `W1 36X48`) — so
//    door/window line items can be added directly from the schedule, no tracing at all.
// Neither ever sets anything automatically — every result here is a *suggestion* the
// user still confirms (OCR misreads architectural text often enough that treating it
// as ground truth would silently corrupt a measurement or add a wrong line item).
//
// Ported unchanged from the LuxeQuoteApp prototype (PR #3) — this module is
// self-contained (no dependency on the app's data schema) and was already solid.

export interface DetectedDimension {
  id: string
  feet: number
  sourceText: string
  bbox: { x0: number; y0: number; x1: number; y1: number } // image-pixel space
  pairFeet?: [number, number] // both values, when this came from a "W x H" label
  pairAreaSqFt?: number
}

// A whole room read straight off the plan: a printed "W x H" label, plus whatever room
// name was printed nearest to it. Area and perimeter come from the label's own feet —
// no calibration needed, since the plan already states the real dimensions.
export interface DetectedRoom {
  id: string
  name: string
  widthFt: number
  heightFt: number
  areaSqFt: number
  perimeterFt: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  sourceText: string
}

export interface ScheduleEntry {
  id: string
  kind: 'door' | 'window'
  label: string // e.g. "D1", or just "Door" when no ID was found
  widthIn: number
  heightIn?: number
  quantity: number
  sourceText: string
}

// The plan's own printed scale note, parsed but not yet turned into feet-per-pixel —
// that last step needs to know how many pixels the render put per paper inch, which
// this module has no reason to know (it works the same on a PDF render or a plain
// photo). The caller — App.tsx, which does know, only for PDFs — does that conversion.
export interface DetectedScale {
  realFeetPerPaperInch: number
  label: string // the matched text itself, e.g. `1'=1/8"` — shown verbatim, not reworded
  sourceText: string
}

// Matches 12'-6", 12' 6", 12'6", bare 12', and — the case that matters most in
// practice — 12-6", because OCR drops the foot mark on printed plans far more often
// than not. Every real scan during development came back as "12-6"" or "14-0"", so a
// pattern that insists on the apostrophe reads a plan as having no dimensions at all.
//
// The separator is therefore a foot mark OR a hyphen, but never nothing: a bare number
// is not a dimension. The negative lookahead after the foot mark stops 30'' (a doubled
// apostrophe, which is how OCR sometimes renders an inch mark) being read as 30 feet —
// that would silently turn a 30-inch door into a 30-foot wall.
//
// Inches are constrained to 0-11 because that is what the notation means; it also stops
// hyphenated codes and dates on a title block from parsing as measurements.
const FOOT_MARK = String.raw`['’′]`
const INCH_MARK = String.raw`["”″]`
// A period is accepted as the separator too, but only when an inch mark follows: OCR
// renders 5'-6" as 5.6" often enough to lose a room over, while genuine decimal feet
// (12.5') ends in a foot mark and is caught by the first group instead. Requiring the
// inch mark is what keeps those two apart.
//
// One capture group per number, so PAIR_RE's groups stay 1-2 (width) and 3-4 (height).
const FEET_INCHES = String.raw`(\d{1,3}(?:\.\d+)?)\s*(?:${FOOT_MARK}(?!${FOOT_MARK})\s*-?\s*|-\s*|\.(?=\s*\d{1,2}\s*${INCH_MARK}))\s*((?:0?\d|1[01])(?:\.\d+)?)?\s*${INCH_MARK}?`
const PAIR_RE = new RegExp(`${FEET_INCHES}\\s*[xX×]\\s*${FEET_INCHES}`)
const SINGLE_RE = new RegExp(FEET_INCHES)

// Printed scale notes ("SCALE: 1/4" = 1'-0"", or a schedule row that just reads
// "1'=1/8"") give the plan's real feet-per-paper-inch directly — no calibration line
// needed at all, provided the caller also knows how many pixels the render put per
// paper inch (only true for a PDF page, where the physical page size is exact; see
// lib/pdfToImage.ts). Drafters write the ratio both ways round — paper-inches first
// ("1/4" = 1'-0"", the more common convention) or feet first ("1' = 1/8"", seen on this
// contractor's own plans) — so both orders are matched; the underlying scale is
// identical either way, only which side comes first differs.
const PAPER_INCH_SIDE = String.raw`(?:(\d{1,2})\s*\/\s*(\d{1,2})|(\d{1,2}(?:\.\d+)?))\s*${INCH_MARK}?`
// The real-world side of a scale note is shaped exactly like any other dimension label
// (a wall length, a room width) — reuse FEET_INCHES rather than a hand-rolled copy that
// requires an actual foot mark. A first version of this did exactly that, and would have
// silently missed a scale note on almost every real scan for the same reason a stricter
// FEET_INCHES once did: OCR drops the foot mark far more often than not.
const REAL_FEET_SIDE = FEET_INCHES
const SCALE_INCH_EQ_FEET_RE = new RegExp(`${PAPER_INCH_SIDE}\\s*=\\s*${REAL_FEET_SIDE}`)
const SCALE_FEET_EQ_INCH_RE = new RegExp(`${REAL_FEET_SIDE}\\s*=\\s*${PAPER_INCH_SIDE}`)
// A bare ratio (1:50, 1:100 — common on metric-drafted sets) only counts next to the
// word "scale": on its own, "1:50" reads as easily as a time or an unrelated ratio
// printed somewhere else on the sheet.
const SCALE_RATIO_RE = /\b1\s*:\s*(\d{2,4})\b/

function paperInches(num?: string, den?: string, whole?: string): number | undefined {
  if (num !== undefined && den !== undefined) {
    const n = Number(num)
    const d = Number(den)
    return d > 0 ? n / d : undefined
  }
  return whole !== undefined ? Number(whole) : undefined
}

// Real architectural scales run from tiny site plans (1"=100', i.e. 100 real feet per
// paper inch) to large detail blowups (3"=1', i.e. 1/3 real feet per paper inch).
// Outside that range the match is almost certainly something else on the sheet that
// happened to contain an "=" between two measurement-shaped tokens.
function isPlausibleScale(realFeetPerPaperInch: number): boolean {
  return realFeetPerPaperInch >= 0.1 && realFeetPerPaperInch <= 150
}

// Schedule rows: an ID prefix (D1, DR2, W1, WIN3...) at the start of the line, or a
// bare mention of "door"/"window" when there's no ID. Sizes there are as often given
// in plain inches (32 X 80) as feet-inches, so both are tried.
const SCHEDULE_ID_RE = /^\s*(DR|D|WIN|W)\s*-?\s*(\d{1,2})\b/i
const INCH_PAIR_RE = /(\d{2,3})\s*"?\s*[xX×]\s*(\d{2,3})\s*"?/
const QTY_RE = /\((\d{1,2})\)|\bqty\.?:?\s*(\d{1,2})\b/i

// Renders a measurement back in the notation a plan uses. The raw OCR text is not fit
// to show anyone: the same dimension comes back as 12-6", 12.6" or 12'-6" depending on
// how the scan went, and that string ends up on a line item a customer reads.
export function formatFeetInches(feet: number): string {
  const whole = Math.floor(feet)
  const inches = Math.round((feet - whole) * 12)
  // Rounding can land on 12 inches; carry it rather than printing 8'-12".
  if (inches === 12) return `${whole + 1}'-0"`
  return `${whole}'-${inches}"`
}

function toFeet(feetStr: string, inchesStr?: string): number {
  const feet = Number(feetStr) + (inchesStr ? Number(inchesStr) / 12 : 0)
  return Math.round(feet * 100) / 100
}

// A lone "6'" is as likely to be OCR noise (a stray tick mark, a page number, part of
// an unrelated code) as a real dimension; typical room/wall runs fall well inside this.
function isPlausibleFeet(feet: number): boolean {
  return feet >= 1.5 && feet <= 60
}

function isPlausibleOpeningWidth(inches: number): boolean {
  return inches >= 12 && inches <= 96
}

// Room names printed on plans are short, alphabetic, and usually one of a small set of
// words. Matching that vocabulary (rather than accepting any stray text) keeps title
// blocks, revision notes, and the architect's name from being read as rooms.
const ROOM_WORDS =
  /\b(KITCHEN|BEDROOM|BED|BATH(?:ROOM)?|LIVING|DINING|FAMILY|MASTER|PRIMARY|OFFICE|STUDY|DEN|GARAGE|CLOSET|W\.?I\.?C|LAUNDRY|UTILITY|MUD|HALL(?:WAY)?|ENTRY|FOYER|NOOK|PANTRY|PORCH|PATIO|DECK|BONUS|LOFT|SUITE|GREAT|REC|MEDIA|GYM|STORAGE|ROOM)\b/i

function isRoomNameLine(text: string): boolean {
  if (/\d/.test(text)) return false // dimension labels and callout numbers aren't names
  const cleaned = text.replace(/[^A-Za-z .'/-]/g, '').trim()
  if (cleaned.length < 3 || cleaned.length > 28) return false
  return ROOM_WORDS.test(cleaned)
}

function bboxCenter(b: { x0: number; y0: number; x1: number; y1: number }) {
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}

// Pairs each "W x H" label with the closest room name on the plan. Distance is measured
// between label centers and capped: a name on the far side of the plan is not this
// room's name, and an unmatched dimension is better left generically named than wrong.
function nameForDimension(
  dimBbox: { x0: number; y0: number; x1: number; y1: number },
  names: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[],
  maxDistance: number
): string | undefined {
  const dc = bboxCenter(dimBbox)
  let best: { text: string; dist: number } | undefined
  for (const n of names) {
    const nc = bboxCenter(n.bbox)
    const dist = Math.hypot(nc.x - dc.x, nc.y - dc.y)
    if (dist <= maxDistance && (!best || dist < best.dist)) best = { text: n.text, dist }
  }
  return best?.text
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, c => c.toUpperCase())
}

function parseScheduleLine(text: string, nextId: () => string): ScheduleEntry | null {
  const idMatch = text.match(SCHEDULE_ID_RE)
  const mentionsDoor = /\bdoor\b/i.test(text)
  const mentionsWindow = /\bwin(?:dow)?\b/i.test(text)

  let kind: 'door' | 'window' | null = null
  let label = ''
  if (idMatch) {
    const prefix = idMatch[1].toUpperCase()
    kind = prefix.startsWith('W') ? 'window' : 'door'
    label = `${prefix}${idMatch[2]}`
  } else if (mentionsDoor && !mentionsWindow) {
    kind = 'door'
  } else if (mentionsWindow && !mentionsDoor) {
    kind = 'window'
  }
  if (!kind) return null

  // Feet-inch pair first (e.g. 2'-8" X 6'-8"); schedules just as often give bare
  // inches with no foot mark at all (e.g. 32 X 80), so fall back to that.
  let widthIn: number | undefined
  let heightIn: number | undefined
  const feetPair = text.match(PAIR_RE)
  if (feetPair) {
    widthIn = toFeet(feetPair[1], feetPair[2]) * 12
    heightIn = toFeet(feetPair[3], feetPair[4]) * 12
  } else {
    const inchPair = text.match(INCH_PAIR_RE)
    if (inchPair) {
      widthIn = Number(inchPair[1])
      heightIn = Number(inchPair[2])
    }
  }
  if (widthIn === undefined || !isPlausibleOpeningWidth(widthIn)) return null

  const qtyMatch = text.match(QTY_RE)
  const rawQty = qtyMatch ? Number(qtyMatch[1] ?? qtyMatch[2]) : 1
  const quantity = rawQty > 0 && rawQty <= 50 ? rawQty : 1

  return {
    id: nextId(),
    kind,
    label: label || (kind === 'door' ? 'Door' : 'Window'),
    widthIn: Math.round(widthIn),
    heightIn: heightIn ? Math.round(heightIn) : undefined,
    quantity,
    sourceText: text
  }
}

function parseScaleLine(text: string): { realFeetPerPaperInch: number; label: string } | null {
  let m = text.match(SCALE_INCH_EQ_FEET_RE)
  if (m) {
    const paperIn = paperInches(m[1], m[2], m[3])
    const feet = m[4] !== undefined ? Number(m[4]) + (m[5] ? Number(m[5]) / 12 : 0) : undefined
    if (paperIn && feet) {
      const scale = feet / paperIn
      if (isPlausibleScale(scale)) return { realFeetPerPaperInch: scale, label: m[0].trim() }
    }
  }

  m = text.match(SCALE_FEET_EQ_INCH_RE)
  if (m) {
    const feet = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0)
    const paperIn = paperInches(m[3], m[4], m[5])
    if (paperIn && feet) {
      const scale = feet / paperIn
      if (isPlausibleScale(scale)) return { realFeetPerPaperInch: scale, label: m[0].trim() }
    }
  }

  if (/scale/i.test(text)) {
    const r = text.match(SCALE_RATIO_RE)
    if (r) {
      const ratio = Number(r[1])
      // A drafted ratio is unit-per-same-unit (1 inch of paper : 50 inches real) — divide
      // by 12 to land in the same real-feet-per-paper-inch terms as the other two forms.
      const scale = ratio / 12
      if (isPlausibleScale(scale)) return { realFeetPerPaperInch: scale, label: `1:${ratio}` }
    }
  }

  return null
}

// A worker-thread failure doesn't reliably reject tesseract.js's promise — it can just
// hang. Without a hard timeout, "Scanning the plan..." would stay on screen forever.
// The ceiling is generous because the scan runs in the background behind a visible
// indicator and never blocks tracing by hand: upscaling makes recognition slower, and a
// large plan on an old phone is the case that must not be cut off just short of done.
const OCR_TIMEOUT_MS = 45_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export interface ScanResult {
  dimensions: DetectedDimension[]
  scheduleEntries: ScheduleEntry[]
  rooms: DetectedRoom[]
  scaleNote: DetectedScale | null
}

export function scanPlan(imageUrl: string): Promise<ScanResult> {
  // Wraps the *whole* operation, not just recognize(): a worker that fails while
  // spawning or loading the core/language data can hang inside createWorker() too,
  // before there's even a recognize() promise to race against.
  return withTimeout(runOcr(imageUrl), OCR_TIMEOUT_MS, 'OCR timed out')
}

// Tesseract reads small type badly, and the labels on a plan are the smallest type on
// it. Scaling the image up so its long edge reaches TARGET_LONG_EDGE is the single
// biggest accuracy win available here — at the source resolution a plan came back with
// the foot marks mangled and half the dimensions missed; scaled up, every room read
// cleanly. Never scales *down* (that would throw away detail on a good scan) and is
// capped, because recognition cost grows with area and this runs on phones.
const TARGET_LONG_EDGE = 2800
const MAX_UPSCALE = 3

async function upscaleForOcr(imageUrl: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the plan image'))
    img.src = imageUrl
  })
  const longEdge = Math.max(image.naturalWidth, image.naturalHeight)
  const factor = Math.min(MAX_UPSCALE, TARGET_LONG_EDGE / longEdge)
  if (!(factor > 1.05)) return imageUrl

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * factor)
  canvas.height = Math.round(image.naturalHeight * factor)
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageUrl
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  // PNG, not JPEG: JPEG ringing around high-contrast text is exactly the artefact that
  // costs an apostrophe.
  return canvas.toDataURL('image/png')
}

async function runOcr(imageUrl: string): Promise<ScanResult> {
  // Worker, wasm core, AND the language model are all self-hosted (public/tesseract/).
  // The model used to come from Naptha's CDN to keep the repo small, but that made
  // scanning a plan depend on a third party being reachable — which stopped being an
  // acceptable trade the moment this became an installable offline app. A contractor
  // opening a plan in a basement with no signal should still get their rooms read.
  //
  // Shipped uncompressed with gzip:false rather than as the .gz tesseract.js expects by
  // default: a host that serves .gz with Content-Encoding: gzip has the browser silently
  // decompress it, and tesseract.js then tries to gunzip plain data and fails. Serving
  // it raw removes the ambiguity about who decompresses, and the CDN still compresses
  // it in transit.
  //
  // oem=1 (LSTM_ONLY, tesseract.js's default) only ever loads the "-lstm" core
  // variants — if that ever changes, the non-lstm core files need adding back too.
  const worker = await createWorker('eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/',
    langPath: '/tesseract',
    gzip: false,
    // tesseract.js keeps its own IndexedDB copy of the language model by default. Now
    // that the model is served from our own origin, the service worker already caches
    // it — and storing 5MB twice on a phone, in an app whose plans and photos compete
    // for the same budget, is a real cost for no benefit.
    cacheMethod: 'none'
  })
  try {
    // Sparse text (PSM 11), not the default automatic page segmentation. A floor plan is
    // not a page of prose: labels sit in unrelated places all over it, and the automatic
    // mode assumes columns and paragraphs, so it stitches text that merely shares a
    // baseline into one line — a room's dimension ran into the next room's name, and the
    // door schedule ran into the title block. Sparse mode reads each label on its own.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    const { data } = await worker.recognize(await upscaleForOcr(imageUrl))
    const lines = (data.lines ?? []) as OcrLine[]
    return parsePlanLines(lines)
  } finally {
    // Not awaited: a worker stuck on a hung fetch can be slow to actually terminate,
    // and cleanup taking a moment shouldn't delay the timeout result above from
    // reaching the caller.
    worker.terminate().catch(() => {})
  }
}

export interface OcrLine {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

// Split out from the OCR call itself so the whole interpretation step — what counts as a
// dimension, a schedule row, a room name, and which name belongs to which room — can be
// exercised directly against known text, without standing up the recognition engine.
export function parsePlanLines(lines: OcrLine[]): ScanResult {
  const dimensions: DetectedDimension[] = []
  const scheduleEntries: ScheduleEntry[] = []
  // Collected during the same pass, then paired up afterwards — a room's name and its
  // dimension label are separate OCR lines, so neither can be resolved in isolation.
  const roomNameLines: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = []
  const pairLabels: { a: number; b: number; text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = []
  let dimCounter = 0
  let schedCounter = 0
  // First one found wins — a scale note is normally printed once (occasionally twice,
  // main sheet plus title block, always agreeing), so there's no ambiguity to resolve.
  let scaleNote: DetectedScale | null = null

  for (const line of lines) {
    const text = line.text.trim()
    if (!text) continue

    // Scale notes are checked before anything else: "1/4" = 1'-0"" would otherwise get
    // read as a (implausibly short, and so discarded) dimension label instead.
    if (!scaleNote) {
      const parsed = parseScaleLine(text)
      if (parsed) {
        scaleNote = { ...parsed, sourceText: text }
        continue
      }
    }

    // Schedule rows are checked first and, if matched, don't also get read as a
    // plain dimension label (a schedule size shouldn't show up as a calibration
    // candidate too — it's not a wall or room length).
    const scheduleEntry = parseScheduleLine(text, () => `s${schedCounter++}`)
    if (scheduleEntry) {
      scheduleEntries.push(scheduleEntry)
      continue
    }

    if (isRoomNameLine(text)) {
      roomNameLines.push({ text, bbox: line.bbox })
      continue
    }

    const pair = text.match(PAIR_RE)
    if (pair) {
      const a = toFeet(pair[1], pair[2])
      const b = toFeet(pair[3], pair[4])
      if (isPlausibleFeet(a) && isPlausibleFeet(b)) {
        const pairAreaSqFt = Math.round(a * b * 10) / 10
        dimensions.push({ id: `d${dimCounter++}`, feet: a, sourceText: text, bbox: line.bbox, pairFeet: [a, b], pairAreaSqFt })
        dimensions.push({ id: `d${dimCounter++}`, feet: b, sourceText: text, bbox: line.bbox, pairFeet: [a, b], pairAreaSqFt })
        pairLabels.push({ a, b, text, bbox: line.bbox })
      }
      continue
    }

    const single = text.match(SINGLE_RE)
    if (single) {
      const a = toFeet(single[1], single[2])
      if (isPlausibleFeet(a)) {
        dimensions.push({ id: `d${dimCounter++}`, feet: a, sourceText: text, bbox: line.bbox })
      }
    }
  }

  // Name-matching radius scales with the plan so it means the same thing on a phone
  // photo as on a full-size scan. Measured from how far the recognized text itself
  // spans rather than the image dimensions, which this version's Page type omits.
  const extentX = lines.reduce((max, l) => Math.max(max, l.bbox.x1), 0)
  const extentY = lines.reduce((max, l) => Math.max(max, l.bbox.y1), 0)
  const maxNameDistance = Math.max(extentX, extentY, 800) * 0.12

  const rooms: DetectedRoom[] = dedupePairLabels(pairLabels).map((p, i) => {
    const matched = nameForDimension(p.bbox, roomNameLines, maxNameDistance)
    return {
      id: `r${i}`,
      name: matched ? titleCase(matched) : `Room ${i + 1}`,
      widthFt: p.a,
      heightFt: p.b,
      areaSqFt: Math.round(p.a * p.b * 10) / 10,
      perimeterFt: Math.round((p.a + p.b) * 2 * 10) / 10,
      bbox: p.bbox,
      sourceText: p.text
    }
  })

  return { dimensions: dedupeDimensions(dimensions), scheduleEntries: dedupeSchedule(scheduleEntries), rooms, scaleNote }
}

// The same label is frequently read twice (once per near-duplicate OCR line); collapse
// entries with the same value found in roughly the same spot on the plan.
function dedupeDimensions(items: DetectedDimension[]): DetectedDimension[] {
  const seen = new Set<string>()
  const out: DetectedDimension[] = []
  for (const item of items) {
    const key = `${item.feet}-${Math.round(item.bbox.x0 / 20)}-${Math.round(item.bbox.y0 / 20)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

// Same near-duplicate problem as dimensions: one printed label often comes back as two
// slightly different OCR lines, which would otherwise become two identical rooms.
function dedupePairLabels<T extends { a: number; b: number; bbox: { x0: number; y0: number } }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = `${item.a}x${item.b}-${Math.round(item.bbox.x0 / 40)}-${Math.round(item.bbox.y0 / 40)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function dedupeSchedule(items: ScheduleEntry[]): ScheduleEntry[] {
  const seen = new Set<string>()
  const out: ScheduleEntry[] = []
  for (const item of items) {
    const key = `${item.kind}-${item.label}-${item.widthIn}-${item.heightIn ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}
