import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Clock,
  Code2,
  FileDown,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  MessageSquare,
  Minus,
  ImagePlus,
  BetweenHorizontalStart,
  Quote,
  Redo2,
  Settings,
  Strikethrough,
  Superscript,
  Smartphone,
  Scissors,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { v4 as uuid } from 'uuid'
import { useApp } from '../BookContext'
import { countBookWords, countWords } from '../data'
import { ChapterOptionsMenu } from './ChapterOptionsMenu'
import './Editor.css'
import { DOMSerializer } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  Callout,
  AttributedQuote,
  Footnote,
  ManuscriptImage,
  Monospace,
  PageBreak,
  SansSerif,
  SceneBreak,
  SmallCaps,
  Subscript,
  SuperscriptText,
  TextAppearance,
  HangingIndentBlock,
  VerseBlock,
} from '../editor/extensions'
import { Dialog } from './Dialog'
import { processImageFile } from '../images/process'
import { buildCalloutNode, replaceCalloutRange } from '../editor/callouts'
import { smartDashForInsertion, smartQuoteForInsertion } from '../editor/smartQuotes'
import { FONT_FAMILY_GROUPS } from '../themes/fonts'
import { externalProofreadingEnabled, findTextOccurrences } from '../editor/find'

const TEXT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48, 64]
const TEXT_COLORS = ['#221a1e', '#5b3345', '#a53f35', '#b96e18', '#2f6f52', '#206a83', '#315aa8', '#714a9f', '#767676', '#ffffff']
const HIGHLIGHT_COLORS = ['#fff0a8', '#ffd3c5', '#f5c8dc', '#d9c8f3', '#c9dcff', '#bfe9e3', '#d8edb5', '#e4e4e4']
const TRACKING_OPTIONS = [
  { value: '-0.04em', label: 'Very tight' },
  { value: '-0.02em', label: 'Tight' },
  { value: '', label: 'Normal' },
  { value: '0.025em', label: 'Open' },
  { value: '0.06em', label: 'Wide' },
  { value: '0.1em', label: 'Very wide' },
  { value: '0.16em', label: 'Display' },
]

function formatTimer(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function sanitizePastedHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG'])
  let changed = false
  doc.querySelectorAll('script,style,iframe,object,embed,table').forEach((element) => {
    element.replaceWith(doc.createTextNode(element.textContent || ''))
    changed = true
  })
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      changed = true
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const keep =
        (element.tagName === 'A' && attribute.name === 'href') ||
        (element.tagName === 'IMG' && ['src', 'alt', 'title'].includes(attribute.name))
      if (!keep) {
        element.removeAttribute(attribute.name)
        changed = true
      }
    }
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || ''
      if (!/^(https?:|mailto:|#)/i.test(href)) {
        element.removeAttribute('href')
        changed = true
      }
    }
  }
  if (changed) {
    window.dispatchEvent(new CustomEvent('typesetly:notice', {
      detail: 'Pasted content was cleaned to remove unsupported formatting and unsafe markup.',
    }))
  }
  return doc.body.innerHTML
}

