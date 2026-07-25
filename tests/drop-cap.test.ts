import assert from 'node:assert/strict'
import test from 'node:test'
import { firstLetterRange } from '../src/layout/manuscript.ts'

test('drop caps skip opening quotation marks and select the first letter', () => {
  const text = '“Your Majesty… I urge caution.”'
  const range = firstLetterRange(text)

  assert.deepEqual(range, { start: 1, end: 2 })
  assert.equal(text.slice(range!.start, range!.end), 'Y')
})

test('drop caps do not enlarge punctuation-only paragraphs', () => {
  assert.equal(firstLetterRange('“…”'), null)
})
