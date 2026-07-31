import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { buildCalloutNode, replaceCalloutRange } from '../src/editor/callouts.ts'
import { countWords } from '../src/data.ts'
import { plainTextFromHtml, wordDiff } from '../src/editor/diff.ts'
import { Callout, LitRpgBlock } from '../src/editor/extensions.ts'
import {
  buildLitRpgBlockNode,
  litRpgDraftFromAttrs,
  litRpgPreset,
  moveLitRpgColumn,
  moveLitRpgRow,
  normalizeLitRpgDraft,
  replaceLitRpgBlockRange,
} from '../src/editor/litrpg.ts'
import {
  EXTERNAL_PROOFREADING_CHARACTER_LIMIT,
  collectFindMatches,
  createFindHighlightPlugin,
  DEFAULT_FIND_SCOPE,
  FIND_RESULTS_PAGE_SIZE,
  externalProofreadingEnabled,
  externalProofreadingEnabledForPage,
  findHighlightKey,
  findInChapterHtml,
  findResultsPageSlice,
  findTextOccurrences,
  plainTextCharacterCount,
  snippetAroundMatch,
} from '../src/editor/find.ts'
import {
  defaultChapterOptions,
  defaultEditorPrefs,
  defaultGoals,
  defaultStoryBible,
} from '../src/types.ts'

test('word diff identifies inserted and deleted manuscript text', () => {
  const diff = wordDiff('<p>The old ending.</p>', '<p>The stronger ending.</p>')
  assert.equal(diff.find((part) => part.type === 'deleted')?.text, 'old')
  assert.equal(diff.find((part) => part.type === 'inserted')?.text, 'stronger')
})

test('HTML is reduced to readable text for comparisons', () => {
  assert.equal(plainTextFromHtml('<p>A &amp; B</p><p>Next</p>'), 'A & B Next')
})

test('word counting preserves words split by inline formatting marks', () => {
  assert.equal(
    countWords('<p>One cro<strong>ss-page</strong> word.</p><p>Next line.</p>'),
    5,
  )
})

test('new project defaults include migration-safe advanced settings', () => {
  assert.equal(defaultChapterOptions().includeIn, 'all')
  assert.equal(defaultEditorPrefs().spellcheck, true)
  // Browser grammar extensions are allowed on the active chapter by default.
  assert.equal(defaultEditorPrefs().externalProofreading, 'auto')
  assert.equal(defaultEditorPrefs().recoveryIntervalMinutes, 5)
  assert.deepEqual(defaultGoals().habitWritingDays, [1, 2, 3, 4, 5])
  assert.deepEqual(defaultGoals().wordLog, {})
  assert.deepEqual(defaultStoryBible(), { characters: [], world: [], relationships: [] })
})

test('find supports case-insensitive navigation counts without overlapping matches', () => {
  assert.deepEqual(findTextOccurrences('One one ONE', 'one'), [
    { index: 0, length: 3 },
    { index: 4, length: 3 },
    { index: 8, length: 3 },
  ])
  assert.equal(findTextOccurrences('banana', 'ana').length, 1)
  assert.equal(findInChapterHtml('<p>First</p><p>second first</p>', 'FIRST').length, 2)
})

test('find defaults to the current document scope', () => {
  assert.equal(DEFAULT_FIND_SCOPE, 'chapter')
})

test('find results list paginates without needing a scrollbar', () => {
  assert.equal(FIND_RESULTS_PAGE_SIZE, 8)
  assert.deepEqual(findResultsPageSlice(168, 0), {
    page: 0,
    pageCount: 21,
    start: 0,
    end: 8,
  })
  assert.deepEqual(findResultsPageSlice(168, 20), {
    page: 20,
    pageCount: 21,
    start: 160,
    end: 168,
  })
  assert.deepEqual(findResultsPageSlice(168, 99), {
    page: 20,
    pageCount: 21,
    start: 160,
    end: 168,
  })
  assert.deepEqual(findResultsPageSlice(0, 0), {
    page: 0,
    pageCount: 1,
    start: 0,
    end: 0,
  })
})

