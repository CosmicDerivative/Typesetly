import { plainTextFromHtml } from './diff.ts'

export interface TextOccurrence {
  index: number
  length: number
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

export type ExternalProofreadingMode = 'auto' | 'always' | 'off'

export const EXTERNAL_PROOFREADING_CHARACTER_LIMIT = 30_000

export function externalProofreadingEnabled(
  mode: ExternalProofreadingMode,
  characterCount: number,
) {
  if (mode === 'off') return false
  if (mode === 'always') return true
  return characterCount <= EXTERNAL_PROOFREADING_CHARACTER_LIMIT
}
