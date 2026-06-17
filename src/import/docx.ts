import mammoth from 'mammoth'
import { v4 as uuid } from 'uuid'
import { countWords, createEmptyBook, makePage } from '../data'
import { inferPageTypeFromTitle, nextChapterTitle } from '../manuscript/pageTypes'
import type { Chapter, ImportReport } from '../types'
import { defaultChapterOptions } from '../types'

const STYLE_MAP = [
  "p[style-name='Title'] => h1.book-title:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Quote'] => blockquote[data-typesetly-node='attributedQuote']:fresh",
  "p[style-name='Block Quote'] => blockquote[data-typesetly-node='attributedQuote']:fresh",
  "p[style-name='Verse'] => div[data-typesetly-node='verse']:fresh",
  "p[style-name='Hanging Indent'] => div[data-typesetly-node='hangingIndent']:fresh",
]

function chapter(title: string): Chapter {
  const normalizedTitle = title.trim() || 'Untitled Chapter'
  return {
    id: uuid(),
    title: normalizedTitle,
    subtitle: '',
    type: inferPageTypeFromTitle(normalizedTitle),
    content: '<p></p>',
    options: defaultChapterOptions(),
  }
}

function normalizeImportedElement(element: HTMLElement): string {
  if (
    element.tagName.toLowerCase() === 'p' &&
    /^\s*(\*\s*){3}\s*$/.test(element.textContent || '')
  ) {
    return '<hr data-typesetly-node="scene-break">'
  }
  return element.outerHTML
}

function htmlToChapters(html: string): Chapter[] {
  const documentValue = new DOMParser().parseFromString(html, 'text/html')
  const splitOnPageBreak = !documentValue.querySelector('h1:not(.book-title)')
  const footnotes = new Map<string, string>()
  for (const item of Array.from(documentValue.querySelectorAll('li[id^="footnote-"]'))) {
    const clone = item.cloneNode(true) as HTMLElement
    clone.querySelectorAll('a[href^="#footnote-ref"]').forEach((link) => link.remove())
    footnotes.set(item.id, clone.textContent?.trim() || '')
  }
  for (const reference of Array.from(documentValue.querySelectorAll('a[href^="#footnote-"]'))) {
    const id = (reference.getAttribute('href') || '').slice(1)
    const text = footnotes.get(id)
    if (!text) continue
    const token = documentValue.createElement('span')
    token.dataset.typesetlyNode = 'footnote'
    token.dataset.noteId = id
    token.dataset.noteText = text
    token.setAttribute('title', text)
    token.innerHTML = `<sup>${reference.textContent || '1'}</sup>`
    reference.replaceWith(token)
  }
  for (const list of Array.from(documentValue.querySelectorAll('ol,ul'))) {
    if (Array.from(list.children).length && Array.from(list.children).every((item) => item.id.startsWith('footnote-'))) list.remove()
  }
  for (const image of Array.from(documentValue.querySelectorAll('img'))) {
    image.setAttribute('data-typesetly-node', 'image')
    image.setAttribute('data-layout', 'inline')
    image.setAttribute('data-width', '100')
    image.setAttribute('data-decorative', image.getAttribute('alt') ? 'false' : 'true')
  }
  const chapters: Chapter[] = []
  let current = chapter('Chapter 1')
  let buffer: string[] = []

  const flush = () => {
    if (!buffer.length && chapters.length) return
    current.content = buffer.join('') || '<p></p>'
    chapters.push(current)
    buffer = []
  }

  for (const node of Array.from(documentValue.body.children)) {
    const element = node as HTMLElement
    if (element.matches('h1')) {
      if (element.classList.contains('book-title') && !buffer.length && !chapters.length) continue
      if (buffer.length || chapters.length) flush()
      current = chapter(element.textContent || 'Untitled Chapter')
      continue
    }
    if (element.querySelector('br[style*="page-break"]') || element.classList.contains('page-break')) {
      if (splitOnPageBreak && buffer.length) {
        flush()
        current = chapter(nextChapterTitle(chapters))
        continue
      }
      buffer.push('<div data-typesetly-node="page-break"></div>')
      continue
    }
    buffer.push(normalizeImportedElement(element))
  }
  flush()
  return chapters.length ? chapters : [chapter('Chapter 1')]
}

export async function importDocxToBook(file: File): Promise<ImportReport> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: STYLE_MAP,
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64')
        return { src: `data:${image.contentType};base64,${base64}` }
      }),
    },
  )

  const title = file.name.replace(/\.docx$/i, '') || 'Imported Book'
  const book = createEmptyBook(title)
  const imported = htmlToChapters(result.value)
  const requiredFrontMatter = [
    makePage('title-page', 'Title Page'),
    makePage('copyright', 'Copyright', '<p>Copyright ©. All rights reserved.</p>'),
    makePage('contents', 'Contents'),
  ]
  const warnings = result.messages.map((message) => message.message)
  const convertedDocument = new DOMParser().parseFromString(result.value, 'text/html')

  if (!/<h1[\s>]/i.test(result.value)) {
    warnings.push(
      'No Heading 1 chapter markers were found. The manuscript was imported as one chapter.',
    )
  }
  const duplicateTitles = imported
    .filter((chapter, index) => imported.findIndex((candidate) => candidate.title.trim().toLowerCase() === chapter.title.trim().toLowerCase()) !== index)
    .map((chapter) => chapter.title)
  if (duplicateTitles.length) warnings.push(`Duplicate chapter titles detected: ${Array.from(new Set(duplicateTitles)).join(', ')}.`)
  for (const importedChapter of imported) {
    const words = countWords(importedChapter.content)
    if (words > 8_000) warnings.push(`${importedChapter.title} is ${words.toLocaleString()} words; consider splitting it for smoother editing and export.`)
  }
  const images = convertedDocument.querySelectorAll('img').length
  if (images > 20) warnings.push(`${images} embedded images were imported. Review image placement and print resolution.`)

  return {
    warnings,
    summary: {
      chapters: imported.filter((item) => item.type === 'chapter').length,
      words: imported.reduce((sum, item) => sum + countWords(item.content), 0),
      images,
      footnotes: convertedDocument.querySelectorAll('a[href^="#footnote-"]').length,
      links: convertedDocument.querySelectorAll('a[href]').length,
    },
    book: {
      ...book,
      schemaVersion: 3,
      details: { ...book.details, title },
      chapters: [...requiredFrontMatter, ...imported],
      activeId: imported[0]?.id || requiredFrontMatter[0].id,
    },
  }
}
