import { saveAs } from 'file-saver'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { exportableChapters, headingParts, parseManuscript } from '../layout/manuscript'
import type { BookProject, BookTheme, Chapter, ExportResult } from '../types'
import { preflightBook } from './preflight'

function fileName(title: string) {
  return `${title.replace(/[^\w\s-]/g, '').trim() || 'book'}.pdf`
}

function wrapText(text: string, font: PDFFont, size: number, width: number, hyphenate: boolean) {
  const words = text.split(/\s+/).filter(Boolean).flatMap((original) => {
    if (!hyphenate || font.widthOfTextAtSize(original, size) <= width) return [original]
    const approximate = Math.max(4, Math.floor((original.length * width) / font.widthOfTextAtSize(original, size)) - 1)
    const pieces: string[] = []
    let remaining = original
    while (remaining.length > approximate) {
      pieces.push(`${remaining.slice(0, approximate)}-`)
      remaining = remaining.slice(approximate)
    }
    if (remaining) pieces.push(remaining)
    return pieces
  })
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line)
      line = word
    } else line = candidate
  }
  if (line) lines.push(line)
  return lines
}

function dataUrlBytes(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { mime: match[1].toLowerCase(), bytes }
}

async function splitImageSpread(dataUrl: string): Promise<[string, string] | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image()
    value.onload = () => resolve(value)
    value.onerror = () => reject(new Error('A two-page image could not be decoded.'))
    value.src = dataUrl
  }).catch(() => null)
  if (!image) return null
  const halfWidth = Math.floor(image.naturalWidth / 2)
  if (halfWidth < 1) return null
  const renderHalf = (offset: number, width: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = image.naturalHeight
    canvas.getContext('2d')?.drawImage(image, offset, 0, width, image.naturalHeight, 0, 0, width, image.naturalHeight)
    return canvas.toDataURL('image/png')
  }
  return [
    renderHalf(0, halfWidth),
    renderHalf(halfWidth, image.naturalWidth - halfWidth),
  ]
}

