import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from 'docx'
import { saveAs } from 'file-saver'
import { litRpgDraftFromAttrs, type LitRpgBlockDraft } from '../editor/litrpg'
import { exportableChapters, parseManuscript } from '../layout/manuscript'
import type { BookProject, Chapter, ExportResult } from '../types'
import {
  litRpgAuthoredTitle,
  litRpgColumnWidthFractions,
  litRpgFreeformBands,
  litRpgFreeformFields,
  litRpgIsTranslucent,
  litRpgManuscriptWordInk,
  litRpgOpaqueWordFill,
  litRpgTitleDisplay,
  litRpgUsesBoxedFields,
  litRpgWordColor,
  mixLitRpgRgb,
  litRpgRgb,
  type LitRpgExportField,
} from './litrpgExport'

function base64Bytes(dataUrl: string) {
  const match = /^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { bytes, type: match[1] === 'jpeg' ? 'jpg' : match[1] as 'png' | 'jpg' | 'gif' }
}

function wordColor(value?: string) {
  if (!value) return undefined
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return hex[1].toUpperCase()
  const rgb = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(value)
  if (!rgb) return undefined
  return rgb.slice(1, 4)
    .map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function mixWordFill(background: string, accent: string, amount: number) {
  const mixed = mixLitRpgRgb(litRpgRgb(background), litRpgRgb(accent), amount)
  const channel = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0').toUpperCase()
  return `${channel(mixed.r)}${channel(mixed.g)}${channel(mixed.b)}`
}

function transformedText(value: string, transform?: string) {
  if (transform === 'uppercase') return value.toLocaleUpperCase()
  if (transform === 'lowercase') return value.toLocaleLowerCase()
  if (transform === 'capitalize') {
    return value.replace(/\p{L}[\p{L}\p{M}'\u2019-]*/gu, (word) =>
      `${word.charAt(0).toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`,
    )
  }
  return value
}

function runsFromElement(element: HTMLElement): Array<TextRun | ExternalHyperlink> {
  const output: Array<TextRun | ExternalHyperlink> = []
  const visit = (node: Node, marks: {
    bold?: boolean
    italics?: boolean
    underline?: boolean
    strike?: boolean
    superScript?: boolean
    subScript?: boolean
    smallCaps?: boolean
    font?: string
    size?: number
    color?: string
    backgroundColor?: string
    characterSpacing?: number
    textTransform?: string
  } = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        output.push(
          new TextRun({
            text: transformedText(node.textContent, marks.textTransform),
            bold: marks.bold,
            italics: marks.italics,
            underline: marks.underline ? { type: UnderlineType.SINGLE } : undefined,
            strike: marks.strike,
            superScript: marks.superScript,
            subScript: marks.subScript,
            smallCaps: marks.smallCaps,
            font: marks.font || 'Times New Roman',
            size: marks.size || 24,
            color: wordColor(marks.color),
            shading: wordColor(marks.backgroundColor)
              ? { fill: wordColor(marks.backgroundColor) }
              : undefined,
            characterSpacing: marks.characterSpacing,
          }),
        )
      }
      return
    }
    const child = node as HTMLElement
    const tag = child.tagName?.toLowerCase()
    if (tag === 'a' && child.getAttribute('href')) {
      output.push(
        new ExternalHyperlink({
          link: child.getAttribute('href') || '',
          children: [new TextRun({ text: child.textContent || '', style: 'Hyperlink' })],
        }),
      )
      return
    }
    const next = {
      bold: marks.bold || tag === 'strong' || tag === 'b',
      italics: marks.italics || tag === 'em' || tag === 'i',
      underline: marks.underline || tag === 'u',
      strike: marks.strike || tag === 's' || tag === 'strike',
      superScript: marks.superScript || tag === 'sup',
      subScript: marks.subScript || tag === 'sub',
      smallCaps: marks.smallCaps || child.dataset.typesetlyMark === 'smallCaps',
      font: child.dataset.typesetlyMark === 'monospace'
        ? 'Courier New'
        : child.dataset.typesetlyMark === 'sansSerif'
          ? 'Arial'
          : child.dataset.typesetlyMark === 'textAppearance' && child.style.fontFamily
            ? child.style.fontFamily.replaceAll(/["']/g, '')
            : marks.font,
      size:
        child.dataset.typesetlyMark === 'textAppearance' && child.style.fontSize
          ? Math.max(2, Math.round(Number.parseFloat(child.style.fontSize) * 1.5))
          : marks.size,
      color:
        child.dataset.typesetlyMark === 'textAppearance' && child.style.color
          ? child.style.color
          : marks.color,
      backgroundColor:
        child.dataset.typesetlyMark === 'textAppearance' && child.style.backgroundColor
          ? child.style.backgroundColor
          : marks.backgroundColor,
      characterSpacing:
        child.dataset.typesetlyMark === 'textAppearance' && child.style.letterSpacing
          ? Math.round(Number.parseFloat(child.style.letterSpacing) * 240)
          : marks.characterSpacing,
      textTransform:
        child.dataset.typesetlyMark === 'textAppearance' && child.style.textTransform
          ? child.style.textTransform
          : marks.textTransform,
    }
    for (const grandchild of Array.from(child.childNodes || [])) visit(grandchild, next)
  }
  for (const child of Array.from(element.childNodes)) visit(child)
  return output.length ? output : [new TextRun({ text: element.textContent || '' })]
}

function litRpgDocxTable(block: LitRpgBlockDraft) {
  const columns = block.columns.length ? block.columns : ['Value']
  const columnCount = columns.length
  const fullWidth = 9360
  const tableWidth = Math.round(fullWidth * (Math.min(100, Math.max(30, block.widthPercent || 100)) / 100))
  const fractions = litRpgColumnWidthFractions(block)
  const columnWidths = fractions.map((fraction, index) => {
    if (index === fractions.length - 1) {
      return tableWidth - fractions.slice(0, -1).reduce((sum, value) => sum + Math.round(value * tableWidth), 0)
    }
    return Math.round(fraction * tableWidth)
  })
  const translucent = litRpgIsTranslucent(block)
  const freeform = litRpgUsesBoxedFields(block)
  const boxed = freeform && !translucent
  const manuscriptInk = litRpgManuscriptWordInk()
  const bg = translucent
    ? 'FFFFFF'
    : litRpgOpaqueWordFill(block.background || '#102a2d', block.backgroundOpacity ?? 100)
  const accent = translucent ? manuscriptInk.title : litRpgWordColor(block.accent, '5EEAD4')
  const text = translucent ? manuscriptInk.body : litRpgWordColor(block.textColor, 'ECFEFF')
  const muted = translucent ? manuscriptInk.muted : text
  const borderColor = translucent ? manuscriptInk.border : litRpgWordColor(block.border, '2DD4BF')
  const stripe = mixWordFill(block.background || '#102a2d', block.accent || '#5eead4', 0.14)
  const cellFill = mixWordFill(block.background || '#102a2d', '#000000', 0.1)
  const compact = block.density === 'compact'
  const font = translucent
    ? 'Arial'
    : block.appearance === 'terminal'
      ? 'Courier New'
      : block.appearance === 'ornate'
        ? 'Times New Roman'
        : 'Arial'
  const pad = Math.max(40, Math.round((block.cellPadding || 8) * (compact ? 5 : 7)))
  const bodySize = compact ? 16 : 18
  const titleSize = compact ? 18 : 22
  const metaSize = compact ? 14 : 16
  const borderStyle = translucent
    ? BorderStyle.SINGLE
    : block.appearance === 'terminal'
      ? BorderStyle.DASHED
      : block.appearance === 'ornate'
        ? BorderStyle.DOUBLE
        : BorderStyle.SINGLE
  const edgeSize = translucent
    ? Math.max(4, Math.round((block.borderWidth || 1) * 4))
    : block.appearance === 'minimal'
      ? (boxed ? Math.max(6, Math.round((block.borderWidth || 1) * 6)) : 0)
      : Math.max(boxed ? 8 : 4, Math.round((block.borderWidth || 1) * (boxed ? 8 : 6)))
  const leftSize = translucent
    ? edgeSize
    : block.appearance === 'minimal'
      ? Math.max(18, Math.round((block.borderWidth || 4) * 8))
      : edgeSize
  const noneBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: bg },
    bottom: { style: BorderStyle.NONE, size: 0, color: bg },
    left: { style: BorderStyle.NONE, size: 0, color: bg },
    right: { style: BorderStyle.NONE, size: 0, color: bg },
  }
  const cellBorder = (isFirstColumn: boolean, emphasize = false) => {
    if (translucent && freeform) return noneBorder
    const size = emphasize ? Math.max(edgeSize, 8) : edgeSize || 1
    const color = edgeSize || emphasize ? borderColor : bg
    return {
      top: { style: borderStyle, size, color },
      bottom: { style: borderStyle, size, color },
      left: {
        style: block.appearance === 'minimal' && !translucent ? BorderStyle.SINGLE : borderStyle,
        size: isFirstColumn ? Math.max(leftSize || edgeSize || 1, size) : size,
        color: (isFirstColumn && leftSize) || edgeSize || emphasize ? borderColor : bg,
      },
      right: { style: borderStyle, size, color },
    }
  }
  const cellText = (value: string | undefined) => (value && value.trim() ? value : '-')
  const alignment = block.alignment === 'left'
    ? AlignmentType.LEFT
    : block.alignment === 'right'
      ? AlignmentType.RIGHT
      : AlignmentType.CENTER
  const displayTitle = translucent ? litRpgAuthoredTitle(block) : litRpgTitleDisplay(block)
  const fieldRun = (field: LitRpgExportField) => new TextRun({
    text: field.text,
    bold: field.kind === 'title' || field.kind === 'column',
    italics: field.kind === 'subtitle' || field.kind === 'footer',
    color: field.kind === 'title' || field.kind === 'column'
      ? accent
      : field.kind === 'subtitle' || field.kind === 'footer'
        ? muted
        : text,
    font,
    size: field.kind === 'title'
      ? titleSize
      : field.kind === 'column' || field.kind === 'subtitle' || field.kind === 'footer'
        ? metaSize
        : bodySize,
  })

  if (freeform) {
    const fields = litRpgFreeformFields(block, { preserveAuthoredCase: translucent })
    const bands = litRpgFreeformBands(fields)
    const contentWidth = Math.max(1200, tableWidth - pad * 2)
    const bandTables = bands.map((band) => {
      const rawWidths = band.map((field) => Math.max(600, Math.round((field.layout.width / 100) * contentWidth)))
      const widthSum = rawWidths.reduce((sum, width) => sum + width, 0) || contentWidth
      const widths = rawWidths.map((width, index) => (
        index === rawWidths.length - 1
          ? contentWidth - rawWidths.slice(0, -1).reduce((sum, value) => sum + value, 0)
          : Math.round((width / widthSum) * contentWidth)
      ))
      return new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: widths,
        rows: [
          new TableRow({
            children: band.map((field, index) => new TableCell({
              width: { size: widths[index], type: WidthType.DXA },
              verticalAlign: VerticalAlign.TOP,
              shading: { type: ShadingType.CLEAR, fill: boxed ? cellFill : bg },
              borders: cellBorder(index === 0, boxed && field.kind === 'title'),
              margins: {
                top: Math.round(pad * 0.45),
                bottom: Math.round(pad * 0.45),
                left: Math.round(pad * 0.45),
                right: Math.round(pad * 0.45),
              },
              children: [new Paragraph({ children: [fieldRun(field)] })],
            })),
          }),
        ],
      })
    })

    return new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [tableWidth],
      alignment,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: tableWidth, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: bg },
              borders: {
                top: { style: BorderStyle.SINGLE, size: edgeSize, color: borderColor },
                bottom: { style: BorderStyle.SINGLE, size: edgeSize, color: borderColor },
                left: { style: BorderStyle.SINGLE, size: edgeSize, color: borderColor },
                right: { style: BorderStyle.SINGLE, size: edgeSize, color: borderColor },
              },
              margins: { top: pad, bottom: pad, left: pad, right: pad },
              children: bandTables.length
                ? bandTables
                : [new Paragraph({ children: [new TextRun({ text: displayTitle, bold: true, color: accent, font, size: titleSize })] })],
            }),
          ],
        }),
      ],
    })
  }

  const spanCell = (
    content: Paragraph[],
    fill: string,
    options: { firstColumn?: boolean; emphasize?: boolean } = {},
  ) => new TableCell({
    columnSpan: columnCount,
    width: { size: tableWidth, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill },
    borders: cellBorder(options.firstColumn !== false, options.emphasize),
    margins: { top: pad, bottom: pad, left: pad, right: pad },
    children: content,
  })

  const rows: TableRow[] = [
    new TableRow({
      children: [
        spanCell([
          new Paragraph({
            children: [
              new TextRun({
                text: displayTitle,
                bold: true,
                color: accent,
                font,
                size: titleSize,
              }),
            ],
          }),
        ], boxed ? cellFill : bg, { emphasize: boxed }),
      ],
    }),
  ]

  if (block.subtitle) {
    rows.push(new TableRow({
      children: [
        spanCell([
          new Paragraph({
            children: [
              new TextRun({
                text: block.subtitle,
                color: muted,
                font,
                size: metaSize,
                italics: true,
              }),
            ],
          }),
        ], boxed ? cellFill : bg, { emphasize: boxed }),
      ],
    }))
  }

  if (block.showColumnHeaders) {
    rows.push(new TableRow({
      children: columns.map((column, index) => new TableCell({
        width: { size: columnWidths[index], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { type: ShadingType.CLEAR, fill: boxed ? cellFill : stripe },
        borders: cellBorder(index === 0, boxed),
        margins: { top: pad, bottom: pad, left: pad, right: pad },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: column || `Column ${index + 1}`,
                bold: true,
                color: accent,
                font,
                size: metaSize,
              }),
            ],
          }),
        ],
      })),
    }))
  }

  for (const [rowIndex, row] of block.rows.entries()) {
    const fill = !boxed && block.stripedRows && rowIndex % 2 === 1 ? stripe : boxed ? cellFill : bg
    rows.push(new TableRow({
      children: columns.map((_, index) => new TableCell({
        width: { size: columnWidths[index], type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        shading: { type: ShadingType.CLEAR, fill },
        borders: cellBorder(index === 0, boxed),
        margins: { top: pad, bottom: pad, left: pad, right: pad },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: cellText(row.cells[index]),
                color: text,
                font,
                size: bodySize,
              }),
            ],
          }),
        ],
      })),
    }))
  }

  if (block.footer) {
    rows.push(new TableRow({
      children: [
        spanCell([
          new Paragraph({
            children: [
              new TextRun({
                text: block.footer,
                color: translucent ? muted : text,
                font,
                size: metaSize,
                italics: true,
              }),
            ],
          }),
        ], boxed ? cellFill : bg, { emphasize: boxed }),
      ],
    }))
  }

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    alignment,
    rows,
  })
}

