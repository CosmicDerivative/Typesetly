import { Heart, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useApp } from '../BookContext'
import { TRIM_SIZES } from '../themes/presets'
import { FONT_FAMILIES, FONT_FAMILY_GROUPS, fontStack } from '../themes/fonts'
import type { BookTheme, ThemeChapterDecoration } from '../types'
import './FormattingPanel.css'
import { Dialog } from './Dialog'
import { processImageFile } from '../images/process'
import { dataUrlToBlob, imageRef } from '../library/images'
import { storeNewImage } from '../library/store'
import { useResolvedImageSrc } from '../library/useResolvedImageSrc'
import { chapterDecorations } from '../themes/chapterDecorations'
import { ChapterDecorations } from './ChapterDecorations'
import './ChapterDecorations.css'

function ResolvedImg({
  src,
  alt = '',
  className,
  style,
}: {
  src?: string
  alt?: string
  className?: string
  style?: CSSProperties
}) {
  const resolved = useResolvedImageSrc(src)
  if (!src || !resolved) return null
  return <img className={className} src={resolved} alt={alt} style={style} />
}

async function storeThemeImage(file: File, maxDimension?: number) {
  const processed = await processImageFile(file, maxDimension)
  const blob = dataUrlToBlob(processed.dataUrl)
  if (!blob) throw new Error('The selected image is not supported.')
  const stored = await storeNewImage('library', blob)
  return imageRef(stored.id)
}

function previewChapterNumber(theme: BookTheme) {
  if (!theme.chapterHeading.showNumber || theme.chapterHeading.numberView === 'none') return ''
  if (theme.chapterHeading.numberView === 'roman') return 'CHAPTER I'
  if (theme.chapterHeading.numberView === 'words') return 'CHAPTER ONE'
  return 'CHAPTER 1'
}

function ThemeSample({ theme, className = '' }: { theme: BookTheme; className?: string }) {
  const chapterNumber = previewChapterNumber(theme)
  const decorations = chapterDecorations(theme.chapterHeading)
  const hasOverlay = decorations.some((decoration) => decoration.placement === 'header-overlay')
  const dropCap = theme.paragraph.dropCaps
  const leadInSmallCaps = theme.paragraph.leadInSmallCaps
  const bodySize = Math.max(1, theme.typography.bodySize)
  const imageMargin = theme.chapterHeading.imageAlign === 'center'
    ? '0 auto .5em'
    : theme.chapterHeading.imageAlign === 'right'
      ? '0 0 .5em auto'
      : '0 auto .5em 0'

  return (
    <div
      className={`theme-sample ${className}`.trim()}
      style={{
        fontFamily: fontStack(theme.typography.bodyFont),
        fontSize: `${Math.max(9.5, Math.min(13, bodySize * .96))}px`,
      }}
    >
      <ChapterDecorations decorations={decorations} placement="above-heading" />
      <div className={`theme-heading-composition${hasOverlay ? ' has-overlay' : ''}`}>
        <ChapterDecorations decorations={decorations} placement="header-overlay" />
        <div className="theme-heading-content">
          {theme.chapterHeading.imageEnabled && theme.chapterHeading.sharedImageDataUrl && (
            <ResolvedImg
              className="ts-kicker-image"
              src={theme.chapterHeading.sharedImageDataUrl}
              alt=""
              style={{
                width: `${theme.chapterHeading.imageSize}%`,
                margin: imageMargin,
              }}
            />
          )}
          {chapterNumber && (
            <div
              className="ts-kicker"
              style={{
                fontFamily: fontStack(theme.chapterHeading.numberFont),
                fontSize: `${theme.chapterHeading.numberSize / bodySize}em`,
                textAlign: theme.chapterHeading.titleAlign,
              }}
            >
              {chapterNumber}
            </div>
          )}
          {theme.chapterHeading.showTitle && (
            <div
              className="ts-title"
              style={{
                fontFamily: fontStack(theme.chapterHeading.titleFont),
                fontSize: `${theme.chapterHeading.titleSize / bodySize}em`,
                fontWeight: theme.chapterHeading.titleWeight === 'bold' ? 700 : 400,
                textAlign: theme.chapterHeading.titleAlign,
              }}
            >
              Chapter Title
            </div>
          )}
          {theme.chapterHeading.showSubtitle && (
            <div
              className="ts-subtitle"
              style={{
                fontFamily: fontStack(theme.chapterHeading.subtitleFont),
                fontSize: `${theme.chapterHeading.subtitleSize / bodySize}em`,
                textAlign: theme.chapterHeading.titleAlign,
              }}
            >
              A chapter subtitle
            </div>
          )}
        </div>
      </div>
      <ChapterDecorations decorations={decorations} placement="below-heading" />
      <ChapterDecorations decorations={decorations} placement="before-opening" />
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
      <ChapterDecorations decorations={decorations} placement="chapter-footer" />
    </div>
  )
}

