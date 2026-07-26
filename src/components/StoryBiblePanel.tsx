import {
  BookCopy,
  BookOpen,
  Copy,
  Globe,
  Network,
  PanelRight,
  Plus,
  Search,
  StickyNote as StickyNoteIcon,
  TextSearch,
  Trash2,
  User,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../BookContext'
import { getMentionIndex, type EntityMentions } from '../story/mentions'
import {
  defaultStoryBible,
  type BookProject,
  type CharacterProfile,
  type WorldbuildingCategory,
  type WorldbuildingEntry,
} from '../types'
import { Dialog } from './Dialog'
import { DrawerControls } from './DrawerControls'
import { StoryMindMap } from './StoryMindMap'
import './StoryBiblePanel.css'

const WORLD_CATEGORIES: Array<{ value: WorldbuildingCategory; label: string }> = [
  { value: 'location', label: 'Location' },
  { value: 'culture', label: 'Culture' },
  { value: 'organization', label: 'Organization' },
  { value: 'history', label: 'History' },
  { value: 'magic', label: 'Magic system' },
  { value: 'technology', label: 'Technology' },
  { value: 'creature', label: 'Creature' },
  { value: 'object', label: 'Object' },
  { value: 'other', label: 'Other' },
]

type StoryTab = 'characters' | 'world' | 'map'
type StoryScope = 'book' | 'series'

type StoryRecordRow =
  | {
      key: string
      kind: 'characters'
      book: BookProject
      record: CharacterProfile
    }
  | {
      key: string
      kind: 'world'
      book: BookProject
      record: WorldbuildingEntry
    }

function tagsFromInput(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))]
}

function sameSeries(left?: string, right?: string) {
  return Boolean(
    left?.trim() &&
    right?.trim() &&
    left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0
  )
}

interface MentionSummaryProps {
  mentions?: EntityMentions
  onOpenChapter?: (chapterId: string) => void
}

function MentionSummary({ mentions, onOpenChapter }: MentionSummaryProps) {
  return (
    <div className="story-mention-summary">
      <div>
        <TextSearch size={15} />
        <span>
          <strong>{mentions?.total || 0}</strong>
          live manuscript {mentions?.total === 1 ? 'mention' : 'mentions'}
        </span>
      </div>
      <div className="story-mention-pages">
        {(mentions?.chapters || []).map((chapter) => (
          <button
            type="button"
            key={chapter.chapterId}
            disabled={!onOpenChapter}
            onClick={() => onOpenChapter?.(chapter.chapterId)}
          >
            {chapter.chapterTitle} <span>{chapter.count}</span>
          </button>
        ))}
        {!mentions?.chapters.length && <small>No manuscript references found yet.</small>}
      </div>
    </div>
  )
}

