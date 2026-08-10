export const DEFAULT_PARAGRAPH_SPACING_EM = 0.8
export const MIN_PARAGRAPH_SPACING_EM = 0
export const MAX_PARAGRAPH_SPACING_EM = 3

/** Normalize saved and user-entered paragraph gaps to a portable em value. */
export function paragraphSpacingEm(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_PARAGRAPH_SPACING_EM
  return Math.min(
    MAX_PARAGRAPH_SPACING_EM,
    Math.max(MIN_PARAGRAPH_SPACING_EM, Number(value)),
  )
}
