import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { buildCalloutNode, replaceCalloutRange } from '../src/editor/callouts.ts'
import { plainTextFromHtml, wordDiff } from '../src/editor/diff.ts'
import { Callout } from '../src/editor/extensions.ts'
import {
  EXTERNAL_PROOFREADING_CHARACTER_LIMIT,
  collectFindMatches,
  createFindHighlightPlugin,
  DEFAULT_FIND_SCOPE,
  FIND_RESULTS_PAGE_SIZE,
  externalProofreadingEnabled,
  findHighlightKey,
  findInChapterHtml,
  findResultsPageSlice,
  findTextOccurrences,
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

test('new project defaults include migration-safe advanced settings', () => {
  assert.equal(defaultChapterOptions().includeIn, 'all')
  assert.equal(defaultEditorPrefs().spellcheck, true)
  // External proofreading extensions caused runaway memory usage, so new
  // books keep them off until the writer opts in.
  assert.equal(defaultEditorPrefs().externalProofreading, 'off')
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

test('automatic external proofreading protects long chapters while preserving overrides', () => {
  assert.equal(externalProofreadingEnabled('auto', EXTERNAL_PROOFREADING_CHARACTER_LIMIT), true)
  assert.equal(externalProofreadingEnabled('auto', EXTERNAL_PROOFREADING_CHARACTER_LIMIT + 1), false)
  assert.equal(externalProofreadingEnabled('always', 1_000_000), true)
  assert.equal(externalProofreadingEnabled('off', 1), false)
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
