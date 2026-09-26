// Shared geometry types for the sim, collision and room code.
export type Vec = { x: number; y: number }

/** Director-style rect: left/top inclusive, right/bottom exclusive (see `insideRect`). */
export interface Rect { left: number; top: number; right: number; bottom: number }

/** Tile size in pixels (objCollisionMap pTileSize). */
export const TILE_PX = 32
