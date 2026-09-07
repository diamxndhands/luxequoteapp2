import { BusinessProfile, DEFAULT_PROFILE } from '../types/settings'

// No Settings screen exists yet to edit the full profile (logo, address, license,
// terms text) — this just persists whatever the Quote step lets someone adjust
// (business name, GST rate) on top of DEFAULT_PROFILE, so those choices survive a
// reload instead of resetting every session.

const KEY = 'luxequote:businessProfile:v1'

export function loadBusinessProfile(): BusinessProfile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_PROFILE
}

export function saveBusinessProfile(profile: BusinessProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile))
  } catch {
    // Private browsing or quota exceeded — stays correct for this session.
  }
}
