// Shared geometry types for the sim, collision and room code.
export type Vec = { x: number; y: number }

/** Director-style rect: left/top inclusive, right/bottom exclusive (see `insideRect`). */
export interface Rect { left: number; top: number; right: number; bottom: number }

/** Tile size in pixels (objCollisionMap pTileSize). */
export const TILE_PX = 32

/** Euclidean distance between two points. */
export const distance = (a: Vec, b: Vec): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Centre of the world tile at 1-based tile coordinates (tx, ty), in world pixels. */
export const tileCentre = (tx: number, ty: number): Vec => ({ x: (tx - 1) * TILE_PX + TILE_PX / 2, y: (ty - 1) * TILE_PX + TILE_PX / 2 })
