import type { BookProject, PageType } from '../types'

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

/** EPUB title pages are generated from Book Details, matching PDF and DOCX. */
export function epubTitlePageMarkup(details: BookProject['details']) {
  const series = details.seriesName
    ? `${details.seriesName}${details.seriesNumber != null ? ` · Book ${details.seriesNumber}` : ''}`
    : ''
  return `<header class="title-page">
    <h1>${escapeXml(details.title)}</h1>
    ${details.subtitle ? `<p class="book-subtitle">${escapeXml(details.subtitle)}</p>` : ''}
    ${series ? `<p class="book-series">${escapeXml(series)}</p>` : ''}
    ${details.author ? `<p class="book-author">by ${escapeXml(details.author)}</p>` : ''}
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
  return name === 'class' || name === 'style' || EPUB_RENDER_DATA_ATTRIBUTES.has(name)
}
