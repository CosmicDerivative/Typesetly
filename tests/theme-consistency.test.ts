import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBook } from '../src/data.ts'
import { headingParts, isGenericChapterTitle } from '../src/layout/manuscript.ts'
import {
  layoutShowsPageNumber,
  runningHeaderAlignment,
  runningHeaderText,
} from '../src/layout/runningHeaders.ts'
import { PRESET_THEMES } from '../src/themes/presets.ts'
import {
  DEFAULT_PARAGRAPH_SPACING_EM,
  paragraphSpacingEm,
} from '../src/themes/paragraph.ts'

test('all built-in themes have complete, usable print settings', () => {
  assert.equal(PRESET_THEMES.length, 17)
  assert.equal(new Set(PRESET_THEMES.map((theme) => theme.id)).size, PRESET_THEMES.length)
  assert.equal(new Set(PRESET_THEMES.map((theme) => theme.name)).size, PRESET_THEMES.length)

  for (const theme of PRESET_THEMES) {
    assert.equal(theme.preset, true, theme.name)
    assert.ok(theme.typography.bodyFont.trim(), theme.name)
    assert.ok(theme.chapterHeading.titleFont.trim(), theme.name)
    assert.ok(theme.chapterHeading.numberFont.trim(), theme.name)
    assert.ok(theme.headerFooter.font.trim(), theme.name)
    assert.ok(theme.typography.bodySize >= 9 && theme.typography.bodySize <= 18, theme.name)
    assert.ok(theme.typography.lineSpacing >= 1.2 && theme.typography.lineSpacing <= 2, theme.name)
    assert.ok(theme.paragraph.paragraphSpacingEm >= 0 && theme.paragraph.paragraphSpacingEm <= 3, theme.name)
    assert.ok(theme.print.trimWidthIn > theme.print.marginInside + theme.print.marginOutside + 2, theme.name)
    assert.ok(theme.print.trimHeightIn > theme.print.marginTop + theme.print.marginBottom + 3, theme.name)
    if (theme.sceneBreak.style === 'ornament') assert.ok(theme.sceneBreak.ornament.trim(), theme.name)
  }
})

test('paragraph spacing stays portable and migration safe', () => {
  assert.equal(paragraphSpacingEm(undefined), DEFAULT_PARAGRAPH_SPACING_EM)
  assert.equal(paragraphSpacingEm(Number.NaN), DEFAULT_PARAGRAPH_SPACING_EM)
  assert.equal(paragraphSpacingEm(-1), 0)
  assert.equal(paragraphSpacingEm(1.35), 1.35)
  assert.equal(paragraphSpacingEm(9), 3)
})

test('generic chapter placeholders are never printed twice by a theme', () => {
  const project = createEmptyBook()
  const chapter = project.chapters.find((entry) => entry.type === 'chapter')!

  for (const theme of PRESET_THEMES) {
    const heading = headingParts(project, chapter, theme)
    if (heading.number) assert.equal(heading.title, '', theme.name)
    else if (theme.chapterHeading.showTitle) assert.equal(heading.title, 'Chapter 1', theme.name)

    chapter.title = 'The Door in Winter'
    assert.equal(headingParts(project, chapter, theme).title, 'The Door in Winter', theme.name)
    chapter.title = 'Chapter 1'
  }

  assert.equal(isGenericChapterTitle('Chapter I', 1), true)
  assert.equal(isGenericChapterTitle('Chapter One', 1), true)
  assert.equal(isGenericChapterTitle('Chapter: 1', 1), true)
  assert.equal(isGenericChapterTitle('Prologue', 1), false)
})

test('running-header layouts retain their documented parity and page-number behavior', () => {
  const context = { title: 'A Long Winter', author: 'Ada Author', chapter: 'The Door' }

  assert.equal(runningHeaderText('title-author', context, 2), 'A Long Winter')
  assert.equal(runningHeaderText('title-author', context, 3), 'Ada Author')
  assert.equal(runningHeaderText('author-title-page', context, 2), 'Ada Author')
  assert.equal(runningHeaderText('author-title-page', context, 3), 'A Long Winter')
  assert.equal(runningHeaderText('chapter-page', context, 8), 'The Door')
  assert.equal(runningHeaderText('page-center', context, 8), '')
  assert.equal(runningHeaderAlignment(2), 'left')
  assert.equal(runningHeaderAlignment(3), 'right')
  assert.equal(layoutShowsPageNumber('title-author'), false)
  assert.equal(layoutShowsPageNumber('author-title-page'), true)
  assert.equal(layoutShowsPageNumber('chapter-page'), true)
  assert.equal(layoutShowsPageNumber('page-center'), true)
})
