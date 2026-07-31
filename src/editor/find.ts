import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { plainTextFromHtml } from './diff.ts'

export interface TextOccurrence {
  index: number
  length: number
}

export type FindScope = 'chapter' | 'book'

/** New Find sessions default to the active chapter/document. */
export const DEFAULT_FIND_SCOPE: FindScope = 'chapter'

/** How many result cards to show per page in the Find sidebar list. */
export const FIND_RESULTS_PAGE_SIZE = 8

export interface FindResultsPage {
  page: number
  pageCount: number
  start: number
  end: number
}

export function findResultsPageSlice(
  total: number,
  page: number,
  pageSize = FIND_RESULTS_PAGE_SIZE,
): FindResultsPage {
  if (total <= 0 || pageSize <= 0) {
    return { page: 0, pageCount: 1, start: 0, end: 0 }
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(0, page), pageCount - 1)
  const start = safePage * pageSize
  return {
    page: safePage,
    pageCount,
    start,
    end: Math.min(total, start + pageSize),
  }
}

export interface FindMatchItem {
  chapterId: string
  chapterTitle: string
  occurrenceInChapter: number
  globalIndex: number
  snippet: string
  highlightStart: number
  highlightLength: number
}

export function findTextOccurrences(
  text: string,
  query: string,
  caseSensitive = false,
): TextOccurrence[] {
  if (!query) return []
  const haystack = caseSensitive ? text : text.toLocaleLowerCase()
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const occurrences: TextOccurrence[] = []
  let cursor = 0
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor)
    if (index < 0) break
    occurrences.push({ index, length: needle.length })
    cursor = index + Math.max(needle.length, 1)
  }
  return occurrences
}

export function findInChapterHtml(
  html: string,
  query: string,
  caseSensitive = false,
): TextOccurrence[] {
  return findTextOccurrences(plainTextFromHtml(html), query, caseSensitive)
}

const SNIPPET_CONTEXT = 36

export function snippetAroundMatch(
  text: string,
  index: number,
  length: number,
  context = SNIPPET_CONTEXT,
): { snippet: string; highlightStart: number; highlightLength: number } {
  const start = Math.max(0, index - context)
  const end = Math.min(text.length, index + length + context)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return {
    snippet: `${prefix}${text.slice(start, end)}${suffix}`,
    highlightStart: prefix.length + (index - start),
    highlightLength: length,
  }
}

export function collectFindMatches(
  chapters: Array<{ id: string; title: string; content: string }>,
  query: string,
  caseSensitive = false,
): FindMatchItem[] {
  if (!query) return []
  const items: FindMatchItem[] = []
  let globalIndex = 0
  for (const chapter of chapters) {
    const text = plainTextFromHtml(chapter.content)
    const occurrences = findTextOccurrences(text, query, caseSensitive)
    for (let occurrenceInChapter = 0; occurrenceInChapter < occurrences.length; occurrenceInChapter += 1) {
      const occurrence = occurrences[occurrenceInChapter]
      const around = snippetAroundMatch(text, occurrence.index, occurrence.length)
      items.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        occurrenceInChapter,
        globalIndex: globalIndex++,
        snippet: around.snippet,
        highlightStart: around.highlightStart,
        highlightLength: around.highlightLength,
      })
    }
  }
  return items
}

export type FindHighlightRange = {
  matches: Array<{ from: number; to: number }>
  activeIndex: number
} | null

export const findHighlightKey = new PluginKey<DecorationSet>('findHighlight')

/** Inline decorations so Find matches stay visible while the panel keeps DOM focus. */
export function createFindHighlightPlugin() {
  return new Plugin({
    key: findHighlightKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const meta = tr.getMeta(findHighlightKey) as FindHighlightRange | undefined
        if (meta === null) return DecorationSet.empty
        if (meta && Array.isArray(meta.matches)) {
          const active = Math.min(Math.max(0, meta.activeIndex), Math.max(0, meta.matches.length - 1))
          return DecorationSet.create(
            tr.doc,
            meta.matches.map((range, index) =>
              Decoration.inline(range.from, range.to, {
                class: index === active ? 'find-match-highlight' : 'find-match',
              }),
            ),
          )
        }
        return set.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        return findHighlightKey.getState(state)
      },
    },
  })
}

export const FindHighlight = Extension.create({
  name: 'findHighlight',
  addProseMirrorPlugins() {
    return [createFindHighlightPlugin()]
  },
})

export type ExternalProofreadingMode = 'auto' | 'always' | 'off'

// Plain-text length of one active editor field (not HTML). Draft passes only
// the focused page, so a long chapter never makes an extension scan the whole
// manuscript at once.
export const EXTERNAL_PROOFREADING_CHARACTER_LIMIT = 25_000

/** Visible text length an extension would scan (tags stripped). */
export function plainTextCharacterCount(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .length
}

export function externalProofreadingEnabled(
  mode: ExternalProofreadingMode,
  characterCount: number,
) {
  if (mode === 'off') return false
  if (mode === 'always') return true
  return characterCount <= EXTERNAL_PROOFREADING_CHARACTER_LIMIT
}

/** Grammar extensions may inspect only the page that currently owns focus. */
export function externalProofreadingEnabledForPage(
  mode: ExternalProofreadingMode,
  pageHtml: string,
  pageIndex: number,
  activePageIndex: number,
) {
  return pageIndex === activePageIndex
    && externalProofreadingEnabled(mode, plainTextCharacterCount(pageHtml))
}
