import { Project } from '../../types/project'

interface Props {
  project: Project
}

// Visible at every step — turns the wizard into a live receipt instead of a black box.
// Reads directly off the project, so once room/service tagging actually writes
// TaggedService entries this updates for free; nothing here is step-specific.
export default function WizardSidebar({ project }: Props) {
  const allTagged = [...project.rooms.flatMap(r => r.tagged_services), ...project.project_line_items]
  const subtotal = allTagged.reduce((sum, t) => sum + t.computed_total, 0)

  return (
    <div className="wizardSidebar">
      <div className="sidebarSection">
        <div className="label">Rooms</div>
        {project.rooms.length === 0 ? (
          <div className="meta">None yet</div>
        ) : (
          project.rooms.map(r => (
            <div key={r.id} className="sidebarRow">
              <span>{r.label}</span>
              <span className="meta">{r.tagged_services.length} service{r.tagged_services.length === 1 ? '' : 's'}</span>
            </div>
          ))
        )}
      </div>

      {project.project_line_items.length > 0 && (
        <div className="sidebarSection">
          <div className="label">Project-level</div>
          <div className="sidebarRow">
            <span>Consultations / Refine</span>
            <span className="meta">{project.project_line_items.length}</span>
          </div>
        </div>
      )}

      <div className="sidebarSection">
        <div className="label">Materials supplied by</div>
        <div className="meta">{project.materials_supplied_by === 'contractor' ? 'Contractor' : 'Client'}</div>
      </div>

      <div className="sidebarTotal">
        <span>Running subtotal</span>
        <strong>${subtotal.toFixed(0)}</strong>
      </div>
    </div>
  )
}
