import { saveAs } from 'file-saver'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { exportableChapters, headingParts, parseManuscript } from '../layout/manuscript'
import { layoutShowsPageNumber, runningHeaderText } from '../layout/runningHeaders'
import type { BookProject, BookTheme, Chapter, ExportResult } from '../types'
import {
  litRpgAuthoredTitle,
  litRpgColumnWidthFractions,
  litRpgFreeformFields,
  litRpgIsTranslucent,
  litRpgManuscriptInk,
  litRpgRgb,
  litRpgTitleDisplay,
  litRpgUsesBoxedFields,
  mixLitRpgRgb,
} from './litrpgExport'
import { pdfSafeText } from './pdfText'
import { preflightBook } from './preflight'
import { addInternalPdfLink } from './pdfLinks'
import { tableOfContentsEntries } from './toc'

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
  const courier = await documentValue.embedFont(StandardFonts.Courier)
  const courierBold = await documentValue.embedFont(StandardFonts.CourierBold)
  const pdfFont = (family: string, bold = false) => {
    const sansFamily = /sans|helvetica|source|arial|avenir|inter|roboto|lato|verdana|tahoma/i.test(family)
    return sansFamily ? (bold ? sansBold : sans) : (bold ? serifBold : serif)
  }
  const bodyFont = pdfFont(theme.typography.bodyFont)
  const headingFont = pdfFont(theme.chapterHeading.titleFont, theme.chapterHeading.titleWeight === 'bold')
  const numberFont = pdfFont(theme.chapterHeading.numberFont)
  const subtitleFont = pdfFont(theme.chapterHeading.subtitleFont)
  const subheadingFont = pdfFont(theme.subheading.font, theme.subheading.weight === 'bold')
  const headerFooterFont = pdfFont(theme.headerFooter.font)
  const replacedPdfCharacters = new Set<string>()
  const safeText = (text: string, font: PDFFont) => {
    const safe = pdfSafeText(text, font.getCharacterSet())
    safe.replaced.forEach((character) => replacedPdfCharacters.add(character))
    return safe.text
  }
  const wrapForPdf = (text: string, font: PDFFont, size: number, width: number, hyphenate: boolean) =>
    wrapText(safeText(text, font), font, size, width, hyphenate)
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
  const chapterDestinations = new Map<string, { page: PDFPage; number: number }>()
  const deferredContents: Array<{ pages: Array<{ page: PDFPage; number: number }>; entries: Chapter[] }> = []
  const printChapters = exportableChapters(project, 'print')
  const generatedNotesChapter = makeNotesChapter()
  const hasGeneratedBookNotes =
    theme.notes.printPlacement === 'book-end' &&
    printChapters.some((chapter) => parseManuscript(chapter.content).notes.length > 0)
  const tocEntries = [
    ...tableOfContentsEntries(printChapters),
    ...(hasGeneratedBookNotes ? [generatedNotesChapter] : []),
  ]

  const margins = () => {
    const odd = pageNumber % 2 === 1
    return {
      left: (odd ? theme.print.marginInside : theme.print.marginOutside) * 72,
      right: (odd ? theme.print.marginOutside : theme.print.marginInside) * 72,
      top: theme.print.marginTop * 72,
      bottom: theme.print.marginBottom * 72,
    }
  }

  const marginsForPage = (number: number) => {
    const odd = number % 2 === 1
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
    return pageFootnotes.flatMap((note) => wrapForPdf(`${note.number}. ${note.text}`, bodyFont, noteSize, width, false))
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
    const center = (text: string, yPosition: number) => {
      const printable = safeText(text, headerFooterFont)
      page.drawText(printable, {
        x: (pageWidth - headerFooterFont.widthOfTextAtSize(printable, size)) / 2,
        y: yPosition,
        size,
        font: headerFooterFont,
        color,
      })
    }
    if (!activeChapter.options.hideHeaderFooter) {
      if (theme.headerFooter.layout !== 'none') {
        const odd = pageNumber % 2 === 1
        const headerText = runningHeaderText(
          theme.headerFooter.layout,
          { title, author, chapter },
          pageNumber,
        )
        if (headerText) {
          const printableHeader = safeText(headerText, headerFooterFont)
          page.drawText(printableHeader, {
            x: odd ? pageWidth - margin.right - headerFooterFont.widthOfTextAtSize(printableHeader, size) : margin.left,
            y: pageHeight - margin.top / 2,
            size,
            font: headerFooterFont,
            color,
          })
        }
        if (
          layoutShowsPageNumber(theme.headerFooter.layout) &&
          !activeChapter.options.hidePageNumber
        ) {
          center(String(pageNumber), margin.bottom / 2)
        }
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
    const printable = safeText(text, usedFont)
    const textWidth = usedFont.widthOfTextAtSize(printable, usedSize)
    const x =
      options.align === 'center'
        ? (pageWidth - textWidth) / 2
        : options.align === 'right'
          ? pageWidth - margin.right - textWidth
          : margin.left + indent
    ensureSpace(usedSize * 1.3)
    page.drawText(printable, { x, y, size: usedSize, font: usedFont, color: options.color || rgb(0.1, 0.1, 0.1) })
    y -= usedSize * 1.3
  }

  const drawParagraph = (text: string, first: boolean) => {
    const margin = margins()
    const indent =
      theme.paragraph.paragraphStyle === 'indent' && !first ? fontSize * 1.2 : 0
    const width = pageWidth - margin.left - margin.right - indent
    const lines = wrapForPdf(text, bodyFont, fontSize, width, theme.print.hyphens)
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
      const wrapped = wrapForPdf(value, bodyFont, messageSize, maxTextWidth, true)
      return wrapped.length ? wrapped : ['']
    })
    const printableSender = safeText(sender, sansBold)
    const textWidth = Math.max(
      54,
      printableSender ? sansBold.widthOfTextAtSize(printableSender, senderSize) : 0,
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
    if (printableSender) {
      page.drawText(printableSender, {
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

  const drawLitRpgBlock = (block: Extract<ReturnType<typeof parseManuscript>['blocks'][number], { type: 'litrpg-block' }>['draft']) => {
    const margin = margins()
    const contentWidth = pageWidth - margin.left - margin.right
    const widthPercent = Math.min(100, Math.max(30, block.widthPercent || 100))
    const blockWidth = contentWidth * (widthPercent / 100)
    const blockX = block.alignment === 'left'
      ? margin.left
      : block.alignment === 'right'
        ? pageWidth - margin.right - blockWidth
        : margin.left + (contentWidth - blockWidth) / 2

    const translucent = litRpgIsTranslucent(block)
    const boxed = litRpgUsesBoxedFields(block)
    const compact = block.density === 'compact'
    const padX = Math.max(6, (block.cellPadding || 8) * (compact ? 0.55 : 0.75))
    const padY = compact ? 6 : 10
    const titleSize = compact ? Math.max(8, fontSize - 1) : Math.max(9, fontSize)
    const bodySize = compact ? Math.max(7, fontSize - 2) : Math.max(8, fontSize - 1)
    const metaSize = Math.max(6, bodySize - 1)
    const rowGap = compact ? 2 : 4
    const sectionGap = compact ? 3 : 5
    const accentBar = boxed || translucent || block.appearance === 'minimal' ? 0 : 3.5
    const borderInset = !translucent && block.appearance === 'ornate' ? 3 : 0
    const borderThickness = Math.max(
      translucent ? 0.85 : block.appearance === 'minimal' ? 2.5 : 0.75,
      Math.min(4, (block.borderWidth || 1) * (translucent ? 0.55 : 0.75)),
    )
    const cellBorderThickness = Math.max(0.6, Math.min(2.2, (block.borderWidth || 1) * 0.7))

    const terminal = !translucent && block.appearance === 'terminal'
    const ornate = !translucent && block.appearance === 'ornate'
    const titleFont = translucent ? sansBold : terminal ? courierBold : ornate ? serifBold : sansBold
    const textFont = translucent ? sans : terminal ? courier : ornate ? serif : sans
    const headerFont = translucent ? sansBold : terminal ? courierBold : ornate ? serifBold : sansBold

    const bgChannels = litRpgRgb(block.background)
    const accentChannels = litRpgRgb(block.accent, { r: 0.2, g: 0.4, b: 0.45 })
    const textChannels = litRpgRgb(block.textColor, { r: 0.95, g: 0.95, b: 0.95 })
    const borderChannels = litRpgRgb(block.border, { r: 0.2, g: 0.55, b: 0.58 })
    const manuscriptInk = litRpgManuscriptInk()
    const bgColor = rgb(bgChannels.r, bgChannels.g, bgChannels.b)
    const accentColor = translucent
      ? rgb(manuscriptInk.title.r, manuscriptInk.title.g, manuscriptInk.title.b)
      : rgb(accentChannels.r, accentChannels.g, accentChannels.b)
    const textColor = translucent
      ? rgb(manuscriptInk.body.r, manuscriptInk.body.g, manuscriptInk.body.b)
      : rgb(textChannels.r, textChannels.g, textChannels.b)
    const mutedColor = rgb(manuscriptInk.muted.r, manuscriptInk.muted.g, manuscriptInk.muted.b)
    const borderColor = translucent
      ? rgb(manuscriptInk.border.r, manuscriptInk.border.g, manuscriptInk.border.b)
      : rgb(borderChannels.r, borderChannels.g, borderChannels.b)
    const bgOpacity = Math.min(1, Math.max(0, (block.backgroundOpacity ?? 100) / 100))
    const cellFillChannels = mixLitRpgRgb(bgChannels, { r: 0, g: 0, b: 0 }, 0.12)
    const cellFill = rgb(cellFillChannels.r, cellFillChannels.g, cellFillChannels.b)
    const stripeChannels = mixLitRpgRgb(bgChannels, accentChannels, 0.14)
    const stripeColor = rgb(stripeChannels.r, stripeChannels.g, stripeChannels.b)
    const gridChannels = mixLitRpgRgb(bgChannels, borderChannels, 0.22)
    const gridColor = rgb(gridChannels.r, gridChannels.g, gridChannels.b)

    const drawBorderRect = (
      x: number,
      rectBottom: number,
      width: number,
      height: number,
      thickness: number,
      dashed: boolean,
      color = borderColor,
    ) => {
      const edges = [
        { start: { x, y: rectBottom + height }, end: { x: x + width, y: rectBottom + height } },
        { start: { x: x + width, y: rectBottom + height }, end: { x: x + width, y: rectBottom } },
        { start: { x: x + width, y: rectBottom }, end: { x, y: rectBottom } },
        { start: { x, y: rectBottom }, end: { x, y: rectBottom + height } },
      ]
      for (const edge of edges) {
        page.drawLine({
          start: edge.start,
          end: edge.end,
          thickness,
          color,
          ...(dashed ? { dashArray: [3.5, 2.5] } : {}),
        })
      }
    }

    const wrapCell = (value: string, font: PDFFont, size: number, width: number) => {
      const wrapped = wrapForPdf(value, font, size, Math.max(12, width - 4), false)
      return wrapped.length ? wrapped : ['-']
    }

    if (boxed) {
      const fields = litRpgFreeformFields(block, { preserveAuthoredCase: translucent })
      const canvasHeight = Math.max(
        80,
        block.canvasHeight || 0,
        ...fields.map((field) => field.layout.y + field.layout.height + 12),
      )
      // Freeform y/height are authored in CSS px; treat 1px ≈ 1pt for print.
      const blockHeight = Math.max(48, canvasHeight) + borderInset * 2
      ensureSpace(Math.min(blockHeight + lineHeight * 0.4, pageHeight - margin.top - margin.bottom))

      const top = y
      const bottom = y - blockHeight
      const innerX = blockX + borderInset
      const innerTop = top - borderInset
      const fillBottom = bottom + borderInset
      const fillHeight = Math.max(1, innerTop - fillBottom)
      const fillWidth = blockWidth - borderInset * 2

      if (!translucent) {
        page.drawRectangle({
          x: innerX,
          y: fillBottom,
          width: fillWidth,
          height: fillHeight,
          color: bgColor,
          opacity: bgOpacity,
        })

        const gridStep = 16
        for (let gridX = innerX + gridStep; gridX < innerX + fillWidth; gridX += gridStep) {
          page.drawLine({
            start: { x: gridX, y: fillBottom },
            end: { x: gridX, y: innerTop },
            thickness: 0.4,
            color: gridColor,
            opacity: Math.min(1, bgOpacity * 0.45),
          })
        }
        for (let gridY = fillBottom + gridStep; gridY < innerTop; gridY += gridStep) {
          page.drawLine({
            start: { x: innerX, y: gridY },
            end: { x: innerX + fillWidth, y: gridY },
            thickness: 0.4,
            color: gridColor,
            opacity: Math.min(1, bgOpacity * 0.45),
          })
        }
      }

      if (block.appearance === 'minimal' && !translucent) {
        page.drawRectangle({
          x: blockX,
          y: bottom,
          width: borderThickness,
          height: blockHeight,
          color: borderColor,
        })
      } else if (block.appearance === 'ornate' && !translucent) {
        drawBorderRect(blockX, bottom, blockWidth, blockHeight, borderThickness, false)
        drawBorderRect(innerX, fillBottom, fillWidth, fillHeight, Math.max(0.6, borderThickness * 0.55), false)
      } else {
        drawBorderRect(blockX, bottom, blockWidth, blockHeight, borderThickness, terminal)
      }

      for (const field of fields) {
        const fieldX = innerX + (field.layout.x / 100) * fillWidth
        const fieldWidth = Math.max(18, (field.layout.width / 100) * fillWidth)
        const fieldHeight = Math.max(14, field.layout.height)
        const fieldTop = innerTop - field.layout.y
        const fieldBottom = fieldTop - fieldHeight
        const isAccent = field.kind === 'title' || field.kind === 'column'
        const fieldPad = Math.max(3, (block.cellPadding || 8) * 0.45)
        const font = isAccent ? titleFont : field.kind === 'column' ? headerFont : textFont
        const size = field.kind === 'title'
          ? titleSize
          : field.kind === 'column' || field.kind === 'subtitle' || field.kind === 'footer'
            ? metaSize
            : bodySize
        const color = translucent && (field.kind === 'subtitle' || field.kind === 'footer')
          ? mutedColor
          : isAccent
            ? accentColor
            : textColor
        const lines = wrapCell(field.text, font, size, fieldWidth - fieldPad * 2)

        if (!translucent) {
          page.drawRectangle({
            x: fieldX,
            y: fieldBottom,
            width: fieldWidth,
            height: fieldHeight,
            color: cellFill,
            opacity: Math.min(1, bgOpacity + 0.08),
          })
          if (block.showCellBorders) {
            drawBorderRect(
              fieldX,
              fieldBottom,
              fieldWidth,
              fieldHeight,
              cellBorderThickness,
              terminal && field.kind === 'title',
              field.kind === 'title' ? accentColor : borderColor,
            )
          }
        }

        let lineY = fieldTop - fieldPad - size * 0.85
        for (const line of lines) {
          if (lineY < fieldBottom + 2) break
          page.drawText(safeText(line, font), {
            x: fieldX + fieldPad,
            y: lineY,
            size,
            font,
            color,
          })
          lineY -= size * 1.2
        }
      }

      y = bottom - lineHeight * 0.35
      return
    }

    const columns = block.columns.length ? block.columns : ['Value']
    const fractions = litRpgColumnWidthFractions(block)
    const innerWidth = Math.max(24, blockWidth - padX * 2 - borderInset * 2)
    const colWidths = fractions.map((fraction) => fraction * innerWidth)
    const cellText = (value: string | undefined) => (value && value.trim() ? value : '-')

    const titleLines = wrapCell(
      translucent ? litRpgAuthoredTitle(block) : litRpgTitleDisplay(block),
      titleFont,
      titleSize,
      innerWidth,
    )
    const subtitleLines = block.subtitle
      ? wrapCell(block.subtitle, textFont, metaSize, innerWidth)
      : []
    const headerLines = block.showColumnHeaders
      ? columns.map((column, index) => wrapCell(column || `Column ${index + 1}`, headerFont, metaSize, colWidths[index]))
      : []
    const headerRowHeight = headerLines.length
      ? Math.max(...headerLines.map((lines) => lines.length)) * metaSize * 1.25
      : 0
    const dataRows = block.rows.map((row) => columns.map((_, index) =>
      wrapCell(cellText(row.cells[index]), textFont, bodySize, colWidths[index])))
    const dataRowHeights = dataRows.map((cells) =>
      Math.max(bodySize * 1.35 + 4, ...cells.map((lines) => lines.length * bodySize * 1.25 + 4)))
    const footerLines = block.footer
      ? wrapCell(block.footer, textFont, metaSize, innerWidth)
      : []

    const contentHeight =
      accentBar
      + padY
      + titleLines.length * titleSize * 1.25
      + (subtitleLines.length ? sectionGap + subtitleLines.length * metaSize * 1.25 : 0)
      + (headerRowHeight ? sectionGap + headerRowHeight + rowGap : sectionGap)
      + dataRowHeights.reduce((sum, height) => sum + height + rowGap, 0)
      + (footerLines.length ? sectionGap + footerLines.length * metaSize * 1.25 : 0)
      + padY
    const blockHeight = contentHeight + borderInset * 2
    ensureSpace(Math.min(blockHeight + lineHeight * 0.4, pageHeight - margin.top - margin.bottom))

    const top = y
    const bottom = y - blockHeight
    const innerX = blockX + borderInset
    const innerTop = top - borderInset
    const fillBottom = bottom + borderInset
    const fillHeight = Math.max(1, innerTop - fillBottom)

    if (!translucent) {
      page.drawRectangle({
        x: innerX,
        y: fillBottom,
        width: blockWidth - borderInset * 2,
        height: fillHeight,
        color: bgColor,
        opacity: bgOpacity,
      })
    }

    if (accentBar > 0) {
      page.drawRectangle({
        x: innerX,
        y: innerTop - accentBar,
        width: blockWidth - borderInset * 2,
        height: accentBar,
        color: accentColor,
      })
    }

    if (block.appearance === 'minimal' && !translucent) {
      page.drawRectangle({
        x: blockX,
        y: bottom,
        width: borderThickness,
        height: blockHeight,
        color: borderColor,
      })
    } else if (block.appearance === 'ornate' && !translucent) {
      drawBorderRect(blockX, bottom, blockWidth, blockHeight, borderThickness, false)
      drawBorderRect(innerX, fillBottom, blockWidth - borderInset * 2, fillHeight, Math.max(0.6, borderThickness * 0.55), false)
    } else {
      drawBorderRect(blockX, bottom, blockWidth, blockHeight, borderThickness, terminal)
    }

    let cursorY = innerTop - accentBar - padY - titleSize
    const drawWrapped = (
      lines: string[],
      font: PDFFont,
      size: number,
      color: ReturnType<typeof rgb>,
      x: number,
    ) => {
      for (const line of lines) {
        page.drawText(safeText(line, font), {
          x,
          y: cursorY,
          size,
          font,
          color,
        })
        cursorY -= size * 1.25
      }
    }

    drawWrapped(titleLines, titleFont, titleSize, accentColor, innerX + padX)
    if (subtitleLines.length) {
      cursorY -= sectionGap - metaSize * 0.15
      drawWrapped(subtitleLines, textFont, metaSize, translucent ? mutedColor : textColor, innerX + padX)
    }

    const drawTableRow = (
      cells: string[][],
      rowTop: number,
      rowHeight: number,
      fonts: PDFFont[],
      sizes: number[],
      colors: ReturnType<typeof rgb>[],
      fill: ReturnType<typeof rgb> | null,
    ) => {
      const rowBottom = rowTop - rowHeight
      if (fill && !translucent) {
        page.drawRectangle({
          x: innerX + padX * 0.2,
          y: rowBottom,
          width: innerWidth + padX * 0.6,
          height: rowHeight,
          color: fill,
          opacity: Math.min(1, bgOpacity + 0.06),
        })
      }
      let colX = innerX + padX
      cells.forEach((lines, index) => {
        const cellWidth = colWidths[index]
        if (!translucent && block.showCellBorders) {
          drawBorderRect(colX, rowBottom, cellWidth, rowHeight, cellBorderThickness, false)
        }
        let lineY = rowTop - sizes[index] * 0.95 - 2
        for (const line of lines) {
          page.drawText(safeText(line, fonts[index]), {
            x: colX + 3,
            y: lineY,
            size: sizes[index],
            font: fonts[index],
            color: colors[index],
          })
          lineY -= sizes[index] * 1.25
        }
        colX += cellWidth
      })
    }

    if (headerLines.length) {
      cursorY -= sectionGap
      const rowHeight = headerRowHeight + 4
      const headerMix = mixLitRpgRgb(bgChannels, accentChannels, 0.1)
      const headerFill = translucent ? null : rgb(headerMix.r, headerMix.g, headerMix.b)
      drawTableRow(
        headerLines,
        cursorY,
        rowHeight,
        columns.map(() => headerFont),
        columns.map(() => metaSize),
        columns.map(() => accentColor),
        headerFill,
      )
      cursorY -= rowHeight + rowGap
    } else {
      cursorY -= sectionGap
    }

    dataRows.forEach((cells, rowIndex) => {
      const rowHeight = dataRowHeights[rowIndex]
      const fill = !translucent && block.stripedRows && rowIndex % 2 === 1 ? stripeColor : null
      drawTableRow(
        cells,
        cursorY,
        rowHeight,
        columns.map(() => textFont),
        columns.map(() => bodySize),
        columns.map(() => textColor),
        fill,
      )
      cursorY -= rowHeight + rowGap
    })

    if (footerLines.length) {
      cursorY -= sectionGap - metaSize * 0.1
      drawWrapped(footerLines, textFont, metaSize, translucent ? mutedColor : textColor, innerX + padX)
    }

    y = bottom - lineHeight * 0.35
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
    chapterNoteNumber = 0
    newPage()
    // newPage finalizes the page it is leaving, so the previous chapter must
    // remain active until that page's running header and footnotes are drawn.
    activeChapter = chapter
    if (chapter.options.beginOn !== 'either') {
      const needsOdd = chapter.options.beginOn === 'right'
      const isOdd = pageNumber % 2 === 1
      if (needsOdd !== isOdd) {
        blankPages.add(pageNumber)
        newPage()
      }
    }
    chapterOpeningPages.add(pageNumber)
    chapterDestinations.set(chapter.id, { page, number: pageNumber })
  }

  for (const chapter of printChapters) {
    startChapter(chapter)
    if (chapter.type === 'title-page') {
      y = pageHeight * 0.62
      const titleLines = wrapForPdf(project.details.title, headingFont, 24, pageWidth - margins().left - margins().right, false)
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
      const availableHeight = pageHeight - margins().top - margins().bottom - 24 * 1.3 - lineHeight
      const linesPerPage = Math.max(1, Math.floor(availableHeight / (fontSize * 1.55)))
      const pageCount = Math.max(1, Math.ceil(tocEntries.length / linesPerPage))
      const pages = [{ page, number: pageNumber }]
      for (let index = 1; index < pageCount; index += 1) {
        newPage()
        chapterOpeningPages.add(pageNumber)
        pages.push({ page, number: pageNumber })
      }
      deferredContents.push({ pages, entries: tocEntries })
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
      if (heading.number) drawLine(`Chapter ${heading.number}`, {
        font: numberFont,
        align: theme.chapterHeading.titleAlign,
        size: theme.chapterHeading.numberSize,
      })
      if (heading.number && heading.title) {
        y -= Math.max(8, theme.chapterHeading.titleSize * .28)
      }
      if (heading.title) {
        const titleSize = chapter.options.useSmallerChapterTitle
          ? theme.chapterHeading.titleSize * 0.75
          : Math.min(theme.chapterHeading.titleSize, 34)
        const margin = margins()
        for (const line of wrapForPdf(heading.title, headingFont, titleSize, pageWidth - margin.left - margin.right, false)) {
          drawLine(line, { font: headingFont, size: titleSize, align: theme.chapterHeading.titleAlign })
        }
      }
      if (heading.subtitle) drawLine(heading.subtitle, {
        font: subtitleFont,
        size: theme.chapterHeading.subtitleSize,
        align: theme.chapterHeading.titleAlign,
      })
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
        drawLine(block.text, { font: subheadingFont, size: theme.subheading[key] * fontSize, align: theme.subheading.align })
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
      } else if (block.type === 'litrpg-block') {
        const searchableText = [
          block.draft.title,
          block.draft.subtitle,
          ...block.draft.rows.flatMap((row) => row.cells),
          block.draft.footer,
        ].join(' ')
        registerPageFootnotes(searchableText)
        drawLitRpgBlock(block.draft)
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
        drawLine('Notes', { font: subheadingFont, size: fontSize + 2 })
        for (const note of notes) drawParagraph(`${note.number}. ${note.text}`, true)
      }
    }
  }

  if (allBookNotes.length) {
    newPage()
    activeChapter = generatedNotesChapter
    chapterOpeningPages.add(pageNumber)
    chapterDestinations.set(generatedNotesChapter.id, { page, number: pageNumber })
    drawLine('Notes', { font: headingFont, size: Math.min(theme.chapterHeading.titleSize, 30), align: 'center' })
    y -= lineHeight
    for (const note of allBookNotes) drawParagraph(`${note.number}. ${note.text}`, true)
  }

  for (const contents of deferredContents) {
    let entryIndex = 0
    for (const [contentsPageIndex, contentsPage] of contents.pages.entries()) {
      const margin = marginsForPage(contentsPage.number)
      let contentsY = pageHeight - margin.top
      const title = contentsPageIndex === 0 ? 'Contents' : 'Contents (continued)'
      const printableTitle = safeText(title, headingFont)
      contentsPage.page.drawText(printableTitle, {
        x: (pageWidth - headingFont.widthOfTextAtSize(printableTitle, 24)) / 2,
        y: contentsY,
        size: 24,
        font: headingFont,
        color: rgb(0.1, 0.1, 0.1),
      })
      contentsY -= 24 * 1.3 + lineHeight
      const nextPageBottom = margin.bottom + fontSize * 1.55
      while (entryIndex < contents.entries.length && contentsY >= nextPageBottom) {
        const entry = contents.entries[entryIndex]
        const destination = chapterDestinations.get(entry.id)
        if (!destination) {
          entryIndex += 1
          continue
        }
        const pageLabel = String(destination.number)
        const labelWidth = bodyFont.widthOfTextAtSize(pageLabel, fontSize)
        const rowWidth = pageWidth - margin.left - margin.right
        const titleWidth = Math.max(24, rowWidth - labelWidth - 18)
        const originalEntry = safeText(entry.title, bodyFont)
        const suffix = '...'
        let printableEntry = originalEntry
        while (
          printableEntry.length > 1 &&
          bodyFont.widthOfTextAtSize(
            printableEntry === originalEntry ? printableEntry : `${printableEntry.trimEnd()}${suffix}`,
            fontSize,
          ) > titleWidth
        ) {
          printableEntry = printableEntry.slice(0, -1)
        }
        if (printableEntry !== originalEntry) printableEntry = `${printableEntry.trimEnd()}${suffix}`
        const pageX = pageWidth - margin.right - labelWidth
        contentsPage.page.drawText(printableEntry, {
          x: margin.left,
          y: contentsY,
          size: fontSize,
          font: bodyFont,
          color: rgb(0.1, 0.1, 0.1),
        })
        contentsPage.page.drawText(pageLabel, {
          x: pageX,
          y: contentsY,
          size: fontSize,
          font: bodyFont,
          color: rgb(0.1, 0.1, 0.1),
        })
        const titleEnd = margin.left + bodyFont.widthOfTextAtSize(printableEntry, fontSize)
        const dot = safeText('.', bodyFont)
        const dotWidth = bodyFont.widthOfTextAtSize(dot, fontSize)
        const dotCount = Math.max(0, Math.floor((pageX - titleEnd - 12) / Math.max(1, dotWidth * 1.7)))
        if (dotCount) {
          contentsPage.page.drawText(Array(dotCount).fill(dot).join(' '), {
            x: titleEnd + 6,
            y: contentsY,
            size: fontSize,
            font: bodyFont,
            color: rgb(0.45, 0.45, 0.45),
          })
        }
        addInternalPdfLink(
          documentValue,
          contentsPage.page,
          destination.page,
          [margin.left, contentsY - 2, pageWidth - margin.right, contentsY + fontSize + 2],
        )
        contentsY -= fontSize * 1.55
        entryIndex += 1
      }
    }
  }

  if (pageNumber) drawHeaderFooter()
  if (replacedPdfCharacters.size) {
    warnings.push('Characters unsupported by the standard print fonts were replaced with print-safe equivalents.')
  }
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
