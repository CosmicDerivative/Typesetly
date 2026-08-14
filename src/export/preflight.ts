import type { BookProject, BookTheme } from '../types'

export interface PreflightIssue {
  level: 'error' | 'warning'
  message: string
  chapterId?: string
}

/**
 * Shared publication gate for EPUB and print exports. Errors represent output
 * that is structurally unsafe; warnings are quality or accessibility checks
 * that an author may intentionally accept.
 */
export function preflightBook(project: BookProject, theme?: BookTheme): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  if (!project.details.title.trim()) issues.push({ level: 'error', message: 'Add a book title.' })
  if (!project.details.author.trim()) issues.push({ level: 'warning', message: 'Add an author name.' })
  if (!project.details.language.trim()) issues.push({ level: 'error', message: 'Choose a language for EPUB accessibility.' })
  if (project.details.language && !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(project.details.language)) {
    issues.push({ level: 'warning', message: 'Use a standard language tag such as en or en-US.' })
  }
  if (project.details.isbn && !/^(?:\d[\s-]?){9}[\dXx]$|^(?:\d[\s-]?){13}$/.test(project.details.isbn)) {
    issues.push({ level: 'warning', message: 'The ISBN does not look like a valid ISBN-10 or ISBN-13.' })
  }
  if (project.details.seriesName?.trim() && project.details.seriesNumber == null) {
    issues.push({ level: 'warning', message: 'Add this book’s position in its series.' })
  }
  if (
    project.details.seriesNumber != null &&
    project.details.seriesTotal != null &&
    project.details.seriesNumber > project.details.seriesTotal
  ) {
    issues.push({ level: 'warning', message: 'The series book number is greater than the planned series total.' })
  }
  const included = project.chapters.filter((chapter) => chapter.options.includeIn !== 'none')
  const titleCounts = new Map<string, number>()
  for (const chapter of included) {
    const key = chapter.title.trim().toLocaleLowerCase()
    if (key) titleCounts.set(key, (titleCounts.get(key) || 0) + 1)
  }
  for (const [title, count] of titleCounts) {
    if (count > 1) issues.push({ level: 'error', message: `The title “${title}” is used by ${count} included pages. Use unique titles for navigation.` })
  }
  if (theme?.typography.embeddedFontDataUrl) {
    issues.push({ level: 'warning', message: 'Confirm that the embedded font license permits ebook distribution.' })
  }

  for (const chapter of project.chapters) {
    if (chapter.options.includeIn === 'none') continue
    if (!chapter.title.trim()) issues.push({ level: 'warning', message: 'A page has no title.', chapterId: chapter.id })
    const readable = new DOMParser().parseFromString(chapter.content, 'text/html').body.textContent?.trim() || ''
    if (!readable && !chapter.imageDataUrl && chapter.type === 'chapter') {
      issues.push({ level: 'warning', message: `${chapter.title || 'Untitled page'} is empty.`, chapterId: chapter.id })
    }
    if (chapter.imageDataUrl && !chapter.imageAlt?.trim() && chapter.imageLayout !== 'inline') {
      issues.push({ level: 'warning', message: `${chapter.title}: add alt text or confirm the image is decorative.`, chapterId: chapter.id })
    }
    if (chapter.imageDataUrl && (chapter.imageBytes || estimateDataUrlBytes(chapter.imageDataUrl)) > 5_000_000) {
      issues.push({ level: 'warning', message: `${chapter.title}: chapter image is larger than 5 MB.`, chapterId: chapter.id })
    }
    if (
      chapter.imageDataUrl &&
      (chapter.imageLayout === 'full-page' || chapter.imageLayout === 'two-page') &&
      ((chapter.imageWidthPx || 0) < 1200 || (chapter.imageHeightPx || 0) < 1800)
    ) {
      issues.push({ level: 'warning', message: `${chapter.title}: full-page image may be below print resolution.`, chapterId: chapter.id })
    }
    const doc = new DOMParser().parseFromString(chapter.content, 'text/html')
    let previousHeading = 1
    for (const heading of Array.from(doc.querySelectorAll('h2,h3,h4,h5,h6'))) {
      const level = Number(heading.tagName[1])
      if (level > previousHeading + 1) {
        issues.push({ level: 'warning', message: `${chapter.title}: heading levels skip from H${previousHeading} to H${level}.`, chapterId: chapter.id })
        break
      }
      previousHeading = level
    }
    for (const image of Array.from(doc.querySelectorAll('img'))) {
      const source = image.getAttribute('src')?.trim() || ''
      if (!source) continue
      if (!image.getAttribute('alt') && image.getAttribute('data-decorative') !== 'true') {
        issues.push({ level: 'warning', message: `${chapter.title}: an image needs alt text.`, chapterId: chapter.id })
      }
      const bytes = Number(image.getAttribute('data-bytes') || estimateDataUrlBytes(image.getAttribute('src') || ''))
      if (bytes > 5_000_000) issues.push({ level: 'warning', message: `${chapter.title}: an image is larger than 5 MB.`, chapterId: chapter.id })
      const layout = image.getAttribute('data-layout')
      if (
        (layout === 'full-page' || layout === 'two-page') &&
        (Number(image.getAttribute('data-natural-width') || 0) < 1200 || Number(image.getAttribute('data-natural-height') || 0) < 1800)
      ) issues.push({ level: 'warning', message: `${chapter.title}: a full-page image may be below print resolution.`, chapterId: chapter.id })
    }
    for (const link of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = link.getAttribute('href') || ''
      if (href.startsWith('#chapter-') && !project.chapters.some((item) => `#chapter-${item.id}` === href)) {
        issues.push({ level: 'error', message: `${chapter.title}: an internal link points to a missing chapter.`, chapterId: chapter.id })
      }
      if (/^https?:/i.test(href)) {
        try {
          new URL(href)
        } catch {
          issues.push({ level: 'error', message: `${chapter.title}: a web link is malformed.`, chapterId: chapter.id })
        }
      }
    }
  }
  return issues
}

function estimateDataUrlBytes(dataUrl: string) {
  return Math.ceil((dataUrl.split(',')[1]?.length || 0) * .75)
}
