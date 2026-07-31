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
 * Which top-level block should overflow-move first.
 *
 * When the caret is inside a trailing empty-paragraph run (Enter at end of a
 * full page), move from the caret’s blank onward — not the whole padding run.
 * Dumping every blank that filled empty sheet space onto the next page parked
 * the caret halfway down. Otherwise skip trailing empties and move the last
 * real block (avoids minting empty pages when a tall LitRPG overflows).
 */
export function draftOverflowMoveIndex(
  childIsEmpty: boolean[],
  caretChildIndex: number | null | undefined,
) {
  const last = childIsEmpty.length - 1
  if (last < 0) return 0

  let trailingStart = -1
  if (childIsEmpty[last]) {
    trailingStart = last
    while (trailingStart > 0 && childIsEmpty[trailingStart - 1]) {
      trailingStart -= 1
    }
  }

  if (
    trailingStart >= 0
    && caretChildIndex !== null
    && caretChildIndex !== undefined
    && caretChildIndex >= trailingStart
  ) {
    return caretChildIndex
  }

  let moveIndex = last
  while (moveIndex > 0 && childIsEmpty[moveIndex]) {
    moveIndex -= 1
  }
  return moveIndex
}

/** Index of the last page with author-visible content, or -1 if all blank. */
export function lastContentPageIndex(pages: string[]) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    if (!isEmptyPageHtml(pages[index] || '')) return index
  }
  return -1
}

/**
 * Drop sheets that no longer hold content, without erasing intentional
 * trailing Enter blanks at the end of the document.
 *
 * Rules:
 * 1. Always remove empty pages that sit *before* the last content page
 *    (holes after pull/move or after the author clears a middle sheet).
 *    Never leave a blank hole between content pages.
 * 2. Trailing blank page(s) after the last content page are kept when
 *    `preserveLastEmptyPage` is set (caret on/after last content, or Enter
 *    overflow creating end sheets). Multiple intentional blank end pages
 *    must all survive — not only the final sheet.
 * 3. Otherwise drop trailing blank page(s) entirely. Never fold their empty
 *    paragraphs onto the previous page — that synthesized mid-page multi-line
 *    gaps when the author left the blank sheet (Enter-at-end jump).
 */
export function pruneEmptyDraftPages(
  pages: string[],
  options: { preserveLastEmptyPage?: boolean } = {},
) {
  const normalized = (pages.length ? pages : [EMPTY_PAGE]).map(normalizePageHtml)
  const lastContent = lastContentPageIndex(normalized)

  if (lastContent < 0) {
    // Entirely blank: keep the sheets when preserving end blanks, else one empty.
    if (options.preserveLastEmptyPage) return normalized.length ? normalized : [EMPTY_PAGE]
    return [EMPTY_PAGE]
  }

  const contentPages: string[] = []
  for (let index = 0; index <= lastContent; index += 1) {
    const page = normalized[index]!
    if (isEmptyPageHtml(page)) continue
    contentPages.push(page)
  }
  if (!contentPages.length) return [EMPTY_PAGE]

  if (!options.preserveLastEmptyPage) return contentPages

  const trailing: string[] = []
  for (let index = lastContent + 1; index < normalized.length; index += 1) {
    const page = normalized[index]!
    if (isEmptyPageHtml(page)) trailing.push(page)
  }
  return trailing.length ? [...contentPages, ...trailing] : contentPages
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
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex]!
      // Empty paragraphs are free in the char budget (height reflow places them).
      // Scene breaks need a real budget: Draft CSS gives them ~53px of margin
      // chrome, and Scrivener joins scenes with these HRs — costing "1" left the
      // shift parked in the previous page's overflow clip.
      const size = draftBlockPackCost(block, budget)
      const isSceneBreak = isSceneBreakBlock(block)
      const isLitRpg = isLitRpgBlock(block)
      // Prefer a fresh sheet before a late-page scene shift so the HR + new scene
      // start are not packed into the last lines of an almost-full page.
      if (current.length && isSceneBreak && used > budget * 0.72) {
        pages.push(current.join(''))
        current = [block]
        used = size
        continue
      }
      // LitRPG at the end of a run (no author content after): late-shift off a
      // nearly-full page so reload does not park a tall status screen in the
      // overflow clip. Sandwiched LitRPG (prose after) stays with neighbors —
      // only break when the block itself will not fit.
      if (
        current.length
        && isLitRpg
        && used > budget * 0.55
        && !draftBlocksHaveAuthorContentAfter(blocks, blockIndex)
      ) {
        pages.push(current.join(''))
        current = [block]
        used = size
        continue
      }
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
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
    'meta', 'source', 'track', 'wbr',
  ])
  const tagPattern = /<!--[\s\S]*?-->|<\/?([a-z0-9]+)\b[^>]*>/gi
  let depth = 0
  let blockStart = -1
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(source))) {
    if (match[0].startsWith('<!--')) continue
    const tag = (match[1] || '').toLowerCase()
    const closing = match[0].startsWith('</')
    const selfClosing = match[0].endsWith('/>') || voidTags.has(tag)

    if (!closing) {
      if (depth === 0) blockStart = match.index
      if (selfClosing) {
        if (depth === 0 && blockStart >= 0) {
          blocks.push(source.slice(blockStart, tagPattern.lastIndex))
          blockStart = -1
        }
      } else {
        depth += 1
      }
      continue
    }

    if (depth > 0) depth -= 1
    if (depth === 0 && blockStart >= 0) {
      blocks.push(source.slice(blockStart, tagPattern.lastIndex))
      blockStart = -1
    }
  }
  if (blockStart >= 0) blocks.push(source.slice(blockStart))
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

