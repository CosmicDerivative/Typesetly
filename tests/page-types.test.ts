import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBook, createSampleBook } from '../src/data.ts'
import {
  createInitialLibraryState,
  isUntouchedLegacySample,
} from '../src/library/store.ts'
import {
  convertPageType,
  inferPageTypeFromTitle,
  nextChapterTitle,
  normalizeNamedMatterPage,
  numberedChapterOrdinal,
  pageSection,
} from '../src/manuscript/pageTypes.ts'

test('a new installation opens to an empty library instead of a demo manuscript', () => {
  const state = createInitialLibraryState()
  assert.deepEqual(state.books, [])
  assert.equal(state.openBookId, null)
  assert.ok(state.themes.length > 0)
})

test('only an untouched legacy demo is eligible for automatic cleanup', () => {
  const sample = createSampleBook()
  assert.equal(isUntouchedLegacySample(sample), true)
  sample.updatedAt = new Date(Date.parse(sample.updatedAt) + 1_000).toISOString()
  assert.equal(isUntouchedLegacySample(sample), false)
})

test('unambiguous imported matter titles do not become numbered chapters', () => {
  assert.equal(inferPageTypeFromTitle('Prologue'), 'prologue')
  assert.equal(inferPageTypeFromTitle('  EPILOGUE:  '), 'epilogue')
  assert.equal(inferPageTypeFromTitle('Acknowledgments'), 'acknowledgements')
  assert.equal(inferPageTypeFromTitle('Chapter 1: Prologue'), 'chapter')
})

test('legacy chapters with exact matter titles migrate before preview and export', () => {
  const project = createEmptyBook()
  const legacyPrologue = project.chapters.find((page) => page.type === 'chapter')!
  legacyPrologue.title = 'Prologue'
  legacyPrologue.partId = 'legacy-part'
  legacyPrologue.folderId = 'legacy-folder'

  const migrated = normalizeNamedMatterPage(legacyPrologue)
  assert.equal(migrated.type, 'prologue')
  assert.equal(migrated.options.numbered, false)
  assert.equal(migrated.partId, undefined)
  assert.equal(migrated.folderId, undefined)

  const descriptive = { ...legacyPrologue, title: 'Chapter 1: Prologue' }
  assert.equal(normalizeNamedMatterPage(descriptive).type, 'chapter')
})

test('next chapter names count chapter pages only', () => {
  const project = createEmptyBook()
  const original = project.chapters.find((page) => page.type === 'chapter')!
  const withMatter = convertPageType(project, original.id, 'prologue')
  assert.equal(nextChapterTitle(withMatter.chapters), 'Chapter 1')
})

test('manuscript ordinals skip matter and chapters excluded from numbering', () => {
  const project = createEmptyBook()
  const first = project.chapters.find((page) => page.type === 'chapter')!
  const prologueProject = convertPageType(project, first.id, 'prologue')
  const unnumbered = createEmptyBook().chapters.find((page) => page.type === 'chapter')!
  unnumbered.options.numbered = false
  const numbered = createEmptyBook().chapters.find((page) => page.type === 'chapter')!
  const chapters = [...prologueProject.chapters, unnumbered, numbered]

  assert.equal(numberedChapterOrdinal(chapters, unnumbered.id), 0)
  assert.equal(numberedChapterOrdinal(chapters, numbered.id), 1)
})

test('changing page type preserves content and relocates matter safely', () => {
  const project = createEmptyBook()
  const original = project.chapters.find((page) => page.type === 'chapter')!
  original.title = 'A Door Opens'
  original.content = '<p>Keep this prose.</p>'

  const prologueProject = convertPageType(project, original.id, 'prologue')
  const prologue = prologueProject.chapters.find((page) => page.id === original.id)!
  assert.equal(prologue.type, 'prologue')
  assert.equal(prologue.options.numbered, false)
  assert.equal(prologue.content, '<p>Keep this prose.</p>')
  assert.equal(pageSection(prologue.type), 'front')
  assert.equal(
    prologueProject.chapters.indexOf(prologue),
    prologueProject.chapters.findIndex((page) => page.type === 'contents') + 1,
  )

  const chapterProject = convertPageType(prologueProject, original.id, 'chapter')
  const chapter = chapterProject.chapters.find((page) => page.id === original.id)!
  assert.equal(chapter.type, 'chapter')
  assert.equal(chapter.options.numbered, true)
  assert.equal(chapter.content, '<p>Keep this prose.</p>')
})
