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
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  HangingIndentBlock,
  VerseBlock,
} from '../editor/extensions'
import { Dialog } from './Dialog'
import { processImageFile } from '../images/process'
import { buildCalloutNode, replaceCalloutRange } from '../editor/callouts'
import { smartQuoteForInsertion } from '../editor/smartQuotes'

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
        if (text === '"' || text === "'") {
          const previousCharacter = view.state.doc.textBetween(Math.max(0, from - 1), from)
          const converted = smartQuoteForInsertion(text, previousCharacter)
          view.dispatch(view.state.tr.insertText(converted, from, to))
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
    const closePopoverMenus = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (!target.closest('.chapter-settings, .chapter-options')) setOptionsOpen(false)
      if (!target.closest('.wordcount-btn, .wordcount-menu')) setWordMenu(false)
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
  return (
    <main className="editor-pane">
      <header className="editor-toolbar">
        <button type="button"><strong>B</strong></button>
        <button type="button"><em>I</em></button>
        <span aria-live="polite">{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
      </header>
      <textarea
        aria-label="Manuscript"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Begin writing..."
      />
    </main>
  )
}
