import type { Chapter } from '../types'

export interface TableOfContentsNode {
  page: Chapter
  children: TableOfContentsNode[]
}

const STRUCTURAL_PAGES = new Set<Chapter['type']>([
  'title-page',
  'copyright',
  'contents',
  'full-page-image',
])

/**
 * Return the authored pages readers normally expect to find in a book's TOC.
 * Export filtering happens before this helper is called, so print-only and
 * ebook-only pages cannot leak into the other format's navigation.
 */
export function tableOfContentsEntries(chapters: Chapter[]): Chapter[] {
  return chapters.filter(
    (chapter) =>
      !STRUCTURAL_PAGES.has(chapter.type) &&
      !chapter.options.hideInToc,
  )
}

/**
 * Build the hierarchy readers expect for books/parts. A visible Part owns the
 * pages whose partId points to it; orphaned or hidden-parent pages stay at the
 * root so no authored content disappears from navigation.
 */
export function tableOfContentsTree(chapters: Chapter[]): TableOfContentsNode[] {
  const entries = tableOfContentsEntries(chapters)
  const visibleParts = new Map(
    entries
      .filter((page) => page.type === 'part')
      .map((page) => [page.id, { page, children: [] as TableOfContentsNode[] }]),
  )
  const roots: TableOfContentsNode[] = []

  for (const page of entries) {
    const node = visibleParts.get(page.id) || { page, children: [] }
    const parent = page.partId ? visibleParts.get(page.partId) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}
