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
    if (value === 'superscriptText') chain.toggleMark('superscriptText').run()
    if (value === 'clear') chain.unsetAllMarks().run()
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
        <div className="toolbar-group">
          <button type="button" className={editor?.isActive('bold') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold"><Bold size={15} strokeWidth={2.4} /></button>
          <button type="button" className={editor?.isActive('italic') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><Italic size={15} /></button>
          <button type="button" className={editor?.isActive('underline') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={15} /></button>
          <button type="button" className={editor?.isActive('strike') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough size={15} /></button>
          <button type="button" className={editor?.isActive('code') ? 'tb active' : 'tb'} onClick={() => editor?.chain().focus().toggleCode().run()} title="Inline code"><Code2 size={15} /></button>
          <select
            className="toolbar-menu"
            value=""
            aria-label="More text formatting"
            title="More text formatting"
            onChange={(event) => applyTextTool(event.target.value)}
          >
            <option value="">More text</option>
            <option value="smallCaps">Small caps</option>
            <option value="sansSerif">Sans serif</option>
            <option value="monospace">Monospace</option>
            <option value="subscript">Subscript</option>
            <option value="superscriptText">Superscript</option>
            <option value="clear">Clear character formatting</option>
          </select>
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
  )
}
