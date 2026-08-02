import type { Chapter } from '../types'

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