export async function exportProjectToPdf(project: BookProject, theme: BookTheme): Promise<ExportResult> {
  const preflight = preflightBook(project, theme)
  const blocking = preflight.filter((issue) => issue.level === 'error')
  if (blocking.length) throw new Error(`PDF export is blocked: ${blocking.map((issue) => issue.message).join(' ')}`)
  const documentValue = await PDFDocument.create()
  const serif = await documentValue.embedFont(StandardFonts.TimesRoman)
  const serifBold = await documentValue.embedFont(StandardFonts.TimesRomanBold)
  const sans = await documentValue.embedFont(StandardFonts.Helvetica)
  const sansBold = await documentValue.embedFont(StandardFonts.HelveticaBold)
  const bodyFont = /sans|helvetica|source/i.test(theme.typography.bodyFont) ? sans : serif
  const headingFont = /sans|helvetica|source/i.test(theme.chapterHeading.titleFont) ? sansBold : serifBold
  const pageWidth = theme.print.trimWidthIn * 72
  const pageHeight = theme.print.trimHeightIn * 72
  const fontSize = theme.print.largePrint ? Math.max(14, theme.typography.bodySize) : theme.typography.bodySize
  const lineHeight = fontSize * theme.typography.lineSpacing
  const warnings: string[] = preflight
    .filter((issue) => issue.level === 'warning')
    .map((issue) => issue.message)
  if (theme.typography.embeddedFontDataUrl) {
    warnings.push('The print PDF uses a standard fallback font; embedded custom fonts are currently applied to EPUB and preview.')
  }
  const allBookNotes: Array<{ number: number; text: string }> = []
  let page!: PDFPage
  let pageNumber = 0
  let y = 0
  let activeChapter: Chapter | null = null
  let chapterNoteNumber = 0
  let bookNoteNumber = 0
  let pageFootnotes: Array<{ number: number; text: string }> = []
  const blankPages = new Set<number>()
  const chapterOpeningPages = new Set<number>()

  const margins = () => {
    const odd = pageNumber % 2 === 1
    return {
      left: (odd ? theme.print.marginInside : theme.print.marginOutside) * 72,
      right: (odd ? theme.print.marginOutside : theme.print.marginInside) * 72,
      top: theme.print.marginTop * 72,
      bottom: theme.print.marginBottom * 72,
    }
  }

  const currentFootnoteLines = () => {
    const margin = margins()
    const noteSize = Math.min(theme.notes.fontSize, fontSize - 1)
    const width = pageWidth - margin.left - margin.right
    return pageFootnotes.flatMap((note) => wrapText(`${note.number}. ${note.text}`, bodyFont, noteSize, width, false))
  }

  const drawHeaderFooter = () => {
    if (!activeChapter) return
    if (blankPages.has(pageNumber) || chapterOpeningPages.has(pageNumber)) return
    const margin = margins()
    const size = theme.headerFooter.size
    const color = rgb(0.34, 0.37, 0.4)
    const title = project.details.title
    const author = project.details.author
    const chapter = activeChapter.title
    const center = (text: string, yPosition: number) =>
      page.drawText(text, {
        x: (pageWidth - bodyFont.widthOfTextAtSize(text, size)) / 2,
        y: yPosition,
        size,
        font: bodyFont,
        color,
      })
    if (!activeChapter.options.hideHeaderFooter) {
      if (theme.headerFooter.layout === 'page-center' && !activeChapter.options.hidePageNumber) {
        center(String(pageNumber), margin.bottom / 2)
      } else if (theme.headerFooter.layout !== 'none') {
        const odd = pageNumber % 2 === 1
        const headerText =
          theme.headerFooter.layout === 'chapter-page'
            ? chapter
            : odd
              ? title
              : author || title
        page.drawText(headerText, {
          x: odd ? pageWidth - margin.right - bodyFont.widthOfTextAtSize(headerText, size) : margin.left,
          y: pageHeight - margin.top / 2,
          size,
          font: bodyFont,
          color,
        })
        if (!activeChapter.options.hidePageNumber) center(String(pageNumber), margin.bottom / 2)
      }
    }
    if (pageFootnotes.length) {
      const noteSize = Math.min(theme.notes.fontSize, fontSize - 1)
      const lines = currentFootnoteLines()
      let noteY = margin.bottom + 6
      const ruleY = noteY + lines.length * noteSize * 1.35 + 5
      page.drawLine({
        start: { x: margin.left, y: ruleY },
        end: { x: margin.left + (pageWidth - margin.left - margin.right) * .28, y: ruleY },
        thickness: .5,
        color: rgb(.45, .45, .45),
      })
      for (const line of lines) {
        page.drawText(line, {
          x: margin.left,
          y: noteY,
          size: noteSize,
          font: bodyFont,
          color: rgb(.25, .25, .25),
        })
        noteY += noteSize * 1.35
      }
    }
  }

  const newPage = () => {
    if (pageNumber) drawHeaderFooter()
    page = documentValue.addPage([pageWidth, pageHeight])
    pageNumber += 1
    pageFootnotes = []
    y = pageHeight - margins().top
  }

  const ensureSpace = (height: number) => {
    const footnoteReserve = pageFootnotes.length
      ? currentFootnoteLines().length * Math.min(theme.notes.fontSize, fontSize - 1) * 1.35 + 16
      : 0
    if (y - height < margins().bottom + footnoteReserve) newPage()
  }

  const drawLine = (
    text: string,
    options: { font?: PDFFont; size?: number; align?: 'left' | 'center' | 'right'; indent?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const margin = margins()
    const usedFont = options.font || bodyFont
    const usedSize = options.size || fontSize
    const indent = options.indent || 0
    const textWidth = usedFont.widthOfTextAtSize(text, usedSize)
    const x =
      options.align === 'center'
        ? (pageWidth - textWidth) / 2
        : options.align === 'right'
          ? pageWidth - margin.right - textWidth
          : margin.left + indent
    ensureSpace(usedSize * 1.3)
    page.drawText(text, { x, y, size: usedSize, font: usedFont, color: options.color || rgb(0.1, 0.1, 0.1) })
    y -= usedSize * 1.3
  }

  const drawParagraph = (text: string, first: boolean) => {
    const margin = margins()
    const indent =
      theme.paragraph.paragraphStyle === 'indent' && !first ? fontSize * 1.2 : 0
    const width = pageWidth - margin.left - margin.right - indent
    const lines = wrapText(text, bodyFont, fontSize, width, theme.print.hyphens)
    if (theme.print.layoutPriority !== 'balanced' && lines.length > 1) {
      const availableLines = Math.floor((y - margin.bottom) / lineHeight)
      const leavesSingleLineOnNextPage = availableLines > 1 && lines.length - availableLines === 1
      if ((availableLines > 0 && availableLines < Math.min(2, lines.length)) || leavesSingleLineOnNextPage) newPage()
    }
    lines.forEach((line, index) => {
      ensureSpace(lineHeight)
      const lineIndent = index === 0 ? indent : 0
      const available = pageWidth - margin.left - margin.right - lineIndent
      const x = margin.left + lineIndent
      if (theme.paragraph.bodyAlign === 'justify' && index < lines.length - 1 && line.includes(' ')) {
        const words = line.split(' ')
        const wordsWidth = words.reduce((sum, word) => sum + bodyFont.widthOfTextAtSize(word, fontSize), 0)
        const gap = (available - wordsWidth) / Math.max(1, words.length - 1)
        let cursorX = x
        for (const word of words) {
          page.drawText(word, { x: cursorX, y, size: fontSize, font: bodyFont, color: rgb(0.1, 0.1, 0.1) })
          cursorX += bodyFont.widthOfTextAtSize(word, fontSize) + gap
        }
      } else {
        page.drawText(line, { x, y, size: fontSize, font: bodyFont, color: rgb(0.1, 0.1, 0.1) })
      }
      y -= lineHeight
    })
    if (theme.paragraph.paragraphStyle === 'space') y -= lineHeight * 0.35
  }

  const drawMessageBubble = (
    text: string,
    sender: string,
    direction: string,
    messageTheme: string,
  ) => {
    const margin = margins()
    const availableWidth = pageWidth - margin.left - margin.right
    const messageSize = Math.max(8, fontSize - 1)
    const messageLineHeight = messageSize * 1.35
    const senderSize = Math.max(7, messageSize - 2)
    const paddingX = 10
    const paddingY = 7
    const maxBubbleWidth = availableWidth * 0.76
    const maxTextWidth = maxBubbleWidth - paddingX * 2
    const lines = text.split(/\r?\n/).flatMap((value) => {
      const wrapped = wrapText(value, bodyFont, messageSize, maxTextWidth, true)
      return wrapped.length ? wrapped : ['']
    })
    const textWidth = Math.max(
      54,
      sender ? bodyFont.widthOfTextAtSize(sender, senderSize) : 0,
      ...lines.map((line) => bodyFont.widthOfTextAtSize(line, messageSize)),
    )
    const bubbleWidth = Math.min(maxBubbleWidth, textWidth + paddingX * 2)
    const senderHeight = sender ? senderSize * 1.45 : 0
    const bubbleHeight = paddingY * 2 + senderHeight + lines.length * messageLineHeight
    ensureSpace(bubbleHeight + lineHeight * 0.45)

    const incoming = direction === 'incoming'
    const android = messageTheme === 'android'
    const x = incoming ? margin.left : pageWidth - margin.right - bubbleWidth
    const top = y + messageSize * 0.3
    const bottom = top - bubbleHeight
    const fillColor = android
      ? incoming ? rgb(0.95, 0.96, 0.97) : rgb(0.87, 0.94, 0.86)
      : incoming ? rgb(0.91, 0.93, 0.95) : rgb(0.09, 0.47, 0.82)
    const textColor = android || incoming ? rgb(0.12, 0.15, 0.18) : rgb(1, 1, 1)

    page.drawRectangle({
      x,
      y: bottom,
      width: bubbleWidth,
      height: bubbleHeight,
      color: fillColor,
      ...(android ? { borderColor: rgb(0.76, 0.82, 0.77), borderWidth: 0.6 } : {}),
    })

    let lineY = top - paddingY - messageSize
    if (sender) {
      page.drawText(sender, {
        x: x + paddingX,
        y: lineY,
        size: senderSize,
        font: sansBold,
        color: textColor,
        opacity: 0.72,
      })
      lineY -= senderHeight
    }
    for (const line of lines) {
      if (line) {
        page.drawText(line, {
          x: x + paddingX,
          y: lineY,
          size: messageSize,
          font: bodyFont,
          color: textColor,
        })
      }
      lineY -= messageLineHeight
    }
    y = bottom - lineHeight * 0.45
  }

  const embedImage = async (dataUrl: string): Promise<PDFImage | null> => {
    const parsed = dataUrlBytes(dataUrl)
    if (!parsed) return null
    return parsed.mime.includes('png')
      ? documentValue.embedPng(parsed.bytes)
      : documentValue.embedJpg(parsed.bytes)
  }

  const drawImage = async (dataUrl: string, maxHeight = pageHeight * 0.35) => {
    const image = await embedImage(dataUrl)
    if (!image) {
      warnings.push('A WebP or GIF image could not be included in the print PDF. Use PNG or JPEG for print.')
      return
    }
    const margin = margins()
    const maxWidth = pageWidth - margin.left - margin.right
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
    const width = image.width * scale
    const height = image.height * scale
    ensureSpace(height + lineHeight)
    page.drawImage(image, { x: (pageWidth - width) / 2, y: y - height, width, height })
    y -= height + lineHeight
  }

  const startChapter = (chapter: Chapter) => {
    activeChapter = chapter
    chapterNoteNumber = 0
    if (!pageNumber) newPage()
    else newPage()
    if (chapter.options.beginOn !== 'either') {
      const needsOdd = chapter.options.beginOn === 'right'
      const isOdd = pageNumber % 2 === 1
      if (needsOdd !== isOdd) {
        blankPages.add(pageNumber)
        newPage()
      }
    }
    chapterOpeningPages.add(pageNumber)
  }

  for (const chapter of exportableChapters(project, 'print')) {
    startChapter(chapter)
    if (chapter.type === 'title-page') {
      y = pageHeight * 0.62
      const titleLines = wrapText(project.details.title, headingFont, 24, pageWidth - margins().left - margins().right, false)
      for (const line of titleLines) drawLine(line, { font: headingFont, size: 24, align: 'center' })
      if (project.details.subtitle) drawLine(project.details.subtitle, { size: 14, align: 'center' })
      if (project.details.seriesName) {
        drawLine(
          `${project.details.seriesName}${project.details.seriesNumber != null ? ` · Book ${project.details.seriesNumber}` : ''}`,
          { size: 10, align: 'center' },
        )
      }
      y -= lineHeight
      if (project.details.author) drawLine(`by ${project.details.author}`, { size: 14, align: 'center' })
      continue
    }
    if (chapter.type === 'contents') {
      drawLine('Contents', { font: headingFont, size: 24, align: 'center' })
      y -= lineHeight
      for (const entry of project.chapters.filter((candidate) =>
        (candidate.type === 'chapter' || candidate.type === 'part') && !candidate.options.hideInToc
      )) drawParagraph(entry.title, true)
      continue
    }
    const heading = headingParts(project, chapter, theme)
    const chapterImage = chapter.imageDataUrl || theme.chapterHeading.sharedImageDataUrl
    if (chapterImage && theme.chapterHeading.imageEnabled && !chapter.options.hideChapterImage) {
      const layout = chapter.imageLayout || 'inline'
      if (layout === 'full-page' || layout === 'two-page') {
        if (layout === 'two-page') {
          const halves = await splitImageSpread(chapterImage)
          if (pageNumber % 2 === 1) newPage()
          if (halves) {
            y = pageHeight - margins().top
            await drawImage(halves[0], pageHeight - margins().top - margins().bottom)
            newPage()
            await drawImage(halves[1], pageHeight - margins().top - margins().bottom)
          } else {
            warnings.push(`${chapter.title}: two-page image could not be split and was placed as a full-page image.`)
            await drawImage(chapterImage, pageHeight - margins().top - margins().bottom)
          }
        } else {
          y = pageHeight - margins().top
          await drawImage(chapterImage, pageHeight - margins().top - margins().bottom)
        }
        if (chapter.imageCaption) {
          newPage()
          drawLine(chapter.imageCaption, { size: Math.max(8, fontSize - 2), align: 'center' })
        }
        newPage()
      } else {
        await drawImage(chapterImage, layout === 'wide' ? pageHeight * 0.35 : pageHeight * 0.2)
        if (chapter.imageCaption) drawLine(chapter.imageCaption, { size: Math.max(8, fontSize - 2), align: 'center' })
      }
    }
    if (!chapter.options.hideChapterHeading) {
      y -= lineHeight
      if (heading.number) drawLine(`Chapter ${heading.number}`, { align: theme.chapterHeading.titleAlign, size: theme.chapterHeading.numberSize })
      if (heading.title) {
        const titleSize = chapter.options.useSmallerChapterTitle
          ? theme.chapterHeading.titleSize * 0.75
          : Math.min(theme.chapterHeading.titleSize, 34)
        const margin = margins()
        for (const line of wrapText(heading.title, headingFont, titleSize, pageWidth - margin.left - margin.right, false)) {
          drawLine(line, { font: headingFont, size: titleSize, align: theme.chapterHeading.titleAlign })
        }
      }
      if (heading.subtitle) drawLine(heading.subtitle, { size: theme.chapterHeading.subtitleSize, align: theme.chapterHeading.titleAlign })
      y -= lineHeight
    }

    const parsed = parseManuscript(chapter.content)
    const noteByNumber = new Map(parsed.notes.map((note) => [note.number, note]))
    const registerPageFootnotes = (text: string) => {
      if (theme.notes.printPlacement !== 'footnotes') return
      const incoming = Array.from(text.matchAll(/\[(\d+)\]/g))
        .map((match) => noteByNumber.get(Number(match[1])))
        .filter(Boolean) as Array<{ number: number; text: string }>
      const unique = incoming.filter((note) => !pageFootnotes.some((existing) => existing.number === note.number))
      if (!unique.length) return
      const existing = pageFootnotes
      pageFootnotes = [...pageFootnotes, ...unique]
      const reserve = currentFootnoteLines().length * Math.min(theme.notes.fontSize, fontSize - 1) * 1.35 + 16
      pageFootnotes = existing
      if (y - lineHeight * 2 < margins().bottom + reserve) newPage()
      pageFootnotes.push(...unique)
    }
    let firstParagraph = true
    for (const block of parsed.blocks) {
      if (block.type === 'page-break') {
        newPage()
        firstParagraph = true
      } else if (block.type === 'scene-break') {
        if (theme.sceneBreak.style === 'none') {
          firstParagraph = true
          continue
        }
        ensureSpace(lineHeight * 3)
        y -= lineHeight * 0.6
        if (theme.sceneBreak.style === 'ornament' && theme.sceneBreak.customImageDataUrl) {
          await drawImage(theme.sceneBreak.customImageDataUrl, lineHeight * 2.5)
        } else if (theme.sceneBreak.style === 'ornament') drawLine(theme.sceneBreak.ornament || '* * *', { align: 'center', size: theme.sceneBreak.size })
        else if (theme.sceneBreak.style === 'space') y -= lineHeight
        firstParagraph = true
      } else if (block.type === 'heading') {
        const key = `h${Math.min(Math.max(block.level, 2), 6)}Size` as 'h2Size'
        ensureSpace(lineHeight * (theme.print.keepSubheadings ? 3 : 1))
        y -= lineHeight * 0.4
        drawLine(block.text, { font: serifBold, size: theme.subheading[key] * fontSize, align: theme.subheading.align })
      } else if (block.type === 'callout') {
        registerPageFootnotes(block.text)
        if (block.variant === 'message') {
          drawMessageBubble(block.text, block.sender, block.direction, block.theme)
        } else {
          ensureSpace(lineHeight * 3)
          const margin = margins()
          const top = y + 4
          drawParagraph(block.text, true)
          page.drawRectangle({
            x: margin.left - 6,
            y: y - 2,
            width: pageWidth - margin.left - margin.right + 12,
            height: top - y + 5,
            borderColor: rgb(0.55, 0.58, 0.62),
            borderWidth: 0.7,
          })
        }
      } else if (block.type === 'styled-block') {
        const text = block.attribution ? `${block.text} — ${block.attribution}` : block.text
        registerPageFootnotes(text)
        drawParagraph(text, block.variant !== 'hangingIndent')
      } else if (block.type === 'image') {
        if (block.layout === 'two-page') {
          const halves = await splitImageSpread(block.src)
          if (halves) {
            if (pageNumber % 2 === 1) newPage()
            await drawImage(halves[0], pageHeight - margins().top - margins().bottom)
            newPage()
            await drawImage(halves[1], pageHeight - margins().top - margins().bottom)
          } else await drawImage(block.src, pageHeight - margins().top - margins().bottom)
        } else {
          if (block.layout === 'full-page') newPage()
          await drawImage(block.src, block.layout === 'full-page'
            ? pageHeight - margins().top - margins().bottom
            : pageHeight * Math.min(.65, Math.max(.15, block.width / 100)))
        }
        if (block.caption) drawLine(block.caption, { size: Math.max(8, fontSize - 2), align: 'center' })
      } else if (block.type === 'list-item') {
        registerPageFootnotes(block.text)
        drawParagraph(`${block.ordered ? `${block.ordinal}.` : '•'} ${block.text}`, false)
      } else {
        registerPageFootnotes(block.text)
        drawParagraph(block.text, firstParagraph)
        firstParagraph = false
      }
    }

    if (parsed.notes.length) {
      const notes = parsed.notes.map((note) => ({
        number: theme.notes.printPlacement === 'book-end' ? ++bookNoteNumber : ++chapterNoteNumber,
        text: note.text,
      }))
      if (theme.notes.printPlacement === 'book-end') allBookNotes.push(...notes)
      else if (theme.notes.printPlacement === 'chapter-end') {
        y -= lineHeight
        drawLine('Notes', { font: serifBold, size: fontSize + 2 })
        for (const note of notes) drawParagraph(`${note.number}. ${note.text}`, true)
      }
    }
  }

  if (allBookNotes.length) {
    activeChapter = makeNotesChapter()
    newPage()
    drawLine('Notes', { font: headingFont, size: Math.min(theme.chapterHeading.titleSize, 30), align: 'center' })
    y -= lineHeight
    for (const note of allBookNotes) drawParagraph(`${note.number}. ${note.text}`, true)
  }

  if (pageNumber) drawHeaderFooter()
  const bytes = await documentValue.save()
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const outputName = fileName(project.details.title)
  saveAs(blob, outputName)
  return { ok: true, fileName: outputName, warnings: [...warnings, `Generated ${pageNumber} print page(s) at ${theme.print.trimWidthIn} × ${theme.print.trimHeightIn} inches.`] }
}

function makeNotesChapter(): Chapter {
  return {
    id: 'generated-notes',
    title: 'Notes',
    subtitle: '',
    type: 'notes',
    content: '',
    options: {
      hideChapterImage: true,
      hideChapterHeading: false,
      hidePageNumber: false,
      hideHeaderFooter: false,
      hideFirstSentenceFormatting: true,
      hideInToc: false,
      useSmallerChapterTitle: false,
      invertTextColor: false,
      numbered: false,
      beginOn: 'either',
      includeIn: 'print',
      includeSubheadingsInToc: false,
    },
  }
}
