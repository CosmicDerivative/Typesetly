import assert from 'node:assert/strict'
import test from 'node:test'
import { previewLineSpacing, previewReaderFontSize } from '../src/preview/typography.ts'

test('reader proofs preserve the complete authored line-spacing range', () => {
  for (const spacing of [1, 1.2, 1.4, 1.6, 2, 2.5]) {
    assert.equal(previewLineSpacing(spacing), spacing)
  }
  assert.notEqual(previewLineSpacing(2), previewLineSpacing(2.5))
})

test('reader proofs normalize invalid line-spacing values safely', () => {
  assert.equal(previewLineSpacing(0), 0.8)
  assert.equal(previewLineSpacing(99), 3)
  assert.equal(previewLineSpacing(Number.NaN), 1.4)
})

test('book-design reader mode uses the authored point size', () => {
  assert.equal(previewReaderFontSize(11, 1, true), '11pt')
  assert.equal(previewReaderFontSize(11, 1.2, true), '13.2pt')
  assert.equal(previewReaderFontSize(11, 1, false), '16px')
  assert.equal(previewReaderFontSize(11, 1.2, false), '19.2px')
})
