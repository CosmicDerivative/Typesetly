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
            >
              Save as New Theme
            </button>
          </div>
        </div>

        <div className="fv-grid">
          <section className="fv-card">
            <h3>Chapter Heading</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={t.chapterHeading.showNumber}
                onChange={(e) =>
                  updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, showNumber: e.target.checked },
                  })
                }
              />
              Show chapter number
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={t.chapterHeading.showSubtitle}
                onChange={(e) =>
                  updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, showSubtitle: e.target.checked },
                  })
                }
              />
              Show subtitle
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={t.chapterHeading.imageEnabled}
                onChange={(e) =>
                  updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, imageEnabled: e.target.checked },
                  })
                }
              />
              Chapter image / ornament
            </label>
            {t.chapterHeading.imageEnabled && (
              <label>
                Shared chapter image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    const processed = await processImageFile(file)
                    updateEditingTheme({
                      chapterHeading: {
                        ...t.chapterHeading,
                        sharedImageDataUrl: processed.dataUrl,
                      },
                    })
                  }}
                />
              </label>
            )}
            <label>
              Title align
              <select
                value={t.chapterHeading.titleAlign}
                onChange={(e) =>
                  updateEditingTheme({
                    chapterHeading: {
                      ...t.chapterHeading,
                      titleAlign: e.target.value as typeof t.chapterHeading.titleAlign,
                    },
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              Number style
              <select
                value={t.chapterHeading.numberView}
                onChange={(e) =>
                  updateEditingTheme({
                    chapterHeading: {
                      ...t.chapterHeading,
                      numberView: e.target.value as typeof t.chapterHeading.numberView,
                    },
                  })
                }
              >
                <option value="arabic">Arabic</option>
                <option value="roman">Roman</option>
                <option value="words">Words</option>
                <option value="none">None</option>
              </select>
            </label>
            <label>
              Title size
              <input
                type="number"
                min={14}
                max={48}
                value={t.chapterHeading.titleSize}
                onChange={(event) =>
                  updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, titleSize: Number(event.target.value) },
                  })
                }
              />
            </label>
          </section>

          <section className="fv-card">
            <h3>Paragraph</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={t.paragraph.dropCaps}
                onChange={(e) =>
                  updateEditingTheme({
                    paragraph: { ...t.paragraph, dropCaps: e.target.checked },
                  })
                }
              />
              Drop caps
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={t.paragraph.leadInSmallCaps}
                onChange={(e) =>
                  updateEditingTheme({
                    paragraph: { ...t.paragraph, leadInSmallCaps: e.target.checked },
                  })
                }
              />
              Lead-in small caps
            </label>
            <label>
              Paragraph style
              <select
                value={t.paragraph.paragraphStyle}
                onChange={(e) =>
                  updateEditingTheme({
                    paragraph: {
                      ...t.paragraph,
                      paragraphStyle: e.target.value as typeof t.paragraph.paragraphStyle,
                    },
                  })
                }
              >
                <option value="indent">Indent</option>
                <option value="space">Space between</option>
              </select>
            </label>
            <label>
              Body align
              <select
                value={t.paragraph.bodyAlign}
                onChange={(e) =>
                  updateEditingTheme({
                    paragraph: {
                      ...t.paragraph,
                      bodyAlign: e.target.value as typeof t.paragraph.bodyAlign,
                    },
                  })
                }
              >
                <option value="justify">Justify</option>
                <option value="left">Left</option>
              </select>
            </label>
          </section>

          <section className="fv-card">
            <h3>Special Paragraphs</h3>
            <label>
              Verse indent
              <input
                type="range"
                min={0}
                max={4}
                step={0.25}
                value={t.specialBlocks.verseIndentEm}
                onChange={(event) => updateEditingTheme({
                  specialBlocks: { ...t.specialBlocks, verseIndentEm: Number(event.target.value) },
                })}
              />
            </label>
            <label>
              Verse line spacing
              <input
                type="range"
                min={1}
                max={2}
                step={0.05}
                value={t.specialBlocks.verseLineSpacing}
                onChange={(event) => updateEditingTheme({
                  specialBlocks: { ...t.specialBlocks, verseLineSpacing: Number(event.target.value) },
                })}
              />
            </label>
            <label>
              Hanging indent
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.25}
                value={t.specialBlocks.hangingIndentEm}
                onChange={(event) => updateEditingTheme({
                  specialBlocks: { ...t.specialBlocks, hangingIndentEm: Number(event.target.value) },
                })}
              />
            </label>
            <label>
              Quotation indent
              <input
                type="range"
                min={0}
                max={4}
                step={0.25}
                value={t.specialBlocks.quoteIndentEm}
                onChange={(event) => updateEditingTheme({
                  specialBlocks: { ...t.specialBlocks, quoteIndentEm: Number(event.target.value) },
                })}
              />
            </label>
            <label>
              Quotation rule
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={t.specialBlocks.quoteBorderWidth}
                onChange={(event) => updateEditingTheme({
                  specialBlocks: { ...t.specialBlocks, quoteBorderWidth: Number(event.target.value) },
                })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={t.specialBlocks.quoteItalic}
                onChange={(event) => updateEditingTheme({
                  specialBlocks: { ...t.specialBlocks, quoteItalic: event.target.checked },
                })}
              />
              Italicize quotations
            </label>
          </section>

          <section className="fv-card">
            <h3>Scene Break</h3>
            <label>
              Style
              <select
                value={t.sceneBreak.style}
                onChange={(e) =>
                  updateEditingTheme({
                    sceneBreak: {
                      ...t.sceneBreak,
                      style: e.target.value as typeof t.sceneBreak.style,
                    },
                  })
                }
              >
                <option value="ornament">Ornament</option>
                <option value="space">Extra space</option>
                <option value="none">None</option>
              </select>
            </label>
            {t.sceneBreak.style === 'ornament' && (
              <>
                <label>
                  Text ornament
                  <input
                    value={t.sceneBreak.ornament}
                    placeholder="* * *"
                    onChange={(event) =>
                      updateEditingTheme({
                        sceneBreak: {
                          ...t.sceneBreak,
                          ornament: event.target.value,
                          customImageDataUrl: undefined,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Ornament size ({t.sceneBreak.size}px)
                  <input
                    type="range"
                    min={8}
                    max={48}
                    value={t.sceneBreak.size}
                    onChange={(event) =>
                      updateEditingTheme({
                        sceneBreak: { ...t.sceneBreak, size: Number(event.target.value) },
                      })
                    }
                  />
                </label>
                <label>
                  Custom ornament image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      const processed = await processImageFile(file, 1200)
                      updateEditingTheme({
                        sceneBreak: { ...t.sceneBreak, customImageDataUrl: processed.dataUrl },
                      })
                      event.target.value = ''
                    }}
                  />
                </label>
                {t.sceneBreak.customImageDataUrl && (
                  <div className="scene-image-setting">
                    <img src={t.sceneBreak.customImageDataUrl} alt="Current scene ornament" />
                    <button
                      type="button"
                      onClick={() =>
                        updateEditingTheme({
                          sceneBreak: { ...t.sceneBreak, customImageDataUrl: undefined },
                        })
                      }
                    >
                      Remove custom image
                    </button>
                  </div>
                )}
              </>
            )}
            {t.sceneBreak.style === 'space' && (
              <p className="setting-hint">Scenes are separated by a clean blank line with no ornament.</p>
            )}
            {t.sceneBreak.style === 'none' && (
              <p className="setting-hint">The scene boundary remains in the manuscript but adds no visible mark or spacing.</p>
            )}
          </section>

          <section className="fv-card">
            <h3>Typography</h3>
            <label>
              Body font
              <select
                value={t.typography.bodyFont}
                onChange={(e) =>
                  updateEditingTheme({
                    typography: { ...t.typography, bodyFont: e.target.value },
                  })
                }
              >
                <option>Palatino Linotype</option>
                <option>Garamond</option>
                <option>Georgia</option>
                <option>Times New Roman</option>
                <option>Libre Baskerville</option>
                <option>Source Sans 3</option>
                <option>Arial</option>
                <option>Book Antiqua</option>
                <option>Cambria</option>
                <option>Charter</option>
                <option>Courier New</option>
                <option>OpenDyslexic</option>
                <option>Verdana</option>
              </select>
            </label>
            <label>
              Custom installed font
              <input
                value={t.typography.bodyFont}
                onChange={(event) => updateEditingTheme({ typography: { ...t.typography, bodyFont: event.target.value } })}
                placeholder="Enter any font installed on this computer"
              />
            </label>
            <label>
              Embed font for EPUB
              <input
                type="file"
                accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const name = file.name.replace(/\.[^.]+$/, '') || 'Embedded Book Font'
                    const source = String(reader.result)
                    void new FontFace(name, `url(${source})`).load().then((font) => document.fonts.add(font))
                    updateEditingTheme({
                      typography: {
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
