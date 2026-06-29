import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
  UnderlineType,
} from 'docx'
import { saveAs } from 'file-saver'
import { exportableChapters, parseManuscript } from '../layout/manuscript'
import type { BookProject, Chapter, ExportResult } from '../types'

function base64Bytes(dataUrl: string) {
  const match = /^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { bytes, type: match[1] === 'jpeg' ? 'jpg' : match[1] as 'png' | 'jpg' | 'gif' }
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
  } = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        output.push(
          new TextRun({
            text: node.textContent,
            bold: marks.bold,
            italics: marks.italics,
            underline: marks.underline ? { type: UnderlineType.SINGLE } : undefined,
            strike: marks.strike,
            superScript: marks.superScript,
            subScript: marks.subScript,
            smallCaps: marks.smallCaps,
            font: marks.font || 'Times New Roman',
            size: 24,
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
          : marks.font,
    }
    for (const grandchild of Array.from(child.childNodes || [])) visit(grandchild, next)
  }
  for (const child of Array.from(element.childNodes)) visit(child)
  return output.length ? output : [new TextRun({ text: element.textContent || '' })]
}

async function chapterParagraphs(chapter: Chapter): Promise<Paragraph[]> {
  const documentValue = new DOMParser().parseFromString(chapter.content, 'text/html')
  const paragraphs: Paragraph[] = []
  for (const element of Array.from(documentValue.body.children) as HTMLElement[]) {
    const tag = element.tagName.toLowerCase()
    const nodeType = element.dataset.typesetlyNode
    if (nodeType === 'page-break') {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
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
  const children: Paragraph[] = []
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
