import { useEffect, useState } from 'react'
import { ScheduleEntry } from '../lib/ocr'

interface Props {
  entries: ScheduleEntry[]
  onAccept: (entries: ScheduleEntry[]) => void
}

// Mirrors DetectedDimensionsBanner's shape: a transient pill that only appears when a
// door/window schedule was actually found, expanding into a checklist so accepted
// entries are a deliberate choice, not something that lands in the quote unreviewed —
// OCR misreads an ID, a size, or a quantity often enough that blind trust isn't safe.
// Ported unchanged from the prototype.
export default function ScheduleBanner({ entries, onAccept }: Props) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // This component is mounted once (empty entries) well before OCR ever resolves, so a
  // lazy useState initializer over `entries` would only ever see that first, empty
  // array — re-sync explicitly whenever a fresh batch of results actually arrives.
  useEffect(() => {
    setChecked(new Set(entries.map(e => e.id)))
  }, [entries])

  if (entries.length === 0) return null

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const doorCount = entries.filter(e => e.kind === 'door').length
  const windowCount = entries.filter(e => e.kind === 'window').length
  const summary = [doorCount && `${doorCount} door${doorCount === 1 ? '' : 's'}`, windowCount && `${windowCount} window${windowCount === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="ocrBannerWrap schedule">
      <button className="ocrBanner" onClick={() => setOpen(!open)}>
        🚪 Found a door/window schedule: {summary} — tap to review
      </button>
      {open && (
        <div className="ocrPopover">
          {entries.map(e => (
            <label key={e.id} className="scheduleRow">
              <input type="checkbox" checked={checked.has(e.id)} onChange={() => toggle(e.id)} />
              <div>
                <div className="name">
                  {e.label} · {e.kind === 'door' ? 'Door' : 'Window'}
                </div>
                <div className="meta">
                  {e.widthIn}
                  {e.heightIn ? `×${e.heightIn}` : ''} in{e.quantity > 1 ? ` · qty ${e.quantity}` : ''}
                </div>
              </div>
            </label>
          ))}
          <button
            className="primary"
            style={{ width: '100%', marginTop: 8 }}
            disabled={checked.size === 0}
            onClick={() => {
              onAccept(entries.filter(e => checked.has(e.id)))
              setOpen(false)
            }}
          >
            Add {checked.size} item{checked.size === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  )
}