/** Scrivener / editor scene separator (`<hr data-typesetly-node="scene-break">`). */
export function isSceneBreakBlock(html: string) {
  return /data-typesetly-node=["']scene-break["']/i.test(html) || /^<hr\b/i.test(html.trim())
}

/** LitRPG status / system panel atom (`<div data-typesetly-node="litrpg-block">`). */
export function isLitRpgBlock(html: string) {
  return /data-typesetly-node=["']litrpg-block["']/i.test(html)
}

/** True when a top-level block has author-visible content (not an empty `<p>`). */
export function draftBlockHasAuthorContent(html: string) {
  if (isEmptyPageHtml(html)) return false
  // isEmptyPageHtml treats a lone empty paragraph page as empty; a single
  // empty `<p>` block is also non-content for sandwich checks.
  const normalized = normalizePageHtml(html)
  if (/^<p\b[^>]*>\s*(?:<br\b[^>]*>\s*)?<\/p>$/i.test(normalized)) return false
  return true
}

/** True when any later top-level block still holds author-visible content. */
export function draftBlocksHaveAuthorContentAfter(blocks: string[], index: number) {
  for (let after = index + 1; after < blocks.length; after += 1) {
    if (draftBlockHasAuthorContent(blocks[after] || '')) return true
  }
  return false
}

/**
 * Character-budget weight for one top-level block during the first pack pass.
 * Scene breaks are visually tall (~26px margins each side in Draft) despite
 * having no text — under-weighting them stranded Scrivener scene shifts in the
 * previous page's overflow:hidden clip.
 *
 * LitRPG blocks are worse: plain text inside a status screen is tiny, but the
 * freeform canvas / table + Draft node-view toolbar dominate page height.
 * Under-costing them on reload packed them into the previous sheet's
 * overflow:hidden clip (restart jump-back).
 */
export function draftBlockPackCost(block: string, charsPerPage: number) {
  const budget = Math.max(200, charsPerPage)
  if (isLitRpgBlock(block)) {
    const text = plainLength(block)
    const canvasMatch = block.match(/data-canvas-height=["'](\d+)["']/i)
    const styleHeightMatch = block.match(
      /litrpg-freeform-canvas[^>]*style=["'][^"']*height:\s*(\d+)px/i,
    )
    const canvasHeight = Number(canvasMatch?.[1] || styleHeightMatch?.[1] || 0)
    const rowCount = (block.match(/<tr\b/gi) || []).length
    // Map visual height → char budget. ~620px ≈ one Draft body; +toolbar chrome.
    const chromePx = 36
    let visualPx = chromePx + 160
    if (canvasHeight > 0) {
      visualPx = chromePx + canvasHeight + 24
    } else if (rowCount > 0) {
      visualPx = chromePx + 72 + rowCount * 36
    }
    const visualFraction = Math.min(0.98, Math.max(0.28, visualPx / 620))
    return Math.max(text, Math.floor(budget * visualFraction))
  }
  const text = plainLength(block)
  if (text > 0) return text
  if (isSceneBreakBlock(block)) {
    return Math.max(72, Math.floor(budget * 0.12))
  }
  if (/<img\b/i.test(block) || /data-typesetly-node=/i.test(block)) {
    return Math.max(40, Math.floor(budget * 0.1))
  }
  return 0
}

/**
 * When a page overflows, prefer shedding trailing content after a LitRPG block
 * so sandwiched prose→status→prose stays contiguous. Only move the LitRPG
 * itself when nothing real follows it on this sheet.
 */
export function draftOverflowMoveIndexPreferTrailingAfterLitRpg(
  childIsEmpty: boolean[],
  childIsLitRpg: boolean[],
  caretChildIndex: number | null | undefined,
) {
  const moveIndex = draftOverflowMoveIndex(childIsEmpty, caretChildIndex)
  if (childIsEmpty[moveIndex] || !childIsLitRpg[moveIndex]) return moveIndex

  // Moving a LitRPG while real non-LitRPG content still follows on this sheet:
  // shed that trailing content first (keep the status block with prose above).
  let firstTrailingReal = -1
  for (let after = moveIndex + 1; after < childIsEmpty.length; after += 1) {
    if (!childIsEmpty[after] && !childIsLitRpg[after]) {
      firstTrailingReal = after
      break
    }
  }
  if (firstTrailingReal < 0) return moveIndex

  // Treat the LitRPG (and anything before the trailing real run) as already
  // settled so draftOverflowMoveIndex picks the trailing prose.
  const masked = childIsEmpty.map((empty, index) => empty || index < firstTrailingReal)
  return draftOverflowMoveIndex(masked, caretChildIndex)
}

/**
 * When overflowing the first block after a scene break, move the break with it
 * so the scene shift stays on one sheet (HR chrome + new scene start together).
 */
export function draftOverflowMoveIndexKeepingSceneBreak(
  childIsEmpty: boolean[],
  childIsSceneBreak: boolean[],
  caretChildIndex: number | null | undefined,
) {
  let moveIndex = draftOverflowMoveIndex(childIsEmpty, caretChildIndex)
  if (
    moveIndex <= 0
    || !childIsSceneBreak[moveIndex - 1]
    || childIsEmpty[moveIndex]
    || childIsSceneBreak[moveIndex]
  ) {
    return moveIndex
  }
  // Enter-at-end blanks after the scene must not drag the scene break forward.
  const last = childIsEmpty.length - 1
  if (childIsEmpty[last]) {
    let trailingStart = last
    while (trailingStart > 0 && childIsEmpty[trailingStart - 1]) trailingStart -= 1
    if (
      caretChildIndex !== null
      && caretChildIndex !== undefined
      && caretChildIndex >= trailingStart
    ) {
      return moveIndex
    }
  }
  return moveIndex - 1
}

/** Content box height inside a Draft page sheet (excludes margins). */
export function draftPageBodyHeight(metrics: DraftPageMetrics, chromePx = 0) {
  return Math.max(
    120,
    metrics.heightPx - metrics.marginTopPx - metrics.marginBottomPx - Math.max(0, chromePx),
  )
}

/**
 * Vertical space occupied by first-page chrome, including margins that sit
 * outside getBoundingClientRect but still shrink the body.
 */
export function draftChromeOccupiedHeight(
  borderBoxHeightPx: number,
  marginTopPx = 0,
  marginBottomPx = 0,
) {
  return Math.max(0, borderBoxHeightPx)
    + Math.max(0, marginTopPx)
    + Math.max(0, marginBottomPx)
}

/** True when a laid-out block bottom paints past the page body clip edge. */
export function draftContentExceedsPageClip(
  contentBottomPx: number,
  clipBottomPx: number,
  epsilonPx = 0.5,
) {
  return contentBottomPx > clipBottomPx + epsilonPx
}
