import assert from 'node:assert/strict'
import test from 'node:test'
import { makePage } from '../src/data.ts'
import { tableOfContentsEntries, tableOfContentsTree } from '../src/export/toc.ts'

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

test('TOC nests chapters beneath their visible book or part divider', () => {
  const bookOne = makePage('part', 'Bonded Summoner Book 1')
  const first = makePage('chapter', 'Chapter 1', '<p>One</p>', { partId: bookOne.id })
  const second = makePage('chapter', 'Chapter 2', '<p>Two</p>', { partId: bookOne.id })
  const bookTwo = makePage('part', 'Bonded Summoner Book 2')
  const third = makePage('chapter', 'Chapter 1', '<p>Three</p>', { partId: bookTwo.id })

  assert.deepEqual(
    tableOfContentsTree([bookOne, first, second, bookTwo, third]).map((node) => ({
      title: node.page.title,
      children: node.children.map((child) => child.page.title),
    })),
    [
      { title: 'Bonded Summoner Book 1', children: ['Chapter 1', 'Chapter 2'] },
      { title: 'Bonded Summoner Book 2', children: ['Chapter 1'] },
    ],
  )
})

test('TOC keeps children visible when their parent part is hidden', () => {
  const hiddenPart = makePage('part', 'Hidden divider')
  hiddenPart.options.hideInToc = true
  const chapter = makePage('chapter', 'Still visible', '<p>Story</p>', { partId: hiddenPart.id })
  assert.deepEqual(tableOfContentsTree([hiddenPart, chapter]).map((node) => node.page.title), ['Still visible'])
})
