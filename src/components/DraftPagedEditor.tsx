import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { DOMSerializer } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AttributedQuote,
  Callout,
  Footnote,
  HangingIndentBlock,
  ManuscriptImage,
  Monospace,
  PageBreak,
  SansSerif,
  SceneBreak,
  SmallCaps,
  Subscript,
  SuperscriptText,
  TextAppearance,
  VerseBlock,
} from '../editor/extensions'
import {
  FindHighlight,
  findHighlightKey,
  findTextOccurrences,
} from '../editor/find'
import { smartDashForInsertion, smartQuoteForInsertion } from '../editor/smartQuotes'
import {
  draftPageBodyHeight,
  estimateCharsPerPage,
  isEmptyPageHtml,
  joinChapterPages,
  normalizePageHtml,
  splitChapterIntoPages,
} from '../layout/chapterPages'
import {
  draftPageMetrics,
  draftStackHeight,
  type DraftPageMetrics,
} from '../layout/draftPages'
import type { ThemePrint } from '../types'

function sanitizePastedHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const allowed = new Set([
    'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'SUB', 'SUP',
    'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG',
  ])
  for (const element of Array.from(doc.body.querySelectorAll('script,style,iframe,object,embed,table'))) {
    element.replaceWith(doc.createTextNode(element.textContent || ''))
  }
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const keep =
        (element.tagName === 'A' && attribute.name === 'href') ||
        (element.tagName === 'IMG' && ['src', 'alt', 'title'].includes(attribute.name))
      if (!keep) element.removeAttribute(attribute.name)
    }
  }
  return doc.body.innerHTML
}

function createPageExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false },
      horizontalRule: false,
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder: 'Start writing…' }),
    CharacterCount,
    ManuscriptImage,
    SceneBreak,
    PageBreak,
    Footnote,
    Callout,
    SmallCaps,
    SansSerif,
    Monospace,
    Subscript,
    SuperscriptText,
    VerseBlock,
    HangingIndentBlock,
    AttributedQuote,
    TextAppearance,
    FindHighlight,
  ]
}

function serializeNode(editor: Editor, node: Parameters<DOMSerializer['serializeNode']>[0]) {
  const wrapper = document.createElement('div')
  wrapper.appendChild(DOMSerializer.fromSchema(editor.schema).serializeNode(node))
  return wrapper.innerHTML
}

function pageOverflows(editor: Editor, maxHeight: number) {
  return editor.view.dom.scrollHeight > maxHeight + 2
}

function countScenesBefore(editors: Array<Editor | null>, pageIndex: number, pos: number) {
  let total = 0
  for (let index = 0; index < pageIndex; index += 1) {
    const editor = editors[index]
    if (!editor) continue
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'sceneBreak') total += 1
    })
  }
  const editor = editors[pageIndex]
  if (editor) {
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'sceneBreak' && position < pos) total += 1
    })
  }
  return total
}

export interface DraftPagedEditorProps {
  chapterId: string
  chapterTitle: string
  chapterHtml: string
  language: string
  print: ThemePrint
  fontFamily: string
  fontSize: number
  lineHeight: number
  paragraphStyle: string
  textAlign: string
  spellcheck: boolean
  smartQuotes: boolean
  typewriterScrolling: boolean
  allowExternalProofreading: boolean
  firstPageChrome?: ReactNode
  onChapterHtmlChange: (html: string) => void
  onActiveEditorChange: (editor: Editor | null) => void
  onPageCountChange?: (count: number) => void
}

/**
 * Google Docs–style Draft surface: one TipTap contenteditable per page sheet.
 * Pages reassemble into a single chapter HTML for storage so LanguageTool
 * sees smaller per-page fields while Typesetly keeps one chapter document.
 */
