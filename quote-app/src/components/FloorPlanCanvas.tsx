import { Fragment, useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect, Text } from 'react-konva'
import useImage from 'use-image'
import { ScaleCalibration } from '../types/project'
import { pixelDistance, polygonAreaPx, polylineLengthPx, realFeetPerPixel, round1 } from '../lib/measurement'
import { DetectedDimension } from '../lib/ocr'

// Ported from the prototype's FloorPlanCanvas.tsx, adapted to be schema-agnostic: the
// original keyed everything off a hardcoded ServiceType enum (colors, trim-checklist,
// what a "room" trace even was). This version knows nothing about services or the
// catalog — it draws and edits traces the caller hands it, colored however the caller
// says, and reports raw geometry back. The one exception is 'room': closing a room
// polygon still needs an in-canvas name prompt (there's no sensible place to put that
// outside the canvas, since it has to happen right where the shape was just drawn), but
// what happens after that — offering to bulk-apply baseboard/crown/quarter-round against
// the room's own perimeter — moved out to the wizard, since that's a decision about the
// service catalog the canvas has no business knowing about.

export type TraceKind = 'point' | 'span' | 'line' | 'polygon' | 'room'
export type CanvasMode = 'none' | 'calibrate' | TraceKind

export interface CanvasTrace {
  id: string
  kind: TraceKind
  points: number[] // flattened [x1,y1,x2,y2,...] in image pixel space
  color: string
}

interface Props {
  imageUrl: string | null
  mode: CanvasMode
  // Color for the in-progress trace/room being drawn right now. Ignored when mode is
  // 'none' or 'calibrate'.
  activeColor: string | null
  scale: ScaleCalibration | null
  traces: CanvasTrace[]
  detectedDimensions: DetectedDimension[]
  calibrationHint: number | null
  onCalibrationConfirmed: (scale: ScaleCalibration) => void
  // point/span/line/polygon kinds finish here with their raw points.
  onTraceDrawn: (points: number[]) => void
  // 'room' kind finishes here instead, since closing a room polygon prompts for a name
  // right on the canvas before it commits.
  onRoomDrawn: (points: number[], name: string, areaSqFt: number, perimeterFt: number) => void
  onTraceEdited: (traceId: string, points: number[]) => void
  onCancel: () => void
}

const HINTS: Record<CanvasMode, string> = {
  none: '',
  calibrate: 'Click the two ends of something you know the real length of — a wall, a door, a countertop.',
  point: 'Click on the plan to place it.',
  span: 'Click both edges of the opening to measure its width.',
  line: 'Click along the run to trace it. Click the start point again, or press Finish, when you’re done.',
  polygon: 'Click around the area to trace it. Click the start point again, or press Finish, to close it.',
  room: 'Click around the room’s outline to trace it. Click the start point again, or press Finish — this measures the floor area and perimeter.'
}

