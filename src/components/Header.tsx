import {
  BookOpen,
  CircleHelp,
  HardDrive,
  LayoutGrid,
  Map as MapIcon,
  PackageOpen,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Share2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../BookContext'
import { TYPESETLY_LOGO_URL } from '../branding'
import type { AppMode } from '../types'
import { BookDetailsModal } from './BookDetailsModal'
import './Header.css'
import { Dialog } from './Dialog'
import { Wiki } from './Wiki'

export function Header() {
  const {
    project,
    mode,
    setMode,
    goHome,
    downloadSnapshot,
    setRightPanel,
    sidebarOpen,
    setSidebarOpen,
    sidebarPinned,
    pinnedRightPanel,
    setPinnedRightPanel,
    activeChapter,
    addChapter,
    addPart,
    duplicateChapter,
    deleteChapter,
    deleteScene,
    moveChapterBy,
  } = useApp()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [wikiOpen, setWikiOpen] = useState(false)
  const closeWiki = useCallback(() => setWikiOpen(false), [])
  const activateMode = useCallback((nextMode: AppMode) => {
    setMode(nextMode)
    setSidebarOpen(nextMode === 'plan' ? false : sidebarPinned)
    setRightPanel(
      nextMode === 'plan' && pinnedRightPanel === 'story'
        ? 'none'
        : pinnedRightPanel !== 'none'
        ? pinnedRightPanel
        : nextMode === 'publish'
          ? 'preview'
          : 'none',
    )
  }, [
    pinnedRightPanel,
    setMode,
    setRightPanel,
    setSidebarOpen,
    sidebarPinned,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const target = event.target instanceof Element ? event.target : null
      const editable = Boolean(
        target?.closest('input, textarea, select, [contenteditable="true"]'),
      )

      if (event.key === 'F1') {
        event.preventDefault()
        setHelpOpen(true)
      } else if (modifier && event.altKey && event.key === '1') {
        event.preventDefault()
        activateMode('draft')
      } else if (modifier && event.altKey && event.key === '2') {
        event.preventDefault()
        activateMode('plan')
      } else if (modifier && event.altKey && event.key === '3') {
        event.preventDefault()
        activateMode('organize')
      } else if (modifier && event.altKey && event.key === '4') {
        event.preventDefault()
        activateMode('design')
      } else if (modifier && event.altKey && event.key === '5') {
        event.preventDefault()
        activateMode('publish')
      } else if (modifier && event.shiftKey && key === 's') {
        event.preventDefault()
        downloadSnapshot()
      } else if (modifier && !event.shiftKey && key === 's') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('typesetly:notice', {
          detail: 'Saved locally. Typesetly also saves changes automatically.',
        }))
      } else if (modifier && event.shiftKey && key === 'e') {
        event.preventDefault()
        activateMode('publish')
      } else if (modifier && !event.shiftKey && key === 'f') {
        event.preventDefault()
        if (pinnedRightPanel !== 'none') setPinnedRightPanel('find')
        setRightPanel('find')
      } else if (modifier && key === ',') {
        event.preventDefault()
        if (pinnedRightPanel !== 'none') setPinnedRightPanel('settings')
        setRightPanel('settings')
      } else if (modifier && key === '\\') {
        event.preventDefault()
        setSidebarOpen(sidebarPinned ? true : !sidebarOpen)
      } else if (modifier && !event.shiftKey && key === 'n') {
        event.preventDefault()
        addChapter()
      } else if (modifier && event.shiftKey && key === 'n') {
        event.preventDefault()
        addPart()
      } else if (modifier && event.shiftKey && key === 'd' && activeChapter) {
        event.preventDefault()
        duplicateChapter(activeChapter.id)
      } else if (
        modifier &&
        event.shiftKey &&
        (event.key === 'Delete' || event.key === 'Backspace') &&
        activeChapter
      ) {
        event.preventDefault()
        deleteChapter(activeChapter.id)
      } else if (event.altKey && event.shiftKey && event.key === 'ArrowUp' && activeChapter) {
        event.preventDefault()
        moveChapterBy(activeChapter.id, -1)
      } else if (event.altKey && event.shiftKey && event.key === 'ArrowDown' && activeChapter) {
        event.preventDefault()
        moveChapterBy(activeChapter.id, 1)
      } else if (event.key === 'Delete' && !editable && !modifier && !event.altKey) {
        const sceneElement = target?.closest<HTMLElement>('[data-scene-index][data-chapter-id]')
        const pageElement = target?.closest<HTMLElement>('[data-page-id]')
        if (sceneElement) {
          event.preventDefault()
          deleteScene(
            sceneElement.dataset.chapterId || '',
            Number(sceneElement.dataset.sceneIndex),
          )
        } else if (pageElement?.dataset.pageId) {
          event.preventDefault()
          deleteChapter(pageElement.dataset.pageId)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeChapter,
    addChapter,
    addPart,
    activateMode,
    deleteChapter,
    deleteScene,
    downloadSnapshot,
    duplicateChapter,
    moveChapterBy,
    pinnedRightPanel,
    setRightPanel,
    setPinnedRightPanel,
    setSidebarOpen,
    sidebarOpen,
    sidebarPinned,
  ])

  if (!project) return null

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <button className="app-logo" title="Home" type="button" onClick={goHome}>
            <img src={TYPESETLY_LOGO_URL} alt="" />
            <span className="app-wordmark">Typesetly</span>
          </button>
          {mode === 'draft' && (
            <button
              className="icon-btn sidebar-toggle"
              title={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
              aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          )}
          <div className="book-identity">
            <span>Open manuscript</span>
            <h1 className="book-title">{project.details.title}</h1>
          </div>
          <button
            className="edit-details-btn"
            type="button"
            onClick={() => setDetailsOpen(true)}
          >
            Book profile
          </button>
        </div>

        <nav className="header-modes" aria-label="Mode">
          <button
            type="button"
            className={mode === 'draft' ? 'mode-tab active' : 'mode-tab'}
            onClick={() => activateMode('draft')}
        >
          Format
        </button>
      </nav>
      <button type="button">Export</button>
    </header>
  )
}
