import { Heart, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../BookContext'
import { TRIM_SIZES } from '../themes/presets'
import type { BookTheme } from '../types'
import './FormattingPanel.css'
import { Dialog } from './Dialog'
import { processImageFile } from '../images/process'

function previewFontStack(font: string) {
  const normalized = font.toLocaleLowerCase()
  if (normalized.includes('source sans')) return `"${font}", "Segoe UI", Arial, sans-serif`
  if (normalized.includes('libre baskerville')) return `"${font}", Georgia, serif`
  if (normalized.includes('palatino')) return `"${font}", Palatino, "Book Antiqua", Georgia, serif`
  if (normalized.includes('garamond')) return `${font}, "Times New Roman", Georgia, serif`
  if (normalized.includes('times')) return `"${font}", "Times New Roman", serif`
  if (normalized.includes('georgia')) return `${font}, Georgia, serif`
  return `"${font}", Georgia, serif`
}

function previewChapterNumber(theme: BookTheme) {
  if (!theme.chapterHeading.showNumber || theme.chapterHeading.numberView === 'none') return ''
  if (theme.chapterHeading.numberView === 'roman') return 'CHAPTER I'
  if (theme.chapterHeading.numberView === 'words') return 'CHAPTER ONE'
  return 'CHAPTER 1'
}
export function FormattingPanel() {
  const [theme, setTheme] = useState(themes[0])
  const [fontSize, setFontSize] = useState(11)

  return (
    <aside className="formatting-panel">
      <h2>Formatting</h2>
      <label>
        Theme
        <select value={theme} onChange={(event) => setTheme(event.target.value)}>
          {themes.map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <label>
        Body size
        <input
          type="number"
          min="8"
          max="18"
          value={fontSize}
          onChange={(event) => setFontSize(Number(event.target.value))}
        />
      </label>
      <p>Previewing {theme} at {fontSize} pt.</p>
    </aside>
  )
}
