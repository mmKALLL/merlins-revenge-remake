// A best score shortened for the map lists, truncated (never rounded up) with no trailing zeros:
// up to 4 digits as they are, then k with 3 significant digits (12.3k, 123k), then M with 4
// (1.234M, 12.34M, 123.4M).

/** Scores up to this many digits show in full. */
const FULL_DIGITS = 4

const SUFFIXES = [
  { at: 1e6, suffix: 'M', significantDigits: 4 },
  { at: 1e3, suffix: 'k', significantDigits: 3 },
] as const

/** `score` shortened, e.g. 9999 -> "9999", 12345 -> "12.3k", 123456 -> "123k", 1234567 -> "1.234M". */
export function shortScore(score: number): string {
  const whole = Math.floor(score)
  if (String(whole).length <= FULL_DIGITS) return String(whole)
  const { at, suffix, significantDigits } = SUFFIXES.find((s) => whole >= s.at)!
  const intDigits = String(Math.floor(whole / at)).length
  const decimals = Math.max(0, significantDigits - intDigits)
  const scale = 10 ** decimals
  const truncated = Math.floor((whole / at) * scale) / scale
  const text = truncated.toFixed(decimals)
  return `${decimals > 0 ? text.replace(/\.?0+$/, '') : text}${suffix}`
}
