import { WIZARD_STEPS, WizardStep, stepIndex } from './steps'

interface Props {
  current: WizardStep
  // The furthest step reached this session — clicking a stepper item jumps back to any
  // step up to and including this one. Never lets you jump *ahead* of it: "Next"
  // unlocking on the minimum being met is the only way forward, per the spec ("going
  // backward is always allowed" is the one-directional guarantee, not free navigation).
  furthest: WizardStep
}

// Persistent progress bar: always visible, current step highlighted, completed steps
// checked off. Doubles as backward navigation — tapping an already-reached step jumps
// straight to it.
export default function WizardStepper({ current, furthest, onSelect }: Props & { onSelect: (step: WizardStep) => void }) {
  const currentIdx = stepIndex(current)
  const furthestIdx = stepIndex(furthest)

  return (
    <div className="stepBar">
      {WIZARD_STEPS.map((s, i) => (
        <div key={s.id} className="stepWrap">
          <button
            className={`stepItem${current === s.id ? ' active' : ''}${i < currentIdx ? ' done' : ''}`}
            disabled={i > furthestIdx}
            onClick={() => onSelect(s.id)}
          >
            <span className="stepNum">{i < currentIdx ? '✓' : i + 1}</span>
            {s.label}
          </button>
          {i < WIZARD_STEPS.length - 1 && <span className="stepConnector" />}
        </div>
      ))}
    </div>
  )
}
