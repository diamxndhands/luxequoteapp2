import { useState } from 'react'
import { AdHocItem } from '../../types/project'
import { MaterialsSuppliedBy, UNIT_LABEL, UnitType } from '../../types/service'

interface Props {
  materialsSuppliedBy: MaterialsSuppliedBy
  onCancel: () => void
  onAdd: (item: AdHocItem, quantity: number) => void
}

const UNIT_OPTIONS: UnitType[] = ['linear_ft', 'sqft', 'per_item', 'flat']

// A one-off item with no catalog entry — see AdHocItem's own comment in types/project.ts
// for why this exists. Deliberately never touches the rate table: what's typed here is
// what's charged, once, for this line only.
export default function CustomItemForm({ materialsSuppliedBy, onCancel, onAdd }: Props) {
  const [name, setName] = useState('')
  const [unitType, setUnitType] = useState<UnitType>('per_item')
  const [laborRate, setLaborRate] = useState('')
  const [materialRate, setMaterialRate] = useState('')
  const [quantity, setQuantity] = useState('1')

  const pricesMaterial = materialsSuppliedBy === 'contractor'
  const canAdd = name.trim().length > 0 && Number(laborRate) >= 0 && Number(quantity) > 0

  function submit() {
    if (!canAdd) return
    const item: AdHocItem = {
      name: name.trim(),
      unit_type: unitType,
      labor_rate: Number(laborRate),
      material_rate: pricesMaterial && materialRate !== '' ? Number(materialRate) : null
    }
    onAdd(item, Number(quantity))
  }

  return (
    <div className="pickerOverlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="configPanel">
        <header className="configPanelHead">
          <h2>Custom item</h2>
          <button className="removeBtn" onClick={onCancel}>
            ✕
          </button>
        </header>

        <div className="configField">
          <label className="label">Description</label>
          <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="What is this?" />
        </div>

        <div className="configField">
          <label className="label">Unit</label>
          <select value={unitType} onChange={e => setUnitType(e.target.value as UnitType)}>
            {UNIT_OPTIONS.map(u => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </div>

        <div className="configField">
          <label className="label">Quantity</label>
          <input type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>

        <div className="configField">
          <label className="label">Labor rate ($ per {UNIT_LABEL[unitType]})</label>
          <input type="number" min="0" step="any" value={laborRate} onChange={e => setLaborRate(e.target.value)} />
        </div>

        {pricesMaterial && (
          <div className="configField">
            <label className="label">Material rate ($ per {UNIT_LABEL[unitType]}, optional)</label>
            <input type="number" min="0" step="any" value={materialRate} onChange={e => setMaterialRate(e.target.value)} />
          </div>
        )}

        <footer className="configPanelFoot">
          <span className="meta">Priced once, on this line only — not saved to the rate table.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onCancel}>Cancel</button>
            <button className="primary" disabled={!canAdd} onClick={submit}>
              Add
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
