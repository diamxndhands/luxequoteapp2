import DetectedDimensionsBanner from '../../DetectedDimensionsBanner'
import DetectedRoomsBanner from '../../DetectedRoomsBanner'
import { DetectedDimension, DetectedRoom } from '../../../lib/ocr'
import { Room } from '../../../types/project'
import { ScaleCalibration } from '../../../types/project'
import { CanvasMode } from '../../FloorPlanCanvas'

interface Props {
  scale: ScaleCalibration | null
  mode: CanvasMode
  onCalibrateClick: () => void
  onTraceRoomClick: () => void
  ocrStatus: 'idle' | 'scanning' | 'done' | 'error'
  detectedDimensions: DetectedDimension[]
  onUseDimension: (d: DetectedDimension) => void
  detectedRooms: DetectedRoom[]
  onAcceptDetectedRooms: (rooms: DetectedRoom[]) => void
  onDismissDetectedRooms: () => void
  rooms: Room[]
  onRemoveRoom: (id: string) => void
}

// Calibration + room tracing/detection — the one step of the five that's fully real
// right now, since the underlying mechanics (canvas tracing, OCR room detection) were
// already ported. The door/window schedule banner is deliberately not shown here: those
// are service line items, not rooms, and have nowhere to go until the Services step
// exists to receive them.
export default function RoomsStep({
  scale,
  mode,
  onCalibrateClick,
  onTraceRoomClick,
  ocrStatus,
  detectedDimensions,
  onUseDimension,
  detectedRooms,
  onAcceptDetectedRooms,
  onDismissDetectedRooms,
  rooms,
  onRemoveRoom
}: Props) {
  // FloorPlanCanvas's own hint bar (the calibration form, the room-name prompt, the
  // Undo/Finish/Cancel bar) takes over the same top-left corner as this toolbar and the
  // OCR banners the moment a draw mode starts — it needs that space to itself (the
  // calibration form alone has a number input, a unit dropdown, and two buttons), so
  // everything below stands down while mode !== 'none' rather than fighting it for
  // space.
  const idle = mode === 'none'

  return (
    <>
      {idle && (
        <div className="uploadStepBar">
          <button onClick={onCalibrateClick}>{scale ? `Scale: ${scale.realLength} ${scale.unit}` : 'Calibrate scale'}</button>
          <button disabled={!scale} onClick={onTraceRoomClick}>
            Trace a room
          </button>
        </div>
      )}

      {idle && (
        <>
          <DetectedDimensionsBanner status={ocrStatus} dimensions={detectedDimensions} onUse={onUseDimension} />
          <DetectedRoomsBanner rooms={detectedRooms} onAccept={onAcceptDetectedRooms} onDismiss={onDismissDetectedRooms} />
        </>
      )}

      {rooms.length > 0 && (
        <div className="roomListPanel">
          {rooms.map(r => (
            <div key={r.id} className="serviceItem">
              <div>
                <div className="name">{r.label}</div>
                <div className="meta">
                  {r.source === 'ocr_detected' ? 'from plan' : 'traced'} · {r.area_sqft ?? '—'} sq ft · {r.perimeter_ft ?? '—'} ft perimeter
                </div>
              </div>
              <button className="removeBtn" onClick={() => onRemoveRoom(r.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
