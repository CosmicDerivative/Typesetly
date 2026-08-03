import assert from 'node:assert/strict'
import test from 'node:test'
import { wrapPdfParagraph } from '../src/export/pdfLayout.ts'

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
