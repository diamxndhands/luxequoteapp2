import { Project } from '../types/project'

// Single-project autosave, same split-image-from-state discipline as the prototype's
// persistence.ts: a large plan photo failing to fit localStorage's quota shouldn't also
// take the much smaller, more important room/service data down with it. Storage backend
// is still an open decision (see the audit) — this is what makes the wizard usable
// today, not a commitment to localStorage long-term.

const IMAGE_KEY = 'luxequote:project:image:v1'
const PROJECT_KEY = 'luxequote:project:v1'

export function newProject(): Project {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    materials_supplied_by: 'client',
    rooms: [],
    project_line_items: [],
    status: 'draft',
    created_at: now,
    updated_at: now
  }
}

export function saveProject(project: Project): void {
  const { floor_plan_image_url, ...rest } = project
  if (floor_plan_image_url) {
    try {
      localStorage.setItem(IMAGE_KEY, floor_plan_image_url)
    } catch {
      // Most likely the plan photo is too large for the browser's storage quota. The
      // project JSON below is independent and still saves, so nothing else is lost.
    }
  }
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(rest))
  } catch {
    // Private browsing or quota exceeded — the in-memory state stays correct for this
    // session even though it won't survive a reload.
  }
}

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY)
    if (!raw) return null
    const rest = JSON.parse(raw) as Omit<Project, 'floor_plan_image_url'>
    let floor_plan_image_url: string | undefined
    try {
      floor_plan_image_url = localStorage.getItem(IMAGE_KEY) ?? undefined
    } catch {
      floor_plan_image_url = undefined
    }
    return { ...rest, floor_plan_image_url }
  } catch {
    return null
  }
}

export function clearProject(): void {
  try {
    localStorage.removeItem(IMAGE_KEY)
    localStorage.removeItem(PROJECT_KEY)
  } catch {
    // Nothing to do if storage is inaccessible — there's nothing persisted to worry about.
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
