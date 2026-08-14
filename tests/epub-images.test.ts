import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import {
  createEpubImageRegistry,
  epubChapterDecorationStyle,
  epubImageDataUrlParts,
  epubImageHrefMatchesMediaType,
  epubImageSourceIsUnavailable,
  pageUsesChapterThemeArtwork,
} from '../src/export/epubImages.ts'
import { normalizeChapterDecoration } from '../src/themes/chapterDecorations.ts'

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

test('EPUB drops empty and unresolved local image sources before validation', () => {
  assert.equal(epubImageSourceIsUnavailable(undefined), true)
  assert.equal(epubImageSourceIsUnavailable(''), true)
  assert.equal(epubImageSourceIsUnavailable('   '), true)
  assert.equal(epubImageSourceIsUnavailable('typesetly-image://missing-image'), true)
  assert.equal(epubImageSourceIsUnavailable('blob:https://typesetly.invalid/dead-image'), true)
  assert.equal(epubImageSourceIsUnavailable('data:image/png;base64,QUJD'), false)
  assert.equal(epubImageSourceIsUnavailable('https://example.com/image.png'), false)
})

test('shared chapter artwork never leaks onto front or back matter pages', () => {
  assert.equal(pageUsesChapterThemeArtwork('chapter'), true)
  assert.equal(pageUsesChapterThemeArtwork('part'), false)
  assert.equal(pageUsesChapterThemeArtwork('title-page'), false)
  assert.equal(pageUsesChapterThemeArtwork('contents'), false)
  assert.equal(pageUsesChapterThemeArtwork('copyright'), false)
  assert.equal(pageUsesChapterThemeArtwork('back-matter'), false)
})

test('EPUB image registry packages repeated artwork only once', () => {
  const registry = createEpubImageRegistry()
  const image = { mediaType: 'image/webp', extension: 'webp', base64: 'U0FNRQ==' }
  const first = registry.add(image)
  const fortieth = Array.from({ length: 39 }, () => registry.add(image)).at(-1)
  assert.equal(registry.files.length, 1)
  assert.equal(fortieth, first)
  assert.equal(first.href, 'images/image-1.webp')
  assert.deepEqual(registry.stats(), { references: 40, uniqueFiles: 1, reusedReferences: 39 })
})

test('EPUB image registry recognizes equivalent JPEG labels and base64 padding', () => {
  const registry = createEpubImageRegistry()
  const first = registry.add({ mediaType: 'image/jpg', extension: 'jpeg', base64: 'QQ==' })
  const second = registry.add({ mediaType: 'image/jpeg', extension: 'jpg', base64: 'QQ' })
  assert.equal(first, second)
  assert.equal(first.mediaType, 'image/jpeg')
  assert.equal(first.href, 'images/image-1.jpg')
  assert.deepEqual(registry.stats(), { references: 2, uniqueFiles: 1, reusedReferences: 1 })
})

test('a 200 KB chapter banner referenced by forty chapters is stored once in the EPUB archive', async () => {
  const bytes = Buffer.allocUnsafe(200_000)
  let state = 0x12345678
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    bytes[index] = state & 0xff
  }
  const base64 = bytes.toString('base64')
  const registry = createEpubImageRegistry()
  const references = Array.from({ length: 40 }, (_, index) => registry.add({
    mediaType: index % 2 ? 'image/jpeg' : 'image/jpg',
    extension: index % 2 ? 'jpg' : 'jpeg',
    base64: index % 3 ? base64 : base64.replace(/=+$/, ''),
  }))
  const zip = new JSZip()
  for (const image of registry.files) zip.file(`OEBPS/${image.href}`, image.base64, { base64: true })
  zip.file(
    'OEBPS/text/references.xhtml',
    references.map((image) => `<img src="../${image.href}" alt="" />`).join(''),
  )
  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const loaded = await JSZip.loadAsync(archive)
  const packagedImages = Object.keys(loaded.files).filter((name) => name.startsWith('OEBPS/images/') && !loaded.files[name]!.dir)
  assert.deepEqual(packagedImages, ['OEBPS/images/image-1.jpg'])
  assert.ok(archive.byteLength < 210_000, `expected one 200 KB image, received ${archive.byteLength} bytes`)
  assert.deepEqual(registry.stats(), { references: 40, uniqueFiles: 1, reusedReferences: 39 })
})

test('EPUB image registry keeps genuinely different image bytes separate', () => {
  const registry = createEpubImageRegistry()
  registry.add({ mediaType: 'image/webp', extension: 'webp', base64: 'T05F' })
  registry.add({ mediaType: 'image/webp', extension: 'webp', base64: 'VFdP' })
  assert.equal(registry.files.length, 2)
})

test('EPUB chapter overlays preserve every anchor at supported control boundaries', () => {
  const edge = { imageDataUrl: 'data:image/png;base64,QUJD', placement: 'header-overlay' as const, width: 100, opacity: 5, offsetX: -50, offsetY: 240, rotation: -180 }
  assert.equal(
    epubChapterDecorationStyle(normalizeChapterDecoration({ ...edge, align: 'left' })),
    'width:100%;opacity:0.05;position:absolute;top:0;left:0;transform:translate(-50%,240px) rotate(-180deg);',
  )
  assert.equal(
    epubChapterDecorationStyle(normalizeChapterDecoration({ ...edge, align: 'center' })),
    'width:100%;opacity:0.05;position:absolute;top:0;left:50%;transform:translate(calc(-50% + -50%),240px) rotate(-180deg);',
  )
  assert.equal(
    epubChapterDecorationStyle(normalizeChapterDecoration({ ...edge, align: 'right' })),
    'width:100%;opacity:0.05;position:absolute;top:0;right:0;transform:translate(-50%,240px) rotate(-180deg);',
  )
})

test('EPUB flow decorations keep placement alignment outside the heading overlay', () => {
  const decoration = normalizeChapterDecoration({
    imageDataUrl: 'data:image/png;base64,QUJD',
    placement: 'chapter-footer',
    align: 'center',
    width: 5,
    opacity: 100,
    offsetX: 50,
    offsetY: -240,
    rotation: 180,
  })
  assert.equal(
    epubChapterDecorationStyle(decoration),
    'width:5%;opacity:1;transform:translate(50%,-240px) rotate(180deg);margin-left:auto;margin-right:auto;',
  )
})
