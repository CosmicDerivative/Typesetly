import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { DOMSerializer, Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
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
  PageContinuation,
  PageBreak,
  SansSerif,
  SceneBreak,
  SmallCaps,
  Subscript,
  SuperscriptText,
  TextAppearance,
  VerseBlock,
} from '../editor/extensions'
import { LitRpgBlockEditorExtension } from '../editor/LitRpgBlockEditorExtension'
import { dropLitRpgAcrossPages } from '../editor/litrpgDrag'
import {
  externalProofreadingEnabledForPage,
  FindHighlight,
  findHighlightKey,
  findTextOccurrences,
  type ExternalProofreadingMode,
} from '../editor/find'
import { smartDashForInsertion, smartQuoteForInsertion } from '../editor/smartQuotes'
import {
  draftPageBodyHeight,
  estimateCharsPerPage,
  isEmptyPageHtml,
  joinChapterPages,
  lastContentPageIndex,
  normalizePageHtml,
  pruneEmptyDraftPages,
  draftChromeOccupiedHeight,
  draftContentExceedsPageClip,
  draftOverflowMoveIndexPreferTrailingAfterLitRpg,
  splitChapterIntoPages,
} from '../layout/chapterPages'
import {
  draftPageMetrics,
  draftStackHeight,
  type DraftPageMetrics,
} from '../layout/draftPages'
import type { ThemePrint } from '../types'

interface CrossPageHighlightRange {
  from: number
  to: number
}

interface CrossPageEditorRange extends CrossPageHighlightRange {
  editor: Editor
  pageIndex: number
}

interface CrossPageSelection {
  ranges: CrossPageEditorRange[]
  text: string
}

export interface CrossPageSelectionSummary {
  pageCount: number
  text: string
}

type CrossPageCommand =
  | { action: 'bold' | 'italic' | 'underline' | 'strike' | 'code' }
  | { action: 'paragraph' | 'blockquote' | 'bulletList' | 'orderedList' }
  | { action: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { action: 'textAlign'; value: 'left' | 'center' | 'right' | 'justify' }
  | { action: 'textMark'; mark: 'smallCaps' | 'sansSerif' | 'monospace' | 'subscript' | 'superscriptText' }
  | { action: 'clearMarks' }
  | {
      action: 'textAppearance'
      attribute: 'fontFamily' | 'fontSize' | 'color' | 'backgroundColor' | 'letterSpacing' | 'textTransform'
      value: string
    }
  | { action: 'clearTextAppearance' }
  | { action: 'link'; href: string }

const crossPageHighlightKey = new PluginKey<DecorationSet>('crossPageHighlight')

const CrossPageHighlight = Extension.create({
  name: 'crossPageHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: crossPageHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, current) {
            const range = transaction.getMeta(crossPageHighlightKey) as
              | CrossPageHighlightRange
              | null
              | undefined
            if (range === undefined) return current.map(transaction.mapping, transaction.doc)
            if (!range || range.from >= range.to) return DecorationSet.empty
            return DecorationSet.create(transaction.doc, [
              Decoration.inline(range.from, range.to, {
                class: 'cross-page-selection',
              }),
            ])
          },
        },
        props: {
          decorations(state) {
            return crossPageHighlightKey.getState(state) || DecorationSet.empty
          },
        },
      }),
    ]
  },
})

function setCrossPageHighlight(editor: Editor, range: CrossPageHighlightRange | null) {
  if (editor.isDestroyed) return
  editor.view.dispatch(
    editor.state.tr
      .setMeta(crossPageHighlightKey, range)
      .setMeta('addToHistory', false),
  )
}

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
    ManuscriptImage,
    SceneBreak,
    PageBreak,
    Footnote,
    Callout,
    LitRpgBlockEditorExtension,
    SmallCaps,
    SansSerif,
    Monospace,
    Subscript,
    SuperscriptText,
    VerseBlock,
    HangingIndentBlock,
    AttributedQuote,
    TextAppearance,
    PageContinuation,
    FindHighlight,
    CrossPageHighlight,
  ]
}

function serializeNode(editor: Editor, node: Parameters<DOMSerializer['serializeNode']>[0]) {
  const wrapper = document.createElement('div')
  wrapper.appendChild(DOMSerializer.fromSchema(editor.schema).serializeNode(node))
  return wrapper.innerHTML
}

function serializeDocument(editor: Editor, doc: ProseMirrorNode) {
  const wrapper = document.createElement('div')
  wrapper.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(doc.content))
  return wrapper.innerHTML
}

/** Atom / structural blocks that must never be mid-split across Draft pages. */
function isUnsplittablePageNode(node: ProseMirrorNode) {
  if (node.isAtom) return true
  return node.type.name === 'litrpgBlock'
    || node.type.name === 'manuscriptImage'
    || node.type.name === 'sceneBreak'
    || node.type.name === 'pageBreak'
}

/** True when every top-level node is an empty paragraph (aside from `except`). */
function pageHasOnlyEmptyParagraphs(
  doc: ProseMirrorNode,
  except?: ProseMirrorNode | null,
) {
  for (let index = 0; index < doc.childCount; index += 1) {
    const child = doc.child(index)
    if (except && child === except) continue
    if (child.type.name !== 'paragraph' || child.textContent.trim()) return false
  }
  return true
}

function isEmptyParagraphNode(node: ProseMirrorNode) {
  return node.type.name === 'paragraph' && !node.textContent.trim()
}

/** Start index of the trailing empty-paragraph run, or -1 if the page does not end blank. */
function firstTrailingEmptyParagraphIndex(doc: ProseMirrorNode) {
  if (doc.childCount === 0) return -1
  if (!isEmptyParagraphNode(doc.child(doc.childCount - 1))) return -1
  let index = doc.childCount - 1
  while (index > 0 && isEmptyParagraphNode(doc.child(index - 1))) {
    index -= 1
  }
  return index
}

/**
 * Drop a trailing empty-paragraph run in one transaction.
 * Used when sheet-padding blanks still overflow after Enter moved the caret
 * blank — must not delete one-by-one with a layout measure each time (that
 * freezes Draft on mount when a page carries a long blank run).
 */
function shedTrailingEmptyPadding(editor: Editor) {
  const doc = editor.state.doc
  const trailingStart = firstTrailingEmptyParagraphIndex(doc)
  if (trailingStart < 0) return false
  if (trailingStart === 0) {
    if (doc.childCount <= 1) return false
    editor.commands.setContent('<p></p>', { emitUpdate: false })
    return true
  }
  const deleteFrom = positionAtChildIndex(doc, trailingStart)
  editor.view.dispatch(
    editor.state.tr
      .delete(deleteFrom, doc.content.size)
      .setMeta(PAGE_REFLOW_META, true)
      .setMeta('addToHistory', false),
  )
  return true
}

function positionAtChildIndex(doc: ProseMirrorNode, childIndex: number) {
  let position = 0
  for (let index = 0; index < childIndex; index += 1) {
    position += doc.child(index).nodeSize
  }
  return position
}

/**
 * Measure a candidate page document using the live editor's width, typography,
 * paragraph mode, and CSS without mutating the visible editor or its selection.
 */
function measureProbeHeight(editor: Editor, doc: ProseMirrorNode) {
  const live = editor.view.dom
  const liveWrapper = live.parentElement
  const wrapper = liveWrapper?.cloneNode(false) as HTMLElement | undefined
  const probe = live.cloneNode(false) as HTMLElement
  const computed = window.getComputedStyle(live)
  const width = live.getBoundingClientRect().width

  probe.removeAttribute('contenteditable')
  probe.removeAttribute('data-lt-active')
  probe.innerHTML = serializeDocument(editor, doc)
  // Static HTML from DOMSerializer omits the React LitRPG node-view chrome
  // (inline toolbar via padding-top). Match that reserved height so candidates
  // are not underestimated and pulled onto a page that then permanently overflows.
  for (const block of probe.querySelectorAll('.litrpg-block')) {
    const element = block as HTMLElement
    element.classList.add('litrpg-block-node-view')
    if (!element.style.paddingTop) element.style.paddingTop = '30px'
    const canvasHeight = Number(element.getAttribute('data-canvas-height') || 0)
    if (canvasHeight > 0) {
      const canvas = element.querySelector('.litrpg-freeform-canvas')
      if (canvas instanceof HTMLElement && !canvas.style.height) {
        canvas.style.height = `${canvasHeight}px`
      }
    }
  }
  probe.style.width = `${width}px`
  probe.style.maxHeight = 'none'
  probe.style.height = 'auto'
  probe.style.minHeight = '0'
  probe.style.overflow = 'visible'
  probe.style.fontFamily = computed.fontFamily
  probe.style.fontSize = computed.fontSize
  probe.style.fontWeight = computed.fontWeight
  probe.style.letterSpacing = computed.letterSpacing
  probe.style.lineHeight = computed.lineHeight
  probe.style.textAlign = computed.textAlign

  const host = wrapper || document.createElement('div')
  host.style.position = 'fixed'
  host.style.zIndex = '-1'
  host.style.top = '0'
  host.style.left = '-100000px'
  host.style.width = `${liveWrapper?.getBoundingClientRect().width || width}px`
  host.style.height = 'auto'
  host.style.maxHeight = 'none'
  host.style.overflow = 'visible'
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  host.appendChild(probe)
  document.body.appendChild(host)
  const height = probe.scrollHeight
  host.remove()
  return height
}

