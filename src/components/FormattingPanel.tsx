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
  const {
    mode,
    themes,
    project,
    activeTheme,
    editingTheme,
    applyTheme,
    startThemeEdit,
    updateEditingTheme,
    saveEditingTheme,
    cancelThemeEdit,
    toggleThemeFavorite,
    deleteCustomTheme,
    setRightPanel,
  } = useApp()
  const [nameDialog, setNameDialog] = useState(false)
  const [themeName, setThemeName] = useState('')
  const [themeQuery, setThemeQuery] = useState('')

  if (mode !== 'design' || !project) return null

  const sorted = [...themes]
    .filter((theme) => theme.name.toLowerCase().includes(themeQuery.trim().toLowerCase()))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite))

  if (editingTheme) {
    const t = editingTheme
    return (
      <>
      <div className="formatting-view">
        <div className="fv-head">
          <div>
            <h2>Book lab</h2>
            <p>Shape a distinct reading system and watch the proof update live.</p>
          </div>
          <div className="fv-actions">
            <button type="button" className="ghost" onClick={cancelThemeEdit}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setThemeName(t.name)
                setNameDialog(true)
              }}
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
