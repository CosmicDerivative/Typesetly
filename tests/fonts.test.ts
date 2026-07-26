import assert from 'node:assert/strict'
import test from 'node:test'
import { FONT_FAMILIES, FONT_FAMILY_GROUPS, fontStack } from '../src/themes/fonts.ts'

test('typography catalog offers broad, categorized, unique choices', () => {
  assert.ok(FONT_FAMILY_GROUPS.length >= 3)
  assert.ok(FONT_FAMILIES.length >= 40)
  assert.equal(new Set(FONT_FAMILIES).size, FONT_FAMILIES.length)
  assert.ok(FONT_FAMILIES.includes('Atkinson Hyperlegible'))
  assert.ok(FONT_FAMILIES.includes('Bookerly') === false)
})

test('font stacks preserve the requested face and select a useful fallback family', () => {
  assert.match(fontStack('Libre Baskerville'), /Georgia, serif/)
  assert.match(fontStack('Atkinson Hyperlegible'), /sans-serif/)
  assert.match(fontStack('Cascadia Mono'), /monospace/)
})
