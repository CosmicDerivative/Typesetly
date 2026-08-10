import assert from 'node:assert/strict'
import test from 'node:test'
import { pdfJustifiedWordGap, wrapPdfParagraph } from '../src/export/pdfLayout.ts'

const monospace = {
  widthOfTextAtSize(text: string, size: number) {
    return text.length * size
  },
}

test('PDF paragraph wrapping reserves indent width on the first line only', () => {
  assert.deepEqual(
    wrapPdfParagraph('one two three four five', monospace, 1, 13, false, 9),
    ['one two', 'three four', 'five'],
  )
})

test('PDF paragraph wrapping uses the full width when no indent is selected', () => {
  assert.deepEqual(
    wrapPdfParagraph('one two three four five', monospace, 1, 13, false),
    ['one two three', 'four five'],
  )
})

test('PDF justification refuses visibly stretched or compressed word spacing', () => {
  assert.equal(pdfJustifiedWordGap(100, 80, 4, 3), 5)
  assert.equal(pdfJustifiedWordGap(100, 70, 2, 3), null)
  assert.equal(pdfJustifiedWordGap(100, 98, 4, 3), null)
  assert.equal(pdfJustifiedWordGap(100, 80, 0, 3), null)
})
