import { useRef } from 'react'

interface Props {
  imageUrl: string | null
  ocrStatus: 'idle' | 'scanning' | 'done' | 'error'
  onUpload: (file: File) => void
}

// Just the upload action, per the spec's flow — calibrating and tracing happen in the
// Rooms step once there's a plan to work against. OCR starts scanning immediately on
// upload (it's slow enough that starting early matters) but its results surface as
// interactive banners in the Rooms step, not here.
export default function UploadStep({ imageUrl, ocrStatus, onUpload }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
        }}
      />
      {!imageUrl ? (
        <div className="emptyState">
          <div className="emptyStateIcon">🗺️</div>
          <div className="emptyStateTitle">Upload a floor plan to begin</div>
          <button className="primary" onClick={() => fileInputRef.current?.click()}>
            Choose a plan
          </button>
        </div>
      ) : (
        <div className="uploadStepBar">
          <button onClick={() => fileInputRef.current?.click()}>Replace plan</button>
          {ocrStatus === 'scanning' && <span className="meta">Scanning plan for text…</span>}
        </div>
      )}
    </>
  )
}