const measurementCalibration = new WeakMap<
  Editor,
  { doc: ProseMirrorNode; signature: string; offset: number }
>()

/** Probe packing must leave a hair of slack so a “fits” candidate cannot sit on the clip edge. */
const PAGE_FIT_SLACK_PX = 1

/**
 * True when live block boxes extend past the sheet body clip.
 *
 * Grammar tools force overflow:visible on the prose-editor, so scrollHeight is
 * often clamped and a probe can under-count. Overflowed blocks then stay in the
 * previous page’s doc and paint as a half-line “skimming” under overflow:hidden
 * on `.editor-page-body` — looking like a hidden page bleeding into the prior sheet.
 */
function pageContentOverflowsBody(editor: Editor) {
  const dom = editor.view.dom
  const body = dom.closest('.editor-page-body')
  if (!(body instanceof HTMLElement)) return false
  const clipBottom = body.getBoundingClientRect().bottom
  for (let index = 0; index < dom.children.length; index += 1) {
    const child = dom.children[index]
    if (!(child instanceof HTMLElement)) continue
    if (draftContentExceedsPageClip(child.getBoundingClientRect().bottom, clipBottom)) {
      return true
    }
  }
  return false
}

function measureCandidateHeight(editor: Editor, doc: ProseMirrorNode) {
  const live = editor.view.dom
  const computed = window.getComputedStyle(live)
  const signature = [
    live.getBoundingClientRect().width,
    computed.fontFamily,
    computed.fontSize,
    computed.fontWeight,
    computed.letterSpacing,
    computed.lineHeight,
    computed.textAlign,
    live.style.minHeight,
    live.style.maxHeight,
    computed.minHeight,
    computed.maxHeight,
  ].join('|')
  let calibration = measurementCalibration.get(editor)
  if (
    !calibration
    || calibration.doc !== editor.state.doc
    || calibration.signature !== signature
  ) {
    const baseline = measureProbeHeight(editor, editor.state.doc)
    calibration = {
      doc: editor.state.doc,
      signature,
      // Ignore clamped scrollHeight when overflow is visible + max-height is set;
      // only keep a positive live-vs-probe delta for node-view chrome (LitRPG).
      offset: Math.max(0, live.scrollHeight - baseline),
    }
    // If scrollHeight is clamped to max-height, the delta is meaningless/negative
    // and must not inflate candidates (that re-created false "always overflowing").
    const maxHeightPx = Number.parseFloat(live.style.maxHeight || computed.maxHeight)
    if (
      Number.isFinite(maxHeightPx)
      && maxHeightPx > 0
      && live.scrollHeight <= maxHeightPx + 2
      && baseline > live.scrollHeight + 2
    ) {
      calibration.offset = 0
    }
    measurementCalibration.set(editor, calibration)
  }
  return measureProbeHeight(editor, doc) + calibration.offset
}

function candidateFitsPage(editor: Editor, doc: ProseMirrorNode, maxHeight: number) {
  return measureCandidateHeight(editor, doc) <= maxHeight - PAGE_FIT_SLACK_PX
}

interface ParagraphSplitBoundary {
  prefixEnd: number
  suffixStart: number
}

function textblockSplitOffsets(node: ProseMirrorNode) {
  if (!node.isTextblock || node.type.name !== 'paragraph') return []
  const offsets: ParagraphSplitBoundary[] = []
  node.descendants((child, position) => {
    if (!child.isText || !child.text) return
    for (const match of child.text.matchAll(/\s+/g)) {
      const prefixEnd = position + (match.index || 0)
      const suffixStart = prefixEnd + match[0].length
      const before = node.textBetween(0, prefixEnd, ' ').trim().split(/\s+/).filter(Boolean)
      const after = node.textBetween(suffixStart, node.content.size, ' ').trim().split(/\s+/).filter(Boolean)
      // Avoid a one-word widow/orphan while still using the available page.
      if (before.length >= 2 && after.length >= 2) {
        offsets.push({ prefixEnd, suffixStart })
      }
    }
  })
  return offsets.filter((boundary, index) => (
    index === 0
    || boundary.prefixEnd !== offsets[index - 1]?.prefixEnd
  ))
}

function withLastNode(doc: ProseMirrorNode, replacement: ProseMirrorNode) {
  const last = doc.lastChild
  if (!last) return doc
  const before = doc.content.cut(0, doc.content.size - last.nodeSize)
  return doc.type.create(doc.attrs, before.append(Fragment.from(replacement)))
}

function withNodeAtIndex(
  doc: ProseMirrorNode,
  index: number,
  replacement: ProseMirrorNode,
) {
  if (index < 0 || index >= doc.childCount) return doc
  const nodes: ProseMirrorNode[] = []
  for (let childIndex = 0; childIndex < doc.childCount; childIndex += 1) {
    nodes.push(childIndex === index ? replacement : doc.child(childIndex))
  }
  return doc.type.create(doc.attrs, Fragment.from(nodes))
}

function withAppendedNode(doc: ProseMirrorNode, node: ProseMirrorNode) {
  return doc.type.create(doc.attrs, doc.content.append(Fragment.from(node)))
}

function withPageNodeAppended(doc: ProseMirrorNode, node: ProseMirrorNode) {
  const last = doc.lastChild
  if (
    node.type.name === 'paragraph'
    && node.attrs.pageContinuation
    && last?.type === node.type
  ) {
    const seam = node.attrs.pageContinuationSpace
      ? Fragment.from(doc.type.schema.text(' '))
      : Fragment.empty
    const merged = last.type.create(
      last.attrs,
      last.content.append(seam).append(node.content),
      last.marks,
    )
    return withLastNode(doc, merged)
  }
  return withAppendedNode(doc, node)
}

function documentWithOnlyNode(doc: ProseMirrorNode, node: ProseMirrorNode) {
  return doc.type.create(doc.attrs, Fragment.from(node))
}

function hasTwoRenderedLines(editor: Editor, doc: ProseMirrorNode, node: ProseMirrorNode) {
  const lineHeight = Number.parseFloat(window.getComputedStyle(editor.view.dom).lineHeight) || 24
  return measureCandidateHeight(editor, documentWithOnlyNode(doc, node)) >= lineHeight * 1.75
}