async function chapterParagraphs(chapter: Chapter): Promise<Array<Paragraph | Table>> {
  const documentValue = new DOMParser().parseFromString(chapter.content, 'text/html')
  const paragraphs: Array<Paragraph | Table> = []
  for (const element of Array.from(documentValue.body.children) as HTMLElement[]) {
    const tag = element.tagName.toLowerCase()
    const nodeType = element.dataset.typesetlyNode
    if (nodeType === 'page-break') {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
    } else if (nodeType === 'litrpg-block') {
      paragraphs.push(litRpgDocxTable(litRpgDraftFromAttrs({
        ...element.dataset,
        showColumnHeaders: element.dataset.showHeaders,
      })))
    } else if (nodeType === 'scene-break' || tag === 'hr') {
      paragraphs.push(new Paragraph({ text: '* * *', alignment: AlignmentType.CENTER, spacing: { before: 220, after: 220 } }))
    } else if (nodeType === 'verse' || nodeType === 'hangingIndent' || nodeType === 'attributedQuote') {
      paragraphs.push(new Paragraph({
        children: runsFromElement(element),
        indent: nodeType === 'hangingIndent' ? { left: 720, hanging: 360 } : { left: 720, right: 720 },
        spacing: { before: 160, after: 160 },
      }))
      if (nodeType === 'attributedQuote' && element.dataset.attribution) {
        paragraphs.push(new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `— ${element.dataset.attribution}`, italics: true })],
        }))
      }
    } else if (tag === 'img') {
      const image = base64Bytes(element.getAttribute('src') || '')
      if (image) {
        const layout = element.dataset.layout || 'inline'
        const width = layout === 'full-page' || layout === 'two-page' ? 600 : Math.round(420 * Math.min(1, Number(element.dataset.width || 100) / 100))
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: image.bytes,
                transformation: { width, height: Math.round(width * 2 / 3) },
                type: image.type,
              }),
            ],
            pageBreakBefore: layout === 'full-page' || layout === 'two-page',
          }),
        )
        if (element.dataset.caption) paragraphs.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: element.dataset.caption, italics: true, size: 20 })],
        }))
      }
    } else if (tag === 'ul' || tag === 'ol') {
      for (const item of Array.from(element.querySelectorAll(':scope > li')) as HTMLElement[]) {
        paragraphs.push(
          new Paragraph({
            children: runsFromElement(item),
            bullet: tag === 'ul' ? { level: 0 } : undefined,
            numbering: tag === 'ol' ? { reference: 'manuscript-numbering', level: 0 } : undefined,
          }),
        )
      }
    } else {
      const heading =
        tag === 'h2'
          ? HeadingLevel.HEADING_2
          : tag === 'h3'
            ? HeadingLevel.HEADING_3
            : tag === 'h4'
              ? HeadingLevel.HEADING_4
              : undefined
      paragraphs.push(
        new Paragraph({
          children: runsFromElement(element),
          heading,
          spacing: { after: 160 },
        }),
      )
    }
  }

  const notes = parseManuscript(chapter.content).notes
  if (notes.length) {
    paragraphs.push(new Paragraph({ text: 'Notes', heading: HeadingLevel.HEADING_2 }))
    notes.forEach((note) =>
      paragraphs.push(new Paragraph({ text: `${note.number}. ${note.text}`, spacing: { after: 100 } })),
    )
  }
  return paragraphs
}