test('find match snippets include chapter context and local occurrence indexes', () => {
  const matches = collectFindMatches(
    [
      { id: 'a', title: 'Prologue', content: '<p>The quick fox jumps.</p>' },
      { id: 'b', title: 'Chapter 1', content: '<p>Another fox appears near the fox den.</p>' },
    ],
    'fox',
  )
  assert.equal(matches.length, 3)
  assert.equal(matches[0].chapterTitle, 'Prologue')
  assert.equal(matches[0].occurrenceInChapter, 0)
  assert.equal(matches[0].globalIndex, 0)
  assert.match(matches[0].snippet, /fox/i)
  assert.equal(
    matches[0].snippet.slice(matches[0].highlightStart, matches[0].highlightStart + matches[0].highlightLength).toLowerCase(),
    'fox',
  )
  assert.equal(matches[1].chapterId, 'b')
  assert.equal(matches[1].occurrenceInChapter, 0)
  assert.equal(matches[2].occurrenceInChapter, 1)
  assert.deepEqual(snippetAroundMatch('abcdefghij', 3, 2, 2), {
    snippet: '…bcdefg…',
    highlightStart: 3,
    highlightLength: 2,
  })
})

test('find highlight plugin paints a match without requiring editor focus', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit],
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Alpha beta gamma beta' }],
      }],
    },
  })
  const state = EditorState.create({
    schema: editor.schema,
    doc: editor.state.doc,
    plugins: [createFindHighlightPlugin()],
  })
  const ranges: Array<{ from: number; to: number }> = []
  state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return
    for (const match of findTextOccurrences(node.text, 'beta', false)) {
      ranges.push({ from: position + match.index, to: position + match.index + match.length })
    }
  })
  assert.equal(ranges.length, 2)
  const range = ranges[1]
  const highlighted = state.apply(
    state.tr
      .setSelection(TextSelection.create(state.doc, range.from, range.to))
      .setMeta(findHighlightKey, { matches: ranges, activeIndex: 1 }),
  )
  const decorations = findHighlightKey.getState(highlighted)
  assert.ok(decorations)
  assert.equal(decorations.find().length, 2)
  const classes = decorations.find().map((decoration) => decoration.type.attrs.class)
  assert.equal(classes.filter((value) => value === 'find-match').length, 1)
  assert.equal(classes.filter((value) => value === 'find-match-highlight').length, 1)
  const cleared = highlighted.apply(highlighted.tr.setMeta(findHighlightKey, null))
  assert.equal(findHighlightKey.getState(cleared)?.find().length ?? 0, 0)
  editor.destroy()
})

test('automatic external proofreading protects oversized editor fields while preserving overrides', () => {
  assert.equal(externalProofreadingEnabled('auto', EXTERNAL_PROOFREADING_CHARACTER_LIMIT), true)
  assert.equal(externalProofreadingEnabled('auto', EXTERNAL_PROOFREADING_CHARACTER_LIMIT + 1), false)
  assert.equal(externalProofreadingEnabled('always', 1_000_000), true)
  assert.equal(externalProofreadingEnabled('off', 1), false)
})

test('external proofreading follows the page containing the cursor', () => {
  assert.equal(externalProofreadingEnabledForPage('auto', '<p>Page one</p>', 0, 1), false)
  assert.equal(externalProofreadingEnabledForPage('auto', '<p>Page two</p>', 1, 1), true)
  assert.equal(externalProofreadingEnabledForPage('off', '<p>Page two</p>', 1, 1), false)
})

test('plain text character counts ignore markup for proofreading limits', () => {
  assert.equal(plainTextCharacterCount('<p>Hello &amp; world</p>'), 'Hello & world'.length)
  assert.equal(plainTextCharacterCount('<p></p>'), 0)
})

test('draft page metrics preserve trim aspect and grow sheet stacks', async () => {
  const { draftPageCount, draftPageMetrics, draftStackHeight } = await import('../src/layout/draftPages.ts')
  const metrics = draftPageMetrics({
    trimWidthIn: 6,
    trimHeightIn: 9,
    marginInside: 0.75,
    marginOutside: 0.5,
    marginTop: 0.6,
    marginBottom: 0.6,
    justified: true,
    hyphens: true,
    keepSubheadings: true,
    keepSceneBreaks: true,
    layoutPriority: 'best-of-both',
    largePrint: false,
  })
  assert.equal(metrics.widthPx, 720)
  assert.equal(metrics.heightPx, 1080)
  assert.equal(draftPageCount(1, metrics), 1)
  assert.equal(draftPageCount(metrics.heightPx, metrics), 1)
  assert.equal(draftPageCount(metrics.heightPx + 1, metrics), 2)
  assert.equal(draftStackHeight(2, metrics), metrics.heightPx * 2 + metrics.gapPx)
})

