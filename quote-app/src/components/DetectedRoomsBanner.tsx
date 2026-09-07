import { useEffect, useState } from 'react'
import { DetectedRoom } from '../lib/ocr'

interface Props {
  rooms: DetectedRoom[]
  onAccept: (rooms: DetectedRoom[]) => void
  onDismiss: () => void
}

// The payoff of reading the plan's own printed labels: every room on it, measured, with
// nothing traced by hand. Still a review step rather than an auto-apply — OCR misreads a
// dimension often enough that silently pricing off it would be worse than useless.
// Ported unchanged from the prototype (PR #3) — this is the concrete answer to the
// spec's "magic wand" room-selection question that the audit turned up: not a flood-fill
// off the plan's wall geometry, but a printed-dimension reader with the same "confirm
// before it counts" posture as the rest of the OCR pipeline. Manual tracing (the room
// draw_mode in FloorPlanCanvas) remains the fallback for plans without printed dims.
export default function DetectedRoomsBanner({ rooms, onAccept, onDismiss }: Props) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // Mounted long before OCR resolves, so a lazy initializer would only ever see the
  // first (empty) batch — re-sync whenever a fresh set of results actually arrives.
  useEffect(() => {
    setChecked(new Set(rooms.map(r => r.id)))
  }, [rooms])

  if (rooms.length === 0) return null

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalArea = rooms.filter(r => checked.has(r.id)).reduce((sum, r) => sum + r.areaSqFt, 0)

  return (
    <div className="ocrBannerWrap rooms">
      <button className="ocrBanner rooms" onClick={() => setOpen(!open)}>
        📐 Found {rooms.length} room{rooms.length === 1 ? '' : 's'} on this plan — tap to review
      </button>
      {open && (
        <div className="ocrPopover wide">
          <p className="ocrPopoverNote">
            Read from the dimensions printed on the plan. No calibration needed — check the ones you want added.
          </p>
          {rooms.map(r => (
            <label key={r.id} className="scheduleRow">
              <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
              <div>
                <div className="name">{r.name}</div>
                <div className="meta">
                  {r.widthFt}′ × {r.heightFt}′ · {r.areaSqFt} sq ft · {r.perimeterFt} ft perimeter
                </div>
              </div>
            </label>
          ))}
          <div className="ocrPopoverActions">
            <button onClick={onDismiss}>Dismiss</button>
            <button
              className="primary"
              disabled={checked.size === 0}
              onClick={() => onAccept(rooms.filter(r => checked.has(r.id)))}
            >
              Add {checked.size} room{checked.size === 1 ? '' : 's'} · {Math.round(totalArea)} sq ft
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
