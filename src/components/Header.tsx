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

  return (
    <header className="header">
      <img src="/typesetly-logo.png" alt="Typesetly" />
      <nav aria-label="Workspace">
        <button
          type="button"
          className={mode === 'write' ? 'active' : ''}
          onClick={() => setMode('write')}
        >
          Write
        </button>
        <button
          type="button"
          className={mode === 'format' ? 'active' : ''}
          onClick={() => setMode('format')}
        >
          Format
        </button>
      </nav>
      <button type="button">Export</button>
    </header>
  )
}
