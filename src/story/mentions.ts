import { plainTextFromHtml } from '../editor/diff.ts'
import type { BookProject, CharacterProfile } from '../types'

export interface ChapterMentions {
  chapterId: string
  chapterTitle: string
  count: number
}

export interface EntityMentions {
  total: number
  chapters: ChapterMentions[]
}

export type MentionIndex = Record<string, EntityMentions>

const mentionIndexCache = new WeakMap<BookProject, MentionIndex>()

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueTerms(values: string[]) {
  return [...new Set(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => value.toLocaleLowerCase()),
  )]
}

export function characterMentionTerms(character: CharacterProfile) {
  return uniqueTerms([
    character.name,
    ...character.aliases.split(/[,;\n]/),
  ])
}

export function countNamedMentions(text: string, terms: string[]) {
  const alternatives = uniqueTerms(terms)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex)
  if (!alternatives.length) return 0
  const matcher = new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?=$|[^\\p{L}\\p{N}_])`,
    'giu',
  )
  return [...text.matchAll(matcher)].length
}

export function buildMentionIndex(project: BookProject): MentionIndex {
  const bible = project.storyBible
  if (!bible) return {}
  const chapterText = project.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    text: `${chapter.title} ${chapter.subtitle || ''} ${plainTextFromHtml(chapter.content)}`,
  }))
  const entities = [
    ...bible.characters.map((character) => ({
      id: character.id,
      terms: characterMentionTerms(character),
    })),
    ...bible.world.map((entry) => ({
      id: entry.id,
      terms: uniqueTerms([
        entry.name,
        ...(entry.aliases || '').split(/[,;\n]/),
      ]),
    })),
  ]

  return Object.fromEntries(entities.map((entity) => {
    const chapters = chapterText
      .map((chapter) => ({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        count: countNamedMentions(chapter.text, entity.terms),
      }))
      .filter((chapter) => chapter.count > 0)
    return [
      entity.id,
      {
        total: chapters.reduce((sum, chapter) => sum + chapter.count, 0),
        chapters,
      },
    ]
  }))
}

export function getMentionIndex(project: BookProject) {
  const cached = mentionIndexCache.get(project)
  if (cached) return cached
  const index = buildMentionIndex(project)
  mentionIndexCache.set(project, index)
  return index
}
