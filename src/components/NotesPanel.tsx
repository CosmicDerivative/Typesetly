import { Highlighter, Plus, RefreshCw, Search, StickyNote, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../BookContext'
import { normalizedSceneTitles, sceneCount } from '../editor/scenes'
import type { StickyNote as StickyNoteRecord, StickyNoteColor, StickyNoteTarget } from '../types'
import { Dialog } from './Dialog'
import { DrawerControls } from './DrawerControls'
import './NotesPanel.css'

const COLORS: StickyNoteColor[] = ['gold', 'coral', 'sage', 'blue', 'plum']

interface NoteFocus {
  target: StickyNoteTarget
  chapterId?: string
  sceneIndex?: number
  characterId?: string
  worldEntryId?: string
  noteId?: string
}

function targetKey(target: NoteFocus) {
  if (target.target === 'scene') return `scene:${target.chapterId || ''}:${target.sceneIndex ?? 0}`
  if (target.target === 'chapter') return `chapter:${target.chapterId || ''}`
  if (target.target === 'character') return `character:${target.characterId || ''}`
  if (target.target === 'world') return `world:${target.worldEntryId || ''}`
  if (target.target === 'selection') return `selection:${target.chapterId || ''}`
  return 'book'
}

function noteTargetKey(note: StickyNoteRecord) {
  return targetKey(note)
}

function matchesContext(note: StickyNoteRecord, context: NoteFocus) {
  if (context.target === 'chapter') return note.chapterId === context.chapterId
  if (context.target === 'scene') {
    return note.target === 'scene' &&
      note.chapterId === context.chapterId &&
      note.sceneIndex === context.sceneIndex
  }
  if (context.target === 'selection') {
    return note.target === 'selection' && note.chapterId === context.chapterId
  }
  if (context.target === 'character') {
    return note.target === 'character' && note.characterId === context.characterId
  }
  if (context.target === 'world') {
    return note.target === 'world' && note.worldEntryId === context.worldEntryId
  }
  return note.target === 'book'
}

function patchForTarget(value: string): Partial<StickyNoteRecord> {
  const [target, firstId, index] = value.split(':')
  const base = {
    chapterId: undefined,
    sceneIndex: undefined,
    characterId: undefined,
    worldEntryId: undefined,
  }
  if (target === 'chapter') return { ...base, target, chapterId: firstId }
  if (target === 'scene') return { ...base, target, chapterId: firstId, sceneIndex: Number(index) }
  if (target === 'character') return { ...base, target, characterId: firstId }
  if (target === 'world') return { ...base, target, worldEntryId: firstId }
  if (target === 'selection') return { ...base, target, chapterId: firstId }
  return { ...base, target: 'book' }
}

export function NotesPanel() {
  const {
    project,
    activeChapter,
    rightPanel,
    addStickyNote,
    updateStickyNote,
    deleteStickyNote,
  } = useApp()
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [context, setContext] = useState<NoteFocus | null>(null)
  const [contextOnly, setContextOnly] = useState(false)
  const [message, setMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StickyNoteRecord | null>(null)

  const notes = useMemo(() => project?.stickyNotes || [], [project?.stickyNotes])
  const storyBible = project?.storyBible

  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<NoteFocus>).detail
      if (!detail) return
      setContext(detail)
      setContextOnly(true)
      setQuery('')
      if (detail.noteId) setSelectedId(detail.noteId)
    }
    window.addEventListener('typesetly:notes-focus', onFocus)
    return () => window.removeEventListener('typesetly:notes-focus', onFocus)
  }, [])

  const targetOptions = useMemo(() => {
    if (!project) return []
    const options: Array<{ value: string; label: string }> = [
      { value: 'book', label: 'Whole book' },
    ]
    for (const page of project.chapters) {
      options.push({ value: `chapter:${page.id}`, label: `Page · ${page.title}` })
      if (page.type === 'chapter') {
        normalizedSceneTitles(page.sceneTitles, sceneCount(page.content)).forEach((title, index) => {
          options.push({ value: `scene:${page.id}:${index}`, label: `Scene · ${page.title} / ${title}` })
        })
      }
    }
    for (const character of storyBible?.characters || []) {
      options.push({ value: `character:${character.id}`, label: `Character · ${character.name}` })
    }
    for (const entry of storyBible?.world || []) {
      options.push({ value: `world:${entry.id}`, label: `World · ${entry.name}` })
    }
    return options
  }, [project, storyBible])

  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...notes]
      .filter((note) => !contextOnly || !context || matchesContext(note, context))
      .filter((note) =>
        !needle ||
        `${note.title} ${note.body} ${note.quote || ''}`.toLowerCase().includes(needle)
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }, [context, contextOnly, notes, query])

  useEffect(() => {
    if (notes.some((note) => note.id === selectedId)) return
    setSelectedId(visibleNotes[0]?.id || notes[0]?.id || '')
  }, [notes, selectedId, visibleNotes])

  if (rightPanel !== 'notes' || !project) return null

  const selectedNote = notes.find((note) => note.id === selectedId)
  const currentChapterContext: NoteFocus = {
    target: 'chapter',
    chapterId: activeChapter?.id,
  }

  const addNoteFor = (focus: NoteFocus | null = contextOnly ? context : currentChapterContext) => {
    const patch = focus ? patchForTarget(targetKey(focus)) : { target: 'book' as const }
    const id = addStickyNote({
      ...patch,
      title: focus?.target === 'character' ? 'Character note'
        : focus?.target === 'world' ? 'World note'
          : focus?.target === 'scene' ? 'Scene note'
            : focus?.target === 'chapter' ? 'Chapter note'
              : 'New note',
    })
    setSelectedId(id)
    setMessage('')
  }

  const captureSelection = () => {
    const quote = window.getSelection()?.toString().trim() || ''
    if (!quote) {
      setMessage('Highlight manuscript text first, then choose Attach selection.')
      return
    }
    const id = addStickyNote({
      title: 'Selection note',
      target: 'selection',
      chapterId: activeChapter?.id,
      quote,
      color: 'coral',
    })
    setSelectedId(id)
    setContext({ target: 'selection', chapterId: activeChapter?.id })
    setContextOnly(false)
    setMessage('Highlighted text attached.')
  }

  const sourceSnapshot = (note: StickyNoteRecord) => {
    if (note.target === 'character') {
      const character = storyBible?.characters.find((item) => item.id === note.characterId)
      if (!character) return ''
      return [
        character.summary,
        character.motivation && `Motivation: ${character.motivation}`,
        character.conflict && `Conflict: ${character.conflict}`,
        character.arc && `Arc: ${character.arc}`,
        character.relationships && `Relationships: ${character.relationships}`,
      ].filter(Boolean).join('\n\n')
    }
    if (note.target === 'world') {
      const entry = storyBible?.world.find((item) => item.id === note.worldEntryId)
      if (!entry) return ''
      return [
        entry.summary,
        entry.details,
        entry.rules && `Rules: ${entry.rules}`,
        entry.connections && `Connections: ${entry.connections}`,
      ].filter(Boolean).join('\n\n')
    }
    return ''
  }

  const targetLabel = (note: StickyNoteRecord) => {
    if (note.target === 'book') return 'Whole book'
    if (note.target === 'chapter' || note.target === 'selection') {
      return project.chapters.find((page) => page.id === note.chapterId)?.title || 'Missing page'
    }
    if (note.target === 'scene') {
      const chapter = project.chapters.find((page) => page.id === note.chapterId)
      const title = chapter
        ? normalizedSceneTitles(chapter.sceneTitles, sceneCount(chapter.content))[note.sceneIndex || 0]
        : ''
      return `${chapter?.title || 'Missing chapter'} / ${title || 'Scene'}`
    }
    if (note.target === 'character') {
      return storyBible?.characters.find((item) => item.id === note.characterId)?.name || 'Missing character'
    }
    return storyBible?.world.find((item) => item.id === note.worldEntryId)?.name || 'Missing world entry'
  }

  return (
    <>
      <aside className="side-panel notes-panel">
        <div className="sp-head">
          <div>
            <small>Margin notes</small>
            <strong>Sticky Notes</strong>
          </div>
          <DrawerControls panel="notes" />
        </div>

        <div className="notes-actions">
          <button type="button" onClick={() => addNoteFor()}><Plus size={14} /> New note</button>
          <button type="button" onClick={captureSelection}><Highlighter size={14} /> Attach selection</button>
        </div>

        <div className="notes-filter-row">
          <label>
            <Search size={13} />
            <input value={query} placeholder="Search notes…" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button
            type="button"
            className={contextOnly ? 'active' : ''}
            disabled={!context}
            onClick={() => setContextOnly((value) => !value)}
          >
            Context
          </button>
        </div>
        {context && (
          <div className="notes-context">
            <span>Showing {contextOnly ? 'only' : 'all notes; context is'} {targetKey(context).split(':')[0]}</span>
            <button type="button" onClick={() => { setContext(null); setContextOnly(false) }}>Clear</button>
          </div>
        )}
        {message && <p className="notes-message" role="status">{message}</p>}

        <div className="note-list">
          {visibleNotes.map((note) => (
            <button
              type="button"
              key={note.id}
              className={`note-list-item color-${note.color} ${note.id === selectedId ? 'active' : ''}`}
              onClick={() => setSelectedId(note.id)}
            >
              <StickyNote size={13} />
              <span><strong>{note.title || 'Untitled note'}</strong><small>{targetLabel(note)}</small></span>
            </button>
          ))}
          {!visibleNotes.length && <div className="notes-empty">No notes in this view.</div>}
        </div>

        {selectedNote && (
          <div className={`sticky-editor color-${selectedNote.color}`} key={selectedNote.id}>
            <div className="sticky-editor-head">
              <div className="note-colors" aria-label="Note color">
                {COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={selectedNote.color === color ? `color-${color} active` : `color-${color}`}
                    aria-label={`${color} note`}
                    onClick={() => updateStickyNote(selectedNote.id, { color })}
                  />
                ))}
              </div>
              <button
                type="button"
                className="note-delete"
                title="Delete note"
                aria-label="Delete note"
                onClick={() => setDeleteTarget(selectedNote)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              className="sticky-title"
              value={selectedNote.title}
              placeholder="Note title"
              onChange={(event) => updateStickyNote(selectedNote.id, { title: event.target.value })}
            />
            <label className="sticky-target">
              Attached to
              <select
                value={noteTargetKey(selectedNote)}
                onChange={(event) => updateStickyNote(selectedNote.id, patchForTarget(event.target.value))}
              >
                {selectedNote.target === 'selection' && (
                  <option value={noteTargetKey(selectedNote)}>Highlighted text</option>
                )}
                {targetOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            {selectedNote.quote && (
              <blockquote>
                “{selectedNote.quote}”
                <button type="button" onClick={() => updateStickyNote(selectedNote.id, { quote: undefined })}>Remove quote</button>
              </blockquote>
            )}
            <textarea
              rows={8}
              value={selectedNote.body}
              placeholder="Write a reminder, idea, question, or revision note…"
              onChange={(event) => updateStickyNote(selectedNote.id, { body: event.target.value })}
            />
            {(selectedNote.target === 'character' || selectedNote.target === 'world') && (
              <button
                type="button"
                className="pull-source"
                disabled={!sourceSnapshot(selectedNote)}
                onClick={() => {
                  const source = sourceSnapshot(selectedNote)
                  if (!source) return
                  updateStickyNote(selectedNote.id, {
                    body: selectedNote.body
                      ? `${selectedNote.body}\n\n— Source snapshot —\n${source}`
                      : source,
                  })
                }}
              >
                <RefreshCw size={13} /> Pull latest Story Bible details
              </button>
            )}
            <small className="note-updated">Updated {new Date(selectedNote.updatedAt).toLocaleString()}</small>
          </div>
        )}
      </aside>

      {deleteTarget && (
        <Dialog
          title="Delete sticky note?"
          description={`“${deleteTarget.title || 'Untitled note'}” will be permanently removed.`}
          confirmLabel="Delete note"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteStickyNote(deleteTarget.id)
            setDeleteTarget(null)
            setSelectedId('')
          }}
        />
      )}
    </>
  )
}