function splitParagraphForCurrentPage(
  editor: Editor,
  node: ProseMirrorNode,
  buildCandidate: (prefix: ProseMirrorNode) => ProseMirrorNode,
  maxHeight: number,
) {
  const offsets = textblockSplitOffsets(node)
  if (!offsets.length) return null
  let low = 0
  let high = offsets.length - 1
  let fittingOffset = -1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const boundary = offsets[middle]!
    const prefix = node.type.create(
      node.attrs,
      node.content.cut(0, boundary.prefixEnd),
      node.marks,
    )
    if (candidateFitsPage(editor, buildCandidate(prefix), maxHeight)) {
      fittingOffset = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  if (fittingOffset < 0) return null
  // Avoid leaving a short final line alone on either page. Move the boundary
  // backward until the continuation renders as at least two lines.
  while (fittingOffset >= 0) {
    const boundary = offsets[fittingOffset]!
    const suffix = node.type.create(
      {
        ...node.attrs,
        pageContinuation: true,
        pageContinuationSpace: true,
      },
      node.content.cut(boundary.suffixStart, node.content.size),
      node.marks,
    )
    if (hasTwoRenderedLines(editor, editor.state.doc, suffix)) break
    fittingOffset -= 1
  }
  if (fittingOffset < 0) return null
  const boundary = offsets[fittingOffset]!
  const prefix = node.type.create(
    node.attrs,
    node.content.cut(0, boundary.prefixEnd),
    node.marks,
  )
  if (!hasTwoRenderedLines(editor, editor.state.doc, prefix)) return null
  return {
    prefix,
    suffix: node.type.create(
      {
        ...node.attrs,
        pageContinuation: true,
        pageContinuationSpace: true,
      },
      node.content.cut(boundary.suffixStart, node.content.size),
      node.marks,
    ),
  }
}

function pageOverflows(editor: Editor, maxHeight: number) {
  // Prefer the painted clip: probe height can under-count, leaving overflowed
  // blocks hidden in the previous sheet (half-line peek at the body edge).
  if (pageContentOverflowsBody(editor)) return true
  // Grammar-tool overlays need overflow:visible on the live prose-editor, which
  // clamps scrollHeight to the used/max height in Chromium — so a full page
  // never reports overflow and Enter blanks stretch the sheet instead of moving.
  // Measure unconstrained content height (same probe as pull-fit checks).
  return !candidateFitsPage(editor, editor.state.doc, maxHeight)
}

const PAGE_REFLOW_META = 'typesetlyPageReflow'

function cloneNodeForEditor(editor: Editor, node: ProseMirrorNode) {
  return editor.schema.nodeFromJSON(node.toJSON())
}

function replaceDocumentPreservingSelection(editor: Editor, doc: ProseMirrorNode) {
  const { anchor, head } = editor.state.selection
  let transaction = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, doc.content)
    .setMeta(PAGE_REFLOW_META, true)
    .setMeta('addToHistory', false)
  const nextSize = transaction.doc.content.size
  const nextAnchor = Math.max(0, Math.min(anchor, nextSize))
  const nextHead = Math.max(0, Math.min(head, nextSize))
  try {
    transaction = transaction.setSelection(
      TextSelection.create(transaction.doc, nextAnchor, nextHead),
    )
  } catch {
    transaction = transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(nextHead), head >= anchor ? 1 : -1),
    )
  }
  editor.view.dispatch(transaction)
}