const MIN_ZOOM_FACTOR = 0.4
const MAX_ZOOM_FACTOR = 15
const SNAP_PX = 10 // screen pixels within which clicking near the first point closes a shape

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export default function FloorPlanCanvas({
  imageUrl,
  mode,
  activeColor,
  scale,
  traces,
  detectedDimensions,
  calibrationHint,
  onCalibrationConfirmed,
  onTraceDrawn,
  onRoomDrawn,
  onTraceEdited,
  onCancel
}: Props) {
  const [image] = useImage(imageUrl || '')
  const [draftPoints, setDraftPoints] = useState<number[]>([])
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [zoomPct, setZoomPct] = useState(100)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  // Set once the two calibration points are placed; holds the reference line on screen
  // and blocks further clicks while the real-length form below is waiting for input.
  const [pendingCalibration, setPendingCalibration] = useState<{ points: number[]; pixelLength: number } | null>(null)
  const [calibrateValue, setCalibrateValue] = useState('')
  const [calibrateUnit, setCalibrateUnit] = useState<'ft' | 'in'>('ft')
  // Set once a room polygon is closed; holds it (and its computed area/perimeter) while
  // the name prompt below is waiting for input.
  const [pendingRoom, setPendingRoom] = useState<{ points: number[]; areaSqFt: number; perimeterFt: number } | null>(null)
  const [roomName, setRoomName] = useState('')
  // A mis-traced wall used to mean delete-and-redraw the whole thing. Tapping an
  // already-committed trace while idle selects it for reshaping instead: editPoints is a
  // local working copy dragged around freely, only sent up via onTraceEdited once "Done"
  // commits it (a stray background click or Escape discards it instead).
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [editPoints, setEditPoints] = useState<number[] | null>(null)

  const stageRef = useRef<Konva.Stage | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitDoneForUrl = useRef<string | null>(null)
  // Mirrors draftPoints so click handling always reads the latest value even if it runs
  // before React has re-rendered (state alone can be one click stale in that window).
  const draftPointsRef = useRef<number[]>([])

  function updateDraft(next: number[]) {
    draftPointsRef.current = next
    setDraftPoints(next)
  }

  // Track available space so the plan can fill the panel instead of a fixed box.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function fitToScreen() {
    const stage = stageRef.current
    if (!stage || !image || !containerSize.width || !containerSize.height) return
    const fitScale = Math.min(containerSize.width / image.width, containerSize.height / image.height)
    stage.scale({ x: fitScale, y: fitScale })
    stage.position({
      x: (containerSize.width - image.width * fitScale) / 2,
      y: (containerSize.height - image.height * fitScale) / 2
    })
    stage.batchDraw()
    setZoomPct(100)
  }

  // Fit the whole plan into view the first time it (and the container) are ready, and
  // again whenever a new plan is uploaded. Deliberately does not re-run on every resize
  // so it never clobbers a zoom/pan the user already made.
  useEffect(() => {
    if (!image || !containerSize.width || !containerSize.height) return
    if (fitDoneForUrl.current === imageUrl) return
    fitDoneForUrl.current = imageUrl
    fitToScreen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, containerSize.width, containerSize.height, imageUrl])

  function zoomAtPoint(pointer: { x: number; y: number }, factor: number) {
    const stage = stageRef.current
    if (!stage || !image || !containerSize.width) return
    const fitScale = Math.min(containerSize.width / image.width, containerSize.height / image.height)
    const oldScale = stage.scaleX()
    const newScale = clamp(oldScale * factor, fitScale * MIN_ZOOM_FACTOR, fitScale * MAX_ZOOM_FACTOR)
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale
    }
    stage.scale({ x: newScale, y: newScale })
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale
    })
    stage.batchDraw()
    setZoomPct(Math.round((newScale / fitScale) * 100))
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Pinch-to-zoom on a trackpad arrives as a wheel event with ctrlKey set.
      const factor = Math.exp(-e.evt.deltaY * 0.01)
      const pointer = stage.getPointerPosition()
      if (pointer) zoomAtPoint(pointer, factor)
    } else {
      // Plain scroll/trackpad swipe pans the plan.
      stage.position({ x: stage.x() - e.evt.deltaX, y: stage.y() - e.evt.deltaY })
      stage.batchDraw()
    }
  }

  function zoomButton(factor: number) {
    const stage = stageRef.current
    if (!stage) return
    zoomAtPoint({ x: containerSize.width / 2, y: containerSize.height / 2 }, factor)
  }

  function getPos(e: Konva.KonvaEventObject<Event>): { x: number; y: number } | null {
    const stage = e.target.getStage()
    if (!stage) return null
    return stage.getRelativePointerPosition()
  }

  function distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x2 - x1, y2 - y1)
  }

  function finishShape(points: number[]) {
    // A room polygon doesn't go straight to onRoomDrawn — it needs a name first, same
    // as calibration needs a real-length confirm before it commits.
    if (mode === 'room' && scale) {
      const ftPerPx = realFeetPerPixel(scale)
      const areaSqFt = round1(polygonAreaPx(points) * ftPerPx * ftPerPx)
      const perimeterFt = round1(polylineLengthPx([...points, points[0], points[1]]) * ftPerPx)
      setPendingRoom({ points, areaSqFt, perimeterFt })
      const roomCount = traces.filter(t => t.kind === 'room').length
      setRoomName(`Room ${roomCount + 1}`)
      updateDraft([])
      return
    }
    onTraceDrawn(points)
    updateDraft([])
  }

  // Leaving idle mode for any reason (starting a new trace, calibrating) always drops
  // an in-progress edit rather than risking it being silently committed or lost later.
  useEffect(() => {
    if (mode !== 'none') {
      setSelectedTraceId(null)
      setEditPoints(null)
    }
  }, [mode])

  function selectTrace(t: CanvasTrace) {
    if (mode !== 'none') return
    setSelectedTraceId(t.id)
    setEditPoints([...t.points])
  }

  function cancelEdit() {
    setSelectedTraceId(null)
    setEditPoints(null)
  }

  function commitEdit() {
    if (selectedTraceId && editPoints) onTraceEdited(selectedTraceId, editPoints)
    setSelectedTraceId(null)
    setEditPoints(null)
  }

  function movePoint(index: number, x: number, y: number) {
    setEditPoints(prev => {
      if (!prev) return prev
      const next = [...prev]
      next[index * 2] = x
      next[index * 2 + 1] = y
      return next
    })
  }

  function renderHandles(points: number[], color: string) {
    const s = stageRef.current?.scaleX() || 1
    const handles = []
    for (let i = 0; i < points.length; i += 2) {
      const idx = i / 2
      handles.push(
        <Circle
          key={idx}
          x={points[i]}
          y={points[i + 1]}
          radius={7 / s}
          fill="#fff"
          stroke={color}
          strokeWidth={2 / s}
          draggable
          onDragMove={e => movePoint(idx, e.target.x(), e.target.y())}
        />
      )
    }
    return handles
  }

  function confirmRoom() {
    if (!pendingRoom) return
    onRoomDrawn(pendingRoom.points, roomName.trim() || 'Room', pendingRoom.areaSqFt, pendingRoom.perimeterFt)
    setPendingRoom(null)
    setRoomName('')
  }

  function redrawRoom() {
    setPendingRoom(null)
    setRoomName('')
  }

  function confirmCalibration() {
    const realLength = Number(calibrateValue)
    if (!pendingCalibration || !(realLength > 0)) return
    onCalibrationConfirmed({ pixelLength: pendingCalibration.pixelLength, realLength, unit: calibrateUnit })
    setPendingCalibration(null)
    setCalibrateValue('')
  }

  function redrawCalibration() {
    setPendingCalibration(null)
    setCalibrateValue('')
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (mode === 'none') {
      // A trace's own click handler stops propagation before this ever runs, so
      // reaching here with a selection open means the background got clicked instead —
      // discard the in-progress edit rather than leaving it in limbo.
      if (selectedTraceId) cancelEdit()
      return
    }
    const pos = getPos(e)
    if (!pos) return
    const stage = stageRef.current
    const currentScale = stage ? stage.scaleX() : 1

    if (mode === 'calibrate') {
      if (pendingCalibration) return // waiting on the real-length form below; ignore stray clicks
      const next = [...draftPointsRef.current, pos.x, pos.y]
      if (next.length === 4) {
        const [x1, y1, x2, y2] = next
        setPendingCalibration({ points: next, pixelLength: distance(x1, y1, x2, y2) })
        // Pre-fills from a detected printed dimension when the user picked "Use" on one;
        // still shown in the editable field below so a misread OCR value can be fixed.
        setCalibrateValue(calibrationHint != null ? String(calibrationHint) : '')
        setCalibrateUnit('ft')
        updateDraft([])
      } else {
        updateDraft(next)
      }
      return
    }

    if (mode === 'point') {
      onTraceDrawn([pos.x, pos.y])
      return
    }

    if (mode === 'span') {
      const next = [...draftPointsRef.current, pos.x, pos.y]
      if (next.length === 4) {
        onTraceDrawn(next)
        updateDraft([])
      } else {
        updateDraft(next)
      }
      return
    }

    // line / polygon / room: clicking back near the start point finishes the shape (the
    // hint bar's Finish button is the other way to do it — see the JSX below). Not wired
    // to double-click: the browser's dblclick fires after any two clicks in quick
    // succession regardless of how far apart they are, which would finish shapes early.
    const current = draftPointsRef.current
    const isNearStart = current.length >= 4 && distance(pos.x, pos.y, current[0], current[1]) * currentScale <= SNAP_PX
    if (isNearStart) {
      finishShape(current)
      return
    }
    updateDraft([...current, pos.x, pos.y])
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (mode === 'none' || mode === 'point') return
    setCursorPos(getPos(e))
  }

  // Esc backs all the way out of the current tool; Backspace undoes the last point so
  // one bad click doesn't force restarting the whole trace.
  useEffect(() => {
    if (mode === 'none') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        updateDraft([])
        setPendingCalibration(null)
        setPendingRoom(null)
        onCancel()
      } else if (e.key === 'Backspace' && draftPoints.length > 0 && !pendingCalibration && !pendingRoom) {
        e.preventDefault()
        updateDraft(draftPoints.slice(0, -2))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, draftPoints, pendingCalibration, pendingRoom, onCancel])

  // Separate from the effect above since a trace edit happens in mode 'none', which
  // that effect deliberately doesn't attach a listener for.
  useEffect(() => {
    if (!selectedTraceId) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelEdit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedTraceId])

  const liveMeasurement = (() => {
    if (!scale || !cursorPos) return null
    if (mode === 'span' && draftPoints.length === 2) {
      const ftPerPx = realFeetPerPixel(scale)
      const inches = round1(pixelDistance(draftPoints[0], draftPoints[1], cursorPos.x, cursorPos.y) * ftPerPx * 12)
      return `${inches} in so far`
    }
    if (mode === 'line' && draftPoints.length >= 2) {
      const ftPerPx = realFeetPerPixel(scale)
      return `${round1(polylineLengthPx([...draftPoints, cursorPos.x, cursorPos.y]) * ftPerPx)} ft so far`
    }
    if ((mode === 'polygon' || mode === 'room') && draftPoints.length >= 4) {
      const ftPerPx = realFeetPerPixel(scale)
      const area = round1(polygonAreaPx([...draftPoints, cursorPos.x, cursorPos.y]) * ftPerPx * ftPerPx)
      if (mode !== 'room') return `${area} sq ft so far`
      const perimeterFt = round1(polylineLengthPx([...draftPoints, cursorPos.x, cursorPos.y, draftPoints[0], draftPoints[1]]) * ftPerPx)
      return `${area} sq ft · ${perimeterFt} ft perimeter so far`
    }
    return null
  })()

  return (
    <div ref={containerRef} className="planSurface">
      {/* Overlaid, never affects the canvas box's size — a hint banner that pushed the
          canvas in-flow would shrink it, desyncing the stage's fit/centering from where
          clicks are measured. */}
      {mode === 'calibrate' && pendingCalibration ? (
        <div className="canvasHint">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            How long is that, in real life?
            <input
              type="number"
              min="0"
              step="any"
              autoFocus
              className="calibrateInput"
              value={calibrateValue}
              onChange={e => setCalibrateValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmCalibration()
              }}
              placeholder="e.g. 10"
            />
            <select value={calibrateUnit} onChange={e => setCalibrateUnit(e.target.value as 'ft' | 'in')}>
              <option value="ft">feet</option>
              <option value="in">inches</option>
            </select>
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={redrawCalibration}>Redraw</button>
            <button className="primary" disabled={!(Number(calibrateValue) > 0)} onClick={confirmCalibration}>
              Confirm
            </button>
          </div>
        </div>
      ) : pendingRoom ? (
        <div className="canvasHint roomConfirm">
          <div>
            <input
              className="roomNameInput"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="Room name"
              maxLength={40}
              autoFocus
            />
            <strong>
              {pendingRoom.areaSqFt} sq ft · {pendingRoom.perimeterFt} ft perimeter
            </strong>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={redrawRoom}>Redraw</button>
            <button className="primary" onClick={confirmRoom}>
              Add room
            </button>
          </div>
        </div>
      ) : selectedTraceId ? (
        <div className="canvasHint">
          <span>Drag the highlighted points to reshape this trace.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={cancelEdit}>Cancel</button>
            <button className="primary" onClick={commitEdit}>
              Done
            </button>
          </div>
        </div>
      ) : (
        mode !== 'none' && (
          <div className="canvasHint">
            <span>
              {HINTS[mode]}
              {liveMeasurement ? <strong style={{ marginLeft: 8 }}>{liveMeasurement}</strong> : null}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(mode === 'line' || mode === 'polygon' || mode === 'room') && draftPoints.length > 0 && (
                <button onClick={() => updateDraft(draftPoints.slice(0, -2))}>Undo point</button>
              )}
              {(mode === 'line' || mode === 'polygon' || mode === 'room') && draftPoints.length >= 4 && (
                <button className="primary" onClick={() => finishShape(draftPointsRef.current)}>
                  Finish
                </button>
              )}
              <button
                onClick={() => {
                  updateDraft([])
                  setPendingCalibration(null)
                  setPendingRoom(null)
                  onCancel()
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      )}

      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        draggable
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
        style={{ cursor: mode === 'none' ? 'grab' : 'crosshair' }}
      >
        <Layer>
          {image && <KonvaImage image={image} />}

          {/* committed traces — tapping one while idle selects it for reshaping (see
              selectTrace); a selected trace is driven by the local editPoints working
              copy instead of its own points so drags render live */}
          {traces.map(t => {
            // Schedule-derived entries (added straight from an OCR door/window schedule,
            // no plan position at all) have no points to render.
            if (t.points.length === 0) return null
            const isSelected = t.id === selectedTraceId
            const points = isSelected && editPoints ? editPoints : t.points
            const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
              if (mode !== 'none' || isSelected) return
              e.cancelBubble = true
              selectTrace(t)
            }

            if (t.kind === 'span') {
              return (
                <Fragment key={t.id}>
                  <Line points={points} stroke={t.color} strokeWidth={isSelected ? 4 : 3} onClick={handleClick} onTap={handleClick} />
                  {isSelected ? (
                    renderHandles(points, t.color)
                  ) : (
                    <>
                      <Circle x={points[0]} y={points[1]} radius={4} fill={t.color} onClick={handleClick} onTap={handleClick} />
                      <Circle x={points[2]} y={points[3]} radius={4} fill={t.color} onClick={handleClick} onTap={handleClick} />
                    </>
                  )}
                </Fragment>
              )
            }
            if (t.kind === 'point') {
              return <Circle key={t.id} x={points[0]} y={points[1]} radius={isSelected ? 7 : 5} fill={t.color} onClick={handleClick} onTap={handleClick} />
            }
            if (t.kind === 'line') {
              return (
                <Fragment key={t.id}>
                  <Line points={points} stroke={t.color} strokeWidth={4} lineCap="round" lineJoin="round" onClick={handleClick} onTap={handleClick} />
                  {isSelected && renderHandles(points, t.color)}
                </Fragment>
              )
            }
            // polygon / room: both a closed, filled trace
            return (
              <Fragment key={t.id}>
                <Line points={points} closed stroke={t.color} strokeWidth={isSelected ? 3 : 2} fill={t.color + '55'} onClick={handleClick} onTap={handleClick} />
                {isSelected && renderHandles(points, t.color)}
              </Fragment>
            )
          })}

          {/* calibration reference line, shown while its real-length form is open */}
          {pendingCalibration && (
            <>
              <Line points={pendingCalibration.points} stroke="#caa53d" strokeWidth={3} dash={[8, 4]} />
              <Circle x={pendingCalibration.points[0]} y={pendingCalibration.points[1]} radius={5} fill="#caa53d" />
              <Circle x={pendingCalibration.points[2]} y={pendingCalibration.points[3]} radius={5} fill="#caa53d" />
            </>
          )}

          {/* the just-closed room polygon, shown while its name prompt is open —
              previewed in the color the caller passed as activeColor */}
          {pendingRoom && <Line points={pendingRoom.points} closed stroke={activeColor ?? '#0EA5A5'} strokeWidth={2} fill={(activeColor ?? '#0EA5A5') + '55'} />}

          {/* points at printed dimensions found on the plan, so it's obvious where on
              the image each entry in the "Printed dimensions" sidebar list refers to */}
          {mode === 'calibrate' && !pendingCalibration && (() => {
            const s = stageRef.current?.scaleX() || 1
            return detectedDimensions.map(d => (
              <Fragment key={d.id}>
                <Rect
                  x={d.bbox.x0}
                  y={d.bbox.y0}
                  width={d.bbox.x1 - d.bbox.x0}
                  height={d.bbox.y1 - d.bbox.y0}
                  stroke="#caa53d"
                  strokeWidth={1.5 / s}
                  dash={[4 / s, 3 / s]}
                />
                <Text x={d.bbox.x0} y={d.bbox.y0 - 14 / s} text={`${d.feet} ft`} fontSize={12 / s} fill="#a9821f" />
              </Fragment>
            ))
          })()}

          {/* in-progress draft */}
          {draftPoints.length > 0 && mode !== 'point' && !pendingCalibration && (
            <Line
              points={cursorPos ? [...draftPoints, cursorPos.x, cursorPos.y] : draftPoints}
              stroke={mode === 'calibrate' ? '#caa53d' : activeColor ?? '#96948a'}
              strokeWidth={3}
              dash={[6, 4]}
              closed={(mode === 'polygon' || mode === 'room') && draftPoints.length >= 6}
            />
          )}
          {/* start-point marker so it's obvious you can click back on it to close the shape */}
          {(mode === 'line' || mode === 'polygon' || mode === 'room') && draftPoints.length >= 4 && (
            <Circle
              x={draftPoints[0]}
              y={draftPoints[1]}
              radius={SNAP_PX / (stageRef.current?.scaleX() || 1)}
              stroke={activeColor ?? '#96948a'}
              strokeWidth={2}
            />
          )}
        </Layer>
      </Stage>

      <div className="zoomControls" title="Scroll to pan · Ctrl/⌘+scroll or pinch to zoom · drag to pan">
        <button onClick={() => zoomButton(1 / 1.25)} title="Zoom out">
          −
        </button>
        <button onClick={fitToScreen} title="Reset to fit">
          {zoomPct}%
        </button>
        <button onClick={() => zoomButton(1.25)} title="Zoom in">
          +
        </button>
      </div>
    </div>
  )
}
