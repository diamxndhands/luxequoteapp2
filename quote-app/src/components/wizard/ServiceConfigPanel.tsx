import { useState } from 'react'
import { Service, ServiceModifier, MaterialsSuppliedBy, UNIT_LABEL } from '../../types/service'
import { SelectedModifier } from '../../types/project'
import { needsRatePrompt, priceService, recordModifierRate, recordRate, resolveModifierDelta } from '../../lib/pricing'

interface Props {
  service: Service
  defaultQuantity: number
  defaultQuantitySource: 'auto' | 'manual'
  materialsSuppliedBy: MaterialsSuppliedBy
  onCancel: () => void
  // Returns the quantity/source and selected modifiers the user landed on, plus the
  // service (with any first-use rates baked in) — the caller persists the rate changes
  // into the catalog and turns this into a TaggedService via lib/pricing's tagService.
  onAdd: (result: { service: Service; quantity: number; quantitySource: 'auto' | 'manual'; selectedModifiers: SelectedModifier[] }) => void
}

// Opens for any service that either has modifiers to configure or a rate this project
// has never seen before — the spec's "small config step ... rather than a single
// click" for bespoke items, plus the first-use rate prompt folded into the same screen
// rather than a separate interruption. A service with neither (simple, already priced)
// never reaches this component at all — see ServicesStep's quick-add path.
export default function ServiceConfigPanel({ service, defaultQuantity, defaultQuantitySource, materialsSuppliedBy, onCancel, onAdd }: Props) {
  const [workingService, setWorkingService] = useState<Service>(service)
  const [quantity, setQuantity] = useState(defaultQuantity)
  const [quantitySource, setQuantitySource] = useState(defaultQuantitySource)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [laborRateInput, setLaborRateInput] = useState('')
  const [materialRateInput, setMaterialRateInput] = useState('')
  const [modifierRateInputs, setModifierRateInputs] = useState<Record<string, { labor: string; material: string }>>({})

  const pricesMaterial = workingService.material_applicable && materialsSuppliedBy === 'contractor'

  function modifierInput(modifierId: string) {
    return modifierRateInputs[modifierId] ?? { labor: '', material: '' }
  }

  function setModifierInput(modifierId: string, field: 'labor' | 'material', value: string) {
    setModifierRateInputs(prev => ({ ...prev, [modifierId]: { ...modifierInput(modifierId), [field]: value } }))
  }

  function toggleModifier(m: ServiceModifier) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(m.id)) next.delete(m.id)
      else next.add(m.id)
      return next
    })
  }

  // A newly typed rate commits into the local working copy immediately (not just on
  // final Add) so the live total below reacts to it right away, same as the
  // first-use flow the spec describes: enter it once, it's on file from here on.
  function commitLaborRate() {
    const n = Number(laborRateInput)
    if (!(n >= 0)) return
    setWorkingService(s => recordRate(s, 'labor', n))
  }

  function commitMaterialRate() {
    const n = Number(materialRateInput)
    if (!(n >= 0)) return
    setWorkingService(s => recordRate(s, 'material', n))
  }

  function commitModifierRate(modifierId: string, field: 'labor' | 'material') {
    const n = Number(modifierInput(modifierId)[field])
    if (!(n >= 0)) return
    setWorkingService(s => ({ ...s, modifiers: s.modifiers.map(m => (m.id === modifierId ? recordModifierRate(m, field, n) : m)) }))
  }

  const resolvedModifiers: SelectedModifier[] = []
  let modifiersReady = true
  for (const m of workingService.modifiers) {
    if (!selectedIds.has(m.id)) continue
    const resolved = resolveModifierDelta(m, materialsSuppliedBy)
    if (resolved) resolvedModifiers.push(resolved)
    else modifiersReady = false
  }

  const baseReady = !needsRatePrompt(workingService.base_labor_rate) && (!pricesMaterial || !needsRatePrompt(workingService.base_material_rate))
  const canAdd = baseReady && modifiersReady && quantity > 0

  const preview = baseReady && modifiersReady ? priceService(workingService, quantity, resolvedModifiers, materialsSuppliedBy) : null

  return (
    <div className="pickerOverlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="configPanel">
        <header className="configPanelHead">
          <div>
            <div className="meta">{workingService.category}</div>
            <h2>{workingService.name}</h2>
          </div>
          <button className="removeBtn" onClick={onCancel}>
            ✕
          </button>
        </header>

        {needsRatePrompt(service.base_labor_rate) && (
          <div className="ratePrompt">
            <label className="label">Labor rate — never priced before, this saves to the rate table</label>
            <div className="rateRow">
              <input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={laborRateInput}
                onChange={e => setLaborRateInput(e.target.value)}
                placeholder={`$ per ${UNIT_LABEL[workingService.unit_type]}`}
              />
              <button disabled={!(Number(laborRateInput) >= 0)} onClick={commitLaborRate}>
                Set
              </button>
            </div>
          </div>
        )}

        {pricesMaterial && needsRatePrompt(service.base_material_rate) && (
          <div className="ratePrompt">
            <label className="label">Material rate — never priced before, this saves to the rate table</label>
            <div className="rateRow">
              <input type="number" min="0" step="any" value={materialRateInput} onChange={e => setMaterialRateInput(e.target.value)} placeholder="$ per unit" />
              <button disabled={!(Number(materialRateInput) >= 0)} onClick={commitMaterialRate}>
                Set
              </button>
            </div>
          </div>
        )}

        <div className="configField">
          <label className="label">Quantity ({UNIT_LABEL[workingService.unit_type]})</label>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={e => {
              setQuantity(Number(e.target.value))
              setQuantitySource('manual')
            }}
          />
          {defaultQuantitySource === 'auto' && quantitySource === 'auto' && <span className="meta">from room geometry</span>}
        </div>

        {workingService.modifiers.length > 0 && (
          <div className="configField">
            <label className="label">Modifiers</label>
            {workingService.modifiers.map(m => {
              const checked = selectedIds.has(m.id)
              const needsLabor = checked && needsRatePrompt(m.labor_delta)
              const needsMaterial = checked && pricesMaterial && needsRatePrompt(m.material_delta)
              return (
                <div key={m.id} className="modifierRow">
                  <label className="trimCheck">
                    <input type="checkbox" checked={checked} onChange={() => toggleModifier(m)} />
                    {m.name}
                  </label>
                  {needsLabor && (
                    <div className="ratePrompt nested">
                      <label className="label">Labor delta — no rate on file</label>
                      <div className="rateRow">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={modifierInput(m.id).labor}
                          onChange={e => setModifierInput(m.id, 'labor', e.target.value)}
                          placeholder="$ delta"
                        />
                        <button disabled={!(Number(modifierInput(m.id).labor) >= 0)} onClick={() => commitModifierRate(m.id, 'labor')}>
                          Set
                        </button>
                      </div>
                    </div>
                  )}
                  {needsMaterial && (
                    <div className="ratePrompt nested">
                      <label className="label">Material delta — no rate on file</label>
                      <div className="rateRow">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={modifierInput(m.id).material}
                          onChange={e => setModifierInput(m.id, 'material', e.target.value)}
                          placeholder="$ delta"
                        />
                        <button disabled={!(Number(modifierInput(m.id).material) >= 0)} onClick={() => commitModifierRate(m.id, 'material')}>
                          Set
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <footer className="configPanelFoot">
          <span className="meta">{preview ? `$${preview.total.toFixed(0)} total` : 'Enter the rate(s) above to see a price'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onCancel}>Cancel</button>
            <button
              className="primary"
              disabled={!canAdd}
              onClick={() => onAdd({ service: workingService, quantity, quantitySource, selectedModifiers: resolvedModifiers })}
            >
              Add
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