function fontOptions(current: string) {
  return (
    <>
      {!FONT_FAMILIES.includes(current) && <option>{current}</option>}
      {FONT_FAMILY_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.fonts.map((font) => <option key={font}>{font}</option>)}
        </optgroup>
      ))}
    </>
  )
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
    const decorationList = t.chapterHeading.decorations || []
    const setDecorations = (decorations: ThemeChapterDecoration[]) => updateEditingTheme({
      chapterHeading: { ...t.chapterHeading, decorations },
    })
    const updateDecoration = (id: string, patch: Partial<ThemeChapterDecoration>) => {
      setDecorations(decorationList.map((item) => item.id === id ? { ...item, ...patch } : item))
    }
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

        <section className="booklab-live-preview" aria-label="Live chapter proof">
          <div className="booklab-live-preview-copy">
            <span>Live chapter proof</span>
            <p>Images, heading type, alignment, and decorative layers update here as you edit.</p>
          </div>
          <ThemeSample theme={t} className="booklab-theme-sample" />
        </section>

        <div className="fv-grid">
          <section className="fv-card fv-card--chapter-heading">
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
              <>
              <label>
                Shared chapter image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    try {
                      const ref = await storeThemeImage(file)
                      updateEditingTheme({
                        chapterHeading: {
                          ...t.chapterHeading,
                          sharedImageDataUrl: ref,
                        },
                      })
                    } catch (error) {
                      window.dispatchEvent(new CustomEvent('typesetly:notice', {
                        detail: error instanceof Error ? error.message : 'The image could not be imported.',
                      }))
                    }
                  }}
                />
              </label>
              {t.chapterHeading.sharedImageDataUrl && (
                <div className="shared-chapter-image-controls">
                  <div className="compact-grid">
                    <label>
                      Shared image width ({t.chapterHeading.imageSize}%)
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={t.chapterHeading.imageSize}
                        onChange={(event) => updateEditingTheme({
                          chapterHeading: {
                            ...t.chapterHeading,
                            imageSize: Number(event.target.value),
                          },
                        })}
                      />
                    </label>
                    <label>
                      Shared image alignment
                      <select
                        value={t.chapterHeading.imageAlign}
                        onChange={(event) => updateEditingTheme({
                          chapterHeading: {
                            ...t.chapterHeading,
                            imageAlign: event.target.value as typeof t.chapterHeading.imageAlign,
                          },
                        })}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    className="remove-shared-chapter-image"
                    onClick={() => updateEditingTheme({
                      chapterHeading: { ...t.chapterHeading, sharedImageDataUrl: undefined },
                    })}
                  >
                    <Trash2 size={13} /> Remove shared chapter image
                  </button>
                </div>
              )}
              <label>
                Add decorative image layer
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    try {
                      const ref = await storeThemeImage(file)
                      setDecorations([...decorationList, {
                        id: crypto.randomUUID(),
                        name: file.name.replace(/\.[^.]+$/, '') || `Decoration ${decorationList.length + 1}`,
                        imageDataUrl: ref,
                        placement: 'header-overlay',
                        align: decorationList.length % 2 ? 'right' : 'left',
                        width: 28,
                        offsetX: 0,
                        offsetY: 0,
                        opacity: 100,
                        rotation: 0,
                      }])
                      event.target.value = ''
                    } catch (error) {
                      window.dispatchEvent(new CustomEvent('typesetly:notice', {
                        detail: error instanceof Error ? error.message : 'The decorative image could not be imported.',
                      }))
                    }
                  }}
                />
              </label>
              {decorationList.map((decoration, index) => (
                <div className="decoration-layer-editor" key={decoration.id}>
                  <div className="decoration-layer-head">
                    <input
                      aria-label="Layer name"
                      value={decoration.name}
                      onChange={(event) => updateDecoration(decoration.id, { name: event.target.value })}
                    />
                    <button type="button" disabled={index === 0} onClick={() => {
                      const next = [...decorationList]
                      ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                      setDecorations(next)
                    }}>↑</button>
                    <button type="button" disabled={index === decorationList.length - 1} onClick={() => {
                      const next = [...decorationList]
                      ;[next[index], next[index + 1]] = [next[index + 1]!, next[index]!]
                      setDecorations(next)
                    }}>↓</button>
                    <button type="button" title="Remove layer" onClick={() => setDecorations(decorationList.filter((item) => item.id !== decoration.id))}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="compact-grid">
                    <label>Position
                      <select value={decoration.placement} onChange={(event) => updateDecoration(decoration.id, { placement: event.target.value as ThemeChapterDecoration['placement'] })}>
                        <option value="above-heading">Above heading</option>
                        <option value="header-overlay">Around / behind heading</option>
                        <option value="below-heading">Below heading</option>
                        <option value="before-opening">Before opening text</option>
                        <option value="chapter-footer">Chapter footer</option>
                      </select>
                    </label>
                    <label>Align
                      <select value={decoration.align} onChange={(event) => updateDecoration(decoration.id, { align: event.target.value as ThemeChapterDecoration['align'] })}>
                        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                      </select>
                    </label>
                    <label>Width ({decoration.width}%)
                      <input type="range" min={5} max={100} value={decoration.width} onChange={(event) => updateDecoration(decoration.id, { width: Number(event.target.value) })} />
                    </label>
                    <label>Opacity ({decoration.opacity}%)
                      <input type="range" min={5} max={100} value={decoration.opacity} onChange={(event) => updateDecoration(decoration.id, { opacity: Number(event.target.value) })} />
                    </label>
                    <label>Horizontal offset
                      <input type="number" min={-50} max={50} value={decoration.offsetX} onChange={(event) => updateDecoration(decoration.id, { offsetX: Number(event.target.value) })} />
                    </label>
                    <label>Vertical offset
                      <input type="number" min={-240} max={240} value={decoration.offsetY} onChange={(event) => updateDecoration(decoration.id, { offsetY: Number(event.target.value) })} />
                    </label>
                    <label>Rotation
                      <input type="number" min={-180} max={180} value={decoration.rotation} onChange={(event) => updateDecoration(decoration.id, { rotation: Number(event.target.value) })} />
                    </label>
                  </div>
                </div>
              ))}
              </>
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
            <label>
              Title font
              <select
                value={t.chapterHeading.titleFont}
                onChange={(event) => updateEditingTheme({
                  chapterHeading: { ...t.chapterHeading, titleFont: event.target.value },
                })}
              >
                {fontOptions(t.chapterHeading.titleFont)}
              </select>
            </label>
            <label>
              Title weight
              <select
                value={t.chapterHeading.titleWeight}
                onChange={(event) => updateEditingTheme({
                  chapterHeading: {
                    ...t.chapterHeading,
                    titleWeight: event.target.value as typeof t.chapterHeading.titleWeight,
                  },
                })}
              >
                <option value="normal">Regular</option>
                <option value="bold">Bold</option>
              </select>
            </label>
            <div className="compact-grid">
              <label>
                Number font
                <select
                  value={t.chapterHeading.numberFont}
                  onChange={(event) => updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, numberFont: event.target.value },
                  })}
                >
                  {fontOptions(t.chapterHeading.numberFont)}
                </select>
              </label>
              <label>
                Number size
                <input
                  type="number"
                  min={7}
                  max={36}
                  value={t.chapterHeading.numberSize}
                  onChange={(event) => updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, numberSize: Number(event.target.value) },
                  })}
                />
              </label>
              <label>
                Subtitle font
                <select
                  value={t.chapterHeading.subtitleFont}
                  onChange={(event) => updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, subtitleFont: event.target.value },
                  })}
                >
                  {fontOptions(t.chapterHeading.subtitleFont)}
                </select>
              </label>
              <label>
                Subtitle size
                <input
                  type="number"
                  min={7}
                  max={32}
                  value={t.chapterHeading.subtitleSize}
                  onChange={(event) => updateEditingTheme({
                    chapterHeading: { ...t.chapterHeading, subtitleSize: Number(event.target.value) },
                  })}
                />
              </label>
            </div>
          </section>

          <div className="fv-settings-grid">
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
            <label>
              First-sentence styling
              <select
                value={t.paragraph.firstSentenceMode}
                onChange={(event) => updateEditingTheme({
                  paragraph: {
                    ...t.paragraph,
                    firstSentenceMode: event.target.value as typeof t.paragraph.firstSentenceMode,
                  },
                })}
              >
                <option value="chapter">Chapter openings only</option>
                <option value="chapter-and-scene">Chapter and scene openings</option>
              </select>
            </label>
          </section>

          <section className="fv-card">
            <h3>Subheading Hierarchy</h3>
            <label>
              Font
              <select
                value={t.subheading.font}
                onChange={(event) => updateEditingTheme({
                  subheading: { ...t.subheading, font: event.target.value },
                })}
              >
                {fontOptions(t.subheading.font)}
              </select>
            </label>
            <div className="compact-grid">
              <label>
                Weight
                <select
                  value={t.subheading.weight}
                  onChange={(event) => updateEditingTheme({
                    subheading: {
                      ...t.subheading,
                      weight: event.target.value as typeof t.subheading.weight,
                    },
                  })}
                >
                  <option value="normal">Regular</option>
                  <option value="bold">Bold</option>
                </select>
              </label>
              <label>
                Alignment
                <select
                  value={t.subheading.align}
                  onChange={(event) => updateEditingTheme({
                    subheading: {
                      ...t.subheading,
                      align: event.target.value as typeof t.subheading.align,
                    },
                  })}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
            <div className="heading-size-grid">
              {([2, 3, 4, 5, 6] as const).map((level) => {
                const key = `h${level}Size` as const
                return (
                  <label key={level}>
                    H{level}
                    <input
                      type="number"
                      min={8}
                      max={36}
                      value={t.subheading[key]}
                      onChange={(event) => updateEditingTheme({
                        subheading: { ...t.subheading, [key]: Number(event.target.value) },
                      })}
                    />
                  </label>
                )
              })}
            </div>
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
                      try {
                        const ref = await storeThemeImage(file, 1200)
                        updateEditingTheme({
                          sceneBreak: { ...t.sceneBreak, customImageDataUrl: ref },
                        })
                      } catch (error) {
                        window.dispatchEvent(new CustomEvent('typesetly:notice', {
                          detail: error instanceof Error ? error.message : 'The image could not be imported.',
                        }))
                      }
                      event.target.value = ''
                    }}
                  />
                </label>
                {t.sceneBreak.customImageDataUrl && (
                  <div className="scene-image-setting">
                    <ResolvedImg src={t.sceneBreak.customImageDataUrl} alt="Current scene ornament" />
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
                {fontOptions(t.typography.bodyFont)}
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
              Note size
              <input
                type="number"
                min={7}
                max={18}
                step={0.5}
                value={t.notes.fontSize}
                onChange={(event) => updateEditingTheme({
                  notes: { ...t.notes, fontSize: Number(event.target.value) },
                })}
              />
            </label>
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
            {t.headerFooter.layout !== 'none' && (
              <div className="compact-grid">
                <label>
                  Header font
                  <select
                    value={t.headerFooter.font}
                    onChange={(event) => updateEditingTheme({
                      headerFooter: { ...t.headerFooter, font: event.target.value },
                    })}
                  >
                    {fontOptions(t.headerFooter.font)}
                  </select>
                </label>
                <label>
                  Header size
                  <input
                    type="number"
                    min={6}
                    max={18}
                    step={0.5}
                    value={t.headerFooter.size}
                    onChange={(event) => updateEditingTheme({
                      headerFooter: { ...t.headerFooter, size: Number(event.target.value) },
                    })}
                  />
                </label>
              </div>
            )}
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
          return (
            <article key={theme.id} className={active ? 'theme-card active' : 'theme-card'}>
              <button type="button" className="theme-preview" onClick={() => applyTheme(theme.id)}>
                <ThemeSample theme={theme} />
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