export function StoryBiblePanel() {
  const {
    books,
    project,
    mode,
    rightPanel,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    addWorldEntry,
    updateWorldEntry,
    deleteWorldEntry,
    addStoryRelationship,
    updateStoryRelationship,
    deleteStoryRelationship,
    addStickyNote,
    setActiveChapter,
    setMode,
    setRightPanel,
    setSidebarOpen,
    openBook,
  } = useApp()
  const workspace = mode === 'plan'
  const visible = workspace || rightPanel === 'story'
  const [tab, setTab] = useState<StoryTab>('characters')
  const [scope, setScope] = useState<StoryScope>('book')
  const [selectedKey, setSelectedKey] = useState('')
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'character' | 'world'
    id: string
    name: string
  } | null>(null)

  const bible = useMemo(
    () => project?.storyBible || defaultStoryBible(),
    [project?.storyBible],
  )
  const seriesBooks = useMemo(() => {
    if (!project) return []
    if (!project.details.seriesName?.trim()) return [project]
    return books
      .filter((book) => sameSeries(book.details.seriesName, project.details.seriesName))
      .sort((left, right) =>
        (left.details.seriesNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.details.seriesNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.details.title.localeCompare(right.details.title)
      )
  }, [books, project])
  const mentionIndexes = useMemo(
    () => visible
      ? new Map(seriesBooks.map((book) => [book.id, getMentionIndex(book)]))
      : new Map(),
    [seriesBooks, visible],
  )
  const rows = useMemo<StoryRecordRow[]>(() => {
    if (!project || tab === 'map') return []
    const sourceBooks = scope === 'series' ? seriesBooks : [project]
    if (tab === 'characters') {
      return sourceBooks.flatMap((book) =>
        (book.storyBible?.characters || []).map((record) => ({
          key: `${book.id}:${record.id}`,
          kind: 'characters' as const,
          book,
          record,
        }))
      )
    }
    return sourceBooks.flatMap((book) =>
      (book.storyBible?.world || []).map((record) => ({
        key: `${book.id}:${record.id}`,
        kind: 'world' as const,
        book,
        record,
      }))
    )
  }, [project, scope, seriesBooks, tab])
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return rows
    return rows.filter(({ book, record }) =>
      `${record.name} ${record.summary} ${record.tags.join(' ')} ${book.details.title}`
        .toLocaleLowerCase()
        .includes(needle)
    )
  }, [query, rows])

  useEffect(() => {
    if (rows.some((row) => row.key === selectedKey)) return
    setSelectedKey(rows[0]?.key || '')
  }, [rows, selectedKey])

  useEffect(() => {
    if (!project?.details.seriesName?.trim()) setScope('book')
  }, [project?.details.seriesName])

  if (!visible || !project) return null

  const selectedRow = rows.find((row) => row.key === selectedKey)
  const selectedCharacter = selectedRow?.kind === 'characters' ? selectedRow.record : undefined
  const selectedWorld = selectedRow?.kind === 'world' ? selectedRow.record : undefined
  const selectedIsCurrent = selectedRow?.book.id === project.id
  const selectedMentions = selectedRow
    ? mentionIndexes.get(selectedRow.book.id)?.[selectedRow.record.id]
    : undefined
  const hasSeries = Boolean(project.details.seriesName?.trim())

  const selectTab = (nextTab: StoryTab) => {
    setTab(nextTab)
    setQuery('')
    setSelectedKey('')
    if (nextTab === 'map') setScope('book')
  }

  const addRecord = () => {
    if (tab === 'map') return
    const id = tab === 'characters' ? addCharacter() : addWorldEntry()
    setScope('book')
    setSelectedKey(`${project.id}:${id}`)
    setQuery('')
  }

  const copyRecordToCurrentBook = (row: StoryRecordRow) => {
    if (row.book.id === project.id) return
    if (row.kind === 'characters') {
      const { id: _sourceId, ...copy } = row.record
      const id = addCharacter()
      updateCharacter(id, copy)
      setTab('characters')
      setScope('book')
      setSelectedKey(`${project.id}:${id}`)
    } else {
      const { id: _sourceId, ...copy } = row.record
      const id = addWorldEntry(row.record.category)
      updateWorldEntry(id, copy)
      setTab('world')
      setScope('book')
      setSelectedKey(`${project.id}:${id}`)
    }
  }

  const openMention = (bookId: string, chapterId: string) => {
    if (bookId !== project.id) {
      openBook(bookId)
      if (workspace) setMode('plan')
      return
    }
    setActiveChapter(chapterId)
    if (workspace) {
      setMode('draft')
      return
    }
    setRightPanel('none')
  }

  const openSeriesBook = (bookId: string) => {
    openBook(bookId)
    if (!workspace) return
    setMode('plan')
    setSidebarOpen(false)
    setRightPanel('none')
  }

  const openLinkedNotes = (
    kind: 'character' | 'world',
    id: string,
    name: string,
    startingText: string,
  ) => {
    const existing = (project.stickyNotes || []).find((note) =>
      kind === 'character'
        ? note.target === 'character' && note.characterId === id
        : note.target === 'world' && note.worldEntryId === id
    )
    const link = kind === 'character'
      ? { target: 'character' as const, characterId: id }
      : { target: 'world' as const, worldEntryId: id }
    const noteId = existing?.id || addStickyNote({
      ...link,
      title: `${name || (kind === 'character' ? 'Character' : 'World entry')} notes`,
      body: startingText,
      color: 'sage',
    })
    setRightPanel('notes')
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('typesetly:notes-focus', {
          detail: { ...link, noteId },
        }))
      })
    })
  }

  const linkedNoteCount = (kind: 'character' | 'world', id: string) =>
    (project.stickyNotes || []).filter((note) =>
      kind === 'character'
        ? note.target === 'character' && note.characterId === id
        : note.target === 'world' && note.worldEntryId === id
    ).length

  return (
    <>
      <section
        className={workspace ? 'story-planner-view' : 'side-panel story-bible-panel'}
        aria-label={workspace ? 'Plan workspace' : 'Story reference drawer'}
      >
        <div className="sp-head story-studio-head">
          <div>
            <small>Continuity and planning</small>
            <strong>Story Studio</strong>
            <span>Map the people, places, and relationships behind the manuscript.</span>
          </div>
          {workspace ? (
            <button
              type="button"
              className="plan-open-draft-action"
              onClick={() => {
                setRightPanel('story')
                setMode('draft')
              }}
            >
              <PanelRight size={14} /> Open beside Draft
            </button>
          ) : (
            <DrawerControls panel="story" />
          )}
        </div>

        <div className="story-tabs" role="tablist" aria-label="Story Studio section">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'characters'}
            className={tab === 'characters' ? 'active' : ''}
            onClick={() => selectTab('characters')}
          >
            <User size={14} /> Characters <span>{bible.characters.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'world'}
            className={tab === 'world' ? 'active' : ''}
            onClick={() => selectTab('world')}
          >
            <Globe size={14} /> World <span>{bible.world.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'map'}
            className={tab === 'map' ? 'active' : ''}
            onClick={() => selectTab('map')}
          >
            <Network size={14} /> Mind map <span>{bible.relationships.length}</span>
          </button>
        </div>

        {tab !== 'map' && (
          <div className="story-scope-bar">
            <div className="story-scope-toggle">
              <button
                type="button"
                className={scope === 'book' ? 'active' : ''}
                onClick={() => setScope('book')}
              >
                This book
              </button>
              <button
                type="button"
                className={scope === 'series' ? 'active' : ''}
                disabled={!hasSeries}
                onClick={() => setScope('series')}
              >
                Series <span>{seriesBooks.length}</span>
              </button>
            </div>
            <div className="story-series-label">
              <BookCopy size={13} />
              {hasSeries
                ? <span><strong>{project.details.seriesName}</strong> · Book {project.details.seriesNumber || '?'}</span>
                : <span>Add a series in Book profile to browse continuity across volumes.</span>}
            </div>
          </div>
        )}

        {tab === 'map' ? (
          <StoryMindMap
            bible={bible}
            onAdd={(sourceId, targetId, label) => {
              addStoryRelationship(sourceId, targetId, label)
            }}
            onUpdate={updateStoryRelationship}
            onDelete={deleteStoryRelationship}
            onSelectEntity={(kind, id) => {
              setTab(kind)
              setScope('book')
              setSelectedKey(`${project.id}:${id}`)
            }}
          />
        ) : (
          <div className="story-browser">
            <section className="story-directory">
              <div className="story-tools">
                <label>
                  <Search size={13} />
                  <input
                    value={query}
                    placeholder={`Search ${scope === 'series' ? 'series ' : ''}${tab}…`}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button type="button" onClick={addRecord}><Plus size={14} /> Add</button>
              </div>

              <div className="story-records" aria-label={`${tab} records`}>
                {filteredRows.map((row) => {
                  const mentions = mentionIndexes.get(row.book.id)?.[row.record.id]?.total || 0
                  const subtitle = row.kind === 'characters'
                    ? row.record.role || 'Character'
                    : WORLD_CATEGORIES.find((category) => category.value === row.record.category)?.label
                  return (
                    <button
                      type="button"
                      key={row.key}
                      className={row.key === selectedKey ? 'active' : ''}
                      onClick={() => setSelectedKey(row.key)}
                    >
                      <span className="story-record-main">
                        <strong>{row.record.name || (row.kind === 'characters' ? 'Unnamed character' : 'Unnamed entry')}</strong>
                        <small>
                          {subtitle}
                          {scope === 'series' ? ` · ${row.book.details.title}` : ''}
                        </small>
                      </span>
                      <span className="story-record-mentions" title={`${mentions} manuscript mentions`}>
                        <TextSearch size={10} /> {mentions}
                      </span>
                    </button>
                  )
                })}
                {!filteredRows.length && (
                  <div className="story-records-empty">
                    {rows.length ? 'No matching records.' : `No ${tab} in this ${scope} yet.`}
                  </div>
                )}
              </div>

              {scope === 'series' && (
                <div className="series-book-strip">
                  {seriesBooks.map((book) => (
                    <button
                      type="button"
                      key={book.id}
                      className={book.id === project.id ? 'active' : ''}
                      onClick={() => openSeriesBook(book.id)}
                    >
                      <BookOpen size={12} />
                      <span>{book.details.seriesNumber || '?'} · {book.details.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="story-detail">
              {selectedRow && !selectedIsCurrent && (
                <div className="series-reference-card">
                  <div className="series-reference-heading">
                    <div>
                      <small>Series reference · {selectedRow.book.details.title}</small>
                      <strong>{selectedRow.record.name || 'Untitled record'}</strong>
                    </div>
                    <span>Read only</span>
                  </div>
                  <p>{selectedRow.record.summary || 'No summary has been added in this volume.'}</p>
                  {selectedRow.kind === 'characters' ? (
                    <dl>
                      <div><dt>Role</dt><dd>{selectedRow.record.role || '—'}</dd></div>
                      <div><dt>Aliases</dt><dd>{selectedRow.record.aliases || '—'}</dd></div>
                      <div><dt>Motivation</dt><dd>{selectedRow.record.motivation || '—'}</dd></div>
                      <div><dt>Relationships</dt><dd>{selectedRow.record.relationships || '—'}</dd></div>
                    </dl>
                  ) : (
                    <dl>
                      <div><dt>Category</dt><dd>{selectedRow.record.category}</dd></div>
                      <div><dt>Aliases</dt><dd>{selectedRow.record.aliases || '—'}</dd></div>
                      <div><dt>Details</dt><dd>{selectedRow.record.details || '—'}</dd></div>
                      <div><dt>Rules</dt><dd>{selectedRow.record.rules || '—'}</dd></div>
                      <div><dt>Connections</dt><dd>{selectedRow.record.connections || '—'}</dd></div>
                    </dl>
                  )}
                  <MentionSummary mentions={selectedMentions} />
                  <div className="series-reference-actions">
                    <button type="button" onClick={() => copyRecordToCurrentBook(selectedRow)}>
                      <Copy size={13} /> Copy into {project.details.title}
                    </button>
                    <button type="button" onClick={() => openSeriesBook(selectedRow.book.id)}>
                      <BookOpen size={13} /> Open source book
                    </button>
                  </div>
                </div>
              )}

              {selectedCharacter && selectedIsCurrent && (
                <div className="story-form" key={selectedCharacter.id}>
                  <div className="story-form-heading">
                    <div>
                      <small>Character profile</small>
                      <strong>{selectedCharacter.name || 'Unnamed character'}</strong>
                    </div>
                    <div className="story-heading-actions">
                      <button
                        type="button"
                        title="Open linked sticky notes"
                        aria-label="Open linked sticky notes for this character"
                        onClick={() => openLinkedNotes(
                          'character',
                          selectedCharacter.id,
                          selectedCharacter.name,
                          selectedCharacter.notes,
                        )}
                      >
                        <StickyNoteIcon size={14} />
                        {linkedNoteCount('character', selectedCharacter.id) > 0 && (
                          <span>{linkedNoteCount('character', selectedCharacter.id)}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="story-delete"
                        title="Delete character"
                        aria-label="Delete character"
                        onClick={() => setDeleteTarget({
                          kind: 'character',
                          id: selectedCharacter.id,
                          name: selectedCharacter.name,
                        })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <MentionSummary
                    mentions={selectedMentions}
                    onOpenChapter={(chapterId) => openMention(project.id, chapterId)}
                  />
                  <div className="story-compact-grid">
                    <label>Name<input value={selectedCharacter.name} onChange={(event) => updateCharacter(selectedCharacter.id, { name: event.target.value })} /></label>
                    <label>Story role<input value={selectedCharacter.role} placeholder="Protagonist, mentor…" onChange={(event) => updateCharacter(selectedCharacter.id, { role: event.target.value })} /></label>
                    <label>Pronouns<input value={selectedCharacter.pronouns} onChange={(event) => updateCharacter(selectedCharacter.id, { pronouns: event.target.value })} /></label>
                    <label>Age<input value={selectedCharacter.age} onChange={(event) => updateCharacter(selectedCharacter.id, { age: event.target.value })} /></label>
                  </div>
                  <label>Aliases<input value={selectedCharacter.aliases} placeholder="Comma-separated names used in the manuscript" onChange={(event) => updateCharacter(selectedCharacter.id, { aliases: event.target.value })} /></label>
                  <label>One-line summary<textarea rows={2} value={selectedCharacter.summary} onChange={(event) => updateCharacter(selectedCharacter.id, { summary: event.target.value })} /></label>
                  <label>Appearance<textarea rows={3} value={selectedCharacter.appearance} onChange={(event) => updateCharacter(selectedCharacter.id, { appearance: event.target.value })} /></label>
                  <label>Personality and voice<textarea rows={3} value={selectedCharacter.personality} onChange={(event) => updateCharacter(selectedCharacter.id, { personality: event.target.value })} /></label>
                  <label>Motivation and goal<textarea rows={3} value={selectedCharacter.motivation} onChange={(event) => updateCharacter(selectedCharacter.id, { motivation: event.target.value })} /></label>
                  <label>Conflict and stakes<textarea rows={3} value={selectedCharacter.conflict} onChange={(event) => updateCharacter(selectedCharacter.id, { conflict: event.target.value })} /></label>
                  <label>Character arc<textarea rows={3} value={selectedCharacter.arc} onChange={(event) => updateCharacter(selectedCharacter.id, { arc: event.target.value })} /></label>
                  <label>Relationship notes<textarea rows={3} value={selectedCharacter.relationships} placeholder="Free-form context; use Mind map for explicit links." onChange={(event) => updateCharacter(selectedCharacter.id, { relationships: event.target.value })} /></label>
                  <label>Notes<textarea rows={4} value={selectedCharacter.notes} onChange={(event) => updateCharacter(selectedCharacter.id, { notes: event.target.value })} /></label>
                  <label>Tags<input defaultValue={selectedCharacter.tags.join(', ')} placeholder="family, rival, point-of-view" onBlur={(event) => updateCharacter(selectedCharacter.id, { tags: tagsFromInput(event.target.value) })} /></label>
                </div>
              )}

              {selectedWorld && selectedIsCurrent && (
                <div className="story-form" key={selectedWorld.id}>
                  <div className="story-form-heading">
                    <div>
                      <small>Worldbuilding record</small>
                      <strong>{selectedWorld.name || 'Unnamed entry'}</strong>
                    </div>
                    <div className="story-heading-actions">
                      <button
                        type="button"
                        title="Open linked sticky notes"
                        aria-label="Open linked sticky notes for this worldbuilding entry"
                        onClick={() => openLinkedNotes(
                          'world',
                          selectedWorld.id,
                          selectedWorld.name,
                          selectedWorld.notes,
                        )}
                      >
                        <StickyNoteIcon size={14} />
                        {linkedNoteCount('world', selectedWorld.id) > 0 && (
                          <span>{linkedNoteCount('world', selectedWorld.id)}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="story-delete"
                        title="Delete worldbuilding entry"
                        aria-label="Delete worldbuilding entry"
                        onClick={() => setDeleteTarget({
                          kind: 'world',
                          id: selectedWorld.id,
                          name: selectedWorld.name,
                        })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <MentionSummary
                    mentions={selectedMentions}
                    onOpenChapter={(chapterId) => openMention(project.id, chapterId)}
                  />
                  <div className="story-compact-grid">
                    <label>Name<input value={selectedWorld.name} onChange={(event) => updateWorldEntry(selectedWorld.id, { name: event.target.value })} /></label>
                    <label>
                      Category
                      <select value={selectedWorld.category} onChange={(event) => updateWorldEntry(selectedWorld.id, { category: event.target.value as WorldbuildingCategory })}>
                        {WORLD_CATEGORIES.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>Aliases and alternate names<input value={selectedWorld.aliases || ''} placeholder="Comma-separated names used in the manuscript" onChange={(event) => updateWorldEntry(selectedWorld.id, { aliases: event.target.value })} /></label>
                  <label>One-line summary<textarea rows={2} value={selectedWorld.summary} onChange={(event) => updateWorldEntry(selectedWorld.id, { summary: event.target.value })} /></label>
                  <label>Description and history<textarea rows={5} value={selectedWorld.details} onChange={(event) => updateWorldEntry(selectedWorld.id, { details: event.target.value })} /></label>
                  <label>Rules and constraints<textarea rows={4} value={selectedWorld.rules} placeholder="What is possible, forbidden, costly, or rare?" onChange={(event) => updateWorldEntry(selectedWorld.id, { rules: event.target.value })} /></label>
                  <label>Connection notes<textarea rows={3} value={selectedWorld.connections} placeholder="Free-form context; use Mind map for explicit links." onChange={(event) => updateWorldEntry(selectedWorld.id, { connections: event.target.value })} /></label>
                  <label>Notes<textarea rows={4} value={selectedWorld.notes} onChange={(event) => updateWorldEntry(selectedWorld.id, { notes: event.target.value })} /></label>
                  <label>Tags<input defaultValue={selectedWorld.tags.join(', ')} placeholder="capital, ancient, dangerous" onBlur={(event) => updateWorldEntry(selectedWorld.id, { tags: tagsFromInput(event.target.value) })} /></label>
                </div>
              )}

              {!selectedRow && (
                <div className="story-detail-empty">
                  <Network size={28} />
                  <strong>Select a record to open its continuity file.</strong>
                  <span>Manuscript mentions update live as you write.</span>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {deleteTarget && (
        <Dialog
          title={`Delete ${deleteTarget.kind === 'character' ? 'character' : 'world entry'}?`}
          description={`“${deleteTarget.name || 'Untitled'}” and its explicit map relationships will be removed from this book's Story Studio.`}
          confirmLabel="Delete record"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget.kind === 'character') deleteCharacter(deleteTarget.id)
            else deleteWorldEntry(deleteTarget.id)
            setDeleteTarget(null)
            setSelectedKey('')
          }}
        />
      )}
    </>
  )
}
