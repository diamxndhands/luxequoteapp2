import { GlobalWorkerOptions, getDocument, PDFDocumentProxy } from 'pdfjs-dist'
// Vite's ?url suffix bundles the worker as its own asset and gives back the URL to load
// it from — self-hosted like tesseract's worker (see lib/ocr.ts), rather than pointing
// at a CDN. A contractor opening a PDF floor plan on a jobsite with no signal should get
// the same result as one with a good connection.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Floor plans are almost always vector PDFs — their native page size renders blurry at
// 1x scale, the same problem lib/ocr.ts's upscaling solves for photographed plans. This
// targets roughly the same long edge so tracing and OCR get equivalent resolution
// whichever route the plan came in through. Capped well above what any real page size
// needs, so a tiny page (a title block cropped to a few inches) doesn't get scaled to
// something absurd.
const TARGET_LONG_EDGE = 2400
const MAX_SCALE = 6

export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  const buffer = await file.arrayBuffer()
  return getDocument({ data: buffer }).promise
}

export interface RenderedPage {
  dataUrl: string
  // Pixels per *paper* inch this render used — derivable because a PDF page declares
  // its real physical size (1 point = 1/72 inch, per the PDF spec) and this is the only
  // place that knows the scale factor applied on top of that. Lets a printed scale note
  // ("1/4" = 1'-0"") on the plan be turned into feet-per-pixel with no calibration line
  // at all — see lib/ocr.ts's scale-note detection and App.tsx's use of it. Meaningless
  // for a photographed plan, which is why this only exists on the PDF path.
  pixelsPerInch: number
}

async function renderPage(pdf: PDFDocumentProxy, pageNumber: number, targetLongEdge: number): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(MAX_SCALE, targetLongEdge / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create a canvas to render the PDF page')
  // White background first: a PDF page is opaque in a viewer, but the canvas starts
  // transparent — without this, a plan with no fill on its own page renders onto
  // black once it reaches the same code path as an uploaded photo.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return { dataUrl: canvas.toDataURL('image/png'), pixelsPerInch: scale * 72 }
}

// Full resolution, for the page that's actually going to be traced/measured/OCR'd.
export function renderPageImage(pdf: PDFDocumentProxy, pageNumber: number): Promise<RenderedPage> {
  return renderPage(pdf, pageNumber, TARGET_LONG_EDGE)
}

// Small and fast, for a multi-page picker — nobody needs full resolution to recognize
// which page has the floor plan on it, and no one needs its DPI either.
export async function renderPageThumbnail(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  return (await renderPage(pdf, pageNumber, 300)).dataUrl
}
