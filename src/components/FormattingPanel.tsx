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
                        ...t.typography,
                        bodyFont: name,
                        embeddedFontName: name,
                        embeddedFontDataUrl: source,
                      },
                    })
                  }
                  reader.readAsDataURL(file)
                }}
              />
              {t.typography.embeddedFontDataUrl && (
                <button
                  type="button"
                  onClick={() => updateEditingTheme({
                    typography: {
                      ...t.typography,
                      bodyFont: 'Palatino Linotype',
                      embeddedFontName: undefined,
                      embeddedFontDataUrl: undefined,
                    },
                  })}
                >
                  Remove embedded font
                </button>
              )}
            </label>
            <label>
              Body size (pt)
              <input
                type="number"
                min={9}
                max={20}
                step={0.5}
                value={t.typography.bodySize}
                onChange={(e) =>
                  updateEditingTheme({
                    typography: { ...t.typography, bodySize: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              Line spacing
              <input
                type="number"
                min={1}
                max={2.5}
                step={0.05}
                value={t.typography.lineSpacing}
                onChange={(e) =>
                  updateEditingTheme({
                    typography: { ...t.typography, lineSpacing: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={t.print.largePrint}
                onChange={(e) =>
                  updateEditingTheme({
                    print: { ...t.print, largePrint: e.target.checked },
                  })
                }
              />
              Large print
            </label>
          </section>

          <section className="fv-card">
            <h3>Notes</h3>
            <label>
              ePub placement
              <select
                value={t.notes.epubPlacement}
                onChange={(e) =>
                  updateEditingTheme({
                    notes: {
                      ...t.notes,
                      epubPlacement: e.target.value as typeof t.notes.epubPlacement,
                    },
                  })
                }
              >
                <option value="chapter-end">End of chapter</option>
                <option value="book-end">End of book</option>
              </select>
            </label>
            <label>
              Print placement
              <select
                value={t.notes.printPlacement}
                onChange={(e) =>
                  updateEditingTheme({
                    notes: {
                      ...t.notes,
                      printPlacement: e.target.value as typeof t.notes.printPlacement,
                    },
                  })
                }
              >
                <option value="footnotes">Footnotes</option>
                <option value="chapter-end">End of chapter</option>
                <option value="book-end">End of book</option>
              </select>
            </label>
          </section>

          <section className="fv-card">
            <h3>Print / Trim</h3>
            <label>
              Trim size
              <select
                value={`${t.print.trimWidthIn}x${t.print.trimHeightIn}`}
                onChange={(e) => {
                  const trim = TRIM_SIZES.find(
                    (x) => `${x.width}x${x.height}` === e.target.value,
                  )
                  if (!trim) return
                  updateEditingTheme({
                    print: {
                      ...t.print,
                      trimWidthIn: trim.width,
                      trimHeightIn: trim.height,
                    },
                  })
                }}
              >
                {TRIM_SIZES.map((trim) => (
                  <option key={trim.label} value={`${trim.width}x${trim.height}`}>
                    {trim.label}
                    {trim.kdp ? ' · KDP' : ''}
                    {trim.ingram ? ' · Ingram' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="compact-grid">
              {([
                ['marginInside', 'Inside'],
                ['marginOutside', 'Outside'],
                ['marginTop', 'Top'],
                ['marginBottom', 'Bottom'],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  {label} margin
                  <input
                    type="number"
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={t.print[key]}
                    onChange={(event) =>
                      updateEditingTheme({
                        print: { ...t.print, [key]: Number(event.target.value) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={t.print.hyphens}
                onChange={(event) =>
                  updateEditingTheme({ print: { ...t.print, hyphens: event.target.checked } })
                }
              />
              Automatic hyphenation
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={t.print.keepSubheadings}
                onChange={(event) =>
                  updateEditingTheme({ print: { ...t.print, keepSubheadings: event.target.checked } })
                }
              />
              Keep subheadings with following text
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={t.print.keepSceneBreaks}
                onChange={(event) =>
                  updateEditingTheme({ print: { ...t.print, keepSceneBreaks: event.target.checked } })
                }
              />
              Keep scene breaks with surrounding text
            </label>
            <label>
              Header / Footer
              <select
                value={t.headerFooter.layout}
                onChange={(e) =>
                  updateEditingTheme({
                    headerFooter: {
                      ...t.headerFooter,
                      layout: e.target.value as typeof t.headerFooter.layout,
                    },
                  })
                }
              >
                <option value="none">None</option>
                <option value="page-center">Page number center</option>
                <option value="title-author">Title / Author</option>
                <option value="chapter-page">Chapter / Page</option>
                <option value="author-title-page">Author / Title / Page</option>
              </select>
            </label>
            <label>
              Layout priority
              <select
                value={t.print.layoutPriority}
                onChange={(e) =>
                  updateEditingTheme({
                    print: {
                      ...t.print,
                      layoutPriority: e.target.value as typeof t.print.layoutPriority,
                    },
                  })
                }
              >
                <option value="widows-orphans">Widows and Orphans</option>
                <option value="balanced">Balanced Page Spread</option>
                <option value="best-of-both">Best of Both</option>
              </select>
            </label>
          </section>
        </div>
      </div>
      {nameDialog && (
        <Dialog
          title="Save custom theme"
          confirmLabel="Save theme"
          onCancel={() => setNameDialog(false)}
          onConfirm={() => {
            saveEditingTheme(themeName.trim() || t.name)
            setNameDialog(false)
          }}
        >
          <label>
            Theme name
            <input value={themeName} onChange={(event) => setThemeName(event.target.value)} />
          </label>
        </Dialog>
      )}
      </>
    )
  }

  return (
    <div className="formatting-view library">
      <div className="fv-head">
        <div>
          <h2>Design recipes</h2>
          <p>Choose a reading recipe or build one from scratch. The proof updates instantly.</p>
        </div>
        <div className="fv-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setRightPanel('preview')}
          >
            Open previewer
          </button>
          <button type="button" className="primary" onClick={() => startThemeEdit()}>
            <Plus size={14} /> Create New Theme
          </button>
        </div>
      </div>
      <label className="theme-search">
        <input value={themeQuery} onChange={(event) => setThemeQuery(event.target.value)} placeholder="Search themes…" />
      </label>

      <div className="theme-grid">
        {sorted.map((theme) => {
          const active = project.themeId === theme.id
          const chapterNumber = previewChapterNumber(theme)
          const dropCap = theme.paragraph.dropCaps
          const leadInSmallCaps = theme.paragraph.leadInSmallCaps
          return (
            <article key={theme.id} className={active ? 'theme-card active' : 'theme-card'}>
              <button type="button" className="theme-preview" onClick={() => applyTheme(theme.id)}>
                <div
                  className="theme-sample"
                  style={{
                    fontFamily: previewFontStack(theme.typography.bodyFont),
                    fontSize: `${Math.max(9.5, Math.min(13, theme.typography.bodySize * .96))}px`,
                  }}
                >
                  {(theme.chapterHeading.imageEnabled || chapterNumber) && (
                    <div
                      className="ts-kicker"
                      style={{
                        fontFamily: previewFontStack(theme.chapterHeading.numberFont),
                        textAlign: theme.chapterHeading.imageAlign,
                      }}
                    >
                      {theme.chapterHeading.imageEnabled ? '❧' : ''}
                      {theme.chapterHeading.imageEnabled && chapterNumber ? '  ' : ''}
                      {chapterNumber}
                    </div>
                  )}
                  {theme.chapterHeading.showTitle && (
                    <div
                      className="ts-title"
                      style={{
                        fontFamily: previewFontStack(theme.chapterHeading.titleFont),
                        fontSize: `${Math.max(13, Math.min(18, theme.chapterHeading.titleSize * .55))}px`,
                        fontWeight: theme.chapterHeading.titleWeight === 'bold' ? 700 : 400,
                        textAlign: theme.chapterHeading.titleAlign,
                      }}
                    >
                      Chapter Title
                    </div>
                  )}
                  <p
                    className={dropCap ? 'ts-drop' : ''}
                    style={{
                      lineHeight: Math.max(1.25, Math.min(1.7, theme.typography.lineSpacing)),
                      textAlign: theme.paragraph.bodyAlign,
                    }}
                  >
                    {dropCap && <span className="ts-dropcap">W</span>}
                    {leadInSmallCaps ? (
                      <>
                        <span className="ts-small-caps">{dropCap ? 'hen' : 'When'} the story begins,</span>
                        {' the theme shapes every page.'}
                      </>
                    ) : (
                      <>{dropCap ? 'hen' : 'When'} the story begins, the theme shapes every page.</>
                    )}
                  </p>
                </div>
              </button>
              <div className="theme-meta">
                <strong>{theme.name}</strong>
                <div className="theme-tools">
                  <button type="button" title="Favorite" onClick={() => toggleThemeFavorite(theme.id)}>
                    <Heart size={14} fill={theme.favorite ? '#d76443' : 'none'} />
                  </button>
                  <button type="button" title="Edit as new" onClick={() => startThemeEdit(theme)}>
                    <Pencil size={14} />
                  </button>
                  {!theme.preset && (
                    <button type="button" title="Delete" onClick={() => deleteCustomTheme(theme.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              {active && <span className="applied">Applied</span>}
            </article>
          )
        })}
      </div>
      {!sorted.length && <p className="fv-note">No themes match “{themeQuery}”.</p>}
      <p className="fv-note">Active theme: <strong>{activeTheme.name}</strong></p>
    </div>
  )
}
