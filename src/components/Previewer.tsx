import { ChevronLeft, ChevronRight, FileDown, Info, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../BookContext'
import type { PreviewDevice } from '../types'
import './Previewer.css'
import { decorateFirstSentenceHtml, headingParts, parseManuscript, type ManuscriptBlock } from '../layout/manuscript'
import { layoutShowsPageNumber, runningHeaderAlignment, runningHeaderText } from '../layout/runningHeaders'
import { preflightBook } from '../export/preflight'
import { DEVICE_PROFILES, profileDescription, renderedDeviceWidth } from '../preview/devices'
import { estimateBookPages, readingTimeMinutes } from '../layout/pagination'
import { DrawerControls } from './DrawerControls'
import { useResolvedImageSrc } from '../library/useResolvedImageSrc'
import { colorWithOpacity, litRpgElementKey } from '../editor/litrpg'
import { litRpgIsTranslucent } from '../export/litrpgExport'
import { chapterDecorations } from '../themes/chapterDecorations'
import { ChapterDecorations } from './ChapterDecorations'
import './ChapterDecorations.css'

export function Previewer() {
  const {
    rightPanel,
    setRightPanel,
    setMode,
    previewDevice,
    setPreviewDevice,
    activeChapter,
    bodyChapters,
    setActiveChapter,
    project,
    activeTheme,
    mode,
  } = useApp()
  const [exporting, setExporting] = useState<'epub' | 'pdf' | null>(null)
  const [exportMessage, setExportMessage] = useState('')
  const [landscape, setLandscape] = useState(false)
  const [screenPage, setScreenPage] = useState(1)
  const [screenPages, setScreenPages] = useState(1)
  const [readerFontScale, setReaderFontScale] = useState(1)
  const [readerAppearance, setReaderAppearance] = useState<'light' | 'sepia' | 'dark'>('light')
  const [readerFontMode, setReaderFontMode] = useState<'device' | 'book'>('device')
  const [screenWidth, setScreenWidth] = useState(1)
  const screenRef = useRef<HTMLDivElement>(null)
  const pageFlowRef = useRef<HTMLDivElement>(null)
  const swipeStartXRef = useRef<number | null>(null)
  const preflight = useMemo(() => project ? preflightBook(project, activeTheme) : [], [activeTheme, project])
  const previewOrnamentSrc = useResolvedImageSrc(
    activeChapter?.imageDataUrl || activeTheme.chapterHeading.sharedImageDataUrl,
  )
  const sceneBreakImageSrc = useResolvedImageSrc(activeTheme.sceneBreak.customImageDataUrl)

  useEffect(() => {
    const name = activeTheme.typography.embeddedFontName
    const source = activeTheme.typography.embeddedFontDataUrl
    if (!name || !source) return
    void new FontFace(name, `url(${source})`).load().then((font) => document.fonts.add(font))
  }, [activeTheme.typography.embeddedFontDataUrl, activeTheme.typography.embeddedFontName])

  const previewContent = useMemo(() => {
    if (!activeChapter || !project) return { blocks: [] as ManuscriptBlock[], notes: [] }
    if (activeChapter.type === 'title-page') {
      return { notes: [], blocks: [] as ManuscriptBlock[] }
    }
    if (activeChapter.type === 'contents') {
      return {
        notes: [],
        blocks: project.chapters
          .filter((chapter) => (chapter.type === 'chapter' || chapter.type === 'part') && !chapter.options.hideInToc)
          .map((chapter) => ({ type: 'paragraph' as const, text: chapter.title, html: chapter.title })),
      }
    }
    return parseManuscript(activeChapter.content)
  }, [activeChapter, project])

  const profile = DEVICE_PROFILES[previewDevice]
  const portraitWidth = previewDevice === 'Print' ? activeTheme.print.trimWidthIn * 72 : profile.logicalWidth
  const portraitHeight = previewDevice === 'Print' ? activeTheme.print.trimHeightIn * 72 : profile.logicalHeight
  const profileWidth = landscape ? portraitHeight : portraitWidth
  const profileHeight = landscape ? portraitWidth : portraitHeight
  const renderedWidth = renderedDeviceWidth(profile, activeTheme.print.trimWidthIn, landscape)
  const readerFont =
    previewDevice === 'Print' || readerFontMode === 'book'
      ? activeTheme.typography.bodyFont
      : profile.readerFont
  const bookPages = useMemo(
    () => project ? estimateBookPages(project, activeTheme, profile) : 1,
    [activeTheme, profile, project],
  )

  useEffect(() => {
    const screen = screenRef.current
    const pageFlow = pageFlowRef.current
    if (!screen || !pageFlow) return
    setScreenPage(1)
    const measure = () => {
      // CSS columns fragment the manuscript into fixed reader screens. Their
      // measured horizontal flow responds to the device, orientation, and font.
      const width = Math.max(1, screen.clientWidth)
      const pages = Math.max(1, Math.ceil((pageFlow.scrollWidth - 1) / width))
      setScreenWidth(width)
      setScreenPages(pages)
      setScreenPage((current) => Math.min(current, pages))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(screen)
    observer.observe(pageFlow)
    let settleFrame = 0
    const frame = window.requestAnimationFrame(() => {
      measure()
      settleFrame = window.requestAnimationFrame(measure)
    })
    const settleTimer = window.setTimeout(measure, 160)
    void document.fonts.ready.then(() => window.requestAnimationFrame(measure))
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(settleFrame)
      window.clearTimeout(settleTimer)
    }
  }, [
    activeChapter?.id,
    activeChapter?.content,
    landscape,
    mode,
    previewDevice,
    rightPanel,
    activeTheme,
    readerFontMode,
    readerFontScale,
  ])

  if ((mode !== 'publish' && rightPanel !== 'preview') || !project) return null

  const chapterIndex = bodyChapters.findIndex((c) => c.id === activeChapter?.id)
  const canPrev = chapterIndex > 0
  const canNext = chapterIndex >= 0 && chapterIndex < bodyChapters.length - 1
  const theme = activeTheme
  const decorations = chapterDecorations(theme.chapterHeading)
  const hasHeadingOverlay = decorations.some((item) => item.placement === 'header-overlay')
  const deviceClass = `device ${profile.family} ${profile.color ? 'color-screen' : 'eink-screen'}`
  const goToScreen = (page: number) => {
    setScreenPage(Math.max(1, Math.min(screenPages, page)))
  }

  let firstPara = true
  const heading = activeChapter ? headingParts(project, activeChapter, theme) : null

  return (
    <aside className={`previewer ${mode === 'publish' ? 'publish-preview' : 'preview-drawer'}`}>
      <div className="previewer-header">
        <div className="previewer-title">
          <div>
            <small>Proofing desk</small>
            <span>Reader preview</span>
          </div>
          <Info size={14} className="info-icon" />
        </div>
        <DrawerControls
          panel="preview"
          onClose={mode === 'publish' ? () => {
            setMode('draft')
            setRightPanel('none')
          } : undefined}
        />
      </div>

      <div className="preview-controls">
        <select
          aria-label="Preview device"
          value={previewDevice}
          onChange={(e) => setPreviewDevice(e.target.value as PreviewDevice)}
        >
          <option>iPad</option>
          <option>iPhone</option>
          <option>Galaxy</option>
          <option>Paperwhite</option>
          <option>Oasis</option>
          <option>Kindle</option>
          <option>Fire</option>
          <option>Glowlight 3</option>
          <option>Forma</option>
          <option>Print</option>
        </select>
        <div className="theme-chip">{theme.name}</div>
        <div className="device-facts">
          <strong>{profile.label}</strong>
          <span>{previewDevice === 'Print'
            ? `${theme.print.trimWidthIn} × ${theme.print.trimHeightIn}" trim`
            : profileDescription(profile)}</span>
        </div>
        <button
          type="button"
          className="rotate-device"
          onClick={() => setLandscape((value) => !value)}
          disabled={previewDevice === 'Print'}
          title="Rotate preview"
        >
          <RotateCw size={13} /> {landscape ? 'Portrait' : 'Landscape'}
        </button>
        {previewDevice !== 'Print' && (
          <div className="reader-controls" aria-label="Reader preferences">
            <button type="button" onClick={() => setReaderFontScale((value) => Math.max(.8, Number((value - .1).toFixed(1))))}>A−</button>
            <span>{Math.round(readerFontScale * 100)}%</span>
            <button type="button" onClick={() => setReaderFontScale((value) => Math.min(1.5, Number((value + .1).toFixed(1))))}>A+</button>
            <select
              aria-label="Reader color mode"
              value={readerAppearance}
              onChange={(event) => setReaderAppearance(event.target.value as typeof readerAppearance)}
            >
              <option value="light">Light</option>
              <option value="sepia">Sepia</option>
              <option value="dark">Dark</option>
            </select>
            <select
              className="reader-font-select"
              aria-label="Reader font"
              value={readerFontMode}
              onChange={(event) => setReaderFontMode(event.target.value as typeof readerFontMode)}
            >
              <option value="device">Device native font</option>
              <option value="book">Book design font</option>
            </select>
          </div>
        )}
      </div>

      <div className="preview-stage">
        <div
          className={deviceClass}
          style={{
            '--device-width': `${renderedWidth}px`,
            '--device-ratio': `${profileWidth} / ${profileHeight}`,
            '--device-bezel': `${profile.bezel}px`,
            '--device-radius': `${profile.cornerRadius}px`,
          } as CSSProperties}
        >
          <div
            ref={screenRef}
            className={`device-screen reader-${readerAppearance} ${activeChapter?.options.invertTextColor ? 'light-text' : ''}`}
            role="group"
            tabIndex={0}
            aria-label={`Reader screen ${screenPage} of ${screenPages}`}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
                event.preventDefault()
                goToScreen(screenPage - 1)
              }
              if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
                event.preventDefault()
                goToScreen(screenPage + 1)
              }
            }}
            onPointerDown={(event) => {
              swipeStartXRef.current = event.clientX
            }}
            onPointerUp={(event) => {
              const startX = swipeStartXRef.current
              swipeStartXRef.current = null
              if (startX == null) return
              const distance = event.clientX - startX
              if (Math.abs(distance) < 36) return
              goToScreen(screenPage + (distance < 0 ? 1 : -1))
            }}
            onPointerCancel={() => {
              swipeStartXRef.current = null
            }}
            style={{
              fontFamily: readerFont,
              fontSize: previewDevice === 'Print'
                ? `${theme.print.largePrint ? Math.max(14, theme.typography.bodySize) : theme.typography.bodySize}pt`
                : `${16 * readerFontScale}px`,
              lineHeight: theme.typography.lineSpacing,
              textAlign: theme.paragraph.bodyAlign,
              '--verse-indent': `${theme.specialBlocks.verseIndentEm}em`,
              '--verse-spacing': theme.specialBlocks.verseLineSpacing,
              '--hanging-indent': `${theme.specialBlocks.hangingIndentEm}em`,
              '--quote-indent': `${theme.specialBlocks.quoteIndentEm}em`,
              '--quote-border': `${theme.specialBlocks.quoteBorderWidth}px`,
              '--quote-style': theme.specialBlocks.quoteItalic ? 'italic' : 'normal',
              ...(previewDevice === 'Print'
                ? {
                    aspectRatio: `${theme.print.trimWidthIn} / ${theme.print.trimHeightIn}`,
                  }
                : {}),
            } as CSSProperties}
          >
            <div
              ref={pageFlowRef}
              className="preview-page-flow"
              style={{
                transform: `translate3d(-${(screenPage - 1) * screenWidth}px, 0, 0)`,
                ...(previewDevice === 'Print'
                  ? {
                      padding: `${theme.print.marginTop * 18}px ${theme.print.marginOutside * 18}px ${theme.print.marginBottom * 18}px ${theme.print.marginInside * 18}px`,
                      '--page-column-gap': `${(theme.print.marginOutside + theme.print.marginInside) * 18}px`,
                    }
                  : {}),
              } as CSSProperties}
            >
            {previewDevice === 'Print' &&
              activeChapter &&
              screenPage > 1 &&
              !activeChapter.options.hideHeaderFooter &&
              theme.headerFooter.layout !== 'none' && (
                <>
                  {runningHeaderText(
                    theme.headerFooter.layout,
                    {
                      title: project.details.title,
                      author: project.details.author,
                      chapter: activeChapter.title,
                    },
                    screenPage,
                  ) && (
                    <div
                      className={`preview-print-header ${runningHeaderAlignment(screenPage)}`}
                      style={{ fontFamily: theme.headerFooter.font, fontSize: theme.headerFooter.size }}
                    >
                      {runningHeaderText(
                        theme.headerFooter.layout,
                        {
                          title: project.details.title,
                          author: project.details.author,
                          chapter: activeChapter.title,
                        },
                        screenPage,
                      )}
                    </div>
                  )}
                  {layoutShowsPageNumber(theme.headerFooter.layout) &&
                    !activeChapter.options.hidePageNumber && (
                    <div className="preview-print-footer" style={{ fontFamily: theme.headerFooter.font, fontSize: theme.headerFooter.size }}>
                      {screenPage}
                    </div>
                  )}
                </>
              )}
            {activeChapter?.type === 'title-page' ? (
              <div className="preview-title-page">
                <h1>{project.details.title || 'Untitled Book'}</h1>
                {project.details.subtitle && <p>{project.details.subtitle}</p>}
                {project.details.seriesName && (
                  <span className="preview-series">
                    {project.details.seriesName}
                    {project.details.seriesNumber != null ? ` · Book ${project.details.seriesNumber}` : ''}
                  </span>
                )}
                <strong>{project.details.author || 'Author'}</strong>
              </div>
            ) : activeChapter && (
              <>
              {activeChapter.type === 'chapter' && (
                <ChapterDecorations decorations={decorations} placement="above-heading" />
              )}
              <div className={`preview-heading-composition${hasHeadingOverlay && activeChapter.type === 'chapter' ? ' has-overlay' : ''}`}>
                {activeChapter.type === 'chapter' && (
                  <ChapterDecorations decorations={decorations} placement="header-overlay" />
                )}
                <div className="preview-heading-content">
                {activeChapter.type === 'chapter' &&
                  theme.chapterHeading.imageEnabled &&
                  !activeChapter.options.hideChapterImage &&
                  (activeChapter.imageDataUrl || theme.chapterHeading.sharedImageDataUrl) && (
                    <figure
                      className={`preview-ornament image-${activeChapter.imageLayout || 'inline'} align-${theme.chapterHeading.imageAlign}`}
                      style={{ '--chapter-image-width': `${theme.chapterHeading.imageSize}%` } as CSSProperties}
                    >
                      {previewOrnamentSrc && <img src={previewOrnamentSrc} alt={activeChapter.imageAlt || ''} />}
                      {activeChapter.imageCaption && <figcaption>{activeChapter.imageCaption}</figcaption>}
                    </figure>
                  )}
                {!activeChapter.options.hideChapterHeading && heading?.number && (
                  <p
                    className="preview-number"
                    style={{
                      textAlign: theme.chapterHeading.titleAlign,
                      fontFamily: readerFontMode === 'book' || previewDevice === 'Print'
                        ? theme.chapterHeading.numberFont
                        : profile.readerFont,
                      fontSize: `${theme.chapterHeading.numberSize * (previewDevice === 'Print' ? 1 : readerFontScale)}pt`,
                    }}
                  >
                    Chapter {heading.number}
                  </p>
                )}
                {!activeChapter.options.hideChapterHeading && heading?.title && <h2
                  className="preview-title"
                  style={{
                    textAlign: theme.chapterHeading.titleAlign,
                    fontFamily: readerFontMode === 'book' || previewDevice === 'Print'
                      ? theme.chapterHeading.titleFont
                      : profile.readerFont,
                    fontSize: `${(activeChapter.options.useSmallerChapterTitle ? theme.chapterHeading.titleSize * .75 : theme.chapterHeading.titleSize) * (previewDevice === 'Print' ? 1 : readerFontScale)}pt`,
                    fontWeight: theme.chapterHeading.titleWeight,
                  }}
                >
                  {heading.title}
                </h2>}
                {!activeChapter.options.hideChapterHeading && heading?.subtitle ? (
                  <p
                    className="preview-subtitle"
                    style={{
                      textAlign: theme.chapterHeading.titleAlign,
                      fontFamily: readerFontMode === 'book' || previewDevice === 'Print'
                        ? theme.chapterHeading.subtitleFont
                        : profile.readerFont,
                      fontSize: `${theme.chapterHeading.subtitleSize * (previewDevice === 'Print' ? 1 : readerFontScale)}pt`,
                    }}
                  >{heading.subtitle}</p>
                ) : null}
                </div>
              </div>
              {activeChapter.type === 'chapter' && (
                <ChapterDecorations decorations={decorations} placement="below-heading" />
              )}
              {activeChapter.type === 'chapter' && (
                <ChapterDecorations decorations={decorations} placement="before-opening" />
              )}
              </>
            )}

            <div className="preview-body">
              {previewContent.blocks.length === 0 ? (
                <p className="preview-para muted">Nothing to preview yet.</p>
              ) : (
                previewContent.blocks.map((b, i) => {
                  if (b.type === 'scene-break') {
                    firstPara = true
                    if (theme.sceneBreak.style === 'none') return <div key={i} className="scene-none" />
                    if (theme.sceneBreak.style === 'space') return <div key={i} className="scene-space" />
                    if (theme.sceneBreak.customImageDataUrl) {
                      return sceneBreakImageSrc
                        ? <img key={i} className="scene-image" src={sceneBreakImageSrc} alt="" />
                        : null
                    }
                    return (
                      <p key={i} className="scene-ornament" style={{ fontSize: theme.sceneBreak.size }}>
                        {theme.sceneBreak.ornament || '* * *'}
                      </p>
                    )
                  }
                  if (b.type === 'page-break') {
                    firstPara = true
                    return <div key={i} className="preview-page-break"><span>Page break</span></div>
                  }
                  if (b.type === 'image') {
                    const image = (
                      <img
                        className="preview-image"
                        src={b.src}
                        alt={b.decorative ? '' : b.alt}
                        style={{
                          width: `${Math.min(100, Math.max(20, b.width))}%`,
                          objectPosition: `${b.focalX}% ${b.focalY}%`,
                        }}
                      />
                    )
                    return (
                      <figure key={i} className={`preview-figure ${b.layout}`}>
                        {b.link ? <a href={b.link} onClick={(event) => event.preventDefault()}>{image}</a> : image}
                        {b.caption && <figcaption>{b.caption}</figcaption>}
                      </figure>
                    )
                  }
                  if (b.type === 'callout') {
                    return (
                      <div key={i} className={`preview-callout ${b.variant === 'message' ? `text-message ${b.direction} ${b.theme}` : ''}`}>
                        {b.sender && <span className="preview-sender">{b.sender}</span>}
                        {b.text}
                      </div>
                    )
                  }
                  if (b.type === 'litrpg-block') {
                    const block = b.draft
                    const translucent = litRpgIsTranslucent(block)
                    return (
                      <div
                        key={i}
                        className="preview-litrpg"
                        data-appearance={block.appearance}
                        data-density={block.density}
                          data-width={block.width}
                          data-width-percent={String(block.widthPercent)}
                          data-alignment={block.alignment}
                          data-layout-mode={block.layoutMode}
                        data-striped-rows={String(block.stripedRows)}
                        data-show-cell-borders={String(block.showCellBorders)}
                        data-translucent={translucent ? 'true' : 'false'}
                        style={{
                          '--litrpg-accent': block.accent,
                            '--litrpg-bg': block.background,
                            '--litrpg-bg-alpha': colorWithOpacity(block.background, block.backgroundOpacity),
                          '--litrpg-text': block.textColor,
                            '--litrpg-border': block.border,
                            '--litrpg-width': `${block.widthPercent}%`,
                            '--litrpg-radius': `${block.borderRadius}px`,
                            '--litrpg-border-width': `${block.borderWidth}px`,
                            '--litrpg-cell-padding': `${block.cellPadding}px`,
                        } as CSSProperties}
                      >
                          {block.layoutMode === 'freeform' ? (
                            <div className="litrpg-freeform-canvas" style={{ position: 'relative', height: `${block.canvasHeight}px` }}>
                              {[
                                { key: litRpgElementKey.title, value: block.title, className: 'is-title' },
                                { key: litRpgElementKey.subtitle, value: block.subtitle, className: 'is-subtitle' },
                                ...block.columns.flatMap((column, columnIndex) => [
                                  ...(block.showColumnHeaders ? [{ key: litRpgElementKey.column(columnIndex), value: column, className: 'is-column' }] : []),
                                  ...block.rows.map((row, rowIndex) => ({ key: litRpgElementKey.cell(rowIndex, columnIndex), value: row.cells[columnIndex] || '', className: 'is-cell' })),
                                ]),
                                { key: litRpgElementKey.footer, value: block.footer, className: 'is-footer' },
                              ].filter((entry) => entry.value).map((entry) => {
                                const layout = block.elementLayouts[entry.key]
                                if (!layout) return null
                                return (
                                  <div
                                    key={entry.key}
                                    className={`litrpg-freeform-item ${entry.className}`}
                                    style={{
                                      position: 'absolute',
                                      left: `${layout.x}%`,
                                      top: `${layout.y}px`,
                                      width: `${layout.width}%`,
                                      height: `${layout.height}px`,
                                    }}
                                  >
                                    {entry.value}
                                  </div>
                                )
                              })}
                            </div>
                          ) : <>
                          <div className="preview-litrpg-heading">
                          <strong>{block.title}</strong>
                          {block.subtitle && <span>{block.subtitle}</span>}
                        </div>
                          <table>
                            <colgroup>{block.columns.map((_, columnIndex) => <col key={columnIndex} style={{ width: `${block.columnWidths[columnIndex]}%` }} />)}</colgroup>
                          {block.showColumnHeaders && (
                            <thead><tr>{block.columns.map((column, columnIndex) => <th key={columnIndex}>{column}</th>)}</tr></thead>
                          )}
                          <tbody>
                            {block.rows.map((row, rowIndex) => (
                              <tr key={rowIndex}>{block.columns.map((_, columnIndex) => <td key={columnIndex}>{row.cells[columnIndex] || ''}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                          {block.footer && <div className="preview-litrpg-footer">{block.footer}</div>}
                          </>}
                      </div>
                    )
                  }
                  if (b.type === 'styled-block') {
                    return (
                      <div key={i} className={`preview-styled ${b.variant}`}>
                        {b.text}
                        {b.attribution && <cite>— {b.attribution}</cite>}
                      </div>
                    )
                  }
                  if (b.type === 'heading') {
                    return (
                      <h3
                        key={i}
                        style={{
                          fontSize: previewDevice === 'Print'
                            ? `${(theme.subheading[`h${Math.min(Math.max(b.level || 2, 2), 6)}` as 'h2Size'] || 1.15) * theme.typography.bodySize}pt`
                            : `${(theme.subheading[`h${Math.min(Math.max(b.level || 2, 2), 6)}` as 'h2Size'] || 1.15) * 16 * readerFontScale}px`,
                          textAlign: theme.subheading.align,
                          fontFamily: readerFontMode === 'book' || previewDevice === 'Print'
                            ? theme.subheading.font
                            : profile.readerFont,
                        }}
                      >
                        {b.text}
                      </h3>
                    )
                  }
                  if (b.type === 'list-item') {
                    return <p key={i} className="preview-list-item">{b.ordered ? `${b.ordinal}.` : '•'} {b.text}</p>
                  }
                  const useDrop =
                    firstPara &&
                    activeChapter?.type === 'chapter' &&
                    theme.paragraph.dropCaps &&
                    !activeChapter.options.hideFirstSentenceFormatting
                  const useLeadIn =
                    firstPara &&
                    activeChapter?.type === 'chapter' &&
                    theme.paragraph.leadInSmallCaps &&
                    !activeChapter.options.hideFirstSentenceFormatting
                  firstPara = false
                  if ((useDrop || useLeadIn) && b.text) return (
                    <p
                      key={i}
                      className={`preview-para first-formatted ${theme.paragraph.paragraphStyle}`}
                      dangerouslySetInnerHTML={{ __html: decorateFirstSentenceHtml(b.html, useDrop, useLeadIn) }}
                    />
                  )
                  return (
                    <p
                      key={i}
                      className={`preview-para ${theme.paragraph.paragraphStyle}`}
                      dangerouslySetInnerHTML={{ __html: b.html }}
                    />
                  )
                })
              )}
              {previewContent.notes.length > 0 && theme.notes.epubPlacement === 'chapter-end' && (
                <section className="preview-notes">
                  <h4>Notes</h4>
                  {previewContent.notes.map((note) => (
                    <p key={note.id}><sup>{note.number}</sup> {note.text}</p>
                  ))}
                </section>
              )}
              {activeChapter?.type === 'chapter' && (
                <ChapterDecorations decorations={decorations} placement="chapter-footer" />
              )}
            </div>
            </div>
            <button
              type="button"
              className="device-page-zone previous"
              aria-label="Turn to previous preview screen"
              disabled={screenPage <= 1}
              onClick={() => goToScreen(screenPage - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="device-page-zone next"
              aria-label="Turn to next preview screen"
              disabled={screenPage >= screenPages}
              onClick={() => goToScreen(screenPage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {mode === 'publish' && (
        <div className="export-row">
          {preflight.length > 0 && (
            <details className="export-preflight">
              <summary>{preflight.filter((issue) => issue.level === 'error').length ? 'Export needs attention' : `${preflight.length} preflight suggestion(s)`}</summary>
              {preflight.map((issue, index) => (
                <button type="button" key={`${issue.message}-${index}`} className={issue.level} onClick={() => issue.chapterId && setActiveChapter(issue.chapterId)}>
                  {issue.level === 'error' ? 'Error' : 'Check'} · {issue.message}
                </button>
              ))}
            </details>
          )}
          <button
            type="button"
            disabled={Boolean(exporting)}
            onClick={async () => {
              setExporting('epub')
              setExportMessage('')
              try {
                const { exportProjectToEpub } = await import('../export/epub')
                const { prepareForExport } = await import('../export/prepare')
                const result = await exportProjectToEpub(await prepareForExport(project), await prepareForExport(theme))
                setExportMessage(result.warnings?.join(' ') || 'EPUB exported.')
              } catch (error) {
                setExportMessage(error instanceof Error ? error.message : 'EPUB export failed.')
              } finally {
                setExporting(null)
              }
            }}
          >
            <FileDown size={14} /> {exporting === 'epub' ? 'Exporting…' : 'EPUB'}
          </button>
          <button
            type="button"
            disabled={Boolean(exporting)}
            onClick={async () => {
              setExporting('pdf')
              setExportMessage('')
              try {
                const { exportProjectToPdf } = await import('../export/pdf')
                const { prepareForExport } = await import('../export/prepare')
                const result = await exportProjectToPdf(await prepareForExport(project), await prepareForExport(theme))
                setExportMessage(result.warnings?.join(' ') || 'PDF exported.')
              } catch (error) {
                setExportMessage(error instanceof Error ? error.message : 'PDF export failed.')
              } finally {
                setExporting(null)
              }
            }}
          >
            <FileDown size={14} /> {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
          {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
        </div>
      )}

      <div className="preview-page-nav">
        <button
          type="button"
          aria-label="Previous preview screen"
          disabled={screenPage <= 1}
          onClick={() => goToScreen(screenPage - 1)}
        >
          <ChevronLeft size={13} />
        </button>
        <div>
          <strong>Screen {screenPage} of {screenPages}</strong>
          <span>
            {previewDevice === 'Print' ? `About ${bookPages} book pages` : `${activeChapter ? readingTimeMinutes(activeChapter) : 1} min chapter read`}
          </span>
        </div>
        <button
          type="button"
          aria-label="Next preview screen"
          disabled={screenPage >= screenPages}
          onClick={() => goToScreen(screenPage + 1)}
        >
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="preview-nav">
        <button
          type="button"
          className="chapter-nav"
          disabled={!canPrev}
          onClick={() => canPrev && setActiveChapter(bodyChapters[chapterIndex - 1].id)}
        >
          <ChevronLeft size={14} /> Chapter
        </button>
        <button
          type="button"
          className="chapter-nav"
          disabled={!canNext}
          onClick={() => canNext && setActiveChapter(bodyChapters[chapterIndex + 1].id)}
        >
          Chapter <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  )
}
