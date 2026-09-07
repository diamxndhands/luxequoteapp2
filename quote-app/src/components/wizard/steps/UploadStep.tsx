import { useRef, useState } from 'react'
// Type-only: erased at compile time, so this alone doesn't pull pdfjs-dist into the
// bundle. The runtime module (lib/pdfToImage, which does import it) is loaded on
// demand below, the same way lib/pdf.ts's jsPDF dependency already is — most uploads
// are photos, and pdfjs-dist is large enough to not want it in every session's bundle.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { fileToDataUrl } from '../../../lib/projectStore'
import { isPdfFile } from '../../../lib/pdfFile'

interface Props {
  imageUrl: string | null
  ocrStatus: 'idle' | 'scanning' | 'done' | 'error'
  // Takes the resolved raster image, not the raw File — PDF or photo, calibration/
  // tracing/OCR all downstream of this step only ever deal in images, so resolving a
  // PDF page down to one happens here rather than leaking pdfjs into the rest of the
  // app.
  onUpload: (imageDataUrl: string) => void
}

interface PendingPdf {
  doc: PDFDocumentProxy
  pageCount: number
  thumbnails: (string | null)[] // filled in as each renders; null while pending
}

// Just the upload action, per the spec's flow — calibrating and tracing happen in the
// Rooms step once there's a plan to work against. OCR starts scanning immediately on
// upload (it's slow enough that starting early matters) but its results surface as
// interactive banners in the Rooms step, not here.
//
// Floor plans arrive as PDFs as often as photos. A single-page PDF resolves straight
// through; a multi-page one (a plan set — cover sheet, multiple floors) stops for a
// page picker rather than guessing page 1 is the right one, same "confirm before it
// counts" posture as the OCR banners.
export default function UploadStep({ imageUrl, ocrStatus, onUpload }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingPdf | null>(null)
  const [busy, setBusy] = useState<'reading' | 'rendering' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    if (!isPdfFile(file)) {
      onUpload(await fileToDataUrl(file))
      return
    }

    setBusy('reading')
    try {
      const { loadPdf, renderPageImage, renderPageThumbnail } = await import('../../../lib/pdfToImage')
      const doc = await loadPdf(file)
      if (doc.numPages <= 1) {
        setBusy('rendering')
        onUpload(await renderPageImage(doc, 1))
        setBusy(null)
        return
      }
      // More than one page: hold here and render thumbnails for a picker instead of
      // silently assuming page 1 is the floor plan.
      const thumbnails: (string | null)[] = new Array(doc.numPages).fill(null)
      setPending({ doc, pageCount: doc.numPages, thumbnails })
      setBusy(null)
      thumbnails.forEach((_, i) => {
        renderPageThumbnail(doc, i + 1).then(dataUrl => {
          setPending(prev => {
            if (!prev || prev.doc !== doc) return prev
            const next = [...prev.thumbnails]
            next[i] = dataUrl
            return { ...prev, thumbnails: next }
          })
        })
      })
    } catch (e) {
      console.error('Failed to read PDF:', e)
      setError('Could not read that PDF — try a different file, or export the plan as an image.')
      setBusy(null)
    }
  }

  async function pickPage(pageNumber: number) {
    if (!pending) return
    setBusy('rendering')
    try {
      const { renderPageImage } = await import('../../../lib/pdfToImage')
      const dataUrl = await renderPageImage(pending.doc, pageNumber)
      setPending(null)
      onUpload(dataUrl)
    } catch (e) {
      console.error('Failed to render PDF page:', e)
      setError('Could not render that page — try a different one.')
    } finally {
      setBusy(null)
    }
  }

  if (pending) {
    return (
      <div className="pdfPagePicker">
        <div className="pdfPagePickerInner">
          <h2>Which page is the floor plan?</h2>
          <p className="meta">This PDF has {pending.pageCount} pages.</p>
          <div className="pdfThumbGrid">
            {pending.thumbnails.map((thumb, i) => (
              <button key={i} className="pdfThumb" disabled={busy === 'rendering'} onClick={() => pickPage(i + 1)}>
                {thumb ? <img src={thumb} alt={`Page ${i + 1}`} /> : <div className="pdfThumbLoading">…</div>}
                <span>Page {i + 1}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <input
        type="file"
        accept="image/*,application/pdf"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      {!imageUrl && !busy ? (
        <div className="emptyState">
          <div className="emptyStateIcon">🗺️</div>
          <div className="emptyStateTitle">Upload a floor plan to begin</div>
          <button className="primary" onClick={() => fileInputRef.current?.click()}>
            Choose a plan
          </button>
          <div className="meta">Image or PDF</div>
          {error && <div className="anomalyFlag">{error}</div>}
        </div>
      ) : busy ? (
        <div className="emptyState">
          <div className="emptyStateTitle">{busy === 'reading' ? 'Reading PDF…' : 'Rendering page…'}</div>
        </div>
      ) : (
        <div className="uploadStepBar">
          <button onClick={() => fileInputRef.current?.click()}>Replace plan</button>
          {ocrStatus === 'scanning' && <span className="meta">Scanning plan for text…</span>}
          {error && <span className="anomalyFlag">{error}</span>}
        </div>
      )}
    </>
  )
}