export async function exportProjectToDocx(project: BookProject): Promise<ExportResult> {
  const children: Array<Paragraph | Table> = []
  for (const chapter of exportableChapters(project)) {
    if (chapter.type === 'title-page') {
      children.push(
        new Paragraph({ text: project.details.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, pageBreakBefore: children.length > 0 }),
        new Paragraph({ text: project.details.subtitle, alignment: AlignmentType.CENTER }),
        new Paragraph({
          text: project.details.seriesName
            ? `${project.details.seriesName}${project.details.seriesNumber != null ? ` · Book ${project.details.seriesNumber}` : ''}`
            : '',
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: project.details.author ? `by ${project.details.author}` : '', alignment: AlignmentType.CENTER, spacing: { before: 300, after: 600 } }),
      )
      continue
    }
    children.push(
      new Paragraph({
        text: chapter.title,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        spacing: { after: 220 },
      }),
    )
    if (chapter.subtitle) {
      children.push(new Paragraph({ children: [new TextRun({ text: chapter.subtitle, italics: true })], spacing: { after: 220 } }))
    }
    if (chapter.type === 'contents') {
      for (const entry of project.chapters.filter((candidate) =>
        (candidate.type === 'chapter' || candidate.type === 'part') && !candidate.options.hideInToc
      )) children.push(new Paragraph({ text: entry.title, spacing: { after: 80 } }))
    } else children.push(...(await chapterParagraphs(chapter)))
  }

  const documentOutput = new Document({
    numbering: {
      config: [
        {
          reference: 'manuscript-numbering',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [{ children }],
  })
  const blob = await Packer.toBlob(documentOutput)
  const outputName = `${project.details.title.replace(/[^\w\s-]/g, '').trim() || 'book'}.docx`
  if (window.typesetly?.saveDocx) {
    const buffer = await blob.arrayBuffer()
    const result = await window.typesetly.saveDocx({ defaultName: outputName, buffer })
    return { ...result, fileName: outputName }
  }
  saveAs(blob, outputName)
  return { ok: true, fileName: outputName }
}
