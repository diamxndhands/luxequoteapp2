import { MaterialsSuppliedBy } from '../../../types/service'

interface Props {
  materialsSuppliedBy: MaterialsSuppliedBy
  onChange: (value: MaterialsSuppliedBy) => void
}

// Mostly a placeholder — the per-line labor | material | total review with inline
// editing and anomaly flags isn't built yet. The materials-supplied toggle is real,
// though: it's simple, it's a project-level fact rather than a pricing-review
// interaction, and lib/pricing.ts already depends on it, so there's no reason to wait.
export default function PricingStep({ materialsSuppliedBy, onChange }: Props) {
  return (
    <div className="placeholderStep">
      <div className="placeholderCard">
        <h2>Pricing review — coming next</h2>
        <p className="meta">
          Once services are tagged, every line will show here as labor | material | total, editable inline, with
          anomaly flags on auto-quantities that look off.
        </p>

        <div className="materialsToggle">
          <span className="label">Who supplies major materials?</span>
          <div className="toggleGroup">
            <button className={materialsSuppliedBy === 'contractor' ? 'active' : ''} onClick={() => onChange('contractor')}>
              Contractor
            </button>
            <button className={materialsSuppliedBy === 'client' ? 'active' : ''} onClick={() => onChange('client')}>
              Client
            </button>
          </div>
          <p className="meta">
            {materialsSuppliedBy === 'client'
              ? 'No material rates will be charged — labour and consumables only, like the one historical quote on file.'
              : 'Material rates apply wherever a service has one.'}
          </p>
        </div>
      </div>
    </div>
  )
}
