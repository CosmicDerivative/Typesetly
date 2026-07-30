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

/**
 * True when a page has no author-visible content.
 * Empty paragraphs alone count as empty; scene breaks, page breaks, images,
 * and other structural nodes do not.
 */
export function isEmptyPageHtml(html: string) {
  const normalized = normalizePageHtml(html)
  if (/data-typesetly-node=["'][^"']+["']/i.test(normalized)) return false
  if (/<(hr|img|table|ul|ol|blockquote|h[1-6])\b/i.test(normalized)) return false
  const text = normalized
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
  return text.length === 0
}

/** How many empty `<p>` blocks a blank-only page carries. */
export function countBlankParagraphs(html: string) {
  if (!isEmptyPageHtml(html)) return 0
  return (normalizePageHtml(html).match(/<p\b[^>]*>\s*<\/p>/gi) || []).length
}

/**
 * Drop sheets that no longer hold content, without erasing intentional
 * trailing Enter blanks on the last page.
 *
 * Rules:
 * 1. Always remove empty pages that are not last (leftovers after pull/move).
 * 2. Keep a blank last page when `preserveLastEmptyPage` is set (focused end
 *    surface, or previous page still overflowing onto it).
 * 3. Otherwise drop a blank last page; if it had multiple empty paragraphs,
 *    fold those onto the previous page so Enter lines survive as content.
 */
export function pruneEmptyDraftPages(
  pages: string[],
  options: { preserveLastEmptyPage?: boolean } = {},
) {
  const normalized = (pages.length ? pages : [EMPTY_PAGE]).map(normalizePageHtml)
  const withoutMiddle: string[] = []
  for (let index = 0; index < normalized.length; index += 1) {
    const page = normalized[index]!
    const isLast = index === normalized.length - 1
    if (!isLast && isEmptyPageHtml(page)) continue
    withoutMiddle.push(page)
  }

  if (!withoutMiddle.length) return [EMPTY_PAGE]
  if (withoutMiddle.length === 1) return withoutMiddle

  const last = withoutMiddle[withoutMiddle.length - 1]!
  if (!isEmptyPageHtml(last) || options.preserveLastEmptyPage) return withoutMiddle

  const previous = withoutMiddle[withoutMiddle.length - 2]!
  const blankCount = countBlankParagraphs(last)
  if (blankCount <= 1) return withoutMiddle.slice(0, -1)
  return [
    ...withoutMiddle.slice(0, -2),
    normalizePageHtml(`${previous}${last}`),
  ]
}

/**
 * Reassemble Draft page editors into the single chapter HTML Typesetly stores.
 * Preserves trailing empty paragraphs so intentional blank lines survive save.
 */
export function joinChapterPages(pages: string[]) {
  const parts = pages.map((page) => normalizePageHtml(page))
  if (!parts.length) return EMPTY_PAGE
  // Keep empty pages as blank paragraph(s) in the joined document. Filtering
  // them used to erase Enter-at-end blanks and overflowed empty blocks.
  return parts.join('')
    // Whitespace at an element edge is unstable while content moves between
    // page editors. Restore the authored separator before removing the seam.
    .replace(
      /<\/p>\s*<p\b(?=[^>]*data-typesetly-page-continuation=["']true["'])(?=[^>]*data-typesetly-page-space=["']true["'])[^>]*>/gi,
      ' ',
    )
    // A paged editor may split one paragraph into two page-local paragraphs.
    // Remove that artificial seam before storing the chapter.
    .replace(
      /<\/p>\s*<p\b[^>]*data-typesetly-page-continuation=["']true["'][^>]*>/gi,
      '',
    )
    // Defensive cleanup for an orphan marker after unusual structural edits.
    .replace(/\sdata-typesetly-page-(?:continuation|space)=["']true["']/gi, '')
    || EMPTY_PAGE
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
      // Preserve intentional blank-only segments (e.g. trailing Enter pages).
      pages.push(normalizePageHtml(segment))
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
      // Empty paragraphs are free in the char budget (height reflow places them).
      // Structural voids (scene/page breaks, images) still consume a slot.
      const size = plainLength(block) || (
        /<(hr|img)\b/i.test(block) || /data-typesetly-node=/i.test(block) ? 1 : 0
      )
      if (current.length && size > 0 && used + size > budget) {
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

/**
 * Split HTML into top-level blocks. Must keep void tags such as TipTap scene
 * breaks (`<hr data-typesetly-node="scene-break">`) which are neither paired
 * nor written with a trailing slash.
 */
export function splitTopLevelBlocks(html: string) {
  const source = normalizePageHtml(html)
  const blocks: string[] = []
  const tagPattern =
    /<([a-z0-9]+)(\s[^>]*)?>[\s\S]*?<\/\1>|<((?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr))(\s[^>]*)?\/?>|<([a-z0-9]+)(\s[^>]*)?\/>/gi
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
