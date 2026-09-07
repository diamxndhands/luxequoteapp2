import { useEffect, useState } from 'react'
import FloorPlanCanvas, { CanvasMode, CanvasTrace } from './components/FloorPlanCanvas'
import WizardStepper from './components/wizard/WizardStepper'
import WizardSidebar from './components/wizard/WizardSidebar'
import { WIZARD_STEPS, WizardStep, stepIndex } from './components/wizard/steps'
import UploadStep from './components/wizard/steps/UploadStep'
import RoomsStep from './components/wizard/steps/RoomsStep'
import ServicesStep from './components/wizard/steps/ServicesStep'
import PricingStep from './components/wizard/steps/PricingStep'
import QuoteStep from './components/wizard/steps/QuoteStep'
import { DetectedDimension, DetectedRoom, ScheduleEntry, scanPlan } from './lib/ocr'
import { getRoomColor, getNextRoomColor } from './lib/roomColors'
import { fileToDataUrl, loadProject, newProject, saveProject } from './lib/projectStore'
import { loadCatalog, saveCatalog } from './lib/catalogStore'
import { Room, TaggedService } from './types/project'
import { MaterialsSuppliedBy, Service } from './types/service'
import './styles.css'

// The wizard shell: persistent stepper, running summary sidebar, autosave. Upload,
// Rooms, Services, and Pricing are fully wired; Quote is still a placeholder — see
// QuoteStep for what's left.
export default function App() {
  const [project, setProject] = useState(() => loadProject() ?? newProject())
  const [catalog, setCatalog] = useState<Service[]>(() => loadCatalog())
  const [step, setStep] = useState<WizardStep>('upload')
  const [furthest, setFurthest] = useState<WizardStep>('upload')
  const [mode, setMode] = useState<CanvasMode>('none')
  const [calibrationHint, setCalibrationHint] = useState<number | null>(null)

  const [detectedDimensions, setDetectedDimensions] = useState<DetectedDimension[]>([])
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([])
  const [detectedRooms, setDetectedRooms] = useState<DetectedRoom[]>([])
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')

  // Autosave on every change to the project — a jobsite interruption shouldn't lose work.
  useEffect(() => {
    saveProject(project)
  }, [project])

  // Same for the rate table: every first-use rate entered mid-tagging is on file for
  // every quote after this one, per the spec — not just this project's.
  useEffect(() => {
    saveCatalog(catalog)
  }, [catalog])

  // Re-scan a restored plan on load, same as the prototype — OCR results aren't
  // themselves persisted (cheap to recompute, avoids re-associating stale bounding
  // boxes with anything).
  useEffect(() => {
    if (project.floor_plan_image_url) scanForOcr(project.floor_plan_image_url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scanForOcr(url: string) {
    setDetectedDimensions([])
    setScheduleEntries([])
    setDetectedRooms([])
    setOcrStatus('scanning')
    scanPlan(url)
      .then(result => {
        setDetectedDimensions(result.dimensions)
        setScheduleEntries(result.scheduleEntries)
        setDetectedRooms(result.rooms)
        setOcrStatus('done')
      })
      .catch(() => setOcrStatus('error'))
  }

  async function handleUpload(file: File) {
    const url = await fileToDataUrl(file)
    // A new plan invalidates everything measured against the old one.
    setProject(p => ({ ...p, floor_plan_image_url: url, scale: undefined, rooms: [], updated_at: Date.now() }))
    setMode('none')
    setCalibrationHint(null)
    scanForOcr(url)
  }

  function updateRooms(fn: (rooms: Room[]) => Room[]) {
    setProject(p => ({ ...p, rooms: fn(p.rooms), updated_at: Date.now() }))
  }

  function handleRoomDrawn(points: number[], name: string, areaSqFt: number, perimeterFt: number) {
    updateRooms(rooms => [
      ...rooms,
      { id: crypto.randomUUID(), label: name, source: 'traced', floor_plan_polygon: points, area_sqft: areaSqFt, perimeter_ft: perimeterFt, tagged_services: [] }
    ])
    setMode('none')
  }

  function acceptDetectedRooms(accepted: DetectedRoom[]) {
    // Printed-label rooms have real feet directly from the label (no calibration
    // needed) but no polygon on the plan — nothing to trace, so these carry an empty
    // outline and just their measured area/perimeter.
    updateRooms(rooms => [
      ...rooms,
      ...accepted.map(r => ({
        id: crypto.randomUUID(),
        label: r.name,
        source: 'ocr_detected' as const,
        floor_plan_polygon: [],
        area_sqft: r.areaSqFt,
        perimeter_ft: r.perimeterFt,
        tagged_services: []
      }))
    ])
    setDetectedRooms(rooms => rooms.filter(r => !accepted.includes(r)))
  }

  function handleRoomEdited(roomId: string, points: number[]) {
    updateRooms(rooms => rooms.map(r => (r.id === roomId ? { ...r, floor_plan_polygon: points } : r)))
  }

  function removeRoom(roomId: string) {
    updateRooms(rooms => rooms.filter(r => r.id !== roomId))
  }

  function setMaterialsSuppliedBy(value: MaterialsSuppliedBy) {
    setProject(p => ({ ...p, materials_supplied_by: value, updated_at: Date.now() }))
  }

  // `build` runs once per target room so each room's tagged service is priced against
  // its own quantity (its own perimeter/area, or the config panel's manual override for
  // whichever room was the primary target) — see ServicesStep for how bulk apply uses
  // this to avoid billing a small room for a big one's footage.
  function tagRooms(roomIds: string[], build: (room: Room) => TaggedService) {
    setProject(p => ({
      ...p,
      rooms: p.rooms.map(r => (roomIds.includes(r.id) ? { ...r, tagged_services: [...r.tagged_services, build(r)] } : r)),
      updated_at: Date.now()
    }))
  }

  function tagProject(taggedService: TaggedService) {
    setProject(p => ({ ...p, project_line_items: [...p.project_line_items, taggedService], updated_at: Date.now() }))
  }

  function removeRoomService(roomId: string, taggedServiceId: string) {
    setProject(p => ({
      ...p,
      rooms: p.rooms.map(r => (r.id === roomId ? { ...r, tagged_services: r.tagged_services.filter(t => t.id !== taggedServiceId) } : r)),
      updated_at: Date.now()
    }))
  }

  function removeProjectService(taggedServiceId: string) {
    setProject(p => ({ ...p, project_line_items: p.project_line_items.filter(t => t.id !== taggedServiceId), updated_at: Date.now() }))
  }

  // Pricing review's inline edits patch the stored labor/material figures directly and
  // recompute the total from them — quantity and the rate that originally drove the
  // number stay untouched as a record of where it came from, same reasoning as
  // TaggedService's rate_used fields never changing after the fact.
  function applyPricingPatch(t: TaggedService, patch: { labor?: number; material?: number }): TaggedService {
    const labor = patch.labor ?? t.computed_labor_price
    const material = patch.material ?? t.computed_material_price
    return { ...t, computed_labor_price: labor, computed_material_price: material, computed_total: labor + material }
  }

  function updateRoomServicePricing(roomId: string, taggedServiceId: string, patch: { labor?: number; material?: number }) {
    setProject(p => ({
      ...p,
      rooms: p.rooms.map(r =>
        r.id === roomId
          ? { ...r, tagged_services: r.tagged_services.map(t => (t.id === taggedServiceId ? applyPricingPatch(t, patch) : t)) }
          : r
      ),
      updated_at: Date.now()
    }))
  }

  function updateProjectServicePricing(taggedServiceId: string, patch: { labor?: number; material?: number }) {
    setProject(p => ({
      ...p,
      project_line_items: p.project_line_items.map(t => (t.id === taggedServiceId ? applyPricingPatch(t, patch) : t)),
      updated_at: Date.now()
    }))
  }

  // "Next" unlocks once the minimum for that step is met; going backward is always
  // allowed. Pricing has no real interaction to gate on yet beyond the materials
  // toggle, so it's left open rather than trapping the wizard on an unbuildable
  // requirement.
  const totalTagged = project.rooms.reduce((sum, r) => sum + r.tagged_services.length, 0) + project.project_line_items.length
  const canAdvance: Record<WizardStep, boolean> = {
    upload: !!project.floor_plan_image_url,
    rooms: project.rooms.length > 0,
    services: totalTagged > 0,
    pricing: true,
    quote: true
  }

  function goToStep(next: WizardStep) {
    setStep(next)
    if (stepIndex(next) > stepIndex(furthest)) setFurthest(next)
    setMode('none')
  }

  function goNext() {
    const idx = stepIndex(step)
    if (idx < WIZARD_STEPS.length - 1) goToStep(WIZARD_STEPS[idx + 1].id)
  }

  function goBack() {
    const idx = stepIndex(step)
    if (idx > 0) goToStep(WIZARD_STEPS[idx - 1].id)
  }

  const roomIds = project.rooms.map(r => r.id)
  const roomTraces: CanvasTrace[] = project.rooms
    .filter(r => r.floor_plan_polygon.length > 0)
    .map(r => ({ id: r.id, kind: 'room', points: r.floor_plan_polygon, color: getRoomColor(roomIds, r.id) }))

  const showCanvas = step === 'upload' || step === 'rooms'

  return (
    <div className="appShell">
      <WizardStepper current={step} furthest={furthest} onSelect={goToStep} />

      <div className="wizardBody">
        <div className="canvasStage">
          {showCanvas && (
            <FloorPlanCanvas
              imageUrl={project.floor_plan_image_url ?? null}
              mode={mode}
              activeColor={mode === 'room' ? getNextRoomColor(project.rooms.length) : null}
              scale={project.scale ?? null}
              traces={roomTraces}
              detectedDimensions={step === 'rooms' ? detectedDimensions : []}
              calibrationHint={calibrationHint}
              onCalibrationConfirmed={next => {
                setProject(p => ({ ...p, scale: next, updated_at: Date.now() }))
                setCalibrationHint(null)
                setMode('none')
              }}
              onTraceDrawn={() => {
                // No non-room draw modes are reachable yet — service tagging (Services
                // step) is what will drive point/span/line/polygon modes.
              }}
              onRoomDrawn={handleRoomDrawn}
              onTraceEdited={handleRoomEdited}
              onCancel={() => {
                setMode('none')
                setCalibrationHint(null)
              }}
            />
          )}

          {step === 'upload' && <UploadStep imageUrl={project.floor_plan_image_url ?? null} ocrStatus={ocrStatus} onUpload={handleUpload} />}

          {step === 'rooms' && (
            <RoomsStep
              scale={project.scale ?? null}
              mode={mode}
              onCalibrateClick={() => {
                setCalibrationHint(null)
                setMode('calibrate')
              }}
              onTraceRoomClick={() => setMode('room')}
              ocrStatus={ocrStatus}
              detectedDimensions={detectedDimensions}
              onUseDimension={d => {
                setCalibrationHint(d.feet)
                setMode('calibrate')
              }}
              detectedRooms={detectedRooms}
              onAcceptDetectedRooms={acceptDetectedRooms}
              onDismissDetectedRooms={() => setDetectedRooms([])}
              rooms={project.rooms}
              onRemoveRoom={removeRoom}
            />
          )}

          {step === 'services' && (
            <ServicesStep
              project={project}
              catalog={catalog}
              onTagRooms={tagRooms}
              onTagProject={tagProject}
              onRemoveRoomService={removeRoomService}
              onRemoveProjectService={removeProjectService}
              onUpdateCatalog={setCatalog}
            />
          )}
          {step === 'pricing' && (
            <PricingStep
              project={project}
              catalog={catalog}
              onChangeMaterialsSuppliedBy={setMaterialsSuppliedBy}
              onUpdateRoomServicePricing={updateRoomServicePricing}
              onUpdateProjectServicePricing={updateProjectServicePricing}
            />
          )}
          {step === 'quote' && <QuoteStep />}
        </div>

        <WizardSidebar project={project} />
      </div>

      <div className="wizardNav">
        <button onClick={goBack} disabled={step === 'upload'}>
          Back
        </button>
        {step !== 'quote' && (
          <button className="primary" onClick={goNext} disabled={!canAdvance[step]}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}
