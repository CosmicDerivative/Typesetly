import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { litRpgDraftFromAttrs } from '../editor/litrpg'
import { decorateFirstSentenceHtml, exportableChapters, headingParts } from '../layout/manuscript'
import type { BookProject, BookTheme, Chapter, ExportResult } from '../types'
import { litRpgFreeformExportMarkup, litRpgIsTranslucent, litRpgUsesBoxedFields } from './litrpgExport'
import { preflightBook } from './preflight'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function slug(value: string) {
  return value.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'book'
}

function dataUrlParts(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const extension = match[1].includes('png')
    ? 'png'
    : match[1].includes('webp')
      ? 'webp'
      : match[1].includes('gif')
        ? 'gif'
        : 'jpg'
  return { mediaType: match[1], base64: match[2], extension }
}

function fontDataParts(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const mediaType = match[1]
  const extension = mediaType.includes('woff2')
    ? 'woff2'
    : mediaType.includes('woff')
      ? 'woff'
      : mediaType.includes('otf')
        ? 'otf'
        : 'ttf'
  return { mediaType, base64: match[2], extension }
}

function chapterBody(
  chapter: Chapter,
  theme: BookTheme,
  imageFiles: Array<{ id: string; href: string; mediaType: string; base64: string }>,
  noteCounter: { value: number },
) {
  const documentValue = new DOMParser().parseFromString(chapter.content, 'text/html')
  const chapterNotes: Array<{ id: string; number: number; text: string }> = []
  const subheadings: Array<{ id: string; text: string; level: number }> = []

  for (const element of Array.from(documentValue.querySelectorAll('img'))) {
    const image = element as HTMLImageElement
    const parsed = dataUrlParts(image.src)
    if (!parsed) continue
    const id = `image-${imageFiles.length + 1}`
    const href = `images/${id}.${parsed.extension}`
    imageFiles.push({ id, href, mediaType: parsed.mediaType, base64: parsed.base64 })
    image.setAttribute('src', `../${href}`)
    const decorative = image.dataset.decorative === 'true'
    image.setAttribute('alt', decorative ? '' : image.getAttribute('alt') || '')
    image.setAttribute('class', `content-image image-${image.dataset.layout || 'inline'}`)
    image.setAttribute('style', `width:${Math.min(100, Math.max(10, Number(image.dataset.width || 100)))}%;object-position:${Number(image.dataset.focalX || 50)}% ${Number(image.dataset.focalY || 50)}%`)
    const caption = image.dataset.caption || ''
    const link = image.dataset.link || ''
    if (caption || link) {
      const imageMarkup = image.outerHTML
      image.outerHTML = `<figure>${link ? `<a href="${escapeXml(link)}">${imageMarkup}</a>` : imageMarkup}${caption ? `<figcaption>${escapeXml(caption)}</figcaption>` : ''}</figure>`
    }
  }

  for (const token of Array.from(documentValue.querySelectorAll(
    '[data-typesetly-node="footnote"]',
  ))) {
    const element = token as HTMLElement
    noteCounter.value += 1
    const number = noteCounter.value
    const id = element.dataset.noteId || `note-${chapter.id}-${number}`
    const text = element.dataset.noteText || element.getAttribute('title') || ''
    chapterNotes.push({ id, number, text })
    const href = theme.notes.epubPlacement === 'chapter-end'
      ? `#${escapeXml(id)}`
      : `notes.xhtml#${escapeXml(id)}`
    element.outerHTML = `<a epub:type="noteref" id="ref-${escapeXml(id)}" href="${href}"><sup>${number}</sup></a>`
  }

  for (const pageBreak of Array.from(documentValue.querySelectorAll(
    '[data-typesetly-node="page-break"]',
  ))) {
    pageBreak.outerHTML = '<div class="page-break"></div>'
  }

  for (const token of Array.from(documentValue.querySelectorAll(
    '[data-typesetly-node="litrpg-block"]',
  ))) {
    const element = token as HTMLElement
    const draft = litRpgDraftFromAttrs({
      ...Object.fromEntries(Array.from(element.attributes).map((attr) => [
        attr.name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        attr.value,
      ])),
      showColumnHeaders: element.getAttribute('data-show-headers') ?? undefined,
    })
    if (litRpgIsTranslucent(draft)) {
      element.setAttribute('data-translucent', 'true')
    }
    if (litRpgUsesBoxedFields(draft)) {
      element.innerHTML = litRpgFreeformExportMarkup(draft, escapeXml)
    }
  }

  for (const sceneBreak of Array.from(documentValue.querySelectorAll(
    'hr, [data-typesetly-node="scene-break"]',
  ))) {
    let ornament = escapeXml(theme.sceneBreak.ornament || '* * *')
    if (theme.sceneBreak.style === 'ornament' && theme.sceneBreak.customImageDataUrl) {
      const image = dataUrlParts(theme.sceneBreak.customImageDataUrl)
      if (image) {
        const id = `image-${imageFiles.length + 1}`
        const href = `images/${id}.${image.extension}`
        imageFiles.push({ id, href, mediaType: image.mediaType, base64: image.base64 })
        ornament = `<img class="scene-image" src="../${href}" alt="" />`
      }
    }
    sceneBreak.outerHTML =
      theme.sceneBreak.style === 'ornament'
        ? `<div class="scene">${ornament}</div>`
        : theme.sceneBreak.style === 'space'
          ? '<div class="scene-space"></div>'
          : '<div class="scene-none"></div>'
  }

  if (chapter.options.includeSubheadingsInToc) {
    for (const [index, heading] of Array.from(documentValue.querySelectorAll('h2,h3,h4,h5,h6')).entries()) {
      const id = `subheading-${chapter.id}-${index + 1}`
      heading.setAttribute('id', id)
      subheadings.push({ id, text: heading.textContent || `Section ${index + 1}`, level: Number(heading.tagName[1]) })
    }
  }

  if (
    chapter.type === 'chapter'
    && !chapter.options.hideFirstSentenceFormatting
    && (theme.paragraph.dropCaps || theme.paragraph.leadInSmallCaps)
  ) {
    const firstParagraph = Array.from(documentValue.body.querySelectorAll('p'))
      .find((paragraph) => /\p{L}/u.test(paragraph.textContent || ''))
    if (firstParagraph) {
      firstParagraph.innerHTML = decorateFirstSentenceHtml(
        firstParagraph.innerHTML,
        theme.paragraph.dropCaps,
        theme.paragraph.leadInSmallCaps,
      )
    }
  }

  let content = documentValue.body.innerHTML
    .replace(/<img([^>]*?)(?<!\/)>/gi, '<img$1 />')
    .replace(/<br([^>]*?)(?<!\/)>/gi, '<br$1 />')

  return { content, chapterNotes, subheadings }
}