/** Keep the caret’s page sheet (and desk scroller) in view while typing. */
function scrollCaretIntoView(editor: Editor, mode: 'nearest' | 'center' = 'nearest') {
  try {
    const coords = editor.view.coordsAtPos(editor.state.selection.head)
    const desk = editor.view.dom.closest('.editor-scroll')
    if (!(desk instanceof HTMLElement)) return
    const deskRect = desk.getBoundingClientRect()
    if (mode === 'center') {
      const target = deskRect.top + deskRect.height * 0.48
      desk.scrollTop += coords.top - target
      return
    }
    const margin = 64
    if (coords.top < deskRect.top + margin) {
      desk.scrollTop -= deskRect.top + margin - coords.top
    } else if (coords.bottom > deskRect.bottom - margin) {
      desk.scrollTop += coords.bottom - (deskRect.bottom - margin)
    }
  } catch {
    // Selection can be briefly invalid while pages remount during reflow.
  }
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
  externalProofreading: ExternalProofreadingMode
  firstPageChrome?: ReactNode
  onChapterHtmlChange: (html: string) => void
  onActiveEditorChange: (editor: Editor | null) => void
  onPageCountChange?: (count: number) => void
  onCrossPageSelectionChange?: (selection: CrossPageSelectionSummary | null) => void
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
  externalProofreading,
  firstPageChrome,
  onChapterHtmlChange,
  onActiveEditorChange,
  onPageCountChange,
  onCrossPageSelectionChange,
}: DraftPagedEditorProps) {
  const metrics = useMemo(() => draftPageMetrics(print), [print])
  const charsPerPage = useMemo(
    () => estimateCharsPerPage(metrics, fontSize, lineHeight),
    [fontSize, lineHeight, metrics],
  )
  const bodyHeight = useMemo(() => draftPageBodyHeight(metrics), [metrics])
  const [pages, setPages] = useState(() => splitChapterIntoPages(chapterHtml, charsPerPage))
  const [activePageIndex, setActivePageIndex] = useState(0)
  const editorsRef = useRef<Array<Editor | null>>([])
  const chromeHeightsRef = useRef<number[]>([])
  const lastEmittedRef = useRef(joinChapterPages(pages))
  const pendingEmitRef = useRef<{
    html: string
    callback: (html: string) => void
  } | null>(null)
  const emitTimerRef = useRef(0)
  const reflowTimerRef = useRef(0)
  const busyRef = useRef(false)
  const focusedIndexRef = useRef(0)
  const contentEpochRef = useRef(0)
  const renderedChapterIdRef = useRef(chapterId)
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const stackRef = useRef<HTMLDivElement>(null)
  const dragAnchorRef = useRef<{ pageIndex: number; pos: number } | null>(null)
  const crossPageSelectionRef = useRef<CrossPageSelection | null>(null)
  /** After overflow moves the caret’s block, focus this page once reflow settles. */
  const pendingCaretRef = useRef<{
    pageIndex: number
    where?: 'start' | 'end'
    position?: number
  } | null>(null)

  const flushChapter = useCallback(() => {
    window.clearTimeout(emitTimerRef.current)
    emitTimerRef.current = 0
    const pending = pendingEmitRef.current
    pendingEmitRef.current = null
    if (!pending || pending.html === lastEmittedRef.current) return
    lastEmittedRef.current = pending.html
    pending.callback(pending.html)
  }, [])

  const emitChapter = useCallback((nextPages: string[]) => {
    const html = joinChapterPages(nextPages)
    if (html === lastEmittedRef.current && !pendingEmitRef.current) return
    pendingEmitRef.current = { html, callback: onChapterHtmlChange }
    window.clearTimeout(emitTimerRef.current)
    // Updating the whole book makes every outline and status consumer render.
    // Keep typing page-local, then publish one coherent chapter snapshot once
    // the writer pauses briefly.
    emitTimerRef.current = window.setTimeout(flushChapter, 180)
  }, [flushChapter, onChapterHtmlChange])

  const shouldPreserveTrailingBlankPages = useCallback((pageHtmls: string[]) => {
    // Pending Enter/overflow handoff — keep the destination blank sheet.
    if (pendingCaretRef.current) return true

    const lastContent = lastContentPageIndex(pageHtmls)
    const focused = focusedIndexRef.current

    // Entirely blank chapter: keep sheets the author is editing.
    if (lastContent < 0) return pageHtmls.length > 0

    // Caret is on an intentional trailing blank end page.
    if (focused > lastContent) return true

    // Caret on the last content page only while trailing empties are the active
    // Enter run (about to overflow) — not for the whole busy/reflow window.
    if (focused === lastContent) {
      const editor = editorsRef.current[lastContent]
      if (editor) {
        const doc = editor.state.doc
        const trailingStart = firstTrailingEmptyParagraphIndex(doc)
        if (trailingStart >= 0) {
          const selectionFrom = editor.state.selection.from
          let childStart = 0
          for (let childIndex = 0; childIndex < doc.childCount; childIndex += 1) {
            const childEnd = childStart + doc.child(childIndex).nodeSize
            if (
              selectionFrom >= childStart
              && selectionFrom <= childEnd
              && childIndex >= trailingStart
            ) {
              return true
            }
            childStart = childEnd
          }
        }
      }
      // Last content page still overflows onto already-minted trailing blanks.
      if (lastContent < pageHtmls.length - 1) {
        const previous = editorsRef.current[lastContent]
        const chrome = chromeHeightsRef.current[lastContent] || 0
        if (previous && pageOverflows(previous, draftPageBodyHeight(metrics, chrome))) {
          return true
        }
      }
    }
    return false
  }, [metrics])

  const commitPages = useCallback((
    nextPages: string[],
    options?: { preserveLastEmptyPage?: boolean; pruneEmptyPages?: boolean },
  ) => {
    // Never preserve solely because reflow is busy — that kept every minted
    // trailing blank and looped empty-page growth.
    const preserveLastEmptyPage = options?.preserveLastEmptyPage
      ?? shouldPreserveTrailingBlankPages(nextPages)
    // Mid-reflow page growth must not prune: removing a middle empty sheet
    // remounts every later TipTap instance and invalidates page indices.
    const normalized = options?.pruneEmptyPages === false
      ? (nextPages.length ? nextPages : ['<p></p>']).map(normalizePageHtml)
      : pruneEmptyDraftPages(nextPages, { preserveLastEmptyPage })
    pagesRef.current = normalized
    if (editorsRef.current.length > normalized.length) {
      editorsRef.current.length = normalized.length
    }
    if (chromeHeightsRef.current.length > normalized.length) {
      chromeHeightsRef.current.length = normalized.length
    }
    setPages((current) => {
      if (
        current.length === normalized.length
        && current.every((page, index) => page === normalized[index])
      ) {
        return current
      }
      return normalized
    })
    emitChapter(normalized)
    return normalized
  }, [emitChapter, shouldPreserveTrailingBlankPages])

  useEffect(() => {
    if (chapterId !== renderedChapterIdRef.current) {
      flushChapter()
      renderedChapterIdRef.current = chapterId
      contentEpochRef.current += 1
      pendingCaretRef.current = null
      focusedIndexRef.current = 0
      setActivePageIndex(0)
      const next = splitChapterIntoPages(chapterHtml, charsPerPage)
      lastEmittedRef.current = chapterHtml
      pagesRef.current = next
      setPages(next)
      return
    }
    if (
      chapterHtml === lastEmittedRef.current
      || chapterHtml === pendingEmitRef.current?.html
      || pendingEmitRef.current
    ) return
    // External chapter writes (addScene, restore, etc.) must win over an
    // in-flight height reflow that still holds stale per-page HTML.
    contentEpochRef.current += 1
    pendingCaretRef.current = null
    const next = splitChapterIntoPages(chapterHtml, charsPerPage)
    lastEmittedRef.current = chapterHtml
    pagesRef.current = next
    setPages(next)
  }, [chapterHtml, chapterId, charsPerPage, flushChapter])

  useEffect(() => () => {
    flushChapter()
    window.clearTimeout(emitTimerRef.current)
  }, [flushChapter])

  useEffect(() => {
    onPageCountChange?.(pages.length)
  }, [onPageCountChange, pages.length])

  useEffect(() => {
    const lastIndex = Math.max(0, pages.length - 1)
    focusedIndexRef.current = Math.min(focusedIndexRef.current, lastIndex)
    setActivePageIndex((current) => Math.min(current, lastIndex))
  }, [pages.length])

  const focusPage = useCallback((
    index: number,
    where: 'start' | 'end' = 'start',
    requestedPosition?: number,
  ) => {
    const editor = editorsRef.current[index]
    if (!editor) return
    focusedIndexRef.current = index
    setActivePageIndex(index)
    onActiveEditorChange(editor)
    const size = editor.state.doc.content.size
    const pos = requestedPosition === undefined
      ? (where === 'end' ? Math.max(1, size - 1) : 1)
      : Math.max(1, Math.min(requestedPosition, size))
    const selection = TextSelection.near(
      editor.state.doc.resolve(Math.min(pos, size)),
      where === 'end' ? -1 : 1,
    )
    editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
    editor.view.focus()
    scrollCaretIntoView(editor, 'nearest')
  }, [onActiveEditorChange])

  const readLivePages = useCallback(() => {
    const live: string[] = []
    const snapshot = pagesRef.current
    const total = Math.max(editorsRef.current.length, snapshot.length)
    for (let index = 0; index < total; index += 1) {
      const editor = editorsRef.current[index]
      if (!editor) {
        if (snapshot[index]) live.push(normalizePageHtml(snapshot[index]))
        continue
      }
      live.push(normalizePageHtml(editor.getHTML()))
    }
    return live.length ? live : ['<p></p>']
  }, [])

  const clearCrossPageSelection = useCallback(() => {
    crossPageSelectionRef.current = null
    for (const editor of editorsRef.current) {
      if (editor) setCrossPageHighlight(editor, null)
    }
    onCrossPageSelectionChange?.(null)
  }, [onCrossPageSelectionChange])

  const pagePositionAtPoint = useCallback((clientX: number, clientY: number) => {
    let closest:
      | { editor: Editor; pageIndex: number; rect: DOMRect; distance: number }
      | null = null
    for (let pageIndex = 0; pageIndex < editorsRef.current.length; pageIndex += 1) {
      const editor = editorsRef.current[pageIndex]
      if (!editor || editor.isDestroyed) continue
      const rect = editor.view.dom.getBoundingClientRect()
      if (clientX < rect.left - 48 || clientX > rect.right + 48) continue
      const distance = clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : 0
      if (!closest || distance < closest.distance) {
        closest = { editor, pageIndex, rect, distance }
      }
    }
    if (!closest) return null
    const { editor, pageIndex, rect } = closest
    const left = Math.max(rect.left + 2, Math.min(clientX, rect.right - 2))
    const top = Math.max(rect.top + 2, Math.min(clientY, rect.bottom - 2))
    const resolved = editor.view.posAtCoords({ left, top })
    const max = Math.max(1, editor.state.doc.content.size - 1)
    const pos = Math.max(1, Math.min(resolved?.pos ?? (clientY < rect.top ? 1 : max), max))
    return { editor, pageIndex, pos }
  }, [])

  const buildCrossPageSelection = useCallback((
    anchor: { pageIndex: number; pos: number },
    focus: { pageIndex: number; pos: number },
  ): CrossPageSelection | null => {
    if (anchor.pageIndex === focus.pageIndex) return null
    const forward = anchor.pageIndex < focus.pageIndex
    const start = forward ? anchor : focus
    const end = forward ? focus : anchor
    const ranges: CrossPageEditorRange[] = []
    const text: string[] = []
    for (let pageIndex = start.pageIndex; pageIndex <= end.pageIndex; pageIndex += 1) {
      const editor = editorsRef.current[pageIndex]
      if (!editor || editor.isDestroyed) continue
      const max = Math.max(1, editor.state.doc.content.size - 1)
      const from = pageIndex === start.pageIndex
        ? Math.max(1, Math.min(start.pos, max))
        : 1
      const to = pageIndex === end.pageIndex
        ? Math.max(1, Math.min(end.pos, max))
        : max
      if (from >= to) continue
      const textSelection = TextSelection.between(
        editor.state.doc.resolve(from),
        editor.state.doc.resolve(to),
      )
      if (textSelection.from >= textSelection.to) continue
      ranges.push({
        editor,
        pageIndex,
        from: textSelection.from,
        to: textSelection.to,
      })
      text.push(editor.state.doc.textBetween(
        textSelection.from,
        textSelection.to,
        '\n',
        '\n',
      ))
    }
    return ranges.length >= 2
      ? { ranges, text: text.join('\n') }
      : null
  }, [])

  const previewCrossPageSelection = useCallback((selection: CrossPageSelection | null) => {
    const byPage = new Map(
      selection?.ranges.map((range) => [range.pageIndex, range]) || [],
    )
    for (let pageIndex = 0; pageIndex < editorsRef.current.length; pageIndex += 1) {
      const editor = editorsRef.current[pageIndex]
      if (!editor) continue
      const range = byPage.get(pageIndex)
      setCrossPageHighlight(editor, range ? { from: range.from, to: range.to } : null)
    }
  }, [])

  const beginCrossPageSelection = useCallback((event: PointerEvent) => {
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('button, input, textarea, select, [data-litrpg-interaction]')) {
      dragAnchorRef.current = null
      return
    }
    if (!target?.closest('.prose-editor')) {
      clearCrossPageSelection()
      dragAnchorRef.current = null
      return
    }
    const point = pagePositionAtPoint(event.clientX, event.clientY)
    if (!point) return
    clearCrossPageSelection()
    dragAnchorRef.current = { pageIndex: point.pageIndex, pos: point.pos }
  }, [clearCrossPageSelection, pagePositionAtPoint])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const anchor = dragAnchorRef.current
      if (!anchor || (event.buttons & 1) === 0) return
      const scroller = stackRef.current?.closest('.editor-scroll')
      if (scroller instanceof HTMLElement) {
        const rect = scroller.getBoundingClientRect()
        if (event.clientY < rect.top + 48) scroller.scrollTop -= 22
        if (event.clientY > rect.bottom - 48) scroller.scrollTop += 22
      }
      const point = pagePositionAtPoint(event.clientX, event.clientY)
      if (!point || point.pageIndex === anchor.pageIndex) {
        if (crossPageSelectionRef.current) {
          crossPageSelectionRef.current = null
          previewCrossPageSelection(null)
        }
        return
      }
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      const selection = buildCrossPageSelection(anchor, point)
      crossPageSelectionRef.current = selection
      previewCrossPageSelection(selection)
    }

    const end = (event: PointerEvent) => {
      const anchor = dragAnchorRef.current
      dragAnchorRef.current = null
      if (!anchor) return
      const point = pagePositionAtPoint(event.clientX, event.clientY)
      const selection = point
        ? buildCrossPageSelection(anchor, point)
        : crossPageSelectionRef.current
      if (!selection) {
        if (crossPageSelectionRef.current) clearCrossPageSelection()
        return
      }
      crossPageSelectionRef.current = selection
      previewCrossPageSelection(selection)
      window.getSelection()?.removeAllRanges()
      for (const range of selection.ranges) {
        try {
          range.editor.view.dispatch(
            range.editor.state.tr
              .setSelection(TextSelection.between(
                range.editor.state.doc.resolve(range.from),
                range.editor.state.doc.resolve(range.to),
              ))
              .setMeta('addToHistory', false),
          )
        } catch {
          // Atom nodes at a page seam can narrow the native selection while
          // the cross-page decoration remains the authoritative visual range.
        }
      }
      const finalRange = selection.ranges.at(-1)
      if (finalRange) {
        focusedIndexRef.current = finalRange.pageIndex
        setActivePageIndex(finalRange.pageIndex)
        onActiveEditorChange(finalRange.editor)
      }
      onCrossPageSelectionChange?.({
        pageCount: selection.ranges.length,
        text: selection.text,
      })
    }

    document.addEventListener('pointermove', move, { capture: true })
    document.addEventListener('pointerup', end, { capture: true })
    document.addEventListener('pointercancel', end, { capture: true })
    return () => {
      document.removeEventListener('pointermove', move, { capture: true })
      document.removeEventListener('pointerup', end, { capture: true })
      document.removeEventListener('pointercancel', end, { capture: true })
    }
  }, [
    buildCrossPageSelection,
    clearCrossPageSelection,
    onActiveEditorChange,
    onCrossPageSelectionChange,
    pagePositionAtPoint,
    previewCrossPageSelection,
  ])

  const waitForEditor = useCallback(async (pageIndex: number, epoch: number) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (contentEpochRef.current !== epoch) return null
      const editor = editorsRef.current[pageIndex]
      if (editor) return editor
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    }
    return editorsRef.current[pageIndex]
  }, [])

  const reflowFrom = useCallback(async (fromIndex: number) => {
    if (busyRef.current) return
    busyRef.current = true
    const epoch = contentEpochRef.current
    try {
      // Drop empty *content holes* before measuring. Pulling into a hole then
      // pruning mid-pass remounts every later page editor and re-queues reflow.
      // Do not drop intentional trailing blank end pages here.
      {
        const live = readLivePages()
        const preserveLastEmptyPage = shouldPreserveTrailingBlankPages(live)
        const pruned = pruneEmptyDraftPages(live, { preserveLastEmptyPage })
        if (pruned.length !== live.length) {
          if (focusedIndexRef.current > pruned.length - 1) {
            focusedIndexRef.current = Math.max(0, pruned.length - 1)
          }
          commitPages(live, { preserveLastEmptyPage })
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
          if (contentEpochRef.current !== epoch) return
        }
      }

      for (let pass = 0; pass < 24; pass += 1) {
        if (contentEpochRef.current !== epoch) return
        let moved = false
        const total = Math.max(editorsRef.current.length, pagesRef.current.length)

        for (let index = fromIndex; index < total; index += 1) {
          if (contentEpochRef.current !== epoch) return
          let editor = editorsRef.current[index]
          if (!editor) continue

          // Empty sheets with real content after them are layout holes — remove
          // and restart this pass. Trailing blank end pages (no content after)
          // must stay so Enter-at-end can mint intentional empty sheets.
          if (isEmptyPageHtml(editor.getHTML())) {
            const liveSnapshot = readLivePages()
            const hasContentAfter = liveSnapshot
              .slice(index + 1)
              .some((page) => !isEmptyPageHtml(page))
            if (hasContentAfter) {
              const live = liveSnapshot.filter((_, pageIndex) => pageIndex !== index)
              if (focusedIndexRef.current > index) {
                focusedIndexRef.current -= 1
              } else if (focusedIndexRef.current === index) {
                focusedIndexRef.current = Math.max(0, index - 1)
              }
              commitPages(live.length ? live : ['<p></p>'], { preserveLastEmptyPage: false })
              moved = true
              break
            }
          }

          const chrome = chromeHeightsRef.current[index] || 0
          const maxHeight = draftPageBodyHeight(metrics, chrome)

          // Push overflow onto the next page (block at a time).
          // Never leave a deleted block without a home on the next page —
          // otherwise content vanishes when the next sheet is not ready yet.
          for (let push = 0; push < 30; push += 1) {
            if (contentEpochRef.current !== epoch) return
            editor = editorsRef.current[index]
            if (!editor || !pageOverflows(editor, maxHeight)) break
            const doc = editor.state.doc
            if (doc.childCount === 0) break
            // Keep at least an empty paragraph on the page.
            if (doc.childCount === 1 && !doc.textContent.trim() && doc.child(0).type.name === 'paragraph') {
              break
            }

            const pendingHere = pendingCaretRef.current?.pageIndex === index
              ? pendingCaretRef.current
              : null
            // Prefer the handoff position when overflow already queued a caret
            // move onto this sheet — the live selection may still be stale until
            // focusPage runs after reflow settles.
            const selectionFrom = pendingHere?.position !== undefined
              ? pendingHere.position
              : focusedIndexRef.current === index
                ? editor.state.selection.from
                : undefined

            // Enter at the end of a full page creates trailing blank paragraph(s).
            // Overflow those blanks first so the caret lands in the new line on the
            // next sheet. Skipping them (LitRPG safeguard) would push the previous
            // real block and map the caret into already-authored next-page text.
            const childIsEmpty: boolean[] = []
            const childIsSceneBreak: boolean[] = []
            const childIsLitRpg: boolean[] = []
            for (let childIndex = 0; childIndex < doc.childCount; childIndex += 1) {
              const child = doc.child(childIndex)
              childIsEmpty.push(isEmptyParagraphNode(child))
              childIsSceneBreak.push(child.type.name === 'sceneBreak')
              childIsLitRpg.push(child.type.name === 'litrpgBlock')
            }
            let caretChildIndex: number | null = null
            if (selectionFrom !== undefined) {
              let childStart = 0
              for (let childIndex = 0; childIndex < doc.childCount; childIndex += 1) {
                const childEnd = childStart + doc.child(childIndex).nodeSize
                if (selectionFrom >= childStart && selectionFrom <= childEnd) {
                  caretChildIndex = childIndex
                  break
                }
                childStart = childEnd
              }
            }
            const trailingStart = firstTrailingEmptyParagraphIndex(doc)
            const caretInTrailingEmpty = (
              trailingStart >= 0
              && caretChildIndex !== null
              && caretChildIndex >= trailingStart
            )

            // Leftover sheet-padding blanks (after Enter moved only the caret
            // blank, or after reload of a padded page) must not push real
            // content. Shed the whole trailing empty run in one transaction —
            // never one-blank-per-layout-measure (that freezes Draft on mount
            // when a page holds a long blank run from char-budget packing).
            if (trailingStart >= 0 && !caretInTrailingEmpty) {
              if (shedTrailingEmptyPadding(editor)) {
                moved = true
                continue
              }
            }

            // Sandwiched LitRPG: shed trailing prose after the status block first
            // so prose→LitRPG→prose stays contiguous. Solo/end LitRPG still moves
            // as a whole. If the whole trailing block must move, keep a preceding
            // scene break with it so Scrivener shifts are not stranded in the clip.
            let moveIndex = draftOverflowMoveIndexPreferTrailingAfterLitRpg(
              childIsEmpty,
              childIsLitRpg,
              caretChildIndex,
            )
            let last = doc.child(moveIndex)
            let split = caretInTrailingEmpty || !last || isUnsplittablePageNode(last)
              ? null
              : splitParagraphForCurrentPage(
                editor,
                last,
                (prefix) => withNodeAtIndex(doc, moveIndex, prefix),
                maxHeight,
              )
            if (!split) {
              // Same keep-with rule as draftOverflowMoveIndexKeepingSceneBreak,
              // applied on top of the LitRPG trailing preference.
              if (
                moveIndex > 0
                && childIsSceneBreak[moveIndex - 1]
                && !childIsEmpty[moveIndex]
                && !childIsSceneBreak[moveIndex]
              ) {
                let keepScene = true
                const lastEmpty = childIsEmpty.length - 1
                if (childIsEmpty[lastEmpty]) {
                  let emptyRunStart = lastEmpty
                  while (emptyRunStart > 0 && childIsEmpty[emptyRunStart - 1]) {
                    emptyRunStart -= 1
                  }
                  if (
                    caretChildIndex !== null
                    && caretChildIndex !== undefined
                    && caretChildIndex >= emptyRunStart
                  ) {
                    keepScene = false
                  }
                }
                if (keepScene) moveIndex -= 1
              }
              last = doc.child(moveIndex)
            }
            const from = positionAtChildIndex(doc, moveIndex)
            if (from < 0 || !last) break

            // LitRPG / other atoms are unsplittable. If nothing real remains
            // before this atom, pushing it only mints an empty sheet and the
            // next pass prunes/remounts forever (probe height under-counts the
            // live node-view chrome, so a measure-only guard is not enough).
            if (
              isUnsplittablePageNode(last)
              && pageHasOnlyEmptyParagraphs(doc, last)
            ) {
              let onlyEmptiesBefore = true
              for (let before = 0; before < moveIndex; before += 1) {
                if (!isEmptyParagraphNode(doc.child(before))) {
                  onlyEmptiesBefore = false
                  break
                }
              }
              if (onlyEmptiesBefore) break
            }

            // When not mid-splitting a paragraph, move the block plus any
            // trailing blank paragraphs so empties do not become their own page.
            const movedNode = split?.suffix || last
            const movedPositionBase = split
              ? from + split.prefix.content.size
              : from
            const caretFollowsBlock =
              selectionFrom !== undefined
              && (
                caretInTrailingEmpty
                  ? selectionFrom >= movedPositionBase
                  : selectionFrom > movedPositionBase
              )
            let html = split
              ? serializeNode(editor, movedNode)
              : (() => {
                const wrapper = document.createElement('div')
                const serializer = DOMSerializer.fromSchema(editor.schema)
                for (let childIndex = moveIndex; childIndex < doc.childCount; childIndex += 1) {
                  wrapper.appendChild(serializer.serializeNode(doc.child(childIndex)))
                }
                return wrapper.innerHTML
              })()
            // Enter padding that filled empty sheet space must not reappear as a
            // half-page blank stack on the next sheet — keep one line, caret at top.
            if (caretInTrailingEmpty && isEmptyPageHtml(html)) {
              html = '<p></p>'
            }
            const mappedCaretPosition = caretFollowsBlock
              ? (caretInTrailingEmpty ? 1 : Math.max(1, selectionFrom - movedPositionBase))
              : undefined
            const nextIndex = index + 1
            let nextEditor = editorsRef.current[nextIndex]
            const pageEditor = editor
            const removeMovedContent = () => {
              const transaction = split
                ? pageEditor.state.tr.replaceWith(from, from + last.nodeSize, split.prefix)
                : pageEditor.state.tr.delete(from, pageEditor.state.doc.content.size)
              pageEditor.view.dispatch(
                transaction
                  .setMeta(PAGE_REFLOW_META, true)
                  .setMeta('addToHistory', false),
              )
              if (pageEditor.state.doc.childCount === 0) {
                pageEditor.commands.setContent('<p></p>', { emitUpdate: false })
              }
              // Sparse Enter moved only the caret blank; sheet-padding empties
              // left behind can still overflow — shed them in one shot.
              if (caretInTrailingEmpty && pageOverflows(pageEditor, maxHeight)) {
                shedTrailingEmptyPadding(pageEditor)
              }
            }

            if (nextEditor) {
              const nextHtml = nextEditor.getHTML()
              const combined = isEmptyPageHtml(nextHtml)
                ? html
                : `${html}${nextHtml}`
              nextEditor.commands.setContent(normalizePageHtml(combined), { emitUpdate: false })
              removeMovedContent()
              if (caretFollowsBlock) {
                pendingCaretRef.current = {
                  pageIndex: nextIndex,
                  position: mappedCaretPosition,
                }
                // Mark focus on the destination immediately so trailing-blank
                // preserve survives later prune passes before focusPage runs.
                focusedIndexRef.current = nextIndex
              }
              moved = true
              continue
            }

            // No next sheet yet: delete locally, then commit a new page already
            // seeded with this block so nothing is left without a destination.
            // Never mint a brand-new empty sheet from reflow alone — only when
            // the caret follows (user Enter overflow). Otherwise empty pages
            // spawn in a loop whenever preserve keeps trailing blanks.
            if (isEmptyPageHtml(html) && !caretFollowsBlock) {
              break
            }
            removeMovedContent()
            const live = readLivePages()
            while (live.length < nextIndex) live.push('<p></p>')
            const existingNext = live[nextIndex]
            live[nextIndex] = existingNext && !isEmptyPageHtml(existingNext)
              ? normalizePageHtml(`${html}${existingNext}`)
              : normalizePageHtml(html)
            if (caretFollowsBlock) {
              pendingCaretRef.current = {
                pageIndex: nextIndex,
                position: mappedCaretPosition,
              }
              focusedIndexRef.current = nextIndex
            }
            commitPages(live, { pruneEmptyPages: false })
            nextEditor = await waitForEditor(nextIndex, epoch)
            if (contentEpochRef.current !== epoch) return
            if (!nextEditor) {
              // Pages state still holds the seeded HTML; stop this pass and
              // let the next reflow continue once editors mount.
              moved = true
              break
            }
            moved = true
          }

          // Pull from the next page while there is room.
          // Do not pull when the next page is blank-only: those empties are
          // intentional trailing lines / a new page the user just created.
          // Also do not pull a leading blank paragraph — that is an Enter that
          // just overflowed onto this sheet and must keep the caret.
          for (let pull = 0; pull < 20; pull += 1) {
            if (contentEpochRef.current !== epoch) return
            editor = editorsRef.current[index]
            const nextEditor = editorsRef.current[index + 1]
            if (!editor || !nextEditor) break
            if (isEmptyPageHtml(nextEditor.getHTML())) break
            if (pageOverflows(editor, maxHeight)) break

            const sourceFirst = nextEditor.state.doc.child(0)
            if (!sourceFirst || isEmptyParagraphNode(sourceFirst)) break
            // Each page editor owns its own ProseMirror schema instance.
            // Clone the source node into the destination schema before
            // measuring or inserting it; foreign-schema nodes can otherwise
            // be rejected while the source deletion still succeeds.
            const first = cloneNodeForEditor(editor, sourceFirst)
            // Tall LitRPG atoms that already sit alone on the next sheet must
            // stay there. Pulling them back under-counts node-view chrome on
            // remount and restarts the clipped jump-back.
            if (
              isUnsplittablePageNode(first)
              && pageHasOnlyEmptyParagraphs(nextEditor.state.doc, sourceFirst)
            ) {
              break
            }
            // Scrivener scene shift: do not pull a scene-break HR onto this page
            // unless the following scene start also fits. Parking the break alone
            // (or with a clipped opener) looked like a hidden page skimming into
            // the previous sheet.
            if (first.type.name === 'sceneBreak') {
              const followingSource = nextEditor.state.doc.childCount > 1
                ? nextEditor.state.doc.child(1)
                : null
              if (!followingSource || isEmptyParagraphNode(followingSource)) break
              const following = cloneNodeForEditor(editor, followingSource)
              const withBreakAndStart = withPageNodeAppended(
                withPageNodeAppended(editor.state.doc, first),
                following,
              )
              if (!candidateFitsPage(editor, withBreakAndStart, maxHeight)) break
            }
            const currentDoc = editor.state.doc
            const combinedDoc = withPageNodeAppended(currentDoc, first)
            // LitRPG status blocks: probe height lags React node-view chrome on
            // remount. Require extra slack so reload cannot yank a tall block
            // onto a nearly-full sheet and clip it.
            const pullFitHeight = first.type.name === 'litrpgBlock'
              ? maxHeight - 48
              : maxHeight
            if (!candidateFitsPage(editor, combinedDoc, pullFitHeight)) {
              // Never mid-split atoms (LitRPG status blocks, images, …).
              if (isUnsplittablePageNode(first)) break
              const split = splitParagraphForCurrentPage(
                editor,
                first,
                (prefix) => withPageNodeAppended(currentDoc, prefix),
                maxHeight,
              )
              if (!split) break
              replaceDocumentPreservingSelection(
                editor,
                withPageNodeAppended(currentDoc, split.prefix),
              )
              nextEditor.view.dispatch(
                nextEditor.state.tr
                  .replaceWith(
                    0,
                    sourceFirst.nodeSize,
                    cloneNodeForEditor(nextEditor, split.suffix),
                  )
                  .setMeta(PAGE_REFLOW_META, true)
                  .setMeta('addToHistory', false),
              )
              // Probe can still under-count; if the prefix paints past the clip,
              // undo and leave the block on the next sheet.
              if (pageOverflows(editor, maxHeight)) {
                const pulled = editor.state.doc.lastChild
                if (pulled) {
                  editor.view.dispatch(
                    editor.state.tr
                      .delete(
                        editor.state.doc.content.size - pulled.nodeSize,
                        editor.state.doc.content.size,
                      )
                      .setMeta(PAGE_REFLOW_META, true)
                      .setMeta('addToHistory', false),
                  )
                  if (editor.state.doc.childCount === 0) {
                    editor.commands.setContent('<p></p>', { emitUpdate: false })
                  }
                }
                const nextFirst = nextEditor.state.doc.child(0)
                if (nextFirst) {
                  nextEditor.view.dispatch(
                    nextEditor.state.tr
                      .replaceWith(0, nextFirst.nodeSize, sourceFirst)
                      .setMeta(PAGE_REFLOW_META, true)
                      .setMeta('addToHistory', false),
                  )
                }
                break
              }
              moved = true
              break
            }
            replaceDocumentPreservingSelection(editor, combinedDoc)
            nextEditor.view.dispatch(
              nextEditor.state.tr
                .delete(0, sourceFirst.nodeSize)
                .setMeta(PAGE_REFLOW_META, true)
                .setMeta('addToHistory', false),
            )
            if (nextEditor.state.doc.childCount === 0) {
              nextEditor.commands.setContent('<p></p>', { emitUpdate: false })
            }
            // Live node views (LitRPG toolbar) can still overflow after a probe
            // that looked fine — undo immediately to avoid push/pull thrash.
            if (pageOverflows(editor, maxHeight)) {
              const pulled = editor.state.doc.lastChild
              if (pulled) {
                const restoredHtml = serializeNode(editor, pulled)
                editor.view.dispatch(
                  editor.state.tr
                    .delete(
                      editor.state.doc.content.size - pulled.nodeSize,
                      editor.state.doc.content.size,
                    )
                    .setMeta(PAGE_REFLOW_META, true)
                    .setMeta('addToHistory', false),
                )
                if (editor.state.doc.childCount === 0) {
                  editor.commands.setContent('<p></p>', { emitUpdate: false })
                }
                const nextHtml = nextEditor.getHTML()
                nextEditor.commands.setContent(
                  normalizePageHtml(
                    isEmptyPageHtml(nextHtml)
                      ? restoredHtml
                      : `${restoredHtml}${nextHtml}`,
                  ),
                  { emitUpdate: false },
                )
              }
              break
            }
            moved = true
          }

          // Height checks force browser layout. Yield between small batches so
          // importing or opening a long chapter never monopolizes the UI while
          // all of its page sheets settle.
          if (
            index < total - 1
            && (index - fromIndex + 1) % 3 === 0
          ) {
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
          }
        }

        if (contentEpochRef.current !== epoch) return
        if (moved) {
          // Keep the live HTML snapshot in the ref only. Committing/pruning here
          // remounts later TipTap sheets mid-pass and queues endless reflow.
          pagesRef.current = readLivePages()
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
        } else {
          break
        }
      }
    } finally {
      const follow = pendingCaretRef.current
      const stillCurrent = contentEpochRef.current === epoch
      try {
        if (!stillCurrent) {
          pendingCaretRef.current = null
        } else {
          const live = readLivePages()
          // Do not use busyRef here — we are still busy through settle, but
          // trailing blanks should only survive when caret/overflow says so.
          const preserveLastEmptyPage = shouldPreserveTrailingBlankPages(live)
          // Stay busy through commit so remounted sheets' onEditorReady cannot
          // re-queue reflow mid-settle (LitRPG empty-page flash loop).
          commitPages(live, { preserveLastEmptyPage })

          if (follow) {
            pendingCaretRef.current = null
            const editor = await waitForEditor(follow.pageIndex, epoch)
            if (editor && contentEpochRef.current === epoch) {
              focusPage(follow.pageIndex, follow.where, follow.position)
            }
          }
        }
      } finally {
        busyRef.current = false
      }
    }
  }, [commitPages, focusPage, metrics, readLivePages, shouldPreserveTrailingBlankPages, waitForEditor])

  const queueReflow = useCallback((fromIndex: number) => {
    window.clearTimeout(reflowTimerRef.current)
    reflowTimerRef.current = window.setTimeout(() => {
      void reflowFrom(fromIndex)
    }, 140)
  }, [reflowFrom])

  const replaceCrossPageSelection = useCallback((replacement = '') => {
    const selection = crossPageSelectionRef.current
    if (!selection?.ranges.length) return false
    const first = selection.ranges[0]
    busyRef.current = true
    try {
      for (const range of selection.ranges) {
        const size = range.editor.state.doc.content.size
        const from = Math.max(0, Math.min(range.from, size))
        const to = Math.max(from, Math.min(range.to, size))
        let transaction = range.editor.state.tr.delete(from, to)
        if (range === first && replacement) {
          transaction = transaction.insertText(replacement, from)
        }
        range.editor.view.dispatch(
          transaction.setMeta(PAGE_REFLOW_META, true),
        )
      }
    } finally {
      busyRef.current = false
    }
    const caretPosition = Math.max(1, first.from + replacement.length)
    const startPage = first.pageIndex
    clearCrossPageSelection()
    pendingCaretRef.current = {
      pageIndex: startPage,
      position: caretPosition,
    }
    commitPages(readLivePages(), { preserveLastEmptyPage: false })
    queueReflow(startPage)
    return true
  }, [clearCrossPageSelection, commitPages, queueReflow, readLivePages])

  useEffect(() => {
    const command = (event: Event) => {
      const selection = crossPageSelectionRef.current
      const detail = (event as CustomEvent<CrossPageCommand>).detail
      if (!selection || !detail) return
      const startPage = selection.ranges[0]?.pageIndex || 0
      busyRef.current = true
      try {
        for (const range of selection.ranges) {
          const editor = range.editor
          if (editor.isDestroyed) continue
          let chain = editor.chain().setTextSelection({ from: range.from, to: range.to })
          switch (detail.action) {
            case 'bold': chain = chain.toggleBold(); break
            case 'italic': chain = chain.toggleItalic(); break
            case 'underline': chain = chain.toggleUnderline(); break
            case 'strike': chain = chain.toggleStrike(); break
            case 'code': chain = chain.toggleCode(); break
            case 'paragraph': chain = chain.setParagraph(); break
            case 'blockquote': chain = chain.toggleBlockquote(); break
            case 'bulletList': chain = chain.toggleBulletList(); break
            case 'orderedList': chain = chain.toggleOrderedList(); break
            case 'heading': chain = chain.toggleHeading({ level: detail.level }); break
            case 'textAlign': chain = chain.setTextAlign(detail.value); break
            case 'textMark': chain = chain.toggleMark(detail.mark); break
            case 'clearMarks': chain = chain.unsetAllMarks(); break
            case 'clearTextAppearance': chain = chain.unsetMark('textAppearance'); break
            case 'textAppearance': {
              const current = editor.getAttributes('textAppearance')
              const next = { ...current, [detail.attribute]: detail.value || null }
              chain = Object.values(next).every((entry) => !entry)
                ? chain.unsetMark('textAppearance')
                : chain.setMark('textAppearance', next)
              break
            }
            case 'link':
              chain = detail.href
                ? chain.setLink({ href: detail.href })
                : chain.unsetLink()
              break
          }
          chain.run()
        }
      } finally {
        busyRef.current = false
      }
      clearCrossPageSelection()
      commitPages(readLivePages())
      queueReflow(startPage)
    }

    const keydown = (event: KeyboardEvent) => {
      if (!crossPageSelectionRef.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        clearCrossPageSelection()
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        replaceCrossPageSelection()
        return
      }
      if (
        event.key.length === 1
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        event.preventDefault()
        replaceCrossPageSelection(event.key)
      }
    }

    const copy = (event: ClipboardEvent) => {
      const selection = crossPageSelectionRef.current
      if (!selection || !event.clipboardData) return
      event.preventDefault()
      event.clipboardData.setData('text/plain', selection.text)
    }

    const cut = (event: ClipboardEvent) => {
      const selection = crossPageSelectionRef.current
      if (!selection || !event.clipboardData) return
      event.preventDefault()
      event.clipboardData.setData('text/plain', selection.text)
      replaceCrossPageSelection()
    }

    const clear = () => clearCrossPageSelection()
    window.addEventListener('typesetly:cross-page-command', command)
    window.addEventListener('typesetly:clear-cross-page-selection', clear)
    document.addEventListener('keydown', keydown, { capture: true })
    document.addEventListener('copy', copy, { capture: true })
    document.addEventListener('cut', cut, { capture: true })
    return () => {
      window.removeEventListener('typesetly:cross-page-command', command)
      window.removeEventListener('typesetly:clear-cross-page-selection', clear)
      document.removeEventListener('keydown', keydown, { capture: true })
      document.removeEventListener('copy', copy, { capture: true })
      document.removeEventListener('cut', cut, { capture: true })
    }
  }, [
    clearCrossPageSelection,
    commitPages,
    queueReflow,
    readLivePages,
    replaceCrossPageSelection,
  ])

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
      setActivePageIndex(hit.pageIndex)
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
    }, 180)
    return () => window.clearTimeout(timer)
  }, [chapterId, charsPerPage, reflowFrom])

  return (
    <div
      ref={stackRef}
      className="editor-pages-stack"
      onPointerDownCapture={(event) => beginCrossPageSelection(event.nativeEvent)}
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
          allowExternalProofreading={
            externalProofreadingEnabledForPage(
              externalProofreading,
              pageHtml,
              index,
              activePageIndex,
            )
          }
          language={language}
          chapterId={chapterId}
          chapterTitle={chapterTitle}
          chrome={index === 0 ? firstPageChrome : null}
          onChromeHeight={(height) => {
            const changed = chromeHeightsRef.current[index] !== height
            chromeHeightsRef.current[index] = height
            if (changed) queueReflow(index)
          }}
          onEditorReady={(editor) => {
            const newlyReady = editorsRef.current[index] !== editor
            editorsRef.current[index] = editor
            if (index === focusedIndexRef.current) onActiveEditorChange(editor)
            // Remounts during an in-flight reflow must not each schedule another.
            if (newlyReady && !busyRef.current) queueReflow(index)
          }}
          onEditorDestroy={() => {
            if (editorsRef.current[index]) editorsRef.current[index] = null
          }}
          onFocus={() => {
            focusedIndexRef.current = index
            setActivePageIndex(index)
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
            // React's page-state snapshot can lag behind TipTap during a large
            // selection deletion. Read every mounted editor first so saving
            // one changed page can never overwrite untouched later pages.
            const next = readLivePages()
            while (next.length <= index) next.push('<p></p>')
            next[index] = normalizePageHtml(html)

            // Clearing a middle sheet must drop it immediately when content
            // remains after it (a hole). Trailing blank end pages are intentional.
            const hasContentAfter = next
              .slice(index + 1)
              .some((page) => !isEmptyPageHtml(page))
            if (hasContentAfter && isEmptyPageHtml(next[index]!)) {
              contentEpochRef.current += 1
              const focusAt = Math.max(0, index - 1)
              focusedIndexRef.current = focusAt
              setActivePageIndex(focusAt)
              pendingCaretRef.current = { pageIndex: focusAt, where: 'end' }
              commitPages(next, { preserveLastEmptyPage: false })
              window.requestAnimationFrame(() => {
                focusPage(focusAt, 'end')
                queueReflow(focusAt)
              })
              return
            }

            pagesRef.current = next
            emitChapter(next)
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
            if (!current || !previous) return

            if (isEmptyPageHtml(current.getHTML())) {
              setPages((currentPages) => {
                const next = currentPages.filter((_, pageIndex) => pageIndex !== index)
                const normalized = next.length ? next : ['<p></p>']
                emitChapter(normalized)
                return normalized
              })
              window.requestAnimationFrame(() => focusPage(Math.max(0, index - 1), 'end'))
              return
            }

            const previousDoc = previous.state.doc
            const currentDoc = current.state.doc
            const previousLast = previousDoc.lastChild
            const currentFirst = currentDoc.firstChild
            if (!previousLast || !currentFirst) return

            const firstForPrevious = cloneNodeForEditor(previous, currentFirst)
            const canJoinTextBlocks = (
              previousLast.isTextblock
              && firstForPrevious.isTextblock
              && previousLast.type === firstForPrevious.type
            )

            // A generated page seam is not a real editing boundary. Backspace
            // there must operate on the adjacent manuscript blocks, not jump
            // to the preceding page and delete an unrelated end position.
            if (canJoinTextBlocks) {
              const beforeLastSize = previousDoc.content.size - previousLast.nodeSize
              const isContinuation = Boolean(firstForPrevious.attrs.pageContinuation)
              const seam = isContinuation && firstForPrevious.attrs.pageContinuationSpace
                ? Fragment.from(previous.schema.text(' '))
                : Fragment.empty
              const merged = previousLast.type.create(
                previousLast.attrs,
                previousLast.content.append(seam).append(firstForPrevious.content),
                previousLast.marks,
              )
              const nextPreviousDoc = withLastNode(previousDoc, merged)
              let caret = beforeLastSize + 1 + previousLast.content.size + seam.size

              // When this is one paragraph split across generated pages,
              // Backspace removes the actual character at the seam. For a
              // normal paragraph boundary it removes only that boundary.
              busyRef.current = true
              try {
                if (isContinuation && caret > beforeLastSize + 1) {
                  const transaction = previous.state.tr
                    .replaceWith(0, previousDoc.content.size, nextPreviousDoc.content)
                  const deleteFrom = Math.max(beforeLastSize + 1, caret - 1)
                  previous.view.dispatch(
                    transaction
                      .delete(deleteFrom, caret)
                      .setMeta(PAGE_REFLOW_META, true),
                  )
                  caret = deleteFrom
                } else {
                  previous.view.dispatch(
                    previous.state.tr
                      .replaceWith(0, previousDoc.content.size, nextPreviousDoc.content)
                      .setMeta(PAGE_REFLOW_META, true),
                  )
                }

                current.view.dispatch(
                  current.state.tr
                    .delete(0, currentFirst.nodeSize)
                    .setMeta(PAGE_REFLOW_META, true),
                )
                if (current.state.doc.childCount === 0) {
                  current.commands.setContent('<p></p>', { emitUpdate: false })
                }

                pendingCaretRef.current = {
                  pageIndex: index - 1,
                  position: Math.max(1, caret),
                }
                commitPages(readLivePages(), { preserveLastEmptyPage: false })
              } finally {
                busyRef.current = false
              }
              queueReflow(index - 1)
              window.requestAnimationFrame(() => {
                focusPage(index - 1, 'end', Math.max(1, caret))
              })
              return
            }

            // Structural blocks cannot be merged safely. Move focus across the
            // visual seam and leave their authored structure unchanged.
            focusPage(index - 1, 'end')
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
  const typewriterRef = useRef(typewriterScrolling)
  typewriterRef.current = typewriterScrolling

  useLayoutEffect(() => {
    const node = chromeRef.current
    if (!node) {
      setChromeHeight(0)
      onChromeHeight(0)
      return
    }
    const measure = () => {
      const style = window.getComputedStyle(node)
      const height = draftChromeOccupiedHeight(
        node.getBoundingClientRect().height,
        Number.parseFloat(style.marginTop) || 0,
        Number.parseFloat(style.marginBottom) || 0,
      )
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
    onUpdate: ({ editor: ed, transaction }) => {
      if (skipSyncRef.current) return
      onUpdateHtml(ed.getHTML())
      if (transaction.getMeta(PAGE_REFLOW_META) || !ed.isFocused) return
      window.requestAnimationFrame(() => {
        if (ed.isFocused) {
          scrollCaretIntoView(ed, typewriterRef.current ? 'center' : 'nearest')
        }
      })
    },
    editorProps: {
      attributes: {
        class: 'prose-editor',
        spellcheck: spellcheck ? 'true' : 'false',
      },
      transformPastedHTML: sanitizePastedHtml,
      handleDrop(view, event) {
        return dropLitRpgAcrossPages(view, event)
      },
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
    // Lock the content box to trim metrics — never let min-height/auto grow
    // the sheet to absorb Enter blanks.
    dom.style.minHeight = '0'
    dom.style.height = 'auto'
    dom.style.maxHeight = `${maxBody}px`
    // Ancestor .editor-page-body clips paint to the sheet; keep the editable
    // overflow visible so grammar-tool overlays are not clipped mid-badge.
    // Overflow detection must not use scrollHeight while this is visible
    // (see pageOverflows → measureCandidateHeight).
    dom.style.overflow = 'visible'
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
        minHeight: metrics.heightPx,
        maxHeight: metrics.heightPx,
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
      <div
        className="editor-page-body"
        style={{
          height: maxBody,
          maxHeight: maxBody,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
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
