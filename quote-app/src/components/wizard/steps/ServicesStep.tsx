import { useMemo, useState } from 'react'
import { AdHocItem, Project, Room, SelectedModifier, TaggedService } from '../../../types/project'
import { Service, ServiceCategory, UNIT_LABEL } from '../../../types/service'
import { needsRatePrompt, tagAdHoc, tagService } from '../../../lib/pricing'
import ServiceConfigPanel from '../ServiceConfigPanel'
import CustomItemForm from '../CustomItemForm'

const CATEGORY_ORDER: ServiceCategory[] = ['Consultations', 'Install', 'CNC', 'Supply', 'Scribing', 'Refine']

interface Props {
  project: Project
  catalog: Service[]
  onTagRooms: (roomIds: string[], build: (room: Room) => TaggedService) => void
  onTagProject: (taggedService: TaggedService) => void
  onRemoveRoomService: (roomId: string, taggedServiceId: string) => void
  onRemoveProjectService: (taggedServiceId: string) => void
  onUpdateCatalog: (catalog: Service[]) => void
}

// The core of the app: click a room (or "Project-level"), pick a service from its
// category-organized list, and it's tagged and priced. Auto-quantity comes straight off
// the room's own geometry (already known from the Rooms step — no re-tracing needed);
// per_item/flat services fall back to a manual count, per the spec. Bulk apply is two
// affordances: check other rooms to tag them all at once, or copy the whole service set
// from whichever room was active last.
export default function ServicesStep({ project, catalog, onTagRooms, onTagProject, onRemoveRoomService, onRemoveProjectService, onUpdateCatalog }: Props) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(project.rooms[0]?.id ?? null)
  const [lastActiveRoomId, setLastActiveRoomId] = useState<string | null>(null)
  const [bulkRoomIds, setBulkRoomIds] = useState<Set<string>>(new Set())
  const [configService, setConfigService] = useState<Service | null>(null)
  const [showCustomForm, setShowCustomForm] = useState(false)

  const activeRoom = project.rooms.find(r => r.id === activeRoomId) ?? null
  const isProjectLevel = activeRoomId === null

  function selectRoom(id: string | null) {
    if (id !== activeRoomId) setLastActiveRoomId(activeRoomId)
    setActiveRoomId(id)
    setBulkRoomIds(new Set())
  }

  function toggleBulkRoom(id: string) {
    setBulkRoomIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const targetRoomIds = activeRoomId ? [activeRoomId, ...bulkRoomIds] : []

  const available = useMemo(
    () => catalog.filter(s => s.room_scoped === !isProjectLevel),
    [catalog, isProjectLevel]
  )
  const byCategory = useMemo(() => {
    const map = new Map<ServiceCategory, Service[]>()
    for (const s of available) {
      if (!map.has(s.category)) map.set(s.category, [])
      map.get(s.category)!.push(s)
    }
    return map
  }, [available])

  function defaultQuantity(service: Service, room: Room | null): { value: number; source: 'auto' | 'manual' } {
    if (room) {
      if (service.unit_type === 'linear_ft' && room.perimeter_ft != null) return { value: room.perimeter_ft, source: 'auto' }
      if (service.unit_type === 'sqft' && room.area_sqft != null) return { value: room.area_sqft, source: 'auto' }
    }
    return { value: 1, source: 'manual' }
  }

  function needsConfig(service: Service): boolean {
    if (service.modifiers.length > 0) return true
    if (needsRatePrompt(service.base_labor_rate)) return true
    if (service.material_applicable && project.materials_supplied_by === 'contractor' && needsRatePrompt(service.base_material_rate)) return true
    return false
  }

  function addDirectly(service: Service) {
    if (isProjectLevel) {
      onTagProject(tagService(service, 1, 'manual', [], project.materials_supplied_by))
      return
    }
    onTagRooms(targetRoomIds, room => {
      const { value, source } = defaultQuantity(service, room)
      return tagService(service, value, source, [], project.materials_supplied_by)
    })
  }

  function pickService(service: Service) {
    if (needsConfig(service)) {
      setConfigService(service)
    } else {
      addDirectly(service)
    }
  }

  function handleConfigAdd(result: { service: Service; quantity: number; quantitySource: 'auto' | 'manual'; selectedModifiers: SelectedModifier[] }) {
    onUpdateCatalog(catalog.map(s => (s.id === result.service.id ? result.service : s)))
    if (isProjectLevel) {
      onTagProject(tagService(result.service, result.quantity, result.quantitySource, result.selectedModifiers, project.materials_supplied_by))
    } else {
      // The config panel's quantity/modifiers apply to the active room as configured;
      // any additional bulk-checked rooms get the same modifiers but their own
      // auto-quantity, so a bigger room isn't billed for a smaller one's footage.
      onTagRooms(targetRoomIds, room => {
        const isPrimary = room.id === activeRoomId
        const { value, source } = isPrimary ? { value: result.quantity, source: result.quantitySource } : defaultQuantity(result.service, room)
        return tagService(result.service, value, source, result.selectedModifiers, project.materials_supplied_by)
      })
    }
    setConfigService(null)
  }

  function handleCustomAdd(item: AdHocItem, quantity: number) {
    const tagged = tagAdHoc(item, quantity, project.materials_supplied_by)
    if (isProjectLevel) onTagProject(tagged)
    else onTagRooms([activeRoomId!], () => tagged)
    setShowCustomForm(false)
  }

  const lastActiveRoom = project.rooms.find(r => r.id === lastActiveRoomId) ?? null
  const canCopyFromLast = !isProjectLevel && activeRoom && activeRoom.tagged_services.length === 0 && lastActiveRoom && lastActiveRoom.tagged_services.length > 0

  function copyFromLastRoom() {
    if (!lastActiveRoom || !activeRoom) return
    for (const t of lastActiveRoom.tagged_services) {
      const service = t.service_id ? catalog.find(s => s.id === t.service_id) : null
      onTagRooms([activeRoom.id], room => {
        if (service) {
          const { value, source } = defaultQuantity(service, room)
          return tagService(service, value, source, t.modifiers_selected, project.materials_supplied_by)
        }
        // Ad-hoc items have no geometry to re-derive from — carry the quantity over as-is.
        return tagAdHoc(t.ad_hoc!, t.quantity, project.materials_supplied_by)
      })
    }
  }

  function serviceName(t: TaggedService): string {
    if (t.ad_hoc) return t.ad_hoc.name
    return catalog.find(s => s.id === t.service_id)?.name ?? 'Unknown service'
  }

  const activeTagged = isProjectLevel ? project.project_line_items : activeRoom?.tagged_services ?? []

  return (
    <div className="servicesStep">
      <aside className="roomRail">
        <button className={`roomRailItem${isProjectLevel ? ' active' : ''}`} onClick={() => selectRoom(null)}>
          Project-level
          <span className="meta">{project.project_line_items.length}</span>
        </button>
        <div className="roomRailDivider" />
        {project.rooms.map(r => (
          <div key={r.id} className={`roomRailItem${activeRoomId === r.id ? ' active' : ''}`}>
            <button className="roomRailLabel" onClick={() => selectRoom(r.id)}>
              {r.label}
              <span className="meta">{r.tagged_services.length}</span>
            </button>
            {activeRoomId && activeRoomId !== r.id && (
              <label className="bulkCheck" title="Also apply to this room">
                <input type="checkbox" checked={bulkRoomIds.has(r.id)} onChange={() => toggleBulkRoom(r.id)} />
              </label>
            )}
          </div>
        ))}
      </aside>

      <div className="servicesMain">
        {activeRoomId && bulkRoomIds.size > 0 && (
          <div className="bulkNotice">Applying to {targetRoomIds.length} rooms — each uses its own measurements.</div>
        )}
        {canCopyFromLast && (
          <button className="copyLastRoomBtn" onClick={copyFromLastRoom}>
            Copy {lastActiveRoom!.tagged_services.length} service{lastActiveRoom!.tagged_services.length === 1 ? '' : 's'} from {lastActiveRoom!.label}
          </button>
        )}

        {activeTagged.length > 0 && (
          <div className="taggedList">
            {activeTagged.map(t => (
              <div key={t.id} className="serviceItem">
                <div>
                  <div className="name">{serviceName(t)}</div>
                  <div className="meta">
                    {t.quantity} {UNIT_LABEL[t.ad_hoc?.unit_type ?? catalog.find(s => s.id === t.service_id)?.unit_type ?? 'per_item']}
                    {t.quantity_source === 'auto' ? ' · auto' : ''} · ${t.computed_total.toFixed(0)}
                  </div>
                </div>
                <button
                  className="removeBtn"
                  onClick={() => (isProjectLevel ? onRemoveProjectService(t.id) : onRemoveRoomService(activeRoom!.id, t.id))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {CATEGORY_ORDER.filter(c => byCategory.has(c)).map(category => (
          <div key={category} className="categoryGroup">
            <div className="categoryHeader">{category}</div>
            <div className="categoryItems">
              {byCategory.get(category)!.map(s => (
                <button key={s.id} className="serviceChip" onClick={() => pickService(s)}>
                  {s.name}
                  {needsRatePrompt(s.base_labor_rate) && <span className="chipBadge">new rate</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        <button className="customItemBtn" onClick={() => setShowCustomForm(true)}>
          + Custom item
        </button>
      </div>

      {configService && (
        <ServiceConfigPanel
          service={configService}
          defaultQuantity={defaultQuantity(configService, activeRoom).value}
          defaultQuantitySource={defaultQuantity(configService, activeRoom).source}
          materialsSuppliedBy={project.materials_supplied_by}
          onCancel={() => setConfigService(null)}
          onAdd={handleConfigAdd}
        />
      )}

      {showCustomForm && <CustomItemForm materialsSuppliedBy={project.materials_supplied_by} onCancel={() => setShowCustomForm(false)} onAdd={handleCustomAdd} />}
    </div>
  )
}
