import assert from 'node:assert/strict'
import test from 'node:test'
import {
  repairLegacyRtfQuoteDamage,
  smartenPunctuation,
  smartQuoteForInsertion,
} from '../src/editor/smartQuotes.ts'

test('smart punctuation preserves every character in contractions and possessives', () => {
  assert.equal(
    smartenPunctuation(`"I wasn't using my father's tools," she said.`),
    '“I wasn’t using my father’s tools,” she said.',
  )
  assert.equal(smartenPunctuation(`That wasn't it.`), 'That wasn’t it.')
})

test('live smart quote insertion distinguishes apostrophes from opening quotes', () => {
  assert.equal(smartQuoteForInsertion("'", 'n'), '’')
  assert.equal(smartQuoteForInsertion("'", ' '), '‘')
  assert.equal(smartQuoteForInsertion('"', ''), '“')
  assert.equal(smartQuoteForInsertion('"', 'd'), '”')
})

test('legacy Scrivener repair restores unambiguous swallowed letters', () => {
  const repaired = repairLegacyRtfQuoteDamage(
    'Sure, it wasn’’ the best job. His father’’ tools weren’’ ready.',
  )
  assert.equal(
    repaired.text,
    'Sure, it wasn’t the best job. His father’s tools weren’t ready.',
  )
  assert.equal(repaired.repaired, 3)
  assert.equal(repaired.unresolved, 0)

  const ambiguous = repairLegacyRtfQuoteDamage('He’’ ready.')
  assert.equal(ambiguous.text, 'He’’ ready.')
  assert.equal(ambiguous.unresolved, 1)
})
