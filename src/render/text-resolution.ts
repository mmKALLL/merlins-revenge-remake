/**
 * Text texture pixels per game pixel (owner request: softer than the 2x canvas, sharper than 1x).
 * The canvas renders at 2x for crisp sprites; text drawn at 1.5x is scaled up to it, smoothing it a little.
 */
export const TEXT_RESOLUTION = 1.5
