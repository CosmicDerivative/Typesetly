import type { ThemePrint } from '../types'

/** CSS reference pixels per inch for Draft page geometry. */
const CSS_PX_PER_INCH = 96

/** Target width so 5.5–6" trims stay readable without dominating the desk. */
const DEFAULT_TARGET_WIDTH_PX = 720

export interface DraftPageMetrics {
  widthPx: number
  heightPx: number
  marginTopPx: number
  marginRightPx: number
  marginBottomPx: number
  marginLeftPx: number
  /** Desk gutter between stacked page sheets (Google Docs–style). */
  gapPx: number
  scale: number
}

/**
 * Map the active Design theme's print trim/margins onto Draft page sheets.
 * Scaled to a comfortable on-screen width while preserving aspect ratio.
 */
export function draftPageMetrics(
  print: ThemePrint,
  targetWidthPx = DEFAULT_TARGET_WIDTH_PX,
): DraftPageMetrics {
  const naturalWidth = Math.max(1, print.trimWidthIn * CSS_PX_PER_INCH)
  const scale = targetWidthPx / naturalWidth
  const round = (inches: number) => Math.max(8, Math.round(inches * CSS_PX_PER_INCH * scale))

  return {
    widthPx: Math.round(print.trimWidthIn * CSS_PX_PER_INCH * scale),
    heightPx: Math.round(print.trimHeightIn * CSS_PX_PER_INCH * scale),
    marginTopPx: round(print.marginTop),
    marginRightPx: round(print.marginOutside),
    marginBottomPx: round(print.marginBottom),
    marginLeftPx: round(print.marginInside),
    gapPx: 28,
    scale,
  }
}

/**
 * How many page sheets a measured content height would occupy.
 * Used for stack chrome; live Draft pagination uses per-page TipTap editors.
 */
export function draftPageCount(contentHeightPx: number, metrics: DraftPageMetrics) {
  const usable = Math.max(1, contentHeightPx)
  return Math.max(1, Math.ceil(usable / metrics.heightPx))
}

export function draftStackHeight(pageCount: number, metrics: DraftPageMetrics) {
  const pages = Math.max(1, pageCount)
  return pages * metrics.heightPx + (pages - 1) * metrics.gapPx
}
