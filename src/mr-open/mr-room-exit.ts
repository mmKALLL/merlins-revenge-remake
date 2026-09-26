// Port of collisionMaster.checkLeaveScreen / notifyOfScreenExit and the
// #leaveRoom handling in objPlayerMerlinCharacter, expressed in world coords.
import type { CollisionRect } from './mr-collision'
import type { Rect, Vec } from './mr-geometry'

/** Director's inside(point, rect): left <= x < right, top <= y < bottom */
export function insideRect(r: Rect, p: Vec): boolean {
  return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
}

/**
 * Which room the player is in after a move, given the current room's rect.
 *
 * The original computes `PointDirRect(newLoc, playAreaRect.inflate(-1, -1)) * -1`, i.e. it tests
 * against the rect shrunk by 1 px on every side, so it can report a diagonal exit when the reg
 * point leaves on one axis while being within 1 px of a side on the other. This port deliberately
 * reports only the axis (or axes) on which the point actually left `roomRect`.
 */
export function roomAfterMove(roomRect: Rect, loc: Vec, room: Vec): Vec {
  if (insideRect(roomRect, loc)) return room
  const dx = loc.x < roomRect.left ? -1 : loc.x >= roomRect.right ? 1 : 0
  const dy = loc.y < roomRect.top ? -1 : loc.y >= roomRect.bottom ? 1 : 0
  return { x: room.x + dx, y: room.y + dy }
}

/**
 * With exits closed the solid border ring blocks; equivalent to keeping the rect inside the room.
 *
 * Bounds follow objCollisionTile.initCollisionEdges (notes §6): a tile's left/top edge location
 * is `start - 1` and its right/bottom edge location is `end`. The border tile just past the
 * room's right edge therefore has left edge location `roomRect.right - 1`, and the push-out
 * (`rect.right - leftEdge`) leaves `rect.right == roomRect.right - 1`. The border tile before the
 * room's left edge has right edge location `roomRect.left`, leaving `rect.left == roomRect.left`.
 * Hence the `- 1` on the right/bottom bounds only. For the 18x9 room and the 30x30 player rect
 * this gives x in [15, 560] and y in [15, 272].
 */
export function clampToRoom(roomRect: Rect, loc: Vec, cr: CollisionRect): Vec {
  return {
    x: Math.min(roomRect.right - 1 - cr.right, Math.max(roomRect.left - cr.left, loc.x)),
    y: Math.min(roomRect.bottom - 1 - cr.bottom, Math.max(roomRect.top - cr.top, loc.y)),
  }
}
