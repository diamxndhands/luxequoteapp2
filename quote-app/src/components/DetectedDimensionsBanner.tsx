import { useState } from 'react'
import { DetectedDimension } from '../lib/ocr'

interface Props {
  status: 'idle' | 'scanning' | 'done' | 'error'
  dimensions: DetectedDimension[]
  onUse: (dimension: DetectedDimension) => void
}

// A transient overlay instead of a permanent sidebar card — matches the immersive,
// full-bleed canvas: it only takes up space while there's something to say, and
// disappears entirely on failure or a clean miss (manual calibration still works fine).
// Ported unchanged from the prototype.
export default function DetectedDimensionsBanner({ status, dimensions, onUse }: Props) {
  const [open, setOpen] = useState(false)

  if (status === 'idle' || status === 'error') return null
  if (status === 'scanning') return <div className="ocrBanner">Scanning plan for printed dimensions…</div>
  if (dimensions.length === 0) return null

  return (
    <div className="ocrBannerWrap">
      <button className="ocrBanner" onClick={() => setOpen(!open)}>
        📐 {dimensions.length} printed dimension{dimensions.length === 1 ? '' : 's'} found — tap to use
      </button>
      {open && (
        <div className="ocrPopover">
          {dimensions.map(d => (
            <div key={d.id} className="serviceItem">
              <div>
                <div className="name">{d.feet} ft</div>
                <div className="meta">from “{d.sourceText}”</div>
              </div>
              <button
                onClick={() => {
                  onUse(d)
                  setOpen(false)
                }}
              >
                Use
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
