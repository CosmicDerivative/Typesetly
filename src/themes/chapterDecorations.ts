import type { ThemeChapterDecoration, ThemeChapterHeading } from '../types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function normalizeChapterDecoration(
  value: Partial<ThemeChapterDecoration>,
  index = 0,
): ThemeChapterDecoration {
  const placements = new Set<ThemeChapterDecoration['placement']>([
    'above-heading', 'header-overlay', 'below-heading', 'before-opening', 'chapter-footer',
  ])
  const aligns = new Set<ThemeChapterDecoration['align']>(['left', 'center', 'right'])
  return {
    id: value.id || `chapter-decoration-${index + 1}`,
    name: value.name?.trim() || `Decoration ${index + 1}`,
    imageDataUrl: value.imageDataUrl || '',
    placement: placements.has(value.placement as ThemeChapterDecoration['placement'])
      ? value.placement as ThemeChapterDecoration['placement']
      : 'header-overlay',
    align: aligns.has(value.align as ThemeChapterDecoration['align'])
      ? value.align as ThemeChapterDecoration['align']
      : 'center',
    width: clamp(Number(value.width || 28), 5, 100),
    offsetX: clamp(Number(value.offsetX || 0), -50, 50),
    offsetY: clamp(Number(value.offsetY || 0), -240, 240),
    opacity: clamp(Number(value.opacity ?? 100), 5, 100),
    rotation: clamp(Number(value.rotation || 0), -180, 180),
  }
}

export function chapterDecorations(heading: ThemeChapterHeading) {
  if (!heading.imageEnabled) return []
  return (heading.decorations || [])
    .map(normalizeChapterDecoration)
    .filter((item) => item.imageDataUrl)
}

/**
 * Reserve limited horizontal room for small artwork anchored beside a chapter
 * heading. Wide artwork is treated as a banner/background and stays behind
 * the full-width heading instead of forcing the title into a narrow column.
 */
export function chapterOverlayInsets(decorations: ThemeChapterDecoration[]) {
  let left = 0
  let right = 0

  for (const decoration of decorations) {
    if (decoration.placement !== 'header-overlay' || !decoration.imageDataUrl) continue
    if (decoration.width > 40) continue
    const offsetShare = decoration.width * decoration.offsetX / 100
    if (decoration.align === 'left') left = Math.max(left, decoration.width + offsetShare)
    if (decoration.align === 'right') right = Math.max(right, decoration.width - offsetShare)
  }

  left = clamp(left, 0, 32)
  right = clamp(right, 0, 32)
  const combined = left + right
  if (combined > 56) {
    const scale = 56 / combined
    left *= scale
    right *= scale
  }

  return { left, right }
}
