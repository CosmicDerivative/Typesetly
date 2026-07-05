import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { buildCalloutNode, replaceCalloutRange } from '../src/editor/callouts.ts'
import { plainTextFromHtml, wordDiff } from '../src/editor/diff.ts'
import { Callout } from '../src/editor/extensions.ts'
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
  assert.deepEqual(defaultGoals().habitWritingDays, [1, 2, 3, 4, 5])
  assert.deepEqual(defaultGoals().wordLog, {})
  assert.deepEqual(defaultStoryBible(), { characters: [], world: [], relationships: [] })
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
