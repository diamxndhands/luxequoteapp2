// The five-step flow from the spec. Shared by the stepper, the shell's step-routing,
// and the "what counts as done" gating below, so all three read the same list instead
// of three separately-maintained ones drifting apart.
export type WizardStep = 'upload' | 'rooms' | 'services' | 'pricing' | 'quote'

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'services', label: 'Services' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'quote', label: 'Quote' }
]

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.findIndex(s => s.id === step)
}
