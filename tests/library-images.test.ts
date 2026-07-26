import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectImageRefIds,
  dehydrateImageUrls,
  extractDataUrlImages,
  hydrateImageRefs,
  imageRef,
  inlineImagesAsDataUrls,
} from '../src/library/images.ts'
import { chapterKey } from '../src/library/store.ts'

const PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PIXEL_DATA_URL = `data:image/png;base64,${PIXEL_BASE64}`

test('chapter keys are namespaced by book', () => {
  assert.equal(chapterKey('book-1', 'chapter-2'), 'book-1/chapter-2')
})

test('image refs round-trip through hydration', () => {
  const stored = `<p>Before</p><img src="${imageRef('abc-123')}" alt=""><p>After</p>`
  assert.deepEqual(collectImageRefIds(stored), ['abc-123'])
  const hydrated = hydrateImageRefs(stored, (id) => (id === 'abc-123' ? 'blob:app/xyz' : undefined))
  assert.ok(hydrated.includes('src="blob:app/xyz"'))
  // Unresolvable refs survive untouched instead of losing the reference.
  const missing = hydrateImageRefs(stored, () => undefined)
  assert.equal(missing, stored)
})

test('base64 images are extracted into refs with deduplication', () => {
  const cache = new Map<string, string>()
  let counter = 0
  const makeId = () => `image-${++counter}`
  const html = `<img src="${PIXEL_DATA_URL}"><img src="${PIXEL_DATA_URL}">`
  const first = extractDataUrlImages(html, makeId, cache)
  assert.equal(first.images.length, 1)
  assert.equal(first.text, `<img src="${imageRef('image-1')}"><img src="${imageRef('image-1')}">`)
  // A later pass over the same payload reuses the stored blob.
  const second = extractDataUrlImages(html, makeId, cache)
  assert.equal(second.images.length, 0)
  assert.equal(second.text, first.text)
})

test('short data URIs in prose are never mistaken for images', () => {
  const prose = '<p>Set src to data:image/png;base64,abc123 to embed.</p>'
  const result = extractDataUrlImages(prose, () => 'never', new Map())
  assert.equal(result.text, prose)
  assert.equal(result.images.length, 0)
})

test('invalid base64 payloads do not create orphan image refs', () => {
  // Matches the data-URL extractor, but atob rejects the non-padded payload.
  const broken = `data:image/png;base64,${'A'.repeat(65)}`
  const html = `<img src="${broken}">`
  const result = extractDataUrlImages(html, () => 'orphan', new Map())
  assert.equal(result.images.length, 0)
  assert.equal(result.text, html)
})

test('JSON-serialized records keep valid JSON through extraction', () => {
  const record = { chapters: [{ content: `<img src="${PIXEL_DATA_URL}">` }] }
  const extracted = extractDataUrlImages(JSON.stringify(record), () => 'img-1', new Map())
  const parsed = JSON.parse(extracted.text) as typeof record
  assert.equal(parsed.chapters[0].content, `<img src="${imageRef('img-1')}">`)
})

test('object URLs without a registered image are stripped on dehydrate', () => {
  // Dead session blob URLs must not be written back into IndexedDB.
  const text = '<img src="blob:app/unknown-url">'
  assert.equal(dehydrateImageUrls(text), '<img src="">')
})

test('export inlining replaces refs with self-contained data URLs', async () => {
  const text = `<img src="${imageRef('img-9')}">`
  const inlined = await inlineImagesAsDataUrls(text, async (id) => {
    assert.equal(id, 'img-9')
    const bytes = Uint8Array.from(atob(PIXEL_BASE64), (char) => char.charCodeAt(0))
    return new Blob([bytes], { type: 'image/png' })
  })
  assert.equal(inlined, `<img src="${PIXEL_DATA_URL}">`)
})
