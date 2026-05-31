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
  return (
    <aside className="previewer">
      <header>
        <strong>Book preview</strong>
        <span>Page {page}</span>
      </header>
      <div className="preview-page">
        <p className="chapter-number">Chapter One</p>
        <h1>Untitled Chapter</h1>
        <p>Your formatted manuscript will appear here.</p>
      </div>
      <footer>
        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <button type="button" onClick={() => setPage((value) => value + 1)}>Next</button>
      </footer>
    </aside>
  )
}
