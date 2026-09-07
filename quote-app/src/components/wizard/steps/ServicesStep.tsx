import { Room } from '../../../types/project'

interface Props {
  rooms: Room[]
}

// Placeholder — the room/service tagging UI (category-organized picker, auto-quantity,
// modifier config, bulk actions) is the next build-order step, not this one. What's
// real here is only the room list itself, carried over from the Rooms step so it's
// clear what there is to tag once the picker exists.
export default function ServicesStep({ rooms }: Props) {
  return (
    <div className="placeholderStep">
      <div className="placeholderCard">
        <h2>Service tagging — coming next</h2>
        <p className="meta">
          The category-organized service picker, auto-quantity from room geometry, and modifier config for bespoke
          items aren't built yet. This is where a click-to-select room's service list will live.
        </p>
        {rooms.length > 0 && (
          <ul className="placeholderRoomList">
            {rooms.map(r => (
              <li key={r.id}>{r.label}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
