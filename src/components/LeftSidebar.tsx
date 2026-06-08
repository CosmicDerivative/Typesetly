import {
  ChevronRight,
  Copyright,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  List,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useApp } from '../BookContext'
import {
  BACK_MATTER_TYPES,
  FRONT_MATTER_TYPES,
  PAGE_TYPE_LABELS,
} from '../data'
import { normalizedSceneTitles, sceneCount } from '../editor/scenes'
import { numberedChapterOrdinal, REQUIRED_PAGE_TYPES } from '../manuscript/pageTypes'
import type { Chapter, ManuscriptFolder, PageType } from '../types'
import './LeftSidebar.css'
import { Dialog } from './Dialog'
import { DrawerControls } from './DrawerControls'
import { PageTypeSelect } from './PageTypeSelect'

const frontIcons: Partial<Record<PageType, typeof FileText>> = {
  'title-page': FileText,
  copyright: Copyright,
  contents: List,
}

type DragItem =
  | { kind: 'page'; pageId: string }
  | { kind: 'scene'; chapterId: string; sceneIndex: number }

type DropHint =
  | { kind: 'page'; targetId: string; placement: 'before' | 'after' | 'inside' }
  | { kind: 'scene'; chapterId: string; sceneIndex: number; placement: 'before' | 'after' }

type InlineRename =
  | { kind: 'page'; id: string; value: string }
  | { kind: 'scene'; chapterId: string; index: number; value: string }
  | { kind: 'folder'; id: string; value: string }