test('chapter pages split on breaks, pack by budget, and rejoin for storage', async () => {
  const {
    joinChapterPages,
    splitChapterIntoPages,
    isEmptyPageHtml,
    splitTopLevelBlocks,
  } = await import('../src/layout/chapterPages.ts')

  const withBreak =
    '<p>One</p><div data-typesetly-node="page-break"></div><p>Two</p>'
  assert.deepEqual(splitChapterIntoPages(withBreak, 10_000), ['<p>One</p>', '<p>Two</p>'])
  assert.equal(joinChapterPages(['<p>One</p>', '<p>Two</p>']), '<p>One</p><p>Two</p>')
  assert.equal(
    joinChapterPages([
      '<p>The paragraph starts on page one </p>',
      '<p data-typesetly-page-continuation="true">and continues on page two.</p>',
    ]),
    '<p>The paragraph starts on page one and continues on page two.</p>',
  )
  assert.equal(
    joinChapterPages([
      '<p>The paragraph starts on page one</p>',
      '<p data-typesetly-page-continuation="true" data-typesetly-page-space="true">and continues on page two.</p>',
    ]),
    '<p>The paragraph starts on page one and continues on page two.</p>',
  )
  assert.equal(isEmptyPageHtml('<p></p>'), true)
  assert.equal(isEmptyPageHtml('<p></p><p></p>'), true)
  assert.equal(isEmptyPageHtml('<hr data-typesetly-node="scene-break">'), false)
  assert.equal(isEmptyPageHtml('<p>Hi</p><p></p>'), false)

  // Trailing blank pages must survive join so Enter-at-end lines are not erased.
  assert.equal(
    joinChapterPages(['<p>Hello</p>', '<p></p>', '<p></p>']),
    '<p>Hello</p><p></p><p></p>',
  )

  const {
    pruneEmptyDraftPages,
    countBlankParagraphs,
  } = await import('../src/layout/chapterPages.ts')

  // Non-last empty sheets are always removed; a blank last page can be kept.
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p>', '<p>There</p>']),
    ['<p>Hi</p>', '<p>There</p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p>'], { preserveLastEmptyPage: true }),
    ['<p>Hi</p>', '<p></p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p>'], { preserveLastEmptyPage: false }),
    ['<p>Hi</p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p><p></p>'], { preserveLastEmptyPage: false }),
    ['<p>Hi</p><p></p><p></p>'],
  )
  assert.equal(countBlankParagraphs('<p></p><p></p>'), 2)

  // TipTap scene breaks are bare <hr> tags — must not be dropped while paging.
  const withScene = '<p>A</p><hr data-typesetly-node="scene-break"><p>B</p>'
  assert.deepEqual(
    splitTopLevelBlocks(withScene),
    ['<p>A</p>', '<hr data-typesetly-node="scene-break">', '<p>B</p>'],
  )
  const scenePages = splitChapterIntoPages(withScene, 10_000)
  assert.equal(joinChapterPages(scenePages).includes('data-typesetly-node="scene-break"'), true)
  assert.equal(joinChapterPages(scenePages).includes('<p>A</p>'), true)
  assert.equal(joinChapterPages(scenePages).includes('<p>B</p>'), true)

  const long = Array.from({ length: 40 }, (_, index) => `<p>Block ${index} with enough words to consume budget.</p>`).join('')
  const pages = splitChapterIntoPages(long, 120)
  assert.ok(pages.length > 1)
  assert.equal(joinChapterPages(pages).includes('Block 0'), true)
  assert.equal(joinChapterPages(pages).includes('Block 39'), true)
})

test('message bubbles build as a stable callout node with normalized content', () => {
  const node = buildCalloutNode({
    variant: 'message',
    background: 'not-a-color',
    border: '#123456',
    sender: '  Jordan  ',
    direction: 'incoming',
    theme: 'ios',
  }, 'First line\nSecond line')

  assert.equal(node.type, 'callout')
  assert.equal(node.attrs.variant, 'message')
  assert.equal(node.attrs.sender, 'Jordan')
  assert.equal(node.attrs.background, '#f2f6fa')
  assert.deepEqual(node.content, [
    { type: 'paragraph', content: [{ type: 'text', text: 'First line' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
  ])
})

test('message dialog transaction inserts a distinct editable block inside a paragraph', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, Callout],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }],
    },
  })
  const node = buildCalloutNode({
    variant: 'message',
    background: '#f2f6fa',
    border: '#9aa7b2',
    sender: 'Jordan',
    direction: 'outgoing',
    theme: 'android',
  }, 'Hello')

  assert.equal(replaceCalloutRange(editor, { from: 4, to: 4 }, node), true)
  assert.equal(editor.getJSON().content?.[0]?.content?.[0]?.text, 'Bef')
  const inserted = editor.getJSON().content?.[1]
  assert.equal(inserted?.type, 'callout')
  assert.equal(inserted?.attrs?.variant, 'message')
  assert.equal(inserted?.content?.[0]?.content?.[0]?.text, 'Hello')
  assert.equal(editor.getJSON().content?.[2]?.content?.[0]?.text, 'ore')
  editor.destroy()
})

