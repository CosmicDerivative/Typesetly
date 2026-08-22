import type { BookProject, Chapter, PageType } from '../types'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const EPUB_PAGE_TYPES: Partial<Record<PageType, string>> = {
  'title-page': 'titlepage',
  copyright: 'copyright-page',
  dedication: 'dedication',
  epigraph: 'epigraph',
  contents: 'toc',
  'also-by': 'other-credits',
  foreword: 'foreword',
  preface: 'preface',
  prologue: 'prologue',
  chapter: 'chapter',
  part: 'part',
  epilogue: 'epilogue',
  afterword: 'afterword',
  acknowledgements: 'acknowledgments',
  'about-author': 'contributors',
  'also-by-back': 'other-credits',
  notes: 'endnotes',
  bibliography: 'bibliography',
  'full-page-image': 'bodymatter',
  'custom-page': 'bodymatter',
}

export function epubTypeForPage(type: PageType) {
  return EPUB_PAGE_TYPES[type] || 'bodymatter'
}

export function epubParagraphLineHeight(value: number) {
  const spacing = Number.isFinite(value) ? Math.min(3, Math.max(0.8, value)) : 1.4
  return `${spacing}em`
}

/** EPUB title pages are generated from Book Details, matching PDF and DOCX. */
export function epubTitlePageMarkup(details: BookProject['details']) {
  const series = details.seriesName
    ? `${details.seriesName}${details.seriesNumber != null ? ` · Book ${details.seriesNumber}` : ''}`
    : ''
  return `<header class="title-page">
    <div class="title-rule" aria-hidden="true"></div>
    <h1>${escapeXml(details.title)}</h1>
    <div class="title-rule" aria-hidden="true"></div>
    ${details.subtitle ? `<p class="book-subtitle">${escapeXml(details.subtitle)}</p>` : ''}
    ${series ? `<p class="book-series">${escapeXml(series)}</p>` : ''}
    ${details.author ? `<p class="book-author">by ${escapeXml(details.author)}</p>` : ''}
  </header>`
}

/** Parts act as book/volume dividers in omnibuses rather than giant chapters. */
export function epubPartPageMarkup(page: Chapter, author: string, imageMarkup = '') {
  return `<header class="part-page">
    <div class="title-rule" aria-hidden="true"></div>
    ${imageMarkup}
    <h1>${escapeXml(page.title)}</h1>
    <div class="title-rule" aria-hidden="true"></div>
    ${page.subtitle ? `<p class="part-subtitle">${escapeXml(page.subtitle)}</p>` : ''}
    ${author ? `<p class="part-author">${escapeXml(author)}</p>` : ''}
  </header>`
}

const EPUB_RENDER_DATA_ATTRIBUTES = new Set([
  'data-alignment',
  'data-appearance',
  'data-attribution',
  'data-density',
  'data-direction',
  'data-show-cell-borders',
  'data-theme',
  'data-translucent',
  'data-width',
  'data-width-percent',
])

/**
 * TipTap nodes carry duplicate authoring attributes for editor round-trips.
 * They are not valid XHTML attributes and can also add substantial JSON to an
 * EPUB. Keep only presentation attributes needed by the exported stylesheet.
 */
export function stripEpubAuthoringAttributes(root: ParentNode) {
  for (const element of Array.from(root.querySelectorAll('[data-typesetly-node]'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (epubExportAttributeAllowed(attribute.name)) continue
      element.removeAttribute(attribute.name)
    }
  }
}

export function epubExportAttributeAllowed(name: string) {
  // Manuscript images are TipTap authoring nodes too. Their src/alt attributes
  // are rewritten to packaged EPUB resources before this cleanup runs, so
  // removing them here turns a valid Part-page cover into <img /> and causes
  // both the missing-alt and empty-source validation errors.
  return name === 'class'
    || name === 'style'
    || name === 'src'
    || name === 'alt'
    || EPUB_RENDER_DATA_ATTRIBUTES.has(name)
}
