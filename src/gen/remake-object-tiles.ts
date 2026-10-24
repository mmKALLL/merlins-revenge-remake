// Remake object tiles: objects-layer symbols the original keys do not have (the volley spells'
// scrolls), so maps and floors can place them. tools/convert-assets.ts writes them into the
// converted keys: on merlinOpenObjects into empty slots beside the original scrolls (painted with
// the scroll's art), on merlin4Objects after the key's last slot (its sheet has no empty slot; the
// game never draws the objects layer, so those tiles need no art).

/** Object key symbol -> tile index, per objects tileset. */
export const REMAKE_OBJECT_TILES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  merlinOpenObjects: {
    bombVolley: 31, boltFan: 32, arrowRain: 33, shurikenFan: 34, thunderBurst: 35, pinStorm: 36, lavaLob: 37, needleSpray: 40,
  },
  merlin4Objects: {
    bombVolley: 173, boltFan: 174, arrowRain: 175, shurikenFan: 176, thunderBurst: 177, pinStorm: 178, lavaLob: 179, needleSpray: 180,
  },
}
