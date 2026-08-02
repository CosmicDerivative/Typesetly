import assert from 'node:assert/strict'
import test from 'node:test'
import { makePage } from '../src/data.ts'
import { tableOfContentsEntries } from '../src/export/toc.ts'

test('TOC includes authored front, body, and back matter in book order', () => {
  const pages = [
    makePage('title-page', 'Title Page'),
    makePage('copyright', 'Copyright'),
    makePage('dedication', 'Dedication'),
    makePage('contents', 'Contents'),
    makePage('foreword', 'Foreword'),
    makePage('chapter', 'Chapter One'),
    makePage('epilogue', 'Epilogue'),
    makePage('acknowledgements', 'Acknowledgements'),
    makePage('about-author', 'About the Author'),
  ]

  assert.deepEqual(
    tableOfContentsEntries(pages).map((page) => page.title),
    ['Dedication', 'Foreword', 'Chapter One', 'Epilogue', 'Acknowledgements', 'About the Author'],
  )
})

test('TOC omits structural, image-only, and explicitly hidden pages', () => {
  const hidden = makePage('chapter', 'Secret Chapter')
  hidden.options.hideInToc = true

  assert.deepEqual(
    tableOfContentsEntries([
      makePage('title-page', 'Title Page'),
      makePage('contents', 'Contents'),
      makePage('full-page-image', 'Map'),
      hidden,
    ]),
    [],
  )
})
