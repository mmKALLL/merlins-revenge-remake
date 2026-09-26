// Pure sound rules from soundMaster, objSpell, objMusic and the Var* range helpers
// (docs/notes/engine-mechanics-sound.md). Playback itself lives in src/audio/.

/** soundMaster.pDefaultVolume (soundMaster.txt:22): used when a volume is void or #none (calcVolumeDefault). */
export const DEFAULT_VOLUME = 150
/** Director sound(n).volume range. */
export const MAX_VOLUME = 255
/** SFX channels 2-8 (channel 1 is music; soundMaster.txt:27, soundEmptyChan().txt:15-31). */
export const SFX_VOICES = 7
/** objRoom.pRoomClearedSound (objRoom.txt:64). */
export const ROOM_CLEARED_SOUND = 'end_screen'
/** objMusic.pMusicName that stops channel 1 instead of naming a track (soundMaster.playMusic, :145-148). */
export const STOP_MUSIC = 'stopMusic'

export interface ChargeVolumeMap {
  charge: [number, number]
  vol: [number, number]
}

/** structMaster.structAttack #chargeVolumeMap default (structMaster.txt:161). */
export const DEFAULT_CHARGE_VOLUME_MAP: ChargeVolumeMap = { charge: [1, 100], vol: [10, 255] }

/**
 * VarMapRange(var, varRange, valRange) = VarValRange(VarPercent(var, varRange), valRange): linear,
 * clamped to the ends of both ranges (VarPercent returns 0/100 outside the range, VarValRange returns
 * lRange[1]/lRange[2] at <= 0 / >= 100). Ranges may run in either direction.
 */
export function varMapRange(v: number, from: readonly [number, number], to: readonly [number, number]): number {
  const [a, b] = from
  if (v < Math.min(a, b)) return to[0]
  if (v > Math.max(a, b)) return to[1]
  const pct = a === b ? 100 : ((v - a) / (b - a)) * 100
  if (pct <= 0) return to[0]
  if (pct >= 100) return to[1]
  return to[0] + (pct / 100) * (to[1] - to[0])
}

/**
 * objSpell.playReleaseSound / goMode(#explode): the spell's volume from its current charge
 * (before chargeExplodeFactor on explode), kept inside Director's 0-255.
 */
export function chargeVolume(charge: number, map: ChargeVolumeMap = DEFAULT_CHARGE_VOLUME_MAP): number {
  return Math.max(0, Math.min(MAX_VOLUME, varMapRange(charge, map.charge, map.vol)))
}

/** soundMaster.playSound (:176-208): first free SFX channel, else the new sound is dropped (no voice stealing). */
export function hasFreeVoice(busy: number, voices: number = SFX_VOICES): boolean {
  return busy < voices
}

/** objMusic #musicName -> the track to play, or null for "stopMusic". */
export function musicTrackFromName(name: string): string | null {
  return name === STOP_MUSIC ? null : name
}

/**
 * The music a room's activation asks for: every objMusic actor in the room's objects layer calls
 * playMusic from start() (objMusic.txt:25-28) as objTileLayer.activateActors creates it, so with
 * several tiles the last one created wins (row-major order assumed). `undefined` = the room has no
 * music tile and leaves the current track alone; `null` = musicOff stops it.
 */
export function roomMusic(tracks: Iterable<string | null>): string | null | undefined {
  let out: string | null | undefined
  for (const t of tracks) out = t
  return out
}
