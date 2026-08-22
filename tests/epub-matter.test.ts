import assert from 'node:assert/strict'
import test from 'node:test'
import { makePage } from '../src/data.ts'
import { epubExportAttributeAllowed, epubParagraphLineHeight, epubPartPageMarkup, epubTitlePageMarkup, epubTypeForPage } from '../src/export/epubMatter.ts'
import { exportableChapters } from '../src/layout/manuscript.ts'
import type { BookProject, PageType } from '../src/types.ts'

test('EPUB title page is generated from escaped book metadata', () => {
  const markup = epubTitlePageMarkup({
    title: 'Fire & Glass',
    subtitle: '<An Ascension>',
    author: 'A. Writer',
    publisher: '',
    year: '2026',
    isbn: '',
    language: 'en',
    seriesName: 'The Archive',
    seriesNumber: 2,
  })
  assert.match(markup, /Fire &amp; Glass/)
  assert.match(markup, /&lt;An Ascension&gt;/)
  assert.match(markup, /The Archive · Book 2/)
  assert.match(markup, /by A\. Writer/)
  assert.equal((markup.match(/class="title-rule"/g) || []).length, 2)
})

test('EPUB part pages render as omnibus book dividers with their own metadata', () => {
  const part = makePage('part', 'Bonded Summoner Book 2', '<p></p>', {
    subtitle: "Champion's Trial: A Summoner Fantasy LitRPG",
  })
  const markup = epubPartPageMarkup(part, 'JJ Bookerson')
  assert.match(markup, /Bonded Summoner Book 2/)
  assert.match(markup, /Champion&apos;s Trial/)
  assert.match(markup, /JJ Bookerson/)
  assert.doesNotMatch(markup, /Title Page/)
})

test('EPUB uses valid semantics for every supported front and back matter type', () => {
  const types: PageType[] = [
    'title-page', 'copyright', 'dedication', 'epigraph', 'contents', 'also-by',
    'foreword', 'preface', 'prologue', 'chapter', 'part', 'epilogue',
    'afterword', 'acknowledgements', 'about-author', 'also-by-back', 'notes',
    'bibliography', 'full-page-image', 'custom-page',
  ]
  for (const type of types) assert.doesNotMatch(epubTypeForPage(type), /\s|_/)
  assert.equal(epubTypeForPage('title-page'), 'titlepage')
  assert.equal(epubTypeForPage('contents'), 'toc')
  assert.equal(epubTypeForPage('acknowledgements'), 'acknowledgments')
})

test('EPUB paragraph line spacing uses reader-resistant em units and safe bounds', () => {
  assert.equal(epubParagraphLineHeight(1.6), '1.6em')
  assert.equal(epubParagraphLineHeight(0), '0.8em')
  assert.equal(epubParagraphLineHeight(99), '3em')
  assert.equal(epubParagraphLineHeight(Number.NaN), '1.4em')
})

test('EPUB export selection retains enabled front, body, and back matter in book order', () => {
  const pages = [
    makePage('title-page', 'Title Page'),
    makePage('copyright', 'Copyright', '<p>Copyright text</p>'),
    makePage('dedication', 'Dedication', '<p>For the readers.</p>'),
    makePage('contents', 'Contents'),
    makePage('chapter', 'Chapter One', '<p>Story</p>'),
    makePage('epilogue', 'Epilogue', '<p>Afterward</p>'),
    makePage('about-author', 'About the Author', '<p>Biography</p>'),
  ]
  const project = { chapters: pages } as BookProject
  assert.deepEqual(exportableChapters(project, 'ebook').map((page) => page.type), [
    'title-page', 'copyright', 'dedication', 'contents', 'chapter', 'epilogue', 'about-author',
  ])
  assert.match(pages[1]!.content, /Copyright text/)
  assert.match(pages.at(-1)!.content, /Biography/)
})

test('EPUB strips editor-only node state but retains render-critical attributes', () => {
  for (const name of ['kind', 'rows', 'revision', 'data-typesetly-node', 'sourcescreenid']) {
    assert.equal(epubExportAttributeAllowed(name), false)
  }
  for (const name of ['class', 'style', 'src', 'alt', 'data-appearance', 'data-alignment', 'data-translucent']) {
    assert.equal(epubExportAttributeAllowed(name), true)
  }
})

test('EPUB cleanup preserves the packaged source and alt text of an image authored on a Part page', () => {
  for (const name of ['src', 'alt']) assert.equal(epubExportAttributeAllowed(name), true)
  for (const name of ['data-typesetly-node', 'data-caption', 'data-natural-width', 'data-bytes']) {
    assert.equal(epubExportAttributeAllowed(name), false)
  }
})
