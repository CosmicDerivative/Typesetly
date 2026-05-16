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

export function EditorPane() {
  const [text, setText] = useState('')

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
