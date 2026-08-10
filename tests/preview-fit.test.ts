import assert from 'node:assert/strict'
import test from 'node:test'
import { publishPreviewWidth } from '../src/preview/fit.ts'

test('publish proofs grow to use the available desk and retain page ratio', () => {
  assert.equal(publishPreviewWidth(890, 975, 536 / 724), 686)
  assert.equal(publishPreviewWidth(640, 720, 6 / 9), 448)
})

test('publish proof fitting remains safe for narrow or invalid measurements', () => {
  assert.equal(publishPreviewWidth(240, 480, 536 / 724), 192)
  assert.equal(publishPreviewWidth(Number.NaN, 480, 536 / 724), 0)
  assert.equal(publishPreviewWidth(800, 600, 0), 0)
})
