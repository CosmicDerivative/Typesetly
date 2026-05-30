import { countWords } from '../data'
import type { BookProject, BookTheme, Chapter } from '../types'
import type { DeviceProfile } from '../preview/devices'
import { exportableChapters, parseManuscript } from './manuscript'

function contentArea(theme: BookTheme, profile: DeviceProfile) {
  if (profile.family !== 'print') {
    return {
      width: profile.logicalWidth * .82,
      height: profile.logicalHeight * .82,
      fontSize: Math.max(15, theme.typography.bodySize * 1.42),
    }
  }
  return {
    width: Math.max(120, (theme.print.trimWidthIn - theme.print.marginInside - theme.print.marginOutside) * 72),
    height: Math.max(160, (theme.print.trimHeightIn - theme.print.marginTop - theme.print.marginBottom) * 72),
    fontSize: theme.print.largePrint ? Math.max(14, theme.typography.bodySize) : theme.typography.bodySize,
  }
}

/**
 * Fast preview estimate, not a replacement for the PDF renderer. The model
 * works in line units so it can account for images, styled blocks, explicit
 * page breaks, trim size, and reader screen geometry without laying out twice.
 */
export function estimateChapterPages(chapter: Chapter, theme: BookTheme, profile: DeviceProfile) {
  const area = contentArea(theme, profile)
  const lineHeight = area.fontSize * theme.typography.lineSpacing
  const charactersPerLine = Math.max(14, Math.floor(area.width / (area.fontSize * .52)))
  const linesPerPage = Math.max(8, Math.floor(area.height / lineHeight))
  const headingLines = chapter.options.hideChapterHeading ? 0 : 5
  let lines = headingLines
  const parsed = parseManuscript(chapter.content)

  for (const block of parsed.blocks) {
    if (block.type === 'page-break') {
      lines = Math.ceil(lines / linesPerPage) * linesPerPage
    } else if (block.type === 'scene-break') lines += 3
    else if (block.type === 'heading') lines += 3 + Math.ceil(block.text.length / charactersPerLine)
    else if (block.type === 'image') {
      lines += block.layout === 'full-page' ? linesPerPage : block.layout === 'two-page' ? linesPerPage * 2 : Math.ceil(linesPerPage * Math.max(.18, block.width / 130))
    } else if (block.type === 'callout' || block.type === 'styled-block') {
      lines += 2 + Math.ceil(block.text.length / Math.max(12, charactersPerLine - 6))
    } else {
      lines += Math.max(1, Math.ceil(block.text.length / charactersPerLine))
      if (theme.paragraph.paragraphStyle === 'space') lines += .55
    }
  }
  if (parsed.notes.length) lines += parsed.notes.reduce((sum, note) => sum + 1 + Math.ceil(note.text.length / charactersPerLine), 2)
  return Math.max(1, Math.ceil(lines / linesPerPage))
}

export function estimateBookPages(project: BookProject, theme: BookTheme, profile: DeviceProfile) {
  let page = 0
  for (const chapter of exportableChapters(project, profile.family === 'print' ? 'print' : 'ebook')) {
    if (profile.family === 'print' && chapter.options.beginOn !== 'either') {
      const wantsOdd = chapter.options.beginOn === 'right'
      if (page > 0 && (page % 2 === 1) !== wantsOdd) page += 1
    }
    page += estimateChapterPages(chapter, theme, profile)
  }
  return Math.max(1, page)
}

export function readingTimeMinutes(chapter: Chapter) {
  return Math.max(1, Math.ceil(countWords(chapter.content) / 250))
}
