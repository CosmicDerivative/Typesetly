import type { DraftPageMetrics } from './draftPages'

const EMPTY_PAGE = '<p></p>'

/** Rough glyph budget for the first layout pass before height reflow. */
export function estimateCharsPerPage(
  metrics: DraftPageMetrics,
  fontSize: number,
  lineHeight: number,
) {
  const contentWidth = Math.max(
    80,
    metrics.widthPx - metrics.marginLeftPx - metrics.marginRightPx,
  )
  const contentHeight = Math.max(
    80,
    metrics.heightPx - metrics.marginTopPx - metrics.marginBottomPx,
  )
  const charsPerLine = Math.max(18, Math.floor(contentWidth / (fontSize * 0.52)))
  const lines = Math.max(6, Math.floor(contentHeight / (fontSize * lineHeight)))
  return charsPerLine * lines
}

export function normalizePageHtml(html: string | null | undefined) {
  const trimmed = (html || '').trim()
  if (!trimmed) return EMPTY_PAGE
  return trimmed
}

export function isEmptyPageHtml(html: string) {
  const normalized = normalizePageHtml(html)
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
  return normalized.length === 0
}

/** Reassemble Draft page editors into the single chapter HTML Typesetly stores. */
export function joinChapterPages(pages: string[]) {
  const parts = pages
    .map((page) => normalizePageHtml(page))
    .filter((page) => !isEmptyPageHtml(page))
  return parts.length ? parts.join('') : EMPTY_PAGE
}

/**
 * Split chapter HTML into page-sized chunks.
 * Honors explicit page-break nodes, then packs remaining blocks by character budget.
 */
export function splitChapterIntoPages(html: string, charsPerPage: number) {
  const budget = Math.max(200, charsPerPage)
  const segments = splitOnExplicitPageBreaks(html)
  const pages: string[] = []

  for (const segment of segments) {
    if (isEmptyPageHtml(segment)) {
      if (!pages.length) pages.push(EMPTY_PAGE)
      continue
    }
    const blocks = splitTopLevelBlocks(segment)
    if (!blocks.length) {
      pages.push(EMPTY_PAGE)
      continue
    }

    let current: string[] = []
    let used = 0
    for (const block of blocks) {
      const size = plainLength(block)
      if (current.length && used + size > budget) {
        pages.push(current.join(''))
        current = [block]
        used = size
      } else {
        current.push(block)
        used += size
      }
    }
    if (current.length) pages.push(current.join(''))
  }

  return pages.length ? pages : [EMPTY_PAGE]
}

function splitOnExplicitPageBreaks(html: string) {
  const source = normalizePageHtml(html)
  const breakPattern = /<div\b[^>]*data-typesetly-node=["']page-break["'][^>]*>\s*<\/div>/gi
  const pages = source.split(breakPattern).map((part) => part.trim() || '<p></p>')
  return pages.length ? pages : ['<p></p>']
}

function splitTopLevelBlocks(html: string) {
  const source = normalizePageHtml(html)
  const blocks: string[] = []
  const tagPattern = /<([a-z0-9]+)(\s[^>]*)?>[\s\S]*?<\/\1>|<([a-z0-9]+)(\s[^>]*)?\/>/gi
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(source))) {
    blocks.push(match[0])
  }
  return blocks.length ? blocks : [source]
}

function plainLength(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .length
}

/** Content box height inside a Draft page sheet (excludes margins). */
export function draftPageBodyHeight(metrics: DraftPageMetrics, chromePx = 0) {
  return Math.max(
    120,
    metrics.heightPx - metrics.marginTopPx - metrics.marginBottomPx - Math.max(0, chromePx),
  )
}
