import { Project, TaggedService } from '../../../types/project'
import { MaterialsSuppliedBy, Service, UNIT_LABEL } from '../../../types/service'

interface Props {
  project: Project
  catalog: Service[]
  onChangeMaterialsSuppliedBy: (value: MaterialsSuppliedBy) => void
  onUpdateRoomServicePricing: (roomId: string, taggedServiceId: string, patch: { labor?: number; material?: number }) => void
  onUpdateProjectServicePricing: (taggedServiceId: string, patch: { labor?: number; material?: number }) => void
}

function lineName(t: TaggedService, catalog: Service[]): string {
  if (t.ad_hoc) return t.ad_hoc.name
  return catalog.find(s => s.id === t.service_id)?.name ?? 'Unknown service'
}

function lineUnit(t: TaggedService, catalog: Service[]): string {
  const unitType = t.ad_hoc?.unit_type ?? catalog.find(s => s.id === t.service_id)?.unit_type ?? 'per_item'
  return UNIT_LABEL[unitType]
}

// Every tagged service as labor | material | total, editable inline — an edit here
// changes what's stored on the line directly (computed_labor_price etc. are already the
// authoritative numbers a TaggedService carries, not something re-derived from rate x
// quantity each render), so adjusting one line never touches any other. Material is
// hidden entirely rather than shown pinned at zero when the client supplies materials —
// matching the one historical quote this schema is modelled on, which had no material
// column at all on a labour-only job.
export default function PricingStep({ project, catalog, onChangeMaterialsSuppliedBy, onUpdateRoomServicePricing, onUpdateProjectServicePricing }: Props) {
  const pricesMaterial = project.materials_supplied_by === 'contractor'

  function renderRow(t: TaggedService, onUpdate: (patch: { labor?: number; material?: number }) => void) {
    return (
      <tr key={t.id}>
        <td>
          <div className="name">{lineName(t, catalog)}</div>
          {t.anomaly_flag && <div className="anomalyFlag">⚠ {t.anomaly_flag}</div>}
        </td>
        <td className="num">
          {t.quantity} {lineUnit(t, catalog)}
        </td>
        <td>
          <input
            className="rateInput"
            type="number"
            step="any"
            value={t.computed_labor_price}
            onChange={e => onUpdate({ labor: Number(e.target.value) })}
          />
        </td>
        {pricesMaterial && (
          <td>
            <input
              className="rateInput"
              type="number"
              step="any"
              value={t.computed_material_price}
              onChange={e => onUpdate({ material: Number(e.target.value) })}
            />
          </td>
        )}
        <td className="num">${t.computed_total.toFixed(0)}</td>
      </tr>
    )
  }

  const roomsWithServices = project.rooms.filter(r => r.tagged_services.length > 0)
  const allTagged = [...roomsWithServices.flatMap(r => r.tagged_services), ...project.project_line_items]
  const laborTotal = allTagged.reduce((sum, t) => sum + t.computed_labor_price, 0)
  const materialTotal = allTagged.reduce((sum, t) => sum + t.computed_material_price, 0)
  const subtotal = laborTotal + materialTotal

  return (
    <div className="pricingStep">
      <div className="pricingStepInner">
      <div className="materialsToggle">
        <span className="label">Who supplies major materials?</span>
        <div className="toggleGroup">
          <button className={project.materials_supplied_by === 'contractor' ? 'active' : ''} onClick={() => onChangeMaterialsSuppliedBy('contractor')}>
            Contractor
          </button>
          <button className={project.materials_supplied_by === 'client' ? 'active' : ''} onClick={() => onChangeMaterialsSuppliedBy('client')}>
            Client
          </button>
        </div>
        <p className="meta">
          {pricesMaterial
            ? 'Material rates apply wherever a service has one.'
            : 'No material rates are charged — labour and consumables only, like the one historical quote on file.'}
        </p>
      </div>

      {allTagged.length === 0 ? (
        <p className="meta" style={{ padding: '0 4px' }}>
          Nothing tagged yet — go back to Services to tag rooms and project-level items first.
        </p>
      ) : (
        <>
          {roomsWithServices.map(room => (
            <div key={room.id} className="pricingSection">
              <div className="pricingSectionHead">{room.label}</div>
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Qty</th>
                    <th>Labor</th>
                    {pricesMaterial && <th>Material</th>}
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>{room.tagged_services.map(t => renderRow(t, patch => onUpdateRoomServicePricing(room.id, t.id, patch)))}</tbody>
              </table>
            </div>
          ))}

          {project.project_line_items.length > 0 && (
            <div className="pricingSection">
              <div className="pricingSectionHead">Project-level</div>
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Qty</th>
                    <th>Labor</th>
                    {pricesMaterial && <th>Material</th>}
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>{project.project_line_items.map(t => renderRow(t, patch => onUpdateProjectServicePricing(t.id, patch)))}</tbody>
              </table>
            </div>
          )}

          <div className="pricingTotals">
            <div>
              <span>Labor</span>
              <span>${laborTotal.toFixed(0)}</span>
            </div>
            {pricesMaterial && (
              <div>
                <span>Material</span>
                <span>${materialTotal.toFixed(0)}</span>
              </div>
            )}
            <div className="grand">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(0)}</span>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  )
}
