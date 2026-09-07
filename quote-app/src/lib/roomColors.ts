// Assigning each room a stable hue (by its position in a stable room-id list, so it
// never changes as more rooms are added) and using it for that room's own floor trace —
// plus a small swatch anywhere its name appears — makes it instantly readable on a plan
// with several rooms. Generalized from the prototype's roomColors.ts to take a plain
// room-id list instead of a Room[] from the old schema, so it stays decoupled from
// whatever the caller's data model looks like.
const PALETTE = ['#0EA5A5', '#7C6FE0', '#D9748A', '#C98A2E', '#4C9A6A', '#4C86C9', '#B25FB0', '#9AA23A']

export function getRoomColor(roomIds: string[], roomId: string | undefined): string {
  if (!roomId) return '#96948A'
  const idx = roomIds.indexOf(roomId)
  return PALETTE[idx >= 0 ? idx % PALETTE.length : 0]
}

// The color a not-yet-confirmed room will get once added — so its preview matches what
// it turns into rather than always showing the same placeholder hue.
export function getNextRoomColor(roomCount: number): string {
  return PALETTE[roomCount % PALETTE.length]
}