export function EditorPane() {
  const {
    activeChapter,
    project,
    updateChapterContent,
    updateChapterTitle,
    updateChapterSubtitle,
    updateDetails,
    saveStatus,
    timerRunning,
    timerSeconds,
    toggleTimer,
    resetTimer,
    activeTheme,
    splitChapter,
    saveCalloutPreset,
    deleteCalloutPreset,
  } = useApp()

  const [styleLabel, setStyleLabel] = useState('Paragraph')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('https://')
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteValue, setNoteValue] = useState('')
  const [wordMenu, setWordMenu] = useState(false)
  const [textOptionsOpen, setTextOptionsOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const [imageAlt, setImageAlt] = useState('')
  const [imageCaption, setImageCaption] = useState('')
  const [imageLayout, setImageLayout] = useState('inline')
  const [imageWidth, setImageWidth] = useState(100)
  const [imageLink, setImageLink] = useState('')
  const [imageDecorative, setImageDecorative] = useState(false)
  const [imageFocalX, setImageFocalX] = useState(50)
  const [imageFocalY, setImageFocalY] = useState(50)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockEditing, setBlockEditing] = useState(false)
  const [blockVariant, setBlockVariant] = useState<'callout' | 'message'>('callout')
  const [blockBackground, setBlockBackground] = useState('#f2f6fa')
  const [blockBorder, setBlockBorder] = useState('#9aa7b2')
  const [blockSender, setBlockSender] = useState('')
  const [blockDirection, setBlockDirection] = useState<'incoming' | 'outgoing'>('outgoing')
  const [blockTheme, setBlockTheme] = useState<'ios' | 'android'>('ios')
  const [blockText, setBlockText] = useState('')
  const [presetName, setPresetName] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteAttribution, setQuoteAttribution] = useState('')
  const imageRef = useRef<HTMLInputElement>(null)
  const blockRangeRef = useRef<{ from: number; to: number } | null>(null)
  const activeChapterId = activeChapter?.id
  const activeChapterContent = activeChapter?.content
  const allowExternalProofreading = externalProofreadingEnabled(
    project?.editorPrefs.externalProofreading ?? 'auto',
    activeChapterContent?.length ?? 0,
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
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
    ],
    content: activeChapter?.content || '<p></p>',
    onUpdate: ({ editor: ed }) => {
      if (!activeChapter) return
      updateChapterContent(activeChapter.id, ed.getHTML())
      if (project?.editorPrefs.typewriterScrolling) {
        window.requestAnimationFrame(() => {
          const selectionNode = ed.view.domAtPos(ed.state.selection.anchor).node
          const element =
            selectionNode instanceof Element ? selectionNode : selectionNode.parentElement
          element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })
      }
    },
    editorProps: {
      attributes: { class: 'prose-editor' },
      transformPastedHTML: sanitizePastedHtml,
      handleTextInput(view, from, to, text) {
        if (!project?.editorPrefs.smartQuotes) return false
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
    },
  })

  useEffect(() => {
    if (!editor || !activeChapterId) return
    if (editor.getHTML() !== activeChapterContent) {
      editor.commands.setContent(activeChapterContent || '<p></p>', { emitUpdate: false })
    }
  }, [activeChapterContent, activeChapterId, editor])

  useEffect(() => {
    if (!editor) return
    // LanguageTool documents this attribute as its per-editor opt-out. Apply it
    // directly to ProseMirror's contenteditable root so dynamically mounted
    // editors are recognized before an extension begins a full-document scan.
    editor.view.dom.setAttribute('data-lt-active', allowExternalProofreading ? 'true' : 'false')
  }, [allowExternalProofreading, editor])

  useEffect(() => {
    if (!editor || !activeChapterId) return
    const goToScene = (event: Event) => {
      const sceneIndex = (event as CustomEvent<{ index: number }>).detail.index
      const positions: number[] = [1]
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === 'sceneBreak') positions.push(position + node.nodeSize)
      })
      const requested = positions[Math.max(0, Math.min(sceneIndex, positions.length - 1))]
      const position = Math.max(0, Math.min(requested, editor.state.doc.content.size))
      const selection = TextSelection.near(editor.state.doc.resolve(position), 1)
      editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
      editor.view.focus()
    }
    const reportScene = () => {
      let index = 0
      const selectionPosition = editor.state.selection.from
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === 'sceneBreak' && position < selectionPosition) index += 1
      })
      window.dispatchEvent(new CustomEvent('typesetly:active-scene', {
        detail: { chapterId: activeChapterId, index },
      }))
    }
    window.addEventListener('typesetly:scene', goToScene)
    editor.on('selectionUpdate', reportScene)
    reportScene()
    return () => {
      window.removeEventListener('typesetly:scene', goToScene)
      editor.off('selectionUpdate', reportScene)
    }
  }, [activeChapterId, editor])

  useEffect(() => {
    if (!editor || !activeChapterId) return
    const findMatch = (event: Event) => {
      const detail = (event as CustomEvent<{
        chapterId: string
        query: string
        occurrence: number
        caseSensitive: boolean
        replaceWith?: string
      }>).detail
      if (!detail || detail.chapterId !== activeChapterId || !detail.query) return

      const ranges: Array<{ from: number; to: number }> = []
      editor.state.doc.descendants((node, position) => {
        if (!node.isText || !node.text) return
        for (const match of findTextOccurrences(node.text, detail.query, detail.caseSensitive)) {
          ranges.push({
            from: position + match.index,
            to: position + match.index + match.length,
          })
        }
      })
      const range = ranges[detail.occurrence]
      if (!range) return
      const transaction = detail.replaceWith === undefined
        ? editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from, range.to))
        : editor.state.tr.insertText(detail.replaceWith, range.from, range.to)
      editor.view.dispatch(transaction.scrollIntoView())
      editor.view.focus()
    }
    window.addEventListener('typesetly:find-match', findMatch)
    return () => window.removeEventListener('typesetly:find-match', findMatch)
  }, [activeChapterId, editor])

  useEffect(() => {
    const closePopoverMenus = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (!target.closest('.chapter-settings, .chapter-options')) setOptionsOpen(false)
      if (!target.closest('.wordcount-btn, .wordcount-menu')) setWordMenu(false)
      if (!target.closest('.text-options-wrap')) setTextOptionsOpen(false)
    }
    document.addEventListener('pointerdown', closePopoverMenus)
    return () => document.removeEventListener('pointerdown', closePopoverMenus)
  }, [])

  const wordCount = useMemo(() => {
    if (!activeChapter) return 0
    return countWords(activeChapter.content)
  }, [activeChapter])

  if (!project || !activeChapter) {
    return <div className="editor-pane empty">Select a chapter to begin.</div>
  }

  const isFrontOrSpecial =
    activeChapter.type !== 'chapter' && activeChapter.type !== 'part'
  const hasGeneratedTitle = activeChapter.type === 'title-page' || activeChapter.type === 'contents'

  const applyStyle = (value: string) => {
    if (!editor) return
    setStyleLabel(value)
    if (value === 'Paragraph') editor.chain().focus().setParagraph().run()
    if (value.startsWith('Heading')) {
      const level = Number(value.split(' ')[1]) as 1 | 2 | 3 | 4 | 5 | 6
      editor.chain().focus().toggleHeading({ level }).run()
    }
    if (value === 'Quote') editor.chain().focus().toggleBlockquote().run()
  }

  const addLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    setLinkValue(prev || 'https://')
    setLinkOpen(true)
  }

  const confirmLink = () => {
    if (!editor) return
    const url = linkValue.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
    setLinkOpen(false)
  }

  const insertFootnote = () => {
    setNoteValue('')
    setNoteOpen(true)
  }

  const insertSceneBreak = () => {
    if (!editor) return
    editor.chain().focus().insertContent([
      { type: 'sceneBreak' },
      { type: 'paragraph' },
    ]).run()
  }

  const confirmFootnote = () => {
    if (!editor || !noteValue.trim()) return
    editor.chain().focus().insertContent({
      type: 'footnote',
      attrs: { id: `note-${uuid()}`, text: noteValue.trim() },
    }).run()
    setNoteOpen(false)
  }

  const openBlockEditor = (variant: 'callout' | 'message') => {
    if (!editor) return
    const { $from, from, to } = editor.state.selection
    let activeCallout: { from: number; to: number; text: string; attrs: Record<string, unknown> } | null = null
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth)
      if (node.type.name !== 'callout') continue
      const nodeFrom = $from.before(depth)
      activeCallout = {
        from: nodeFrom,
        to: nodeFrom + node.nodeSize,
        text: node.textBetween(0, node.content.size, '\n'),
        attrs: node.attrs as Record<string, unknown>,
      }
      break
    }
    const attrs = activeCallout?.attrs || {}
    setBlockEditing(Boolean(activeCallout))
    setBlockVariant((attrs?.variant as typeof blockVariant) || variant)
    setBlockBackground(String(attrs?.background || '#f2f6fa'))
    setBlockBorder(String(attrs?.border || '#9aa7b2'))
    setBlockSender(String(attrs?.sender || ''))
    setBlockDirection((attrs?.direction as typeof blockDirection) || 'outgoing')
    setBlockTheme((attrs?.theme as typeof blockTheme) || 'ios')
    setBlockText(activeCallout?.text || editor.state.doc.textBetween(from, to, '\n') || '')
    blockRangeRef.current = activeCallout || { from, to }
    setPresetName('')
    setBlockOpen(true)
  }

  const applyBlock = () => {
    if (!editor) {
      setBlockOpen(false)
      return
    }
    const node = buildCalloutNode({
      variant: blockVariant,
      background: blockBackground,
      border: blockBorder,
      sender: blockSender,
      direction: blockDirection,
      theme: blockTheme,
    }, blockText)
    const range = blockRangeRef.current || editor.state.selection
    setBlockOpen(false)
    blockRangeRef.current = null
    try {
      const applied = replaceCalloutRange(editor, range, node)
      if (!applied) {
        window.dispatchEvent(new CustomEvent('typesetly:notice', {
          detail: 'The block could not be inserted at the current selection.',
        }))
        return
      }
      window.requestAnimationFrame(() => {
        if (!editor.isDestroyed) editor.view.focus()
      })
    } catch (error) {
      window.dispatchEvent(new CustomEvent('typesetly:notice', {
        detail: error instanceof Error ? error.message : 'The block could not be inserted.',
      }))
    }
  }

  const insertStyledBlock = (type: 'verse' | 'hangingIndent' | 'attributedQuote') => {
    if (!editor) return
    const placeholder = type === 'verse'
      ? 'Verse or poetry text'
      : type === 'hangingIndent'
        ? 'Hanging indent text'
        : 'Quoted text'

    for (const existing of ['verse', 'hangingIndent', 'attributedQuote'] as const) {
      if (existing !== type && editor.isActive(existing)) editor.chain().focus().lift(existing).run()
    }

    if (!editor.state.selection.empty) {
      editor.chain().focus().wrapIn(type, { attribution: '' }).run()
      return
    }

    editor.chain().focus().insertContent({
      type,
      attrs: { attribution: '' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: placeholder }] }],
    }).run()
  }

  const removeStyledBlock = () => {
    if (!editor) return
    for (const type of ['verse', 'hangingIndent', 'attributedQuote'] as const) {
      if (editor.isActive(type)) editor.chain().focus().lift(type).run()
    }
  }

  const openQuoteAttribution = () => {
    if (!editor?.isActive('attributedQuote')) return
    setQuoteAttribution(String(editor.getAttributes('attributedQuote').attribution || ''))
    setQuoteOpen(true)
  }

  const applyTextTool = (value: string) => {
    if (!editor || !value) return
    const chain = editor.chain().focus()
    if (value === 'smallCaps') chain.toggleMark('smallCaps').run()
    if (value === 'sansSerif') chain.toggleMark('sansSerif').run()
    if (value === 'monospace') chain.toggleMark('monospace').run()
    if (value === 'subscript') chain.toggleMark('subscript').run()
    if (value === 'superscriptText') chain.toggleMark('superscriptText').run()
    if (value === 'clear') chain.unsetAllMarks().run()
  }

  const applyTextAppearance = (
    attribute: 'fontFamily' | 'fontSize' | 'color' | 'backgroundColor' | 'letterSpacing' | 'textTransform',
    value: string,
  ) => {
    if (!editor) return
    const current = editor.getAttributes('textAppearance')
    const next = { ...current, [attribute]: value || null }
    if (Object.values(next).every((entry) => !entry)) {
      editor.chain().focus().unsetMark('textAppearance').run()
    } else {
      editor.chain().focus().setMark('textAppearance', next).run()
    }
  }

  const clearTextAppearance = () => {
    editor?.chain().focus().unsetMark('textAppearance').run()
  }

  const insertImage = async (file: File) => {
    try {
      const processed = await processImageFile(file)
      editor?.chain().focus().insertContent({
        type: 'manuscriptImage',
        attrs: {
          src: processed.dataUrl,
          alt: '',
          caption: '',
          layout: 'inline',
          width: 100,
          link: '',
          decorative: false,
          naturalWidth: processed.width,
          naturalHeight: processed.height,
          bytes: processed.bytes,
          focalX: 50,
          focalY: 50,
        },
      }).run()
      setImageAlt('')
      setImageCaption('')
      setImageLayout('inline')
      setImageWidth(100)
      setImageLink('')
      setImageDecorative(false)
      setImageFocalX(50)
      setImageFocalY(50)
      setImageOpen(true)
    } catch (error) {
      window.dispatchEvent(new CustomEvent('typesetly:notice', {
        detail: error instanceof Error ? error.message : 'The image could not be imported.',
      }))
    }
  }

  const openImageSettings = () => {
    if (!editor?.isActive('manuscriptImage')) {
      imageRef.current?.click()
      return
    }
    const attrs = editor.getAttributes('manuscriptImage')
    setImageAlt(String(attrs.alt || ''))
    setImageCaption(String(attrs.caption || ''))
    setImageLayout(String(attrs.layout || 'inline'))
    setImageWidth(Number(attrs.width || 100))
    setImageLink(String(attrs.link || ''))
    setImageDecorative(Boolean(attrs.decorative))
    setImageFocalX(Number(attrs.focalX || 50))
    setImageFocalY(Number(attrs.focalY || 50))
    setImageOpen(true)
  }

  const applyImageSettings = () => {
    editor?.chain().focus().updateAttributes('manuscriptImage', {
      alt: imageDecorative ? '' : imageAlt.trim(),
      caption: imageCaption.trim(),
      layout: imageLayout,
      width: imageWidth,
      link: imageLink.trim(),
      decorative: imageDecorative,
      focalX: imageFocalX,
      focalY: imageFocalY,
    }).run()
    setImageOpen(false)
  }

  const prefs = project.editorPrefs
  const textAppearance = editor?.getAttributes('textAppearance') || {}
  const hasTextAppearance = Object.values(textAppearance).some(Boolean)
  const selectedTextColor =
    typeof textAppearance.color === 'string' && /^#[0-9a-f]{6}$/i.test(textAppearance.color)
      ? textAppearance.color
      : '#221a1e'
  const selectedHighlight =
    typeof textAppearance.backgroundColor === 'string'
    && /^#[0-9a-f]{6}$/i.test(textAppearance.backgroundColor)
      ? textAppearance.backgroundColor
      : '#fff0a8'

  const splitAtCursor = () => {
    if (!editor || !activeChapter || activeChapter.type !== 'chapter') return
    const position = editor.state.selection.anchor
    const serializer = DOMSerializer.fromSchema(editor.schema)
    const toHtml = (from: number, to: number) => {
      const wrapper = document.createElement('div')
      const fragment = editor.state.doc.content.cut(from, to)
      wrapper.appendChild(serializer.serializeFragment(fragment))
      return wrapper.innerHTML || '<p></p>'
    }
    const before = toHtml(0, Math.max(0, position - 1))
    const after = toHtml(Math.max(0, position - 1), editor.state.doc.content.size)
    if (after === '<p></p>' || !wrapperText(after)) return
    splitChapter(activeChapter.id, before, after)
  }

  return (
    <section className="editor-pane">
      <div className="editor-toolbar">
        <span className="toolbar-brand">Draft desk</span>
        <div className="toolbar-group toolbar-character">
          <button type="button" className={editor?.isActive('bold') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold"><Bold size={15} strokeWidth={2.4} /></button>
          <button type="button" className={editor?.isActive('italic') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><Italic size={15} /></button>
          <button type="button" className={editor?.isActive('underline') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={15} /></button>
          <button type="button" className={editor?.isActive('strike') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough size={15} /></button>
          <button type="button" className={editor?.isActive('code') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleCode().run()} title="Inline code"><Code2 size={15} /></button>
          <div className="text-options-wrap">
            <button
              type="button"
              className={hasTextAppearance ? 'typography-button active' : 'typography-button'}
              aria-expanded={textOptionsOpen}
              aria-haspopup="dialog"
              title="Advanced typography"
              onClick={() => setTextOptionsOpen((open) => !open)}
            >
              <Type size={15} />
              <span>Typography</span>
            </button>
            {textOptionsOpen && (
              <div className="text-options-popover" role="dialog" aria-label="Advanced typography">
                <div className="text-options-heading">
                  <div>
                    <strong>Text appearance</strong>
                    <span>Apply to the selection or your next typed text.</span>
                  </div>
                  <button type="button" onClick={clearTextAppearance} disabled={!hasTextAppearance}>
                    Reset
                  </button>
                </div>
                <div className="text-quick-styles" aria-label="Quick character styles">
                  <button
                    type="button"
                    className={editor?.isActive('smallCaps') ? 'active' : ''}
                    onClick={() => applyTextTool('smallCaps')}
                  >
                    Small caps
                  </button>
                  <button
                    type="button"
                    className={editor?.isActive('subscript') ? 'active' : ''}
                    onClick={() => applyTextTool('subscript')}
                  >
                    Subscript
                  </button>
                  <button
                    type="button"
                    className={editor?.isActive('superscriptText') ? 'active' : ''}
                    onClick={() => applyTextTool('superscriptText')}
                  >
                    Superscript
                  </button>
                  <button
                    type="button"
                    className={editor?.isActive('monospace') ? 'active' : ''}
                    onClick={() => applyTextTool('monospace')}
                  >
                    Monospace
                  </button>
                  <button type="button" onClick={() => applyTextTool('clear')}>
                    Clear all
                  </button>
                </div>
                <div className="text-options-grid">
                  <label>
                    Font family
                    <select
                      value={String(textAppearance.fontFamily || '')}
                      onChange={(event) => applyTextAppearance('fontFamily', event.target.value)}
                    >
                      <option value="">Theme font</option>
                      {FONT_FAMILY_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.fonts.map((font) => <option key={font}>{font}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label>
                    Size
                    <select
                      value={String(textAppearance.fontSize || '')}
                      onChange={(event) => applyTextAppearance('fontSize', event.target.value)}
                    >
                      <option value="">Theme size</option>
                      {TEXT_SIZES.map((size) => (
                        <option key={size} value={`${size}px`}>{size} px</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Letter spacing
                    <select
                      value={String(textAppearance.letterSpacing || '')}
                      onChange={(event) => applyTextAppearance('letterSpacing', event.target.value)}
                    >
                      {TRACKING_OPTIONS.map((option) => (
                        <option key={option.label} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Letter case
                    <select
                      value={String(textAppearance.textTransform || '')}
                      onChange={(event) => applyTextAppearance('textTransform', event.target.value)}
                    >
                      <option value="">As typed</option>
                      <option value="uppercase">UPPERCASE</option>
                      <option value="lowercase">lowercase</option>
                      <option value="capitalize">Title Case</option>
                    </select>
                  </label>
                </div>
                <div className="text-color-section">
                  <span>Text color</span>
                  <div className="text-swatches">
                    {TEXT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={textAppearance.color === color ? 'selected' : ''}
                        style={{ '--swatch': color } as CSSProperties}
                        aria-label={`Text color ${color}`}
                        title={color}
                        onClick={() => applyTextAppearance('color', color)}
                      />
                    ))}
                    <label className="custom-color" title="Custom text color">
                      <input
                        type="color"
                        value={selectedTextColor}
                        aria-label="Custom text color"
                        onChange={(event) => applyTextAppearance('color', event.target.value)}
                      />
                      +
                    </label>
                    <button type="button" className="clear-color" onClick={() => applyTextAppearance('color', '')}>
                      Default
                    </button>
                  </div>
                </div>
                <div className="text-color-section">
                  <span>Highlight</span>
                  <div className="text-swatches">
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={textAppearance.backgroundColor === color ? 'selected' : ''}
                        style={{ '--swatch': color } as CSSProperties}
                        aria-label={`Highlight color ${color}`}
                        title={color}
                        onClick={() => applyTextAppearance('backgroundColor', color)}
                      />
                    ))}
                    <label className="custom-color" title="Custom highlight color">
                      <input
                        type="color"
                        value={selectedHighlight}
                        aria-label="Custom highlight color"
                        onChange={(event) => applyTextAppearance('backgroundColor', event.target.value)}
                      />
                      +
                    </label>
                    <button type="button" className="clear-color" onClick={() => applyTextAppearance('backgroundColor', '')}>
                      None
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-divider" />
        <div className="style-select-wrap">
          <select className="style-select" value={styleLabel} onChange={(e) => applyStyle(e.target.value)}>
            <option>Paragraph</option>
            <option>Heading 2</option>
            <option>Heading 3</option>
            <option>Heading 4</option>
            <option>Heading 5</option>
            <option>Heading 6</option>
            <option>Quote</option>
          </select>
          <ChevronDown size={14} className="style-chevron" />
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <button type="button" className={editor?.isActive({ textAlign: 'left' }) ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></button>
          <button type="button" className={editor?.isActive({ textAlign: 'center' }) ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></button>
          <button type="button" className={editor?.isActive({ textAlign: 'right' }) ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></button>
          <button type="button" className={editor?.isActive({ textAlign: 'justify' }) ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}><AlignJustify size={15} /></button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <button type="button" className={editor?.isActive('bulletList') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></button>
          <button type="button" className={editor?.isActive('orderedList') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></button>
          <button type="button" className={editor?.isActive('blockquote') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={15} /></button>
          <button type="button" className="tb" title="Insert scene break" aria-label="Insert scene break" onClick={insertSceneBreak}><Minus size={15} /></button>
          <button type="button" className="tb" title="Page break" aria-label="Insert page break" onClick={() => editor?.chain().focus().insertContent({ type: 'pageBreak' }).run()}><BetweenHorizontalStart size={15} /></button>
          <button type="button" className={editor?.isActive('manuscriptImage') ? 'tb active' : 'tb'} title="Insert or edit image" aria-label="Insert or edit image" onClick={openImageSettings}><ImagePlus size={15} /></button>
          <button type="button" className="tb" title="Link" onClick={addLink}><Link2 size={15} /></button>
          <button type="button" className="tb" title="Footnote" onClick={insertFootnote}><Superscript size={15} /></button>
          <button type="button" className={editor?.isActive('callout', { variant: 'callout' }) ? 'tb active' : 'tb'} title="Insert or edit callout box" onClick={() => openBlockEditor('callout')}><MessageSquare size={15} /></button>
          <button type="button" className={editor?.isActive('callout', { variant: 'message' }) ? 'tb active' : 'tb'} title="Insert or edit text message" onClick={() => openBlockEditor('message')}><Smartphone size={15} /></button>
          <select
            className="toolbar-menu toolbar-menu-block"
            value=""
            aria-label="Special block formatting"
            title="Special block formatting"
            onChange={(event) => {
              const value = event.target.value
              if (value === 'normal') removeStyledBlock()
              else if (value === 'quoteAttribution') openQuoteAttribution()
              else if (value) insertStyledBlock(value as 'verse' | 'hangingIndent' | 'attributedQuote')
            }}
          >
            <option value="">Special block</option>
            <option value="normal">Remove special style</option>
            <option value="verse">Verse</option>
            <option value="hangingIndent">Hanging indent</option>
            <option value="attributedQuote">Quotation</option>
            {editor?.isActive('attributedQuote') && <option value="quoteAttribution">Edit quotation attribution…</option>}
          </select>
          <button type="button" className="tb" title="Split chapter at cursor" disabled={activeChapter.type !== 'chapter'} onClick={splitAtCursor}><Scissors size={15} /></button>
          <button type="button" className="tb" title="Focus" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 size={15} /></button>
          <input
            ref={imageRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void insertImage(file)
              event.target.value = ''
            }}
          />
        </div>
        <div className="toolbar-spacer" />
        <div className="toolbar-group">
          <button type="button" className="tb" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></button>
          <button type="button" className="tb" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></button>
        </div>
      </div>

      <div className={prefs.typewriterScrolling ? 'editor-scroll typewriter' : 'editor-scroll'}>
        <div
          className="editor-sheet"
          style={{
            fontFamily: prefs.fontFamily,
            fontSize: prefs.fontSize,
            lineHeight: prefs.lineHeight,
          }}
        >
          <div className="chapter-meta">
            {!isFrontOrSpecial &&
              activeTheme.chapterHeading.imageEnabled &&
              !activeChapter.options.hideChapterImage &&
              (activeChapter.imageDataUrl || activeTheme.chapterHeading.sharedImageDataUrl) && (
              <div className="chapter-ornament" aria-hidden>
                <img
                  src={activeChapter.imageDataUrl || activeTheme.chapterHeading.sharedImageDataUrl}
                  alt=""
                />
              </div>
            )}
            <div className="chapter-titles">
              {hasGeneratedTitle ? (
                <h2 className="chapter-title-static">{activeChapter.title}</h2>
              ) : (
                <input
                  className="chapter-title-input"
                  value={activeChapter.title}
                  onChange={(e) => updateChapterTitle(activeChapter.id, e.target.value)}
                  placeholder="Chapter title"
                />
              )}
              {(activeChapter.type === 'chapter' || activeChapter.type === 'part') && (
                <input
                  className="chapter-subtitle-input"
                  value={activeChapter.subtitle}
                  onChange={(e) => updateChapterSubtitle(activeChapter.id, e.target.value)}
                  placeholder="Add subtitle"
                />
              )}
            </div>
            <button type="button" className="chapter-settings" title="Chapter settings" onClick={() => setOptionsOpen((v) => !v)}>
              <Settings size={16} />
            </button>
            {optionsOpen && (
              <ChapterOptionsMenu
                chapter={activeChapter}
                onClose={() => setOptionsOpen(false)}
              />
            )}
          </div>

          {activeChapter.type === 'title-page' ? (
            <div className="title-page-editor">
              <label className="tp-label" htmlFor="title-page-book-title">Book title</label>
              <input
                id="title-page-book-title"
                className="tp-title tp-input"
                value={project.details.title}
                onChange={(event) => updateDetails({ title: event.target.value })}
                placeholder="Book title"
              />
              <label className="tp-label" htmlFor="title-page-author">Author</label>
              <input
                id="title-page-author"
                className="tp-author tp-input"
                value={project.details.author}
                onChange={(event) => updateDetails({ author: event.target.value })}
                placeholder="Author name"
              />
              <input
                className="tp-sub tp-input"
                value={project.details.subtitle}
                onChange={(event) => updateDetails({ subtitle: event.target.value })}
                placeholder="Optional subtitle"
                aria-label="Book subtitle"
              />
              <div className="tp-series-row">
                <input
                  className="tp-input"
                  value={project.details.seriesName || ''}
                  onChange={(event) => updateDetails({ seriesName: event.target.value })}
                  placeholder="Optional series name"
                  aria-label="Series name"
                />
                <input
                  className="tp-input"
                  type="number"
                  min="0"
                  step="0.5"
                  value={project.details.seriesNumber ?? ''}
                  onChange={(event) => updateDetails({
                    seriesNumber: event.target.value ? Number(event.target.value) : undefined,
                  })}
                  placeholder="Book #"
                  aria-label="Series book number"
                />
              </div>
            </div>
          ) : activeChapter.type === 'contents' ? (
            <div className="contents-editor">
              <ol>
                {project.chapters
                  .filter((c) => (c.type === 'chapter' || c.type === 'part') && !c.options.hideInToc)
                  .map((c, i) => (
                    <li key={c.id}>
                      <span>
                        {c.type === 'part' ? c.title : `${i + 1}. ${c.title}`}
                      </span>
                    </li>
                  ))}
              </ol>
            </div>
          ) : (
            <EditorContent
              editor={editor}
              spellCheck={prefs.spellcheck}
              data-lt-active={allowExternalProofreading ? 'true' : 'false'}
              className={`editor-content ${prefs.paragraphStyle} ${prefs.textAlign}`}
            />
          )}
        </div>
      </div>

      <footer className="editor-status">
        <div className="status-left">
          <span className={saveStatus === 'saved' ? 'saved-dot ok' : saveStatus === 'error' ? 'saved-dot error' : 'saved-dot dirty'} />
          <span>{saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Saving…'}</span>
        </div>
        <div className="status-center">
          <button type="button" className="status-btn" onClick={() => void import('../export/docx').then(({ exportProjectToDocx }) => exportProjectToDocx(project))}>
            <FileDown size={14} /> Export .docx
          </button>
          <button
            type="button"
            className={timerRunning ? 'status-btn active' : 'status-btn'}
            onClick={toggleTimer}
            onContextMenu={(e) => { e.preventDefault(); resetTimer() }}
            title="Sprint timer · right-click reset"
          >
            <Clock size={14} />
            {timerRunning || timerSeconds > 0 ? formatTimer(timerSeconds) : 'Timer'}
          </button>
        </div>
        <div className="status-right">
          <button type="button" className="wordcount-btn" onClick={() => setWordMenu((value) => !value)} aria-expanded={wordMenu}>
            Chapter – {wordCount} words
            <ChevronDown size={14} />
          </button>
          {wordMenu && (
            <div className="wordcount-menu">
              <span>Current chapter <strong>{wordCount.toLocaleString()}</strong></span>
              <span>Whole book <strong>{countBookWords(project).toLocaleString()}</strong></span>
              <span>Goal <strong>{project.goals.bookWordTarget.toLocaleString()}</strong></span>
            </div>
          )}
        </div>
      </footer>
      {linkOpen && (
        <Dialog
          title="Add a link"
          confirmLabel="Apply link"
          onCancel={() => setLinkOpen(false)}
          onConfirm={confirmLink}
        >
          <label>
            URL
            <input value={linkValue} onChange={(event) => setLinkValue(event.target.value)} />
          </label>
          <label>
            Or link to a chapter
            <select value={linkValue.startsWith('#') ? linkValue : ''} onChange={(event) => setLinkValue(event.target.value)}>
              <option value="">Choose a destination</option>
              {project.chapters.map((chapter) => <option key={chapter.id} value={`#chapter-${chapter.id}`}>{chapter.title}</option>)}
            </select>
          </label>
        </Dialog>
      )}
      {noteOpen && (
        <Dialog
          title="Add a footnote or endnote"
          description="Placement is controlled by the active formatting theme."
          confirmLabel="Insert note"
          onCancel={() => setNoteOpen(false)}
          onConfirm={confirmFootnote}
        >
          <label>
            Note text
            <textarea rows={5} value={noteValue} onChange={(event) => setNoteValue(event.target.value)} />
          </label>
        </Dialog>
      )}
      {imageOpen && (
        <Dialog title="Image Settings" confirmLabel="Apply" onCancel={() => setImageOpen(false)} onConfirm={applyImageSettings}>
          <label className="check-row">
            <input type="checkbox" checked={imageDecorative} onChange={(event) => setImageDecorative(event.target.checked)} />
            Decorative image
          </label>
          {!imageDecorative && <label>Alt text<input maxLength={140} value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} /></label>}
          <label>Caption<input value={imageCaption} onChange={(event) => setImageCaption(event.target.value)} /></label>
          <label>
            Layout
            <select value={imageLayout} onChange={(event) => setImageLayout(event.target.value)}>
              <option value="inline">Inline</option>
              <option value="wide">Wide</option>
              <option value="full-page">Full page</option>
              <option value="two-page">Two-page spread</option>
            </select>
          </label>
          <label>Width ({imageWidth}%)<input type="range" min={20} max={100} value={imageWidth} onChange={(event) => setImageWidth(Number(event.target.value))} /></label>
          <label>Horizontal focal point ({imageFocalX}%)<input type="range" min={0} max={100} value={imageFocalX} onChange={(event) => setImageFocalX(Number(event.target.value))} /></label>
          <label>Vertical focal point ({imageFocalY}%)<input type="range" min={0} max={100} value={imageFocalY} onChange={(event) => setImageFocalY(Number(event.target.value))} /></label>
          <label>Optional image link<input value={imageLink} onChange={(event) => setImageLink(event.target.value)} placeholder="https:// or #chapter…" /></label>
        </Dialog>
      )}

      {quoteOpen && (
        <Dialog
          title="Quotation Attribution"
          description="Optional. This appears beneath the quotation."
          confirmLabel="Apply"
          onCancel={() => setQuoteOpen(false)}
          onConfirm={() => {
            editor?.chain().focus().updateAttributes('attributedQuote', {
              attribution: quoteAttribution.trim(),
            }).run()
            setQuoteOpen(false)
          }}
        >
          <label>
            Attribution
            <input
              value={quoteAttribution}
              onChange={(event) => setQuoteAttribution(event.target.value)}
              placeholder="Author or source"
            />
          </label>
        </Dialog>
      )}
      {blockOpen && (
        <Dialog
          title={`${blockEditing ? 'Edit' : 'Add'} ${blockVariant === 'message' ? 'Text Message' : 'Callout Box'}`}
          confirmLabel={blockEditing ? 'Apply Changes' : 'Insert Block'}
          onCancel={() => {
            setBlockOpen(false)
            blockRangeRef.current = null
          }}
          onConfirm={applyBlock}
        >
          {(project.calloutPresets || []).length > 0 && (
            <label>
              Saved preset
              <select
                defaultValue=""
                onChange={(event) => {
                  const preset = project.calloutPresets?.find((item) => item.id === event.target.value)
                  if (!preset) return
                  setBlockVariant(preset.variant)
                  setBlockBackground(preset.background)
                  setBlockBorder(preset.border)
                  setBlockDirection(preset.direction)
                  setBlockTheme(preset.messageTheme)
                }}
              >
                <option value="">Choose a preset</option>
                {project.calloutPresets?.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </label>
          )}
          <label>
            Block type
            <select value={blockVariant} onChange={(event) => setBlockVariant(event.target.value as typeof blockVariant)}>
              <option value="callout">Callout box</option>
              <option value="message">Text message</option>
            </select>
          </label>
          <label>
            {blockVariant === 'message' ? 'Message text' : 'Callout text'}
            <textarea
              rows={4}
              value={blockText}
              onChange={(event) => setBlockText(event.target.value)}
              placeholder={blockVariant === 'message' ? 'Type the message…' : 'Type the callout…'}
            />
          </label>
          {blockVariant === 'callout' ? (
            <div className="block-color-grid">
              <label>Background<input type="color" value={blockBackground} onChange={(event) => setBlockBackground(event.target.value)} /></label>
              <label>Border<input type="color" value={blockBorder} onChange={(event) => setBlockBorder(event.target.value)} /></label>
            </div>
          ) : (
            <>
              <label>Sender<input value={blockSender} onChange={(event) => setBlockSender(event.target.value)} /></label>
              <label>
                Direction
                <select value={blockDirection} onChange={(event) => setBlockDirection(event.target.value as typeof blockDirection)}>
                  <option value="incoming">Incoming</option>
                  <option value="outgoing">Outgoing</option>
                </select>
              </label>
              <label>
                Appearance
                <select value={blockTheme} onChange={(event) => setBlockTheme(event.target.value as typeof blockTheme)}>
                  <option value="ios">iOS style</option>
                  <option value="android">Android style</option>
                </select>
              </label>
            </>
          )}
          <div
            className={
              blockVariant === 'message'
                ? `block-live-preview text-message ${blockDirection} ${blockTheme}`
                : 'block-live-preview callout-preview'
            }
            style={blockVariant === 'callout'
              ? { backgroundColor: blockBackground, borderColor: blockBorder }
              : undefined}
          >
            {blockVariant === 'message' && blockSender && <strong>{blockSender}</strong>}
            <span>{blockText.trim() || (blockVariant === 'message' ? 'New message' : 'Callout text')}</span>
          </div>
          <div className="preset-save-row">
            <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" />
            <button
              type="button"
              disabled={!presetName.trim()}
              onClick={() => {
                saveCalloutPreset({
                  name: presetName.trim(),
                  variant: blockVariant,
                  background: blockBackground,
                  border: blockBorder,
                  direction: blockDirection,
                  messageTheme: blockTheme,
                })
                setPresetName('')
              }}
            >
              Save preset
            </button>
          </div>
          {(project.calloutPresets || []).length > 0 && (
            <div className="preset-chips">
              {project.calloutPresets?.map((preset) => (
                <button type="button" key={preset.id} title="Delete preset" onClick={() => deleteCalloutPreset(preset.id)}>
                  {preset.name} ×
                </button>
              ))}
            </div>
          )}
        </Dialog>
      )}
    </section>
  )
}

function wrapperText(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || ''
}