test('message dialog transaction replaces an existing callout without nesting it', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, Callout],
    content: {
      type: 'doc',
      content: [
        buildCalloutNode({
          variant: 'callout',
          background: '#f2f6fa',
          border: '#9aa7b2',
          sender: '',
          direction: 'outgoing',
          theme: 'ios',
        }, 'Old text'),
      ],
    },
  })
  const replacement = buildCalloutNode({
    variant: 'message',
    background: '#f2f6fa',
    border: '#9aa7b2',
    sender: 'Jordan',
    direction: 'incoming',
    theme: 'android',
  }, 'Replacement')
  const existingSize = editor.state.doc.firstChild?.nodeSize || 0

  assert.equal(replaceCalloutRange(editor, { from: 0, to: existingSize }, replacement), true)
  assert.equal(editor.getJSON().content?.length, 1)
  assert.equal(editor.getJSON().content?.[0]?.attrs?.variant, 'message')
  assert.equal(editor.getJSON().content?.[0]?.content?.[0]?.content?.[0]?.text, 'Replacement')
  editor.destroy()
})

test('LitRPG presets provide structured tables for each supported block type', () => {
  const statScreen = litRpgPreset('stat-screen')
  const systemMessage = litRpgPreset('system-message')
  const skillSelection = litRpgPreset('skill-selection')
  const itemInfo = litRpgPreset('item-info')

  assert.deepEqual(statScreen.columns, ['Attribute', 'Value'])
  assert.equal(systemMessage.columns.length, 1)
  assert.deepEqual(skillSelection.columns, ['Skill', 'Rank', 'Effect'])
  assert.equal(itemInfo.rows.some((row) => row.cells.includes('Damage')), true)
})

test('LitRPG block normalization keeps table cells aligned and rejects unsafe colors', () => {
  const normalized = normalizeLitRpgDraft({
    ...litRpgPreset('stat-screen'),
    columns: ['Name', 'Value', 'Notes'],
    rows: [{ cells: ['Strength', '12'] }],
    accent: 'red; background: black',
  })

  assert.deepEqual(normalized.rows[0].cells, ['Strength', '12', ''])
  assert.equal(normalized.accent, '#5eead4')
})

test('LitRPG builder transaction inserts one editable structured node', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, LitRpgBlock],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }],
    },
  })
  const node = buildLitRpgBlockNode({
    ...litRpgPreset('item-info'),
    title: 'Starforged Ring',
  })

  assert.equal(replaceLitRpgBlockRange(editor, { from: 0, to: 0 }, node), true)
  const inserted = editor.getJSON().content?.[0]
  assert.equal(inserted?.type, 'litrpgBlock')
  assert.equal(inserted?.attrs?.title, 'Starforged Ring')
  const restored = litRpgDraftFromAttrs(inserted?.attrs || {})
  assert.deepEqual(restored.columns, ['Property', 'Details'])
  assert.equal(restored.rows[0].cells[0], 'Damage')
  editor.destroy()
})

test('LitRPG rows and columns can be repositioned without detaching their values', () => {
  const columns = ['Skill', 'Rank', 'Effect']
  const rows = [
    { cells: ['Power Strike', 'Common', '+25% damage'] },
    { cells: ['Blink', 'Rare', 'Short teleport'] },
  ]
  const movedRows = moveLitRpgRow(rows, 1, -1)
  assert.equal(movedRows[0].cells[0], 'Blink')

  const movedColumns = moveLitRpgColumn(columns, rows, 2, -1)
  assert.deepEqual(movedColumns.columns, ['Skill', 'Effect', 'Rank'])
  assert.deepEqual(movedColumns.rows[0].cells, ['Power Strike', '+25% damage', 'Common'])
})
