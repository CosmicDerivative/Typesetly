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
