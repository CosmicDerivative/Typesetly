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
import './Header.css'

export function Header() {
  const [mode, setMode] = useState<'write' | 'format'>('write')

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
