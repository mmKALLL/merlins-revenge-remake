// Remake object tiles: objects-layer symbols the original keys do not have (the volley spells'
// scrolls), so maps and floors can place them. tools/convert-assets.ts writes them into the
// converted keys: on merlinOpenObjects into empty slots (beside the original scrolls first; painted with
// the scroll's art), on merlin4Objects after the key's last slot (its sheet has no empty slot; the
// game never draws the objects layer, so those tiles need no art).

/** Object key symbol -> tile index, per objects tileset. */
export const REMAKE_OBJECT_TILES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  merlinOpenObjects: {
    bombVolley: 31, boltFan: 32, arrowRain: 33, shurikenFan: 34, thunderBurst: 35, pinStorm: 36, lavaLob: 37, needleSpray: 40,
    // the second batch: the empty slots with no art on the sheet (18 and 53 are listed `none` but drawn on)
    longbow: 19, dragonFire: 20, boulderLob: 54, darkRockBurst: 55, poisonSmoke: 56, acidSplash: 57, lightningFan: 58, bunnyLob: 59,
    skullToss: 60, frostBurst: 100, iceBoulderLob: 102, chillFlame: 109, laserVolley: 110,
    // the archive's unused music tracks (music tiles are not drawn)
    musicFinalStand2: 206, musicMerl2319: 207, musicUltimateSongThing: 208,
  },
  merlin4Objects: {
    bombVolley: 173, boltFan: 174, arrowRain: 175, shurikenFan: 176, thunderBurst: 177, pinStorm: 178, lavaLob: 179, needleSpray: 180,
    longbow: 181, dragonFire: 182, boulderLob: 183, darkRockBurst: 184, poisonSmoke: 185, acidSplash: 186, lightningFan: 187, bunnyLob: 188,
    skullToss: 189, frostBurst: 190, iceBoulderLob: 191, chillFlame: 192, laserVolley: 193,
    musicFinalStand2: 194, musicMerl2319: 195, musicUltimateSongThing: 196,
  },
}

/**
 * The key's symbols with the remake's objects written in, padded with `none` up to a slot past its
 * end; a slot inside the key must be `none`.
 */
export function withRemakeObjectSymbols(tileSet: string, symbols: readonly string[]): string[] {
  const out = [...symbols]
  for (const [symbol, index] of Object.entries(REMAKE_OBJECT_TILES[tileSet] ?? {})) {
    while (out.length < index) out.push('none')
    if (out[index - 1] !== 'none') throw new Error(`remake object tile ${tileSet} ${index} (${symbol}): the slot holds ${out[index - 1]}`)
    out[index - 1] = symbol
  }
  return out
}
