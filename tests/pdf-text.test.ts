import assert from 'node:assert/strict'
import test from 'node:test'
import { pdfSafeText } from '../src/export/pdfText.ts'

const ascii = new Set(Array.from({ length: 128 }, (_, index) => index))

test('PDF text converts unsupported scene ornaments to print-safe equivalents', () => {
  const result = pdfSafeText('Before ⁂ After', ascii)

  assert.equal(result.text, 'Before * * * After')
  assert.deepEqual(result.replaced, ['⁂'])
})

test('PDF text transliterates accented Latin characters before using a placeholder', () => {
  assert.equal(pdfSafeText('café', ascii).text, 'cafe')
  assert.equal(pdfSafeText('東京', ascii).text, '??')
})
