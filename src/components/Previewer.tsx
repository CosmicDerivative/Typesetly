import { ChevronLeft, ChevronRight, FileDown, Info, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../BookContext'
import type { PreviewDevice } from '../types'
import './Previewer.css'
import { decorateFirstSentenceHtml, headingParts, parseManuscript, type ManuscriptBlock } from '../layout/manuscript'
import { preflightBook } from '../export/preflight'
import { DEVICE_PROFILES, profileDescription, renderedDeviceWidth } from '../preview/devices'
import { estimateBookPages, readingTimeMinutes } from '../layout/pagination'
import { DrawerControls } from './DrawerControls'

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
  const screenRef = useRef<HTMLDivElement>(null)
  const preflight = useMemo(() => project ? preflightBook(project, activeTheme) : [], [activeTheme, project])

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
  const bookPages = useMemo(
    () => project ? estimateBookPages(project, activeTheme, profile) : 1,
    [activeTheme, profile, project],
  )

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) return
    screen.scrollTop = 0
    setScreenPage(1)
    const measure = () => {
      // Screen previews paginate from measured rendered height, so font
      // scaling and device aspect ratios affect the navigation count.
      const pages = Math.max(1, Math.ceil(screen.scrollHeight / Math.max(1, screen.clientHeight)))
      setScreenPages(pages)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(screen)
    const frame = window.requestAnimationFrame(measure)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [activeChapter?.id, activeChapter?.content, landscape, previewDevice, activeTheme])

  if ((mode !== 'publish' && rightPanel !== 'preview') || !project) return null

  const chapterIndex = bodyChapters.findIndex((c) => c.id === activeChapter?.id)
  const canPrev = chapterIndex > 0
  const canNext = chapterIndex >= 0 && chapterIndex < bodyChapters.length - 1
  const theme = activeTheme
  const deviceClass = `device ${profile.family} ${profile.color ? 'color-screen' : 'eink-screen'}`

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
          hidePin={mode === 'publish'}
          onClose={mode === 'publish' ? () => {
            setMode('draft')
            setRightPanel('none')
          } : undefined}
        />
      </div>

      <div className="preview-controls">
        <select
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
            <select value={readerAppearance} onChange={(event) => setReaderAppearance(event.target.value as typeof readerAppearance)}>
              <option value="light">Light</option>
              <option value="sepia">Sepia</option>
              <option value="dark">Dark</option>
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
            onScroll={(event) => {
              const screen = event.currentTarget
              setScreenPage(Math.min(screenPages, Math.floor(screen.scrollTop / Math.max(1, screen.clientHeight)) + 1))
            }}
            style={{
              fontFamily: theme.typography.bodyFont,
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
                    padding: `${theme.print.marginTop * 18}px ${theme.print.marginOutside * 18}px ${theme.print.marginBottom * 18}px ${theme.print.marginInside * 18}px`,
                  }
                : {}),
            } as CSSProperties}
          >
            {previewDevice === 'Print' &&
              activeChapter &&
              !activeChapter.options.hideHeaderFooter &&
              theme.headerFooter.layout !== 'none' && (
                <>
                  {theme.headerFooter.layout !== 'page-center' && (
                    <div className="preview-print-header" style={{ fontFamily: theme.headerFooter.font, fontSize: theme.headerFooter.size }}>
                      {theme.headerFooter.layout === 'chapter-page'
                        ? activeChapter.title
                        : project.details.title}
                    </div>
                  )}
                  {!activeChapter.options.hidePageNumber && (
                    <div className="preview-print-footer" style={{ fontFamily: theme.headerFooter.font, fontSize: theme.headerFooter.size }}>
                      1
                    </div>
                  )}
                </>
              )}
            {activeChapter?.type === 'chapter' &&
              theme.chapterHeading.imageEnabled &&
              !activeChapter.options.hideChapterImage &&
              (activeChapter.imageDataUrl || theme.chapterHeading.sharedImageDataUrl) && (
                <div className="preview-ornament" aria-hidden>
                  <img
                    src={activeChapter.imageDataUrl || theme.chapterHeading.sharedImageDataUrl}
                    alt=""
                  />
                </div>
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
            ) : activeChapter && !activeChapter.options.hideChapterHeading && (
              <>
                {heading?.number && (
                  <p className="preview-number" style={{ textAlign: theme.chapterHeading.titleAlign }}>
                    Chapter {heading.number}
                  </p>
                )}
                {heading?.title && <h2
                  className="preview-title"
                  style={{
                    textAlign: theme.chapterHeading.titleAlign,
                    fontFamily: theme.chapterHeading.titleFont,
                    fontSize: previewDevice === 'Print'
                      ? `${activeChapter.options.useSmallerChapterTitle ? theme.chapterHeading.titleSize * .75 : theme.chapterHeading.titleSize}pt`
                      : `${Math.max(18, Math.min(34, theme.chapterHeading.titleSize * .82)) * readerFontScale}px`,
                    fontWeight: theme.chapterHeading.titleWeight,
                  }}
                >
                  {heading.title}
                </h2>}
                {heading?.subtitle ? (
                  <p className="preview-subtitle">{heading.subtitle}</p>
                ) : null}
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
                      return <img key={i} className="scene-image" src={theme.sceneBreak.customImageDataUrl} alt="" />
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
                          fontFamily: theme.subheading.font,
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
    </aside>
  )
}