export function DraftPagedEditor({
  chapterId,
  chapterTitle,
  chapterHtml,
  language,
  print,
  fontFamily,
  fontSize,
  lineHeight,
  paragraphStyle,
  textAlign,
  spellcheck,
  smartQuotes,
  typewriterScrolling,
  allowExternalProofreading,
  firstPageChrome,
  onChapterHtmlChange,
  onActiveEditorChange,
  onPageCountChange,
}: DraftPagedEditorProps) {
  const metrics = useMemo(() => draftPageMetrics(print), [print])
  const charsPerPage = useMemo(
    () => estimateCharsPerPage(metrics, fontSize, lineHeight),
    [fontSize, lineHeight, metrics],
  )
  const bodyHeight = useMemo(() => draftPageBodyHeight(metrics), [metrics])

  const [pages, setPages] = useState(() => splitChapterIntoPages(chapterHtml, charsPerPage))
  const editorsRef = useRef<Array<Editor | null>>([])
  const chromeHeightsRef = useRef<number[]>([])
  const lastEmittedRef = useRef(joinChapterPages(pages))
  const reflowTimerRef = useRef(0)
  const busyRef = useRef(false)
  const focusedIndexRef = useRef(0)

  const emitChapter = useCallback((nextPages: string[]) => {
    const html = joinChapterPages(nextPages)
    lastEmittedRef.current = html
    onChapterHtmlChange(html)
  }, [onChapterHtmlChange])

  const commitPages = useCallback((nextPages: string[]) => {
    const cleaned = nextPages.map(normalizePageHtml)
    let end = cleaned.length
    while (end > 1 && isEmptyPageHtml(cleaned[end - 1] || '')) end -= 1
    const next = cleaned.slice(0, Math.max(1, end))
    setPages(next)
    emitChapter(next)
    return next
  }, [emitChapter])

  useEffect(() => {
    if (chapterHtml === lastEmittedRef.current) return
    const next = splitChapterIntoPages(chapterHtml, charsPerPage)
    lastEmittedRef.current = joinChapterPages(next)
    setPages(next)
  }, [chapterHtml, chapterId, charsPerPage])

  useEffect(() => {
    onPageCountChange?.(pages.length)
  }, [onPageCountChange, pages.length])

  const focusPage = useCallback((index: number, where: 'start' | 'end' = 'start') => {
    const editor = editorsRef.current[index]
    if (!editor) return
    focusedIndexRef.current = index
    onActiveEditorChange(editor)
    const size = editor.state.doc.content.size
    const pos = where === 'end' ? Math.max(1, size - 1) : 1
    const selection = TextSelection.near(
      editor.state.doc.resolve(Math.min(pos, size)),
      where === 'end' ? -1 : 1,
    )
    editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
    editor.view.focus()
    editor.view.dom.closest('.editor-page-sheet')?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [onActiveEditorChange])

  const readLivePages = useCallback(() => {
    const live: string[] = []
    for (let index = 0; index < editorsRef.current.length; index += 1) {
      const editor = editorsRef.current[index]
      if (!editor) {
        if (pages[index]) live.push(normalizePageHtml(pages[index]))
        continue
      }
      live.push(normalizePageHtml(editor.getHTML()))
    }
    return live.length ? live : ['<p></p>']
  }, [pages])

  const reflowFrom = useCallback(async (fromIndex: number) => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      for (let pass = 0; pass < 24; pass += 1) {
        let moved = false
        const total = Math.max(editorsRef.current.length, pages.length)

        for (let index = fromIndex; index < total; index += 1) {
          let editor = editorsRef.current[index]
          if (!editor) continue
          const chrome = chromeHeightsRef.current[index] || 0
          const maxHeight = draftPageBodyHeight(metrics, chrome)

          // Push overflow onto the next page (block at a time).
          for (let push = 0; push < 30; push += 1) {
            editor = editorsRef.current[index]
            if (!editor || !pageOverflows(editor, maxHeight)) break
            const doc = editor.state.doc
            if (doc.childCount === 0) break
            // Keep at least an empty paragraph on the page.
            if (doc.childCount === 1 && !doc.textContent.trim()) break

            const last = doc.child(doc.childCount - 1)
            const from = doc.content.size - last.nodeSize
            if (from < 0) break
            const html = serializeNode(editor, last)
            editor.view.dispatch(editor.state.tr.delete(from, doc.content.size))

            const nextIndex = index + 1
            if (!editorsRef.current[nextIndex]) {
              const live = readLivePages()
              while (live.length <= nextIndex) live.push('<p></p>')
              commitPages(live)
              await new Promise((resolve) => window.requestAnimationFrame(resolve))
              await new Promise((resolve) => window.requestAnimationFrame(resolve))
            }

            const nextEditor = editorsRef.current[nextIndex]
            if (!nextEditor) break
            const combined = nextEditor.isEmpty
              ? html
              : `${html}${nextEditor.getHTML()}`
            nextEditor.commands.setContent(normalizePageHtml(combined), { emitUpdate: false })
            moved = true
          }

          // Pull from the next page while there is room.
          for (let pull = 0; pull < 20; pull += 1) {
            editor = editorsRef.current[index]
            const nextEditor = editorsRef.current[index + 1]
            if (!editor || !nextEditor || nextEditor.isEmpty) break
            if (pageOverflows(editor, maxHeight)) break

            const first = nextEditor.state.doc.child(0)
            const html = serializeNode(nextEditor, first)
            const before = editor.getHTML()
            editor.commands.setContent(normalizePageHtml(`${before}${html}`), { emitUpdate: false })
            if (pageOverflows(editor, maxHeight)) {
              editor.commands.setContent(normalizePageHtml(before), { emitUpdate: false })
              break
            }
            nextEditor.view.dispatch(nextEditor.state.tr.delete(0, first.nodeSize))
            if (nextEditor.isEmpty) {
              nextEditor.commands.setContent('<p></p>', { emitUpdate: false })
            }
            moved = true
          }
        }

        commitPages(readLivePages())
        if (!moved) break
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
      }
    } finally {
      busyRef.current = false
    }
  }, [commitPages, metrics, pages.length, readLivePages])

  const queueReflow = useCallback((fromIndex: number) => {
    window.clearTimeout(reflowTimerRef.current)
    reflowTimerRef.current = window.setTimeout(() => {
      void reflowFrom(fromIndex)
    }, 50)
  }, [reflowFrom])

  useEffect(() => () => window.clearTimeout(reflowTimerRef.current), [])

  useEffect(() => {
    const goToScene = (event: Event) => {
      const sceneIndex = (event as CustomEvent<{ index: number }>).detail.index
      let remaining = sceneIndex
      const editors = editorsRef.current
      for (let pageIndex = 0; pageIndex < editors.length; pageIndex += 1) {
        const editor = editors[pageIndex]
        if (!editor) continue
        const positions: number[] = [1]
        editor.state.doc.descendants((node, position) => {
          if (node.type.name === 'sceneBreak') positions.push(position + node.nodeSize)
        })
        const localScenes = Math.max(0, positions.length - 1)
        if (remaining <= localScenes) {
          const requested = positions[Math.max(0, Math.min(remaining, positions.length - 1))]
          const position = Math.max(0, Math.min(requested, editor.state.doc.content.size))
          const selection = TextSelection.near(editor.state.doc.resolve(position), 1)
          editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
          focusPage(pageIndex, 'start')
          return
        }
        remaining -= localScenes
      }
    }

    const findMatch = (event: Event) => {
      const detail = (event as CustomEvent<{
        chapterId: string
        query: string
        occurrence: number
        caseSensitive: boolean
        replaceWith?: string
      }>).detail
      if (!detail || detail.chapterId !== chapterId || !detail.query) return

      type Hit = { pageIndex: number; from: number; to: number }
      const hits: Hit[] = []
      editorsRef.current.forEach((editor, pageIndex) => {
        if (!editor) return
        editor.state.doc.descendants((node, position) => {
          if (!node.isText || !node.text) return
          for (const match of findTextOccurrences(node.text, detail.query, detail.caseSensitive)) {
            hits.push({
              pageIndex,
              from: position + match.index,
              to: position + match.index + match.length,
            })
          }
        })
      })

      editorsRef.current.forEach((editor) => {
        editor?.view.dispatch(editor.state.tr.setMeta(findHighlightKey, null))
      })

      const hit = hits[detail.occurrence]
      if (!hit) return
      const editor = editorsRef.current[hit.pageIndex]
      if (!editor) return

      const pageHits = hits
        .filter((entry) => entry.pageIndex === hit.pageIndex)
        .map((entry) => ({ from: entry.from, to: entry.to }))
      const localActive = pageHits.findIndex((entry) => entry.from === hit.from && entry.to === hit.to)

      let transaction = detail.replaceWith === undefined
        ? editor.state.tr.setSelection(TextSelection.create(editor.state.doc, hit.from, hit.to))
        : editor.state.tr.insertText(detail.replaceWith, hit.from, hit.to)
      transaction = detail.replaceWith === undefined
        ? transaction.setMeta(findHighlightKey, {
          matches: pageHits,
          activeIndex: Math.max(0, localActive),
        })
        : transaction.setMeta(findHighlightKey, null)
      editor.view.dispatch(transaction.scrollIntoView())
      focusedIndexRef.current = hit.pageIndex
      onActiveEditorChange(editor)
      window.requestAnimationFrame(() => {
        editor.view.dom.querySelector('.find-match-highlight')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }

    const clearFind = () => {
      editorsRef.current.forEach((editor) => {
        editor?.view.dispatch(editor.state.tr.setMeta(findHighlightKey, null))
      })
    }

    window.addEventListener('typesetly:scene', goToScene)
    window.addEventListener('typesetly:find-match', findMatch)
    window.addEventListener('typesetly:find-clear', clearFind)
    return () => {
      window.removeEventListener('typesetly:scene', goToScene)
      window.removeEventListener('typesetly:find-match', findMatch)
      window.removeEventListener('typesetly:find-clear', clearFind)
    }
  }, [chapterId, focusPage, onActiveEditorChange])

  // Initial height reflow after mount / chapter change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reflowFrom(0)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [chapterId, charsPerPage, reflowFrom])

  return (
    <div
      className="editor-pages-stack"
      style={{
        width: metrics.widthPx,
        minHeight: draftStackHeight(Math.max(1, pages.length), metrics),
        ['--page-width' as string]: `${metrics.widthPx}px`,
        ['--page-height' as string]: `${metrics.heightPx}px`,
        ['--page-gap' as string]: `${metrics.gapPx}px`,
      }}
    >
      {pages.map((pageHtml, index) => (
        <DraftPageSheet
          key={`${chapterId}-page-${index}`}
          index={index}
          html={pageHtml}
          metrics={metrics}
          bodyHeight={bodyHeight}
          fontFamily={fontFamily}
          fontSize={fontSize}
          lineHeight={lineHeight}
          paragraphStyle={paragraphStyle}
          textAlign={textAlign}
          spellcheck={spellcheck}
          smartQuotes={smartQuotes}
          typewriterScrolling={typewriterScrolling}
          allowExternalProofreading={allowExternalProofreading}
          language={language}
          chapterId={chapterId}
          chapterTitle={chapterTitle}
          chrome={index === 0 ? firstPageChrome : null}
          onChromeHeight={(height) => {
            chromeHeightsRef.current[index] = height
          }}
          onEditorReady={(editor) => {
            editorsRef.current[index] = editor
            if (index === focusedIndexRef.current) onActiveEditorChange(editor)
          }}
          onEditorDestroy={() => {
            if (editorsRef.current[index]) editorsRef.current[index] = null
          }}
          onFocus={() => {
            focusedIndexRef.current = index
            const editor = editorsRef.current[index]
            if (editor) onActiveEditorChange(editor)
          }}
          onSelectionScene={() => {
            const editor = editorsRef.current[index]
            if (!editor) return
            const sceneIndex = countScenesBefore(
              editorsRef.current,
              index,
              editor.state.selection.from,
            )
            window.dispatchEvent(new CustomEvent('typesetly:active-scene', {
              detail: { chapterId, index: sceneIndex },
            }))
          }}
          onUpdateHtml={(html) => {
            if (busyRef.current) return
            setPages((current) => {
              const next = current.map((page, pageIndex) => (
                pageIndex === index ? normalizePageHtml(html) : page
              ))
              emitChapter(next)
              return next
            })
            queueReflow(index)
          }}
          onRequestPrevious={() => {
            if (index > 0) focusPage(index - 1, 'end')
          }}
          onRequestNext={() => {
            setPages((current) => {
              if (index + 1 < current.length) return current
              const next = [...current, '<p></p>']
              emitChapter(next)
              return next
            })
            window.requestAnimationFrame(() => focusPage(index + 1, 'start'))
          }}
          onBackspaceAtStart={() => {
            if (index <= 0) return
            const current = editorsRef.current[index]
            const previous = editorsRef.current[index - 1]
            if (!previous) return

            if (current && isEmptyPageHtml(current.getHTML())) {
              setPages((currentPages) => {
                const next = currentPages.filter((_, pageIndex) => pageIndex !== index)
                const normalized = next.length ? next : ['<p></p>']
                emitChapter(normalized)
                return normalized
              })
              window.requestAnimationFrame(() => focusPage(Math.max(0, index - 1), 'end'))
              return
            }

            focusPage(index - 1, 'end')
            const size = previous.state.doc.content.size
            const from = Math.max(1, size - 1)
            if (from < size) {
              previous.chain().setTextSelection(size).deleteRange({ from, to: size }).run()
            }
            queueReflow(Math.max(0, index - 1))
          }}
        />
      ))}
    </div>
  )
}

interface DraftPageSheetProps {
  index: number
  html: string
  metrics: DraftPageMetrics
  bodyHeight: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  paragraphStyle: string
  textAlign: string
  spellcheck: boolean
  smartQuotes: boolean
  typewriterScrolling: boolean
  allowExternalProofreading: boolean
  language: string
  chapterId: string
  chapterTitle: string
  chrome?: ReactNode
  onChromeHeight: (height: number) => void
  onEditorReady: (editor: Editor) => void
  onEditorDestroy: () => void
  onFocus: () => void
  onSelectionScene: () => void
  onUpdateHtml: (html: string) => void
  onRequestPrevious: () => void
  onRequestNext: () => void
  onBackspaceAtStart: () => void
}

function DraftPageSheet({
  index,
  html,
  metrics,
  bodyHeight,
  fontFamily,
  fontSize,
  lineHeight,
  paragraphStyle,
  textAlign,
  spellcheck,
  smartQuotes,
  typewriterScrolling,
  allowExternalProofreading,
  language,
  chapterId,
  chapterTitle,
  chrome,
  onChromeHeight,
  onEditorReady,
  onEditorDestroy,
  onFocus,
  onSelectionScene,
  onUpdateHtml,
  onRequestPrevious,
  onRequestNext,
  onBackspaceAtStart,
}: DraftPageSheetProps) {
  const chromeRef = useRef<HTMLDivElement>(null)
  const [chromeHeight, setChromeHeight] = useState(0)
  const skipSyncRef = useRef(false)

  useLayoutEffect(() => {
    const node = chromeRef.current
    if (!node) {
      setChromeHeight(0)
      onChromeHeight(0)
      return
    }
    const measure = () => {
      const height = node.getBoundingClientRect().height
      setChromeHeight(height)
      onChromeHeight(height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [chrome, onChromeHeight])

  const maxBody = Math.max(120, bodyHeight - chromeHeight)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createPageExtensions(),
    content: html || '<p></p>',
    onCreate: ({ editor: ed }) => onEditorReady(ed),
    onDestroy: () => onEditorDestroy(),
    onFocus: () => onFocus(),
    onUpdate: ({ editor: ed }) => {
      if (skipSyncRef.current) return
      onUpdateHtml(ed.getHTML())
      if (typewriterScrolling) {
        window.requestAnimationFrame(() => {
          const selectionNode = ed.view.domAtPos(ed.state.selection.anchor).node
          const element =
            selectionNode instanceof Element ? selectionNode : selectionNode.parentElement
          element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })
      }
    },
    editorProps: {
      attributes: {
        class: 'prose-editor',
        spellcheck: spellcheck ? 'true' : 'false',
      },
      transformPastedHTML: sanitizePastedHtml,
      handleTextInput(view, from, to, text) {
        if (!smartQuotes) return false
        const previousCharacter = view.state.doc.textBetween(Math.max(0, from - 1), from)
        if (text === '"' || text === "'") {
          const converted = smartQuoteForInsertion(text, previousCharacter)
          view.dispatch(view.state.tr.insertText(converted, from, to))
          return true
        }
        const dash = smartDashForInsertion(text, previousCharacter)
        if (dash) {
          view.dispatch(view.state.tr.insertText(dash.text, from - dash.deleteBefore, to))
          return true
        }
        return false
      },
      handleKeyDown(view, event) {
        const { empty, $anchor } = view.state.selection
        if (!empty) return false
        const atStart = $anchor.pos <= 1
        const atEnd = $anchor.pos >= view.state.doc.content.size - 1

        if (event.key === 'Backspace' && atStart) {
          event.preventDefault()
          onBackspaceAtStart()
          return true
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && atStart) {
          event.preventDefault()
          onRequestPrevious()
          return true
        }
        if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && atEnd) {
          event.preventDefault()
          onRequestNext()
          return true
        }
        return false
      },
    },
  }, [chapterId, index])

  useEffect(() => {
    if (!editor) return
    onEditorReady(editor)
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!editor) return
    const current = normalizePageHtml(editor.getHTML())
    const incoming = normalizePageHtml(html)
    if (current === incoming) return
    skipSyncRef.current = true
    editor.commands.setContent(incoming, { emitUpdate: false })
    skipSyncRef.current = false
  }, [editor, html])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    dom.setAttribute('data-lt-active', allowExternalProofreading ? 'true' : 'false')
    dom.setAttribute('data-typesetly-chapter-id', chapterId)
    dom.setAttribute('data-document-id', `chapter-${chapterId}-page-${index + 1}`)
    dom.setAttribute('data-chapter-title', chapterTitle || 'Chapter')
    dom.setAttribute('aria-label', `${chapterTitle || 'Chapter'}, page ${index + 1}`)
    dom.setAttribute('lang', language || 'en')
    dom.style.maxHeight = `${maxBody}px`
    dom.style.overflow = 'hidden'
  }, [
    allowExternalProofreading,
    chapterId,
    chapterTitle,
    editor,
    index,
    language,
    maxBody,
  ])

  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', onSelectionScene)
    return () => {
      editor.off('selectionUpdate', onSelectionScene)
    }
  }, [editor, onSelectionScene])

  return (
    <div
      className="editor-page-sheet"
      data-page-index={index}
      style={{
        width: metrics.widthPx,
        height: metrics.heightPx,
        marginBottom: metrics.gapPx,
        paddingTop: metrics.marginTopPx,
        paddingRight: metrics.marginRightPx,
        paddingBottom: metrics.marginBottomPx,
        paddingLeft: metrics.marginLeftPx,
        fontFamily,
        fontSize,
        lineHeight,
      }}
    >
      {chrome ? <div ref={chromeRef} className="editor-page-chrome">{chrome}</div> : null}
      <div className="editor-page-body" style={{ maxHeight: maxBody, overflow: 'hidden' }}>
        <EditorContent
          editor={editor}
          spellCheck={spellcheck}
          data-lt-active={allowExternalProofreading ? 'true' : 'false'}
          className={`editor-content ${paragraphStyle} ${textAlign}`}
        />
      </div>
    </div>
  )
}
