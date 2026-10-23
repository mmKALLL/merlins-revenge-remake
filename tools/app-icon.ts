// The installed app's icon (remake, manifest.webmanifest): a game sprite frame scaled up by a whole
// number with hard pixels, centred on a square of the page's colour. The art stays inside the middle
// 80 %, the safe zone of a maskable icon, so launchers may crop it to any shape.
import type { RgbaImage } from './bmp'

/** Share of the icon's side the art may cover (a maskable icon's safe zone is a centred circle of 80 %). */
const ART_SHARE = 0.75

/** `art` on a `size` x `size` square of `background` (RGB), scaled by the largest whole factor that fits. */
export function appIcon(art: RgbaImage, size: number, background: [number, number, number]): RgbaImage {
  const scale = Math.max(1, Math.floor((size * ART_SHARE) / Math.max(art.width, art.height)))
  const left = Math.floor((size - art.width * scale) / 2)
  const top = Math.floor((size - art.height * scale) / 2)
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4
      const ax = Math.floor((x - left) / scale)
      const ay = Math.floor((y - top) / scale)
      const inside = x >= left && y >= top && ax < art.width && ay < art.height
      const a = inside ? (ay * art.width + ax) * 4 : -1
      const opaque = a >= 0 && art.rgba[a + 3]! >= 128 // 1-bit transparency, as the frames have
      rgba[o] = opaque ? art.rgba[a]! : background[0]
      rgba[o + 1] = opaque ? art.rgba[a + 1]! : background[1]
      rgba[o + 2] = opaque ? art.rgba[a + 2]! : background[2]
      rgba[o + 3] = 255
    }
  }
  return { width: size, height: size, rgba }
}
