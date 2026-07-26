import {
  BACK_MATTER_TYPES,
  FRONT_MATTER_TYPES,
} from '../data.ts'
import type { BookProject, Chapter, PageType } from '../types.ts'

export const REQUIRED_PAGE_TYPES: PageType[] = ['title-page', 'copyright', 'contents']

export const CONVERTIBLE_BODY_TYPES: PageType[] = [
  'chapter',
  'part',
  'custom-page',
  'full-page-image',
]

export const CONVERTIBLE_FRONT_TYPES: PageType[] = FRONT_MATTER_TYPES.filter(
  (type) => !REQUIRED_PAGE_TYPES.includes(type),
)

export const CONVERTIBLE_BACK_TYPES: PageType[] = [...BACK_MATTER_TYPES]

export const CONVERTIBLE_PAGE_TYPES: PageType[] = [
  ...CONVERTIBLE_BODY_TYPES,
  ...CONVERTIBLE_FRONT_TYPES,
  ...CONVERTIBLE_BACK_TYPES,
]

export type PageSection = 'front' | 'body' | 'back'

export function pageSection(type: PageType): PageSection {
  if (FRONT_MATTER_TYPES.includes(type)) return 'front'
  if (BACK_MATTER_TYPES.includes(type)) return 'back'
  return 'body'
}

const TITLE_TYPE_MAP = new Map<string, PageType>([
  ['dedication', 'dedication'],
  ['epigraph', 'epigraph'],
  ['foreword', 'foreword'],
  ['preface', 'preface'],
  ['prologue', 'prologue'],
  ['epilogue', 'epilogue'],
  ['afterword', 'afterword'],
  ['acknowledgements', 'acknowledgements'],
  ['acknowledgments', 'acknowledgements'],
  ['about the author', 'about-author'],
  ['author bio', 'about-author'],
  ['notes', 'notes'],
  ['bibliography', 'bibliography'],
])

/**
 * Recognize only unambiguous, whole-title matter names. A title such as
 * "Chapter 1: Prologue" stays a chapter until the author changes it.
 */
export function inferPageTypeFromTitle(title: string): PageType {
  const normalized = title
    .trim()
    .toLocaleLowerCase()
    .replace(/[.:;,!?]+$/g, '')
    .replace(/\s+/g, ' ')
  return TITLE_TYPE_MAP.get(normalized) || 'chapter'
}

/**
 * Repairs projects created before named matter was classified during import.
 * Exact, unambiguous titles are safe to migrate; descriptive titles such as
 * "Chapter 1: Prologue" remain ordinary chapters.
 */
export function normalizeNamedMatterPage(chapter: Chapter): Chapter {
  if (chapter.type !== 'chapter') return chapter
  const inferredType = inferPageTypeFromTitle(chapter.title)
  if (inferredType === 'chapter') return chapter
  return {
    ...chapter,
    type: inferredType,
    partId: undefined,
    folderId: undefined,
    options: {
      ...chapter.options,
      numbered: false,
    },
  }
}

export function nextChapterNumber(chapters: Chapter[]): number {
  return chapters.filter(
    (chapter) => chapter.type === 'chapter' && chapter.options.numbered,
  ).length + 1
}

export function nextChapterTitle(chapters: Chapter[]): string {
  return `Chapter ${nextChapterNumber(chapters)}`
}

export function numberedChapterOrdinal(chapters: Chapter[], pageId: string): number {
  return chapters
    .filter((chapter) => chapter.type === 'chapter' && chapter.options.numbered)
    .findIndex((chapter) => chapter.id === pageId) + 1
}

/**
 * Change a page's publishing role without discarding its manuscript content.
 * Crossing a section boundary relocates it to the end of the appropriate
 * matter section so export order and the manuscript map stay aligned.
 */
export function convertPageType(
  project: BookProject,
  pageId: string,
  nextType: PageType,
): BookProject {
  const sourceIndex = project.chapters.findIndex((chapter) => chapter.id === pageId)
  if (sourceIndex < 0 || !CONVERTIBLE_PAGE_TYPES.includes(nextType)) return project
  const source = project.chapters[sourceIndex]
  if (REQUIRED_PAGE_TYPES.includes(source.type) || source.type === nextType) return project

  const previousSection = pageSection(source.type)
  const nextSection = pageSection(nextType)
  const updated: Chapter = {
    ...source,
    type: nextType,
    partId: nextSection === 'body' && nextType === 'chapter' ? source.partId : undefined,
    folderId:
      nextSection === 'body' && nextType !== 'part'
        ? source.folderId
        : undefined,
    options: {
      ...source.options,
      numbered:
        nextType === 'chapter'
          ? source.type !== 'chapter' || source.options.numbered
          : false,
      ...(nextType === 'full-page-image'
        ? {
            hideChapterHeading: true,
            hideHeaderFooter: true,
            hidePageNumber: true,
          }
        : {}),
    },
  }

  let chapters = project.chapters.map((chapter) =>
    source.type === 'part' && nextType !== 'part' && chapter.partId === source.id
      ? { ...chapter, partId: undefined }
      : chapter,
  )

  if (previousSection === nextSection) {
    chapters[sourceIndex] = updated
    return { ...project, chapters }
  }

  chapters = chapters.filter((chapter) => chapter.id !== source.id)
  if (nextSection === 'front') {
    const lastFront = chapters.reduce(
      (last, chapter, index) => pageSection(chapter.type) === 'front' ? index : last,
      -1,
    )
    chapters.splice(lastFront + 1, 0, updated)
  } else if (nextSection === 'back') {
    chapters.push(updated)
  } else {
    const firstBack = chapters.findIndex((chapter) => pageSection(chapter.type) === 'back')
    chapters.splice(firstBack < 0 ? chapters.length : firstBack, 0, updated)
  }

  return { ...project, chapters }
}