export function LeftSidebar() {
  const {
    project,
    frontMatter,
    bodyChapters,
    backMatter,
    setActiveChapter,
    addChapter,
    addChapterToPart,
    addChapterToFolder,
    addPage,
    addPart,
    addManuscriptFolder,
    renameManuscriptFolder,
    deleteManuscriptFolder,
    toggleManuscriptFolder,
    moveChapterToFolder,
    deleteChapter,
    duplicateChapter,
    moveChapterBy,
    moveChapterRelative,
    moveChapterToPart,
    addScene,
    duplicateScene,
    moveScene,
    moveSceneToChapter,
    deleteScene,
    updateSceneTitle,
    importChaptersFromDocx,
    updateBodyChapterOptions,
    updateChapterOptions,
    updateChapterTitle,
    updateChapterType,
    activeChapter,
    saveActiveAsMasterPage,
    savePageAsMaster,
    addMasterPage,
    restoreTrashItem,
    permanentlyDeleteTrashItem,
    emptyTrash,
    addStickyNote,
    setRightPanel,
    pinnedRightPanel,
    setPinnedRightPanel,
  } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pageMenuId, setPageMenuId] = useState<string | null>(null)
  const [sceneMenu, setSceneMenu] = useState<{ chapterId: string; index: number } | null>(null)
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<string | null>(null)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashDragActive, setTrashDragActive] = useState(false)
  const [renameSceneTarget, setRenameSceneTarget] = useState<{ chapterId: string; index: number } | null>(null)
  const [sceneName, setSceneName] = useState('')
  const [activeScene, setActiveScene] = useState<{ chapterId: string; index: number } | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [bodyMenu, setBodyMenu] = useState(false)
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null)
  const [folderEditor, setFolderEditor] = useState<{ mode: 'create' | 'rename'; id?: string } | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<string | null>(null)
  const [masterQuery, setMasterQuery] = useState('')
  const [inlineRename, setInlineRename] = useState<InlineRename | null>(null)
  const cancelInlineRenameRef = useRef(false)
  const importRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const updateActiveScene = (event: Event) => {
      setActiveScene((event as CustomEvent<{ chapterId: string; index: number }>).detail)
    }
    window.addEventListener('typesetly:active-scene', updateActiveScene)
    return () => window.removeEventListener('typesetly:active-scene', updateActiveScene)
  }, [])

  useEffect(() => {
    const closeTransientMenus = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(
        '.page-actions-menu, .scene-actions-menu, .body-options-menu, .add-menu, .trash-panel, [data-sidebar-menu-trigger]',
      )) return
      setMenuOpen(false)
      setTrashOpen(false)
      setBodyMenu(false)
      setPageMenuId(null)
      setSceneMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      setTrashOpen(false)
      setBodyMenu(false)
      setPageMenuId(null)
      setSceneMenu(null)
    }
    document.addEventListener('pointerdown', closeTransientMenus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeTransientMenus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  if (!project) return null

  const beginInlineRename = (target: InlineRename) => {
    cancelInlineRenameRef.current = false
    setInlineRename(target)
    setPageMenuId(null)
    setSceneMenu(null)
  }

  const finishInlineRename = (target: InlineRename) => {
    if (cancelInlineRenameRef.current) {
      cancelInlineRenameRef.current = false
      setInlineRename(null)
      return
    }
    const name = target.value.trim()
    if (name) {
      if (target.kind === 'page') updateChapterTitle(target.id, name)
      else if (target.kind === 'scene') updateSceneTitle(target.chapterId, target.index, name)
      else renameManuscriptFolder(target.id, name)
    }
    setInlineRename(null)
  }

  const handleInlineRenameKey = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      cancelInlineRenameRef.current = true
      event.currentTarget.blur()
    }
  }

  const beginDrag = (event: DragEvent, item: DragItem) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-typesetly-sidebar-item', JSON.stringify(item))
    setDragItem(item)
    setMenuOpen(false)
    setTrashOpen(false)
    setBodyMenu(false)
    setPageMenuId(null)
    setSceneMenu(null)
  }

  const endDrag = () => {
    setDragItem(null)
    setDropHint(null)
    setTrashDragActive(false)
    setFolderDropTarget(null)
  }

  const sectionForPage = (page: Chapter) => (
    FRONT_MATTER_TYPES.includes(page.type)
      ? 'front'
      : BACK_MATTER_TYPES.includes(page.type)
        ? 'back'
        : 'body'
  )

  const canDropPage = (source: Chapter, target: Chapter, placement: 'before' | 'after' | 'inside') => {
    // Enforce manuscript semantics at the UI boundary: matter stays in its
    // section, protected pages stay fixed, and only chapters can enter parts.
    if (source.id === target.id || sectionForPage(source) !== sectionForPage(target)) return false
    if (REQUIRED_PAGE_TYPES.includes(source.type)) return false
    if (sectionForPage(source) === 'front' && REQUIRED_PAGE_TYPES.includes(target.type)) return false
    if (placement === 'inside') return source.type === 'chapter' && target.type === 'part'
    if (sectionForPage(source) === 'body') return (source.type === 'part') === (target.type === 'part')
    return true
  }

  const canMoveDragItemToTrash = (item: DragItem) => {
    if (item.kind === 'page') {
      const page = project.chapters.find((chapter) => chapter.id === item.pageId)
      return Boolean(page && !REQUIRED_PAGE_TYPES.includes(page.type))
    }
    const chapter = project.chapters.find((candidate) => candidate.id === item.chapterId)
    return Boolean(chapter?.type === 'chapter' && sceneCount(chapter.content) > 1)
  }

  const openScene = (chapterId: string, index: number) => {
    setActiveScene({ chapterId, index })
    window.dispatchEvent(new CustomEvent('typesetly:scene', { detail: { index } }))
  }

  const focusSceneAfterChange = (chapterId: string, index: number) => {
    setActiveScene({ chapterId, index })
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('typesetly:scene', { detail: { index } }))
      })
    })
  }

  const addSceneFromMap = (chapter: Chapter, afterIndex: number) => {
    const newIndex = Math.max(0, afterIndex + 1)
    setActiveChapter(chapter.id)
    addScene(chapter.id, afterIndex)
    setMenuOpen(false)
    setPageMenuId(null)
    setSceneMenu(null)
    focusSceneAfterChange(chapter.id, newIndex)
  }

  const openNotes = (focus: {
    target: 'chapter' | 'scene'
    chapterId: string
    sceneIndex?: number
    noteId?: string
  }) => {
    if (pinnedRightPanel !== 'none') setPinnedRightPanel('notes')
    setRightPanel('notes')
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('typesetly:notes-focus', { detail: focus }))
      })
    })
  }

  const createContextNote = (
    focus: { target: 'chapter' | 'scene'; chapterId: string; sceneIndex?: number },
    title: string,
  ) => {
    const noteId = addStickyNote({
      ...focus,
      title,
      color: focus.target === 'scene' ? 'blue' : 'gold',
    })
    openNotes({ ...focus, noteId })
  }

  const addableFront = FRONT_MATTER_TYPES.filter(
    (type) => !REQUIRED_PAGE_TYPES.includes(type),
  )
  const addableBack = BACK_MATTER_TYPES
  const parts = bodyChapters.filter((chapter) => chapter.type === 'part')
  const manuscriptFolders = project.manuscriptFolders || []
  const partBody = [
    ...bodyChapters.flatMap((chapter) =>
      chapter.type === 'part'
        ? [chapter, ...bodyChapters.filter((candidate) => candidate.partId === chapter.id)]
        : [],
    ),
  ]
  const unfiledBody = bodyChapters.filter(
    (chapter) => chapter.type !== 'part' && !chapter.partId && !chapter.folderId,
  )

  const pageActions = (page: Chapter) => {
    const required = REQUIRED_PAGE_TYPES.includes(page.type)
    const canContainScenes = page.type === 'chapter'
    const excluded = page.options.includeIn === 'none'
    return (
      <div className="page-actions-menu" onClick={(event) => event.stopPropagation()}>
        <div className="action-menu-title">{page.title || PAGE_TYPE_LABELS[page.type]}</div>
        <button type="button" onClick={() => { setActiveChapter(page.id); setPageMenuId(null) }}>
          Open page
        </button>
        <button
          type="button"
          onClick={() => beginInlineRename({ kind: 'page', id: page.id, value: page.title })}
        >
          Rename page
        </button>
        <button
          type="button"
          onClick={() => {
            createContextNote({ target: 'chapter', chapterId: page.id }, `${page.title} note`)
            setPageMenuId(null)
          }}
        >
          Add sticky note
        </button>
        <button type="button" disabled={required} onClick={() => { duplicateChapter(page.id); setPageMenuId(null) }}>
          Duplicate page
        </button>
        {!required && (
          <label className="action-menu-select">
            Page type
            <PageTypeSelect
              value={page.type}
              onChange={(type) => {
                updateChapterType(page.id, type)
                setPageMenuId(null)
              }}
            />
          </label>
        )}
        <div className="action-menu-pair">
          <button type="button" disabled={required} onClick={() => moveChapterBy(page.id, -1)}>Move up</button>
          <button type="button" disabled={required} onClick={() => moveChapterBy(page.id, 1)}>Move down</button>
        </div>
        {page.type === 'part' && (
          <button type="button" onClick={() => { addChapterToPart(page.id); setPageMenuId(null) }}>
            Add chapter to this part
          </button>
        )}
        {page.type === 'chapter' && parts.length > 0 && (
          <label className="action-menu-select">
            Publishing Part
            <select
              value={page.partId || ''}
              onChange={(event) => {
                moveChapterToPart(page.id, event.target.value || undefined)
                setPageMenuId(null)
              }}
            >
              <option value="">Main text (no section)</option>
              {parts.map((part) => <option key={part.id} value={part.id}>{part.title}</option>)}
            </select>
          </label>
        )}
        {sectionForPage(page) === 'body' && page.type !== 'part' && manuscriptFolders.length > 0 && (
          <label className="action-menu-select">
            Manuscript folder
            <select
              value={page.folderId || ''}
              onChange={(event) => {
                moveChapterToFolder(page.id, event.target.value || undefined)
                setPageMenuId(null)
              }}
            >
              <option value="">Unfiled</option>
              {manuscriptFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          </label>
        )}
        {canContainScenes && (
          <button
            type="button"
            onClick={() => {
              const newIndex = sceneCount(page.content)
              setActiveChapter(page.id)
              addScene(page.id, newIndex - 1)
              focusSceneAfterChange(page.id, newIndex)
              setPageMenuId(null)
            }}
          >
            Add scene at end
          </button>
        )}
        <button type="button" onClick={() => { savePageAsMaster(page.id); setPageMenuId(null) }}>
          Save as master page
        </button>
        {!required && page.type !== 'part' && (
          <button
            type="button"
            onClick={() => {
              updateChapterOptions(page.id, { includeIn: excluded ? 'all' : 'none' })
              setPageMenuId(null)
            }}
          >
            {excluded ? 'Include in exports' : 'Exclude from exports'}
          </button>
        )}
        <div className="action-menu-divider" />
        <button
          type="button"
          className="danger-action"
          disabled={required}
          onClick={() => {
            setDeleteTarget(page.id)
            setPageMenuId(null)
          }}
        >
          Move to Trash
        </button>
        {required && <small>Required book pages cannot be removed or reordered.</small>}
      </div>
    )
  }

  const renderPageRow = (
    page: Chapter,
    label: string,
    options: { nested?: boolean; draggable?: boolean; icon?: typeof FileText } = {},
  ) => {
    const active = project.activeId === page.id
    const Icon = options.icon || FileText
    const canDrag = options.draggable ?? !REQUIRED_PAGE_TYPES.includes(page.type)
    const pageHint = dropHint?.kind === 'page' && dropHint.targetId === page.id ? dropHint : null
    const pageNoteCount = (project.stickyNotes || []).filter((note) => note.chapterId === page.id).length
    return (
      <div className={`sidebar-item ${options.nested ? 'nested-item' : ''}`} key={page.id}>
        <div
          data-page-id={page.id}
          className={`${active ? 'chapter-row active' : 'chapter-row'} ${options.nested ? 'nested' : ''} ${pageHint ? `drop-${pageHint.placement}` : ''}`}
          draggable={canDrag && !(inlineRename?.kind === 'page' && inlineRename.id === page.id)}
          onDragStart={(event) => beginDrag(event, { kind: 'page', pageId: page.id })}
          onDragEnd={endDrag}
          onDragOver={(event) => {
            if (!dragItem) return
            if (dragItem.kind === 'scene') {
              if (page.type !== 'chapter') return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropHint({ kind: 'page', targetId: page.id, placement: 'inside' })
              return
            }
            const source = project.chapters.find((chapter) => chapter.id === dragItem.pageId)
            if (!source) return
            const bounds = event.currentTarget.getBoundingClientRect()
            const ratio = (event.clientY - bounds.top) / Math.max(bounds.height, 1)
            const placement =
              page.type === 'part' && source.type === 'chapter' && ratio > .25 && ratio < .75
                ? 'inside'
                : ratio < .5
                  ? 'before'
                  : 'after'
            if (!canDropPage(source, page, placement)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropHint({ kind: 'page', targetId: page.id, placement })
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropHint(null)
          }}
          onDrop={(event) => {
            event.preventDefault()
            if (!dragItem || !pageHint) return endDrag()
            if (dragItem.kind === 'page') {
              moveChapterRelative(dragItem.pageId, page.id, pageHint.placement)
            } else if (page.type === 'chapter') {
              const targetCount = sceneCount(page.content)
              moveSceneToChapter(
                dragItem.chapterId,
                dragItem.sceneIndex,
                page.id,
                targetCount - 1,
                'after',
              )
              const newIndex = dragItem.chapterId === page.id ? targetCount - 1 : targetCount
              setActiveChapter(page.id)
              focusSceneAfterChange(page.id, newIndex)
            }
            endDrag()
          }}
        >
          {inlineRename?.kind === 'page' && inlineRename.id === page.id ? (
            <div className="chapter-inline-editor">
              <Icon size={14} strokeWidth={1.75} className="chapter-icon" />
              <input
                autoFocus
                aria-label={`Rename ${page.title}`}
                value={inlineRename.value}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setInlineRename({ ...inlineRename, value: event.target.value })}
                onKeyDown={handleInlineRenameKey}
                onBlur={() => finishInlineRename(inlineRename)}
              />
            </div>
          ) : (
            <button
              type="button"
              className="chapter-btn"
              onClick={() => setActiveChapter(page.id)}
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                beginInlineRename({ kind: 'page', id: page.id, value: page.title })
              }}
            >
              <Icon size={14} strokeWidth={1.75} className="chapter-icon" />
              <span className="chapter-label">{label}</span>
            </button>
          )}
          {page.type === 'part' && (
            <button
              type="button"
              className="chapter-expand"
              aria-label={expanded[page.id] === false ? 'Expand part' : 'Collapse part'}
              onClick={() => setExpanded((value) => ({ ...value, [page.id]: value[page.id] === false }))}
            >
              {bodyChapters.filter((item) => item.partId === page.id).length}
            </button>
          )}
          {pageNoteCount > 0 && (
            <button
              type="button"
              className="sidebar-note-count"
              title={`${pageNoteCount} ${pageNoteCount === 1 ? 'note' : 'notes'} for ${page.title}`}
              aria-label={`Open ${pageNoteCount} ${pageNoteCount === 1 ? 'note' : 'notes'} for ${page.title}`}
              onClick={(event) => {
                event.stopPropagation()
                openNotes({ target: 'chapter', chapterId: page.id })
              }}
            >
              <StickyNote size={11} />
              <span>{pageNoteCount}</span>
            </button>
          )}
          {page.type === 'chapter' && (
            <button
              type="button"
              className="chapter-add-scene"
              title={`Add a scene to ${page.title}`}
              aria-label={`Add a scene to ${page.title}`}
              onClick={(event) => {
                event.stopPropagation()
                addSceneFromMap(page, sceneCount(page.content) - 1)
              }}
            >
              <Plus size={13} />
            </button>
          )}
          <button
            type="button"
            className="chapter-menu"
            data-sidebar-menu-trigger
            title={`Options for ${page.title}`}
            aria-label={`Options for ${page.title}`}
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen(false)
              setTrashOpen(false)
              setBodyMenu(false)
              setSceneMenu(null)
              setPageMenuId((current) => current === page.id ? null : page.id)
            }}
          >
            <MoreVertical size={13} />
          </button>
        </div>
        {pageMenuId === page.id && pageActions(page)}
        {active && page.type === 'chapter' && (() => {
          const count = sceneCount(page.content)
          const titles = normalizedSceneTitles(page.sceneTitles, count)
          const renderSceneInsertControl = (afterIndex: number, label: string) => (
            <div className="scene-insert-control" key={`insert-${page.id}-${afterIndex}`}>
              <button
                type="button"
                title={label}
                aria-label={label}
                onClick={() => addSceneFromMap(page, afterIndex)}
              >
                <Plus size={10} />
                <span>{label}</span>
              </button>
            </div>
          )
          return (
            <div className="scene-list">
              <div className="scene-list-header">
                <span>Scenes <strong>{count}</strong></span>
                <button
                  type="button"
                  title={`Add a scene to the end of ${page.title}`}
                  onClick={() => addSceneFromMap(page, count - 1)}
                >
                  <Plus size={11} />
                  Add scene
                </button>
              </div>
              {renderSceneInsertControl(-1, `Add scene before ${titles[0]}`)}
              {titles.map((title, sceneIndex) => {
                const sceneActive = activeScene?.chapterId === page.id && activeScene.index === sceneIndex
                const menuActive = sceneMenu?.chapterId === page.id && sceneMenu.index === sceneIndex
                const sceneHint =
                  dropHint?.kind === 'scene' &&
                  dropHint.chapterId === page.id &&
                  dropHint.sceneIndex === sceneIndex
                    ? dropHint
                    : null
                const sceneNoteCount = (project.stickyNotes || []).filter(
                  (note) =>
                    note.target === 'scene' &&
                    note.chapterId === page.id &&
                    note.sceneIndex === sceneIndex,
                ).length
                const sceneRenameActive =
                  inlineRename?.kind === 'scene' &&
                  inlineRename.chapterId === page.id &&
                  inlineRename.index === sceneIndex
                return (
                  <div className="scene-map-entry" key={`${page.id}-scene-${sceneIndex}`}>
                    <div
                      data-chapter-id={page.id}
                      data-scene-index={sceneIndex}
                      className={`scene-row ${sceneHint ? `drop-${sceneHint.placement}` : ''}`}
                      draggable={!sceneRenameActive}
                      onDragStart={(event) => {
                        event.stopPropagation()
                        beginDrag(event, { kind: 'scene', chapterId: page.id, sceneIndex })
                      }}
                      onDragEnd={endDrag}
                      onDragOver={(event) => {
                        if (dragItem?.kind !== 'scene') return
                        event.preventDefault()
                        event.stopPropagation()
                        const bounds = event.currentTarget.getBoundingClientRect()
                        const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                        event.dataTransfer.dropEffect = 'move'
                        setDropHint({ kind: 'scene', chapterId: page.id, sceneIndex, placement })
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (dragItem?.kind !== 'scene' || !sceneHint) return endDrag()
                        moveSceneToChapter(
                          dragItem.chapterId,
                          dragItem.sceneIndex,
                          page.id,
                          sceneIndex,
                          sceneHint.placement,
                        )
                        let newIndex = sceneIndex + (sceneHint.placement === 'after' ? 1 : 0)
                        if (dragItem.chapterId === page.id && dragItem.sceneIndex < newIndex) newIndex -= 1
                        newIndex = Math.max(0, Math.min(newIndex, count))
                        setActiveChapter(page.id)
                        focusSceneAfterChange(page.id, newIndex)
                        endDrag()
                      }}
                    >
                      {sceneRenameActive ? (
                        <input
                          autoFocus
                          className="scene-inline-rename"
                          aria-label={`Rename ${title}`}
                          value={inlineRename.value}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setInlineRename({ ...inlineRename, value: event.target.value })}
                          onKeyDown={handleInlineRenameKey}
                          onBlur={() => finishInlineRename(inlineRename)}
                        />
                      ) : (
                        <button
                          data-chapter-id={page.id}
                          data-scene-index={sceneIndex}
                          className={sceneActive ? 'scene-jump active' : 'scene-jump'}
                          type="button"
                          onClick={() => openScene(page.id, sceneIndex)}
                          onDoubleClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            beginInlineRename({
                              kind: 'scene',
                              chapterId: page.id,
                              index: sceneIndex,
                              value: title,
                            })
                          }}
                        >
                          {title}
                        </button>
                      )}
                      {sceneNoteCount > 0 && (
                        <button
                          type="button"
                          className="sidebar-note-count scene-note-count"
                          title={`${sceneNoteCount} ${sceneNoteCount === 1 ? 'note' : 'notes'} for ${title}`}
                          aria-label={`Open ${sceneNoteCount} ${sceneNoteCount === 1 ? 'note' : 'notes'} for ${title}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            openNotes({ target: 'scene', chapterId: page.id, sceneIndex })
                          }}
                        >
                          <StickyNote size={10} />
                          <span>{sceneNoteCount}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="scene-more"
                        data-sidebar-menu-trigger
                        aria-label={`Options for ${title}`}
                        onClick={() => {
                          setMenuOpen(false)
                          setTrashOpen(false)
                          setBodyMenu(false)
                          setPageMenuId(null)
                          setSceneMenu(menuActive ? null : { chapterId: page.id, index: sceneIndex })
                        }}
                      >
                        <MoreVertical size={12} />
                      </button>
                      {menuActive && (
                        <div className="scene-actions-menu">
                          <button
                            type="button"
                            onClick={() => {
                              createContextNote(
                                { target: 'scene', chapterId: page.id, sceneIndex },
                                `${title} note`,
                              )
                              setSceneMenu(null)
                            }}
                          >
                            Add sticky note
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenameSceneTarget({ chapterId: page.id, index: sceneIndex })
                              setSceneName(title)
                              setSceneMenu(null)
                            }}
                          >
                            Rename scene
                          </button>
                          <button
                            type="button"
                            onClick={() => addSceneFromMap(page, sceneIndex - 1)}
                          >
                            Add scene before
                          </button>
                          <button
                            type="button"
                            onClick={() => addSceneFromMap(page, sceneIndex)}
                          >
                            Add scene after
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              duplicateScene(page.id, sceneIndex)
                              focusSceneAfterChange(page.id, sceneIndex + 1)
                              setSceneMenu(null)
                            }}
                          >
                            Duplicate scene
                          </button>
                          <div className="action-menu-pair">
                            <button
                              type="button"
                              disabled={sceneIndex === 0}
                              onClick={() => {
                                moveScene(page.id, sceneIndex, -1)
                                focusSceneAfterChange(page.id, sceneIndex - 1)
                                setSceneMenu(null)
                              }}
                            >
                              Move up
                            </button>
                            <button
                              type="button"
                              disabled={sceneIndex === count - 1}
                              onClick={() => {
                                moveScene(page.id, sceneIndex, 1)
                                focusSceneAfterChange(page.id, sceneIndex + 1)
                                setSceneMenu(null)
                              }}
                            >
                              Move down
                            </button>
                          </div>
                          <div className="action-menu-divider" />
                          <button
                            type="button"
                            className="danger-action"
                            disabled={count <= 1}
                            onClick={() => {
                              deleteScene(page.id, sceneIndex)
                              focusSceneAfterChange(page.id, Math.min(sceneIndex, count - 2))
                              setSceneMenu(null)
                            }}
                          >
                            Move scene to Trash
                          </button>
                          {count <= 1 && <small>A chapter must keep at least one scene.</small>}
                        </div>
                      )}
                    </div>
                    {renderSceneInsertControl(
                      sceneIndex,
                      sceneIndex === count - 1
                        ? `Add scene at the end of ${page.title}`
                        : `Add scene between ${title} and ${titles[sceneIndex + 1]}`,
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    )
  }

  const bodyPageLabel = (chapter: Chapter) => {
    if (chapter.type === 'part') {
      return `${expanded[chapter.id] === false ? '▸' : '▾'} ${chapter.title}`
    }
    if (chapter.type === 'chapter') {
      const title = chapter.title || 'Untitled'
      return chapter.options.numbered
        ? `${numberedChapterOrdinal(project.chapters, chapter.id)}. ${title}`
        : title
    }
    return chapter.title || PAGE_TYPE_LABELS[chapter.type]
  }

  const renderBodyPage = (chapter: Chapter, nested = Boolean(chapter.partId)) =>
    renderPageRow(chapter, bodyPageLabel(chapter), {
      nested,
      draggable: true,
    })

  const renderFolder = (folder: ManuscriptFolder) => {
    const pages = bodyChapters.filter((chapter) => chapter.folderId === folder.id)
    const draggedPage = dragItem?.kind === 'page'
      ? project.chapters.find((chapter) => chapter.id === dragItem.pageId)
      : undefined
    const canAcceptDrop = Boolean(
      draggedPage &&
      draggedPage.type !== 'part' &&
      sectionForPage(draggedPage) === 'body' &&
      draggedPage.folderId !== folder.id,
    )
    const dropActive = folderDropTarget === folder.id
    const folderRenameActive =
      inlineRename?.kind === 'folder' && inlineRename.id === folder.id

    return (
      <section
        className={`manuscript-folder${dropActive ? ' drop-active' : ''}`}
        key={folder.id}
        onDragOver={(event) => {
          const target = event.target instanceof Element ? event.target : null
          if (target?.closest('.chapter-row')) return
          if (!canAcceptDrop) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          setFolderDropTarget(folder.id)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFolderDropTarget(null)
          }
        }}
        onDrop={(event) => {
          const target = event.target instanceof Element ? event.target : null
          if (target?.closest('.chapter-row')) return
          event.preventDefault()
          event.stopPropagation()
          const item = dragItem
          if (item?.kind !== 'page' || !canAcceptDrop) return endDrag()
          moveChapterToFolder(item.pageId, folder.id)
          endDrag()
        }}
      >
        <div className="manuscript-folder-row">
          {/* A folder is intentionally a map-only target; exporting still
              follows the underlying chapter sequence. */}
          {folderRenameActive ? (
            <div className="folder-inline-editor">
              {folder.collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
              <input
                autoFocus
                aria-label={`Rename ${folder.name}`}
                value={inlineRename.value}
                onChange={(event) => setInlineRename({ ...inlineRename, value: event.target.value })}
                onKeyDown={handleInlineRenameKey}
                onBlur={() => finishInlineRename(inlineRename)}
              />
            </div>
          ) : (
            <button
              type="button"
              className="manuscript-folder-toggle"
              aria-expanded={!folder.collapsed}
              onClick={() => toggleManuscriptFolder(folder.id)}
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                beginInlineRename({ kind: 'folder', id: folder.id, value: folder.name })
              }}
            >
              <ChevronRight
                className={folder.collapsed ? 'folder-chevron' : 'folder-chevron expanded'}
                size={13}
              />
              {folder.collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
              <span>{folder.name}</span>
              <small>{pages.length}</small>
            </button>
          )}
          <button
            type="button"
            className="manuscript-folder-action primary"
            title={`Add chapter to ${folder.name}`}
            aria-label={`Add chapter to ${folder.name}`}
            onClick={() => addChapterToFolder(folder.id)}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className="manuscript-folder-action"
            title={`Rename ${folder.name}`}
            aria-label={`Rename ${folder.name}`}
            onClick={() => {
              setFolderName(folder.name)
              setFolderEditor({ mode: 'rename', id: folder.id })
            }}
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            className="manuscript-folder-action danger"
            title={`Remove ${folder.name}`}
            aria-label={`Remove ${folder.name}`}
            onClick={() => setFolderDeleteTarget(folder.id)}
          >
            <Trash2 size={11} />
          </button>
        </div>
        {!folder.collapsed && (
          <div className="manuscript-folder-pages">
            {pages.length > 0 ? pages.map((page) => renderBodyPage(page, true)) : (
              <div className="manuscript-folder-empty">
                {dropActive ? 'Release to file this page' : 'Drop pages here or use + to add a chapter'}
              </div>
            )}
          </div>
        )}
        {folder.collapsed && dropActive && (
          <div className="manuscript-folder-drop-hint">Release to file this page</div>
        )}
      </section>
    )
  }

  const trashItems = project.trashItems || []

  return (
    <aside className="left-sidebar" ref={sidebarRef}>
      <div className="sidebar-identity">
        <div>
          <span>Manuscript map</span>
          <strong>{project.chapters.length} pages</strong>
        </div>
        <div className="sidebar-identity-actions">
          <DrawerControls panel="outline" />
          <span className="sidebar-monogram" aria-hidden>M</span>
        </div>
      </div>
      <div className="sidebar-scroll">
        <div className="sidebar-section-label">Opening pages</div>
        <div className="front-matter">
          {frontMatter.map((page) =>
            renderPageRow(page, page.title, {
              icon: frontIcons[page.type] || FileText,
            }),
          )}
        </div>

        <div className="body-section">
          <div className="body-header">
            <span>Main text</span>
            <div className="body-header-actions">
              <button
                type="button"
                className="tiny-icon"
                title="New manuscript folder"
                aria-label="New manuscript folder"
                onClick={() => {
                  setFolderName('')
                  setFolderEditor({ mode: 'create' })
                }}
              >
                <FolderPlus size={14} />
              </button>
              <button
                type="button"
                className="tiny-icon"
                data-sidebar-menu-trigger
                title="Main text options"
                aria-expanded={bodyMenu}
                onClick={() => {
                  setMenuOpen(false)
                  setTrashOpen(false)
                  setPageMenuId(null)
                  setSceneMenu(null)
                  setBodyMenu((value) => !value)
                }}
              >
                <MoreVertical size={14} />
              </button>
            </div>
          </div>
          {bodyMenu && (
            <div className="body-options-menu">
              <label>
                <input
                  type="checkbox"
                  checked={bodyChapters.filter((chapter) => chapter.type === 'chapter').every((chapter) => chapter.options.numbered)}
                  onChange={(event) => updateBodyChapterOptions({ numbered: event.target.checked })}
                />
                Number chapters
              </label>
              <label>
                Begin chapters on
                <select
                  value={bodyChapters.find((chapter) => chapter.type === 'chapter')?.options.beginOn || 'either'}
                  onChange={(event) => updateBodyChapterOptions({ beginOn: event.target.value as 'either' | 'left' | 'right' })}
                >
                  <option value="either">Either side</option>
                  <option value="right">Right side</option>
                  <option value="left">Left side</option>
                </select>
              </label>
            </div>
          )}

          <div className="chapter-list">
            {manuscriptFolders.map(renderFolder)}
            {partBody.map((chapter) => {
              const nested = Boolean(chapter.partId)
              if (nested && expanded[chapter.partId!] === false) return null
              return renderBodyPage(chapter, nested)
            })}
            {unfiledBody.map((chapter) => renderBodyPage(chapter))}
          </div>
        </div>

        {backMatter.length > 0 && (
          <div className="body-section back-matter-section">
            <div className="body-header"><span>Closing pages</span></div>
            <div className="chapter-list">
              {backMatter.map((page) => renderPageRow(page, page.title))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="add-chapter-btn" onClick={addChapter}>
          <Plus size={16} strokeWidth={2.25} />
          Add chapter
        </button>
        <div className="more-wrap">
          <button
            type="button"
            className={menuOpen ? 'more-btn active' : 'more-btn'}
            data-sidebar-menu-trigger
            title="Add pages and import"
            aria-label="Add pages and import"
            aria-expanded={menuOpen}
            onClick={() => {
              setTrashOpen(false)
              setBodyMenu(false)
              setPageMenuId(null)
              setSceneMenu(null)
              setMenuOpen((value) => !value)
            }}
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="add-menu" role="menu" aria-label="Add pages and import">
              <div className="add-menu-head">
                <strong>Add to book</strong>
                <button type="button" aria-label="Close add menu" onClick={() => setMenuOpen(false)}>
                  <X size={15} />
                </button>
              </div>
              <button type="button" onClick={() => { addPart(); setMenuOpen(false) }}>Add Part / Volume</button>
              <button
                type="button"
                onClick={() => {
                  setFolderName('')
                  setFolderEditor({ mode: 'create' })
                  setMenuOpen(false)
                }}
              >
                Add Manuscript Folder
              </button>
              <button type="button" onClick={() => { addPage('full-page-image'); setMenuOpen(false) }}>Add Full Page Image</button>
              <button type="button" onClick={() => { addPage('custom-page'); setMenuOpen(false) }}>Add Custom Page</button>
              <button type="button" onClick={() => { importRef.current?.click(); setMenuOpen(false) }}>Import Chapters (.docx)</button>
              <button
                type="button"
                disabled={!activeChapter}
                onClick={() => { saveActiveAsMasterPage(); setMenuOpen(false) }}
              >
                Save Current as Master Page
              </button>
              {(project.masterPages?.length || 0) > 0 && (
                <>
                  <div className="menu-label">Master pages</div>
                  <input
                    className="master-search"
                    value={masterQuery}
                    onChange={(event) => setMasterQuery(event.target.value)}
                    placeholder="Search master pages…"
                  />
                  {project.masterPages
                    ?.filter((page) => page.title.toLowerCase().includes(masterQuery.toLowerCase()))
                    .map((page) => (
                      <button key={page.id} type="button" onClick={() => { addMasterPage(page.id); setMenuOpen(false) }}>
                        {page.title}
                      </button>
                    ))}
                </>
              )}
              <div className="menu-label">Front matter</div>
              {addableFront.map((type) => (
                <button key={type} type="button" onClick={() => { addPage(type); setMenuOpen(false) }}>
                  {PAGE_TYPE_LABELS[type]}
                </button>
              ))}
              <div className="menu-label">Back matter</div>
              {addableBack.map((type) => (
                <button key={type} type="button" onClick={() => { addPage(type); setMenuOpen(false) }}>
                  {PAGE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
          <input
            ref={importRef}
            type="file"
            hidden
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) await importChaptersFromDocx(file)
              event.target.value = ''
            }}
          />
        </div>
        <div
          className={trashDragActive ? 'trash-wrap drag-over' : 'trash-wrap'}
          onDragOver={(event) => {
            if (!dragItem || !canMoveDragItemToTrash(dragItem)) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'move'
            setTrashDragActive(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setTrashDragActive(false)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const dropped = dragItem
            if (!dropped || !canMoveDragItemToTrash(dropped)) return endDrag()
            if (dropped.kind === 'page') deleteChapter(dropped.pageId)
            else deleteScene(dropped.chapterId, dropped.sceneIndex)
            setTrashOpen(true)
            endDrag()
          }}
        >
          <button
            type="button"
            className={trashOpen || trashDragActive ? 'trash-btn active' : 'trash-btn'}
            data-sidebar-menu-trigger
            title="Trash"
            aria-label={`Trash, ${trashItems.length} items`}
            aria-expanded={trashOpen}
            onClick={() => {
              setMenuOpen(false)
              setBodyMenu(false)
              setPageMenuId(null)
              setSceneMenu(null)
              setTrashOpen((value) => !value)
            }}
          >
            <Trash2 size={16} />
            {trashItems.length > 0 && <span>{trashItems.length > 99 ? '99+' : trashItems.length}</span>}
          </button>
          {trashDragActive && <span className="trash-drop-hint">Drop to Trash</span>}
          {trashOpen && (
            <div className="trash-panel">
              <div className="trash-head">
                <strong>Trash</strong>
                <button type="button" aria-label="Close Trash" onClick={() => setTrashOpen(false)}><X size={15} /></button>
              </div>
              {trashItems.length === 0 ? (
                <p className="trash-empty">Deleted pages and scenes will appear here.</p>
              ) : (
                <>
                  <div className="trash-list">
                    {[...trashItems].reverse().map((item) => {
                      const canRestore = item.kind === 'page' ||
                        project.chapters.some((chapter) => chapter.id === item.chapterId)
                      return (
                        <div className="trash-item" key={item.id}>
                          <div>
                            <strong>{item.kind === 'page' ? item.page.title : item.sceneTitle}</strong>
                            <small>
                              {item.kind === 'page'
                                ? PAGE_TYPE_LABELS[item.page.type]
                                : canRestore
                                  ? `Scene from ${item.chapterTitle}`
                                  : `Restore ${item.chapterTitle} first`}
                            </small>
                          </div>
                          <button
                            type="button"
                            disabled={!canRestore}
                            title={canRestore ? 'Restore' : 'Restore its chapter first'}
                            aria-label={canRestore ? 'Restore' : 'Restore its chapter first'}
                            onClick={() => restoreTrashItem(item.id)}
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            type="button"
                            className="trash-delete"
                            title="Delete permanently"
                            aria-label="Delete permanently"
                            onClick={() => setPermanentDeleteTarget(item.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <button type="button" className="empty-trash" onClick={() => setConfirmEmptyTrash(true)}>
                    Empty Trash
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <Dialog
          title="Move this page to Trash?"
          description="You can restore it later from the trashcan in the sidebar."
          confirmLabel="Move to Trash"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteChapter(deleteTarget)
            setDeleteTarget(null)
          }}
        />
      )}
      {permanentDeleteTarget && (
        <Dialog
          title="Delete permanently?"
          description="This item cannot be recovered after permanent deletion."
          confirmLabel="Delete Permanently"
          danger
          onCancel={() => setPermanentDeleteTarget(null)}
          onConfirm={() => {
            permanentlyDeleteTrashItem(permanentDeleteTarget)
            setPermanentDeleteTarget(null)
          }}
        />
      )}
      {confirmEmptyTrash && (
        <Dialog
          title="Empty Trash?"
          description={`Permanently delete ${trashItems.length} item${trashItems.length === 1 ? '' : 's'}? This cannot be undone.`}
          confirmLabel="Empty Trash"
          danger
          onCancel={() => setConfirmEmptyTrash(false)}
          onConfirm={() => {
            emptyTrash()
            setConfirmEmptyTrash(false)
          }}
        />
      )}
      {renameSceneTarget && (
        <Dialog
          title="Rename Scene"
          confirmLabel="Save Name"
          onCancel={() => setRenameSceneTarget(null)}
          onConfirm={() => {
            updateSceneTitle(renameSceneTarget.chapterId, renameSceneTarget.index, sceneName)
            setRenameSceneTarget(null)
          }}
        >
          <label>
            Scene name
            <input value={sceneName} onChange={(event) => setSceneName(event.target.value)} />
          </label>
        </Dialog>
      )}
      {folderEditor && (
        <Dialog
          title={folderEditor.mode === 'create' ? 'New Manuscript Folder' : 'Rename Manuscript Folder'}
          description="Folders organize the Manuscript map only. They do not add headings or change the exported book."
          confirmLabel={folderEditor.mode === 'create' ? 'Create Folder' : 'Save Name'}
          onCancel={() => setFolderEditor(null)}
          onConfirm={() => {
            if (folderEditor.mode === 'create') addManuscriptFolder(folderName)
            else if (folderEditor.id) renameManuscriptFolder(folderEditor.id, folderName)
            setFolderEditor(null)
          }}
        >
          <label>
            Folder name
            <input
              value={folderName}
              placeholder="Drafts, Alternate scenes, Research…"
              autoFocus
              onChange={(event) => setFolderName(event.target.value)}
            />
          </label>
        </Dialog>
      )}
      {folderDeleteTarget && (
        <Dialog
          title="Remove this manuscript folder?"
          description="The pages inside will remain in the book and return to the unfiled Main text list."
          confirmLabel="Remove Folder"
          danger
          onCancel={() => setFolderDeleteTarget(null)}
          onConfirm={() => {
            deleteManuscriptFolder(folderDeleteTarget)
            setFolderDeleteTarget(null)
          }}
        />
      )}
    </aside>
  )
}
