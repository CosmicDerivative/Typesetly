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
