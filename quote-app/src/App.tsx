import { useEffect, useRef, useState } from 'react'
import FloorPlanCanvas, { CanvasMode, CanvasTrace } from './components/FloorPlanCanvas'
import DetectedDimensionsBanner from './components/DetectedDimensionsBanner'
import ScheduleBanner from './components/ScheduleBanner'
import DetectedRoomsBanner from './components/DetectedRoomsBanner'
import { DetectedDimension, DetectedRoom, ScheduleEntry, scanPlan } from './lib/ocr'
import { getNextRoomColor, getRoomColor } from './lib/roomColors'
import { ScaleCalibration } from './types/project'
import { SERVICE_CATALOG_SEED } from './lib/serviceCatalogSeed'
import './styles.css'

// Proof-of-port harness: upload -> calibrate -> OCR (dimensions / door-window schedule /
// room detection) -> trace or accept rooms -> see them listed. This exercises every
// piece ported so far (FloorPlanCanvas, lib/ocr, lib/measurement, lib/roomColors)
// end-to-end against the new schema's Room/ScaleCalibration shapes.
//
// This is NOT the wizard — there's no service picker, no pricing review, no PDF
// generation UI here. Room/service tagging (Upload -> Rooms -> Services -> Pricing ->
// Quote) is the next build-order step, deferred on purpose so this step stays scoped to
// "does the ported plumbing actually work."

interface HarnessRoom {
  id: string
  label: string
  source: 'traced' | 'ocr_detected'
  points: number[]
  areaSqFt?: number
  perimeterFt?: number
}

export default function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [scale, setScale] = useState<ScaleCalibration | null>(null)
  const [rooms, setRooms] = useState<HarnessRoom[]>([])
  const [mode, setMode] = useState<CanvasMode>('none')
  const [detectedDimensions, setDetectedDimensions] = useState<DetectedDimension[]>([])
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([])
  const [detectedRooms, setDetectedRooms] = useState<DetectedRoom[]>([])
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [calibrationHint, setCalibrationHint] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!imageUrl) return
    setDetectedDimensions([])
    setScheduleEntries([])
    setDetectedRooms([])
    setOcrStatus('scanning')
    scanPlan(imageUrl)
      .then(result => {
        setDetectedDimensions(result.dimensions)
        setScheduleEntries(result.scheduleEntries)
        setDetectedRooms(result.rooms)
        setOcrStatus('done')
      })
      .catch(() => setOcrStatus('error'))
  }, [imageUrl])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageUrl(reader.result as string)
      setScale(null)
      setRooms([])
      setMode('none')
    }
    reader.readAsDataURL(file)
  }

  const roomIds = rooms.map(r => r.id)
  const roomTraces: CanvasTrace[] = rooms.map(r => ({ id: r.id, kind: 'room', points: r.points, color: getRoomColor(roomIds, r.id) }))

  function handleRoomDrawn(points: number[], name: string, areaSqFt: number, perimeterFt: number) {
    setRooms(prev => [...prev, { id: crypto.randomUUID(), label: name, source: 'traced', points, areaSqFt, perimeterFt }])
    setMode('none')
  }

  function acceptDetectedRooms(accepted: DetectedRoom[]) {
    // Printed-label rooms have real feet directly from the label (no calibration
    // needed) but no polygon on the plan — there's nothing to trace, so these get an
    // empty points array and just carry their measured area/perimeter.
    setRooms(prev => [
      ...prev,
      ...accepted.map(r => ({ id: crypto.randomUUID(), label: r.name, source: 'ocr_detected' as const, points: [], areaSqFt: r.areaSqFt, perimeterFt: r.perimeterFt }))
    ])
    setDetectedRooms(detectedRooms.filter(r => !accepted.includes(r)))
  }

  function handleRoomEdited(roomId: string, points: number[]) {
    setRooms(prev => prev.map(r => (r.id === roomId ? { ...r, points } : r)))
  }

  return (
    <div className="appShell">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleUpload} style={{ display: 'none' }} />
      <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #dedcd4', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => fileInputRef.current?.click()}>Upload plan</button>
        <button disabled={!imageUrl} onClick={() => setMode('calibrate')}>
          Calibrate
        </button>
        <button disabled={!scale} onClick={() => setMode('room')}>
          Trace room
        </button>
        <span style={{ fontSize: 12, color: '#96948a' }}>
          {scale ? `Scale set (${scale.realLength} ${scale.unit})` : 'No scale yet'} · {rooms.length} room{rooms.length === 1 ? '' : 's'} ·{' '}
          {SERVICE_CATALOG_SEED.length} seeded services
        </span>
      </div>

      <div className="canvasStage">
        <FloorPlanCanvas
          imageUrl={imageUrl}
          mode={mode}
          activeColor={mode === 'room' ? getNextRoomColor(rooms.length) : null}
          scale={scale}
          traces={roomTraces}
          detectedDimensions={detectedDimensions}
          calibrationHint={calibrationHint}
          onCalibrationConfirmed={next => {
            setScale(next)
            setCalibrationHint(null)
            setMode('none')
          }}
          onTraceDrawn={() => {
            // No non-room draw modes are exposed by this harness yet — service tagging
            // (which is what would drive point/span/line/polygon modes) is next-phase.
          }}
          onRoomDrawn={handleRoomDrawn}
          onTraceEdited={handleRoomEdited}
          onCancel={() => {
            setMode('none')
            setCalibrationHint(null)
          }}
        />

        {!imageUrl && (
          <div className="emptyState">
            <div className="emptyStateIcon">🗺️</div>
            <div className="emptyStateTitle">Upload a floor plan to begin</div>
            <button className="primary" onClick={() => fileInputRef.current?.click()}>
              Choose a plan
            </button>
          </div>
        )}

        <DetectedDimensionsBanner
          status={imageUrl ? ocrStatus : 'idle'}
          dimensions={detectedDimensions}
          onUse={d => {
            setCalibrationHint(d.feet)
            setMode('calibrate')
          }}
        />
        <ScheduleBanner entries={scheduleEntries} onAccept={() => {}} />
        <DetectedRoomsBanner rooms={detectedRooms} onAccept={acceptDetectedRooms} onDismiss={() => setDetectedRooms([])} />
      </div>

      {rooms.length > 0 && (
        <div style={{ padding: 12, background: '#fff', borderTop: '1px solid #dedcd4', fontSize: 12, maxHeight: 140, overflowY: 'auto' }}>
          {rooms.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 10 }}>
              <strong>{r.label}</strong>
              <span style={{ color: '#96948a' }}>
                {r.source} · {r.areaSqFt ?? '—'} sq ft · {r.perimeterFt ?? '—'} ft perimeter
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
