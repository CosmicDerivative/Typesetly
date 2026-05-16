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
