import assert from 'node:assert/strict'
import test from 'node:test'
import {
  epubImageDataUrlParts,
  epubImageHrefMatchesMediaType,
  pageUsesChapterThemeArtwork,
} from '../src/export/epubImages.ts'

test('EPUB image resources keep extensions consistent with their media type', () => {
  assert.deepEqual(epubImageDataUrlParts('data:image/png;base64,QUJD'), {
    mediaType: 'image/png',
    extension: 'png',
    base64: 'QUJD',
  })
  assert.deepEqual(epubImageDataUrlParts('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), {
    mediaType: 'image/svg+xml',
    extension: 'svg',
    base64: 'PHN2Zz48L3N2Zz4=',
  })
  assert.equal(epubImageDataUrlParts('data:image/bmp;base64,QUJD'), null)
  assert.equal(epubImageHrefMatchesMediaType('images/chapter-frame.svg', 'image/svg+xml'), true)
  assert.equal(epubImageHrefMatchesMediaType('images/chapter-frame.jpg', 'image/svg+xml'), false)
})

test('shared chapter artwork never leaks onto front or back matter pages', () => {
  assert.equal(pageUsesChapterThemeArtwork('chapter'), true)
  assert.equal(pageUsesChapterThemeArtwork('part'), true)
  assert.equal(pageUsesChapterThemeArtwork('title-page'), false)
  assert.equal(pageUsesChapterThemeArtwork('contents'), false)
  assert.equal(pageUsesChapterThemeArtwork('copyright'), false)
  assert.equal(pageUsesChapterThemeArtwork('back-matter'), false)
})
