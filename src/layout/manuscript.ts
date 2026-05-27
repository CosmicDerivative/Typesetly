import type { BookProject, BookTheme, Chapter } from '../types'

export type ManuscriptBlock =
  | { type: 'paragraph'; text: string; html: string }
  | { type: 'heading'; text: string; level: number }
  | { type: 'scene-break' }
  | { type: 'page-break' }
  | { type: 'callout'; text: string; variant: 'callout' | 'message'; sender: string; direction: string; theme: string }
  | { type: 'image'; src: string; alt: string; caption: string; layout: string; width: number; link: string; decorative: boolean; focalX: number; focalY: number }
  | { type: 'list-item'; text: string; ordered: boolean; ordinal: number }
  | { type: 'styled-block'; text: string; variant: 'verse' | 'hangingIndent' | 'attributedQuote'; attribution: string }

export interface ManuscriptNote {
  id: string
  text: string
  number: number
}

export function parseManuscript(html: string): { blocks: ManuscriptBlock[]; notes: ManuscriptNote[] } {
  const documentValue = new DOMParser().parseFromString(html, 'text/html')
  const notes: ManuscriptNote[] = []

  for (const token of Array.from(documentValue.querySelectorAll(
    '[data-typesetly-node="footnote"]',
  ))) {
    const element = token as HTMLElement
    const id = element.dataset.noteId || `note-${notes.length + 1}`
    const text = element.dataset.noteText || element.getAttribute('title') || ''
    notes.push({ id, text, number: notes.length + 1 })
    element.replaceWith(documentValue.createTextNode(`[${notes.length}]`))
  }

  const blocks: ManuscriptBlock[] = []
  for (const element of Array.from(documentValue.body.children) as HTMLElement[]) {
    const tag = element.tagName.toLowerCase()
    const nodeType = element.dataset.typesetlyNode
    if (nodeType === 'page-break') {
      blocks.push({ type: 'page-break' })
    } else if (nodeType === 'scene-break' || tag === 'hr') {
      blocks.push({ type: 'scene-break' })
    } else if (nodeType === 'callout' || tag === 'blockquote') {
      if (nodeType === 'attributedQuote') {
        blocks.push({ type: 'styled-block', text: element.textContent || '', variant: 'attributedQuote', attribution: element.dataset.attribution || '' })
        continue
      }
      blocks.push({
        type: 'callout',
        text: Array.from(element.children)
          .map((child) => child.textContent || '')
          .join('\n') || element.textContent || '',
        variant: element.dataset.variant === 'message' ? 'message' : 'callout',
        sender: element.dataset.sender || '',
        direction: element.dataset.direction || 'outgoing',
        theme: element.dataset.theme || 'ios',
      })
    } else if (nodeType === 'verse' || nodeType === 'hangingIndent') {
      blocks.push({ type: 'styled-block', text: element.textContent || '', variant: nodeType, attribution: '' })
    } else if (tag === 'img') {
      blocks.push({
        type: 'image',
        src: element.getAttribute('src') || '',
        alt: element.getAttribute('alt') || '',
        caption: element.dataset.caption || '',
        layout: element.dataset.layout || 'inline',
        width: Number(element.dataset.width || 100),
        link: element.dataset.link || '',
        decorative: element.dataset.decorative === 'true',
        focalX: Number(element.dataset.focalX || 50),
        focalY: Number(element.dataset.focalY || 50),
      })
    } else if (/^h[2-6]$/.test(tag)) {
      blocks.push({ type: 'heading', text: element.textContent || '', level: Number(tag[1]) })
    } else if (tag === 'ul' || tag === 'ol') {
      for (const [index, item] of Array.from(element.querySelectorAll(':scope > li')).entries()) {
        blocks.push({ type: 'list-item', text: item.textContent || '', ordered: tag === 'ol', ordinal: index + 1 })
      }
    } else {
      blocks.push({ type: 'paragraph', text: element.textContent || '', html: element.innerHTML })
    }
  }
  return { blocks, notes }
}

export function decorateFirstSentenceHtml(html: string, dropCap: boolean, leadIn: boolean) {
  if (!dropCap && !leadIn) return html
  const documentValue = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = documentValue.body.firstElementChild
  if (!root) return html
  const text = root.textContent || ''
  if (!text) return html
  const sentenceEnd = text.search(/[.!?](?:\s|$)/)
  const leadEnd = sentenceEnd >= 0 ? sentenceEnd + 1 : Math.min(text.length, 90)
  const walker = documentValue.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  let offset = 0

  for (const node of nodes) {
    const value = node.data
    const fragment = documentValue.createDocumentFragment()
    for (let index = 0; index < value.length;) {
      const absolute = offset + index
      const className =
        dropCap && absolute === 0 ? 'dropcap'
          : leadIn && absolute < leadEnd ? 'lead-in'
            : ''
      let end = index + 1
      while (end < value.length) {
        const nextAbsolute = offset + end
        const nextClass =
          dropCap && nextAbsolute === 0 ? 'dropcap'
            : leadIn && nextAbsolute < leadEnd ? 'lead-in'
              : ''
        if (nextClass !== className) break
        end += 1
      }
      const content = value.slice(index, end)
      if (className) {
        const span = documentValue.createElement('span')
        span.className = className
        span.textContent = content
        fragment.appendChild(span)
      } else fragment.appendChild(documentValue.createTextNode(content))
      index = end
    }
    offset += value.length
    node.replaceWith(fragment)
  }
  return root.innerHTML
}

export function exportableChapters(project: BookProject, target: 'ebook' | 'print' | 'all' = 'all'): Chapter[] {
  return project.chapters.filter((chapter) => {
    const include = chapter.options.includeIn || 'all'
    return include !== 'none' && (target === 'all' || include === 'all' || include === target)
  })
}

export function numberedChapterIndex(project: BookProject, chapterId: string): number {
  return project.chapters
    .filter((chapter) => chapter.type === 'chapter' && chapter.options.numbered)
    .findIndex((chapter) => chapter.id === chapterId) + 1
}

export function headingParts(project: BookProject, chapter: Chapter, theme: BookTheme) {
  const index = numberedChapterIndex(project, chapter.id)
  const showNumber =
    chapter.type === 'chapter' &&
    chapter.options.numbered &&
    theme.chapterHeading.showNumber &&
    theme.chapterHeading.numberView !== 'none'
  return {
    number: showNumber ? formatChapterNumber(index, theme.chapterHeading.numberView) : '',
    title: theme.chapterHeading.showTitle && !chapter.options.hideChapterHeading ? chapter.title : '',
    subtitle:
      theme.chapterHeading.showSubtitle && !chapter.options.hideChapterHeading ? chapter.subtitle : '',
  }
}

export function formatChapterNumber(index: number, style: BookTheme['chapterHeading']['numberView']) {
  if (style === 'roman') return toRoman(index)
  if (style === 'words') return numberWords(index)
  return String(index)
}

function toRoman(value: number) {
  const symbols: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let remaining = value
  let output = ''
  for (const [amount, symbol] of symbols) {
    while (remaining >= amount) {
      output += symbol
      remaining -= amount
    }
  }
  return output
}

function numberWords(value: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  if (value < 10) return ones[value]
  if (value < 20) return teens[value - 10]
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? `-${ones[value % 10]}` : ''}`
  if (value < 1000) return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${numberWords(value % 100)}` : ''}`
  return String(value)
}