function xhtml(title: string, body: string, language: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/stylesheet.css" />
</head>
<body>${body}</body>
</html>`
}

export async function exportProjectToEpub(project: BookProject, theme: BookTheme): Promise<ExportResult> {
  const preflight = preflightBook(project, theme)
  const blocking = preflight.filter((issue) => issue.level === 'error')
  if (blocking.length) throw new Error(`EPUB export is blocked: ${blocking.map((issue) => issue.message).join(' ')}`)
  const validationWarnings = preflight.map((issue) => `Check: ${issue.message}`)
  const zip = new JSZip()
  const xhtmlFiles = new Map<string, string>()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.folder('META-INF')!.file(
    'container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>`,
  )

  const oebps = zip.folder('OEBPS')!
  const textFolder = oebps.folder('text')!
  const imageFiles: Array<{ id: string; href: string; mediaType: string; base64: string }> = []
  const manifest: string[] = [
    '<item id="css" href="styles/stylesheet.css" media-type="text/css" />',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
  ]
  const spine: string[] = []
  const navigation: string[] = []
  const bookEndNotes: Array<{ id: string; number: number; text: string; ref: string }> = []
  const noteCounter = { value: 0 }
  let chapters = exportableChapters(project, 'ebook')
  if (project.epubStartChapterId) {
    const start = chapters.findIndex((chapter) => chapter.id === project.epubStartChapterId)
    if (start > 0) chapters = [...chapters.slice(start), ...chapters.slice(0, start)]
  }
  const chapterLinks = new Map(chapters.map((chapter, index) => [`#chapter-${chapter.id}`, `chapter-${index + 1}.xhtml#chapter-${chapter.id}`]))

  chapters.forEach((chapter, index) => {
    const itemId = `chapter-${index + 1}`
    const href = `text/${itemId}.xhtml`
    const heading = headingParts(project, chapter, theme)
    const parsed = chapterBody(chapter, theme, imageFiles, noteCounter)
    for (const [anchor, destination] of chapterLinks) {
      parsed.content = parsed.content.replaceAll(`href="${anchor}"`, `href="${destination}"`)
    }
    if (chapter.type === 'contents') {
      parsed.content = `<nav epub:type="toc"><ol>${project.chapters
        .filter((candidate) => (candidate.type === 'chapter' || candidate.type === 'part') && !candidate.options.hideInToc)
        .map((candidate) => `<li>${escapeXml(candidate.title)}</li>`)
        .join('')}</ol></nav>`
    }
    const chapterImage = chapter.imageDataUrl || theme.chapterHeading.sharedImageDataUrl
    let imageMarkup = ''
    if (chapterImage && theme.chapterHeading.imageEnabled && !chapter.options.hideChapterImage) {
      const image = dataUrlParts(chapterImage)
      if (image) {
        const imageId = `image-${imageFiles.length + 1}`
        const imageHref = `images/${imageId}.${image.extension}`
        imageFiles.push({ id: imageId, href: imageHref, mediaType: image.mediaType, base64: image.base64 })
        const alt = chapter.imageAlt || ''
        const layout = chapter.imageLayout || 'inline'
        imageMarkup = `<figure class="chapter-image-wrap image-${layout}"><img class="chapter-image" src="../${imageHref}" alt="${escapeXml(alt)}" />${chapter.imageCaption ? `<figcaption>${escapeXml(chapter.imageCaption)}</figcaption>` : ''}</figure>`
      }
    }

    const headingMarkup = chapter.options.hideChapterHeading
      ? ''
      : `<header class="chapter-heading">
          ${imageMarkup}
          ${heading.number ? `<p class="chapter-number">${escapeXml(heading.number)}</p>` : ''}
          ${heading.title ? `<h1>${escapeXml(heading.title)}</h1>` : ''}
          ${heading.subtitle ? `<p class="chapter-subtitle">${escapeXml(heading.subtitle)}</p>` : ''}
        </header>`

    let notesMarkup = ''
    if (theme.notes.epubPlacement === 'chapter-end' && parsed.chapterNotes.length) {
      notesMarkup = `<section class="notes" epub:type="footnotes"><h2>Notes</h2>${parsed.chapterNotes
        .map((note) => `<aside epub:type="footnote" id="${escapeXml(note.id)}"><a href="#ref-${escapeXml(note.id)}">${note.number}.</a> ${escapeXml(note.text)}</aside>`)
        .join('')}</section>`
    } else {
      bookEndNotes.push(
        ...parsed.chapterNotes.map((note) => ({ ...note, ref: itemId })),
      )
    }

    const chapterXhtml = xhtml(
        chapter.title,
        `<section id="chapter-${chapter.id}" class="chapter" epub:type="${chapter.type === 'chapter' ? 'chapter' : chapter.type}">${headingMarkup}${parsed.content}${notesMarkup}</section>`,
        project.details.language || 'en',
      )
    textFolder.file(`${itemId}.xhtml`, chapterXhtml)
    xhtmlFiles.set(`text/${itemId}.xhtml`, chapterXhtml)
    manifest.push(`<item id="${itemId}" href="${href}" media-type="application/xhtml+xml" />`)
    spine.push(`<itemref idref="${itemId}" />`)
    if (!chapter.options.hideInToc) {
      const subnav = parsed.subheadings.length
        ? `<ol>${parsed.subheadings.map((subheading) => `<li><a href="${href}#${subheading.id}">${escapeXml(subheading.text)}</a></li>`).join('')}</ol>`
        : ''
      navigation.push(`<li><a href="${href}">${escapeXml(chapter.title)}</a>${subnav}</li>`)
    }
  })

  if (bookEndNotes.length) {
    const notesXhtml = xhtml(
        'Notes',
        `<section class="notes" epub:type="endnotes"><h1>Notes</h1>${bookEndNotes
          .map((note) => `<aside epub:type="footnote" id="${escapeXml(note.id)}"><a href="${note.ref}.xhtml#ref-${escapeXml(note.id)}">${note.number}.</a> ${escapeXml(note.text)}</aside>`)
          .join('')}</section>`,
        project.details.language || 'en',
      )
    textFolder.file('notes.xhtml', notesXhtml)
    xhtmlFiles.set('text/notes.xhtml', notesXhtml)
    manifest.push('<item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml" />')
    spine.push('<itemref idref="notes" />')
    navigation.push('<li><a href="text/notes.xhtml">Notes</a></li>')
  }

  let coverMetadata = ''
  if (project.details.coverDataUrl) {
    const cover = dataUrlParts(project.details.coverDataUrl)
    if (cover) {
      const href = `images/cover.${cover.extension}`
      imageFiles.push({ id: 'cover-image', href, mediaType: cover.mediaType, base64: cover.base64 })
      coverMetadata = '<meta name="cover" content="cover-image" />'
    }
  }

  for (const image of imageFiles) {
    oebps.file(image.href, image.base64, { base64: true })
    manifest.push(
      `<item id="${image.id}" href="${image.href}" media-type="${image.mediaType}"${image.id === 'cover-image' ? ' properties="cover-image"' : ''} />`,
    )
  }

  let embeddedFontCss = ''
  if (theme.typography.embeddedFontDataUrl && theme.typography.embeddedFontName) {
    const font = fontDataParts(theme.typography.embeddedFontDataUrl)
    if (font) {
      const href = `fonts/book-font.${font.extension}`
      oebps.file(href, font.base64, { base64: true })
      manifest.push(`<item id="book-font" href="${href}" media-type="${font.mediaType}" />`)
      embeddedFontCss = `@font-face { font-family: "${theme.typography.embeddedFontName.replace(/"/g, '')}"; src: url("../${href}"); }\n`
    }
  }

  oebps.folder('styles')!.file(
    'stylesheet.css',
    `${embeddedFontCss}@page { margin: 1em; }
body { margin: 0; font-family: ${theme.typography.bodyFont}, serif; font-size: ${theme.typography.bodySize}pt; line-height: ${theme.typography.lineSpacing}; text-align: ${theme.paragraph.bodyAlign}; }
.chapter-heading { text-align: ${theme.chapterHeading.titleAlign}; break-before: page; margin: 3em 0 2em; }
.chapter-heading h1 { margin: 0; font-family: ${theme.chapterHeading.titleFont}, serif; font-size: ${theme.chapterHeading.titleSize}pt; font-weight: ${theme.chapterHeading.titleWeight}; }
.chapter-number { margin: 0 0 .75em; font-family: ${theme.chapterHeading.numberFont}, serif; font-size: ${theme.chapterHeading.numberSize}pt; }
.chapter-subtitle { font-family: ${theme.chapterHeading.subtitleFont}, serif; font-size: ${theme.chapterHeading.subtitleSize}pt; }
.chapter-image { display: block; max-width: ${theme.chapterHeading.imageSize}%; margin: 0 auto 1em; }
.chapter-image-wrap, figure { margin: 1em auto; text-align: center; }
.image-wide img, img.image-wide { width: 100% !important; max-width: 100%; }
.image-full-page, .image-two-page { break-before: page; break-after: page; margin: 0; }
.image-full-page img, .image-two-page img, img.image-full-page, img.image-two-page { width: 100% !important; max-height: 95vh; object-fit: contain; }
figcaption { margin-top: .4em; font-size: .85em; font-style: italic; }
p { margin: ${theme.paragraph.paragraphStyle === 'indent' ? '0' : '0 0 .8em'}; ${theme.paragraph.paragraphStyle === 'indent' ? 'text-indent: 1.2em;' : ''} }
p:first-of-type { text-indent: 0; }
.dropcap { float: left; font-size: 3.2em; line-height: .78; padding: .08em .08em 0 0; }
.lead-in { font-variant: small-caps; letter-spacing: .04em; }
.scene { text-align: center; margin: 1.5em 0; }
.scene-image { max-width: 35%; max-height: 2.5em; }
.scene-space { height: 1.5em; }
.scene-none { display: none; }
.page-break { break-after: page; }
.callout { border: 1px solid #999; padding: .8em; margin: 1em 0; }
.text-message { width: fit-content; max-width: 78%; margin-left: auto; border: 0; border-radius: 1em 1em .25em 1em; color: #fff; background: #1677d2; }
.text-message[data-direction="incoming"] { margin-right: auto; margin-left: 0; color: #222; background: #e9edf2; }
.text-message[data-theme="android"] { border: 1px solid #c7d7c5; border-radius: .45em; color: #243423; background: #dff0dc; }
.text-message > p { margin: 0; text-indent: 0; }
.litrpg-block { box-sizing: border-box; width: min(var(--litrpg-width, 100%), 100%); margin: 1em 0; border: var(--litrpg-border-width, 1px) solid var(--litrpg-border, #555); border-radius: var(--litrpg-radius, .35em); color: var(--litrpg-text, #111); background-color: var(--litrpg-bg-alpha, var(--litrpg-bg, #f7f7f7)); overflow: hidden; }
.litrpg-block[data-width="compact"]:not([data-width-percent]) { width: 86%; margin-right: auto; margin-left: auto; }
.litrpg-block[data-alignment="center"] { float: none; clear: both; margin-right: auto; margin-left: auto; }
.litrpg-block[data-alignment="left"] { float: left; clear: left; margin: .25em 1em .7em 0; }
.litrpg-block[data-alignment="right"] { float: right; clear: right; margin: .25em 0 .7em 1em; }
.litrpg-block[data-appearance="terminal"] { border-style: dashed; font-family: monospace; }
.litrpg-block[data-appearance="minimal"] { border-width: 0 0 0 var(--litrpg-border-width, .25em); }
.litrpg-block[data-appearance="ornate"] { border-style: double; font-family: serif; }
.litrpg-block[data-appearance="ornate"] .litrpg-block-heading { border-bottom: .2em double var(--litrpg-border, #555); text-align: center; }
.litrpg-block-heading { padding: .7em .85em; border-bottom: 1px solid var(--litrpg-border, #777); }
.litrpg-block-title { display: block; color: var(--litrpg-accent, #333); letter-spacing: .04em; text-transform: uppercase; }
.litrpg-block-subtitle { display: block; margin-top: .2em; font-size: .8em; opacity: .78; }
.litrpg-block-table { width: 100%; border-collapse: collapse; color: inherit; font: inherit; }
.litrpg-block-table th, .litrpg-block-table td { padding: var(--litrpg-cell-padding, .5em); border-right: 1px solid var(--litrpg-border, #999); border-bottom: 1px solid var(--litrpg-border, #999); text-align: left; vertical-align: top; }
.litrpg-block[data-show-cell-borders="false"] .litrpg-block-table th,
.litrpg-block[data-show-cell-borders="false"] .litrpg-block-table td { border-right: 0; border-bottom: 0; }
.litrpg-block[data-density="compact"] th, .litrpg-block[data-density="compact"] td { padding: max(.2em, calc(var(--litrpg-cell-padding, .5em) * .7)); }
.litrpg-block-table th { color: var(--litrpg-accent, #333); font-size: .8em; text-transform: uppercase; }
.litrpg-block-footer { padding: .55em .8em; font-size: .8em; font-style: italic; opacity: .8; }
.litrpg-freeform-canvas { position: relative; min-height: 10em; overflow: hidden; background-image: linear-gradient(color-mix(in srgb, var(--litrpg-border, #777) 18%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--litrpg-border, #777) 18%, transparent) 1px, transparent 1px); background-size: 16px 16px; }
.litrpg-freeform-item { position: absolute; box-sizing: border-box; padding: var(--litrpg-cell-padding, .5em); border: 1px solid var(--litrpg-border, #777); background: color-mix(in srgb, var(--litrpg-bg, #f7f7f7) 82%, #000); overflow: hidden; overflow-wrap: anywhere; }
.litrpg-block[data-show-cell-borders="false"] .litrpg-freeform-item { border-color: transparent; }
.litrpg-freeform-item.is-title, .litrpg-freeform-item.is-column { color: var(--litrpg-accent, #333); font-weight: bold; }
.litrpg-freeform-item.is-title { text-transform: uppercase; }
.litrpg-freeform-item.is-column { font-size: .8em; text-transform: uppercase; }
.litrpg-freeform-item.is-subtitle, .litrpg-freeform-item.is-footer { font-size: .8em; font-style: italic; opacity: .8; }
.litrpg-block[data-translucent="true"] { color: #334155; background: transparent; background-color: transparent; box-shadow: none; border-color: #64748b; font-family: ${theme.typography.bodyFont}, serif; }
.litrpg-block[data-translucent="true"] .litrpg-block-heading { padding: .65em .8em .25em; border-bottom: 0; background: transparent; }
.litrpg-block[data-translucent="true"] .litrpg-block-title { color: #1f2937; letter-spacing: 0; text-transform: none; }
.litrpg-block[data-translucent="true"] .litrpg-block-subtitle { color: #64748b; }
.litrpg-block[data-translucent="true"] .litrpg-block-table th,
.litrpg-block[data-translucent="true"] .litrpg-block-table td { border-color: color-mix(in srgb, #64748b 45%, transparent); background: transparent; }
.litrpg-block[data-translucent="true"] .litrpg-block-table th { color: #1f2937; text-transform: none; letter-spacing: 0; }
.litrpg-block[data-translucent="true"] .litrpg-block-footer { padding: .35em .8em .7em; color: #64748b; }
.litrpg-block[data-translucent="true"] .litrpg-freeform-canvas { position: relative; background-image: none; }
.litrpg-block[data-translucent="true"] .litrpg-freeform-item { position: absolute; border: 0; background: transparent; color: #334155; }
.litrpg-block[data-translucent="true"] .litrpg-freeform-item.is-title,
.litrpg-block[data-translucent="true"] .litrpg-freeform-item.is-column { color: #1f2937; text-transform: none; letter-spacing: 0; }
.litrpg-block[data-translucent="true"] .litrpg-freeform-item.is-subtitle,
.litrpg-block[data-translucent="true"] .litrpg-freeform-item.is-footer { color: #64748b; opacity: 1; }
.verse { margin: 1em ${theme.specialBlocks.verseIndentEm}em; line-height: ${theme.specialBlocks.verseLineSpacing}; white-space: pre-wrap; }
.hangingIndent { padding-left: ${theme.specialBlocks.hangingIndentEm}em; text-indent: -${theme.specialBlocks.hangingIndentEm}em; }
.attributedQuote { margin: 1em ${theme.specialBlocks.quoteIndentEm}em; padding-left: 1em; border-left: ${theme.specialBlocks.quoteBorderWidth}px solid #999; font-style: ${theme.specialBlocks.quoteItalic ? 'italic' : 'normal'}; }
.attributedQuote[data-attribution]:after { display: block; margin-top: .5em; content: "— " attr(data-attribution); text-align: right; }
.notes { margin-top: 2em; font-size: ${theme.notes.fontSize}pt; }
.notes aside { margin: 0 0 .7em; }
img { max-width: 100%; height: auto; }
h2,h3,h4,h5,h6 { font-family: ${theme.subheading.font}, serif; text-align: ${theme.subheading.align}; break-after: ${theme.print.keepSubheadings ? 'avoid' : 'auto'}; }`,
  )

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navigation.join('')}</ol></nav></body>
</html>`
  oebps.file('nav.xhtml', navXhtml)
  xhtmlFiles.set('nav.xhtml', navXhtml)
  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${escapeXml(project.details.language || 'en')}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="uid">urn:uuid:${project.id}</dc:identifier>
  <dc:title>${escapeXml(project.details.title)}</dc:title>
  <dc:creator>${escapeXml(project.details.author || 'Unknown')}</dc:creator>
  <dc:language>${escapeXml(project.details.language || 'en')}</dc:language>
  <meta property="schema:accessMode">textual</meta>
  <meta property="schema:accessModeSufficient">textual,visual</meta>
  <meta property="schema:accessibilityFeature">tableOfContents</meta>
  ${project.details.publisher ? `<dc:publisher>${escapeXml(project.details.publisher)}</dc:publisher>` : ''}
  ${project.details.isbn ? `<dc:identifier>${escapeXml(project.details.isbn)}</dc:identifier>` : ''}
  ${project.details.universalBookLink ? `<dc:relation>${escapeXml(project.details.universalBookLink)}</dc:relation>` : ''}
  ${project.details.seriesName ? `<meta property="belongs-to-collection" id="series">${escapeXml(project.details.seriesName)}</meta>
  <meta refines="#series" property="collection-type">series</meta>
  ${project.details.seriesNumber != null ? `<meta refines="#series" property="group-position">${project.details.seriesNumber}</meta>` : ''}` : ''}
  <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  ${coverMetadata}
</metadata>
<manifest>${manifest.join('')}</manifest>
<spine>${spine.join('')}</spine>
</package>`,
  )

  const manifestIds = manifest.map((item) => /\bid="([^"]+)"/.exec(item)?.[1]).filter(Boolean)
  if (new Set(manifestIds).size !== manifestIds.length) validationWarnings.push('Error: duplicate EPUB manifest identifiers were detected.')
  for (const [path, source] of xhtmlFiles) {
    const parsed = new DOMParser().parseFromString(source, 'application/xhtml+xml')
    if (parsed.querySelector('parsererror')) validationWarnings.push(`Error: ${path} is not valid XHTML.`)
    const ids = Array.from(parsed.querySelectorAll('[id]')).map((element) => element.id)
    if (new Set(ids).size !== ids.length) validationWarnings.push(`Error: ${path} contains duplicate element identifiers.`)
    for (const image of Array.from(parsed.querySelectorAll('img'))) {
      if (!image.hasAttribute('alt')) validationWarnings.push(`Error: ${path} contains an image without an alt attribute.`)
    }
  }
  if (validationWarnings.some((warning) => warning.startsWith('Error:'))) {
    throw new Error(`EPUB validation failed: ${validationWarnings.filter((warning) => warning.startsWith('Error:')).join(' ')}`)
  }
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
  const fileName = `${slug(project.details.title)}.epub`
  saveAs(blob, fileName)
  return {
    ok: true,
    fileName,
    warnings: [
      ...validationWarnings,
      `Internal validation passed for ${xhtmlFiles.size} XHTML files, ${chapters.length} spine item(s), and ${imageFiles.length} image(s). Run the final file through official EPUBCheck before publishing.`,
    ],
  }
}
