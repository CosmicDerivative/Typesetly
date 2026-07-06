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
