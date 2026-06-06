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
        <button
          type="button"
          onClick={() => setChapters((items) => [
            ...items,
            { id: Date.now(), title: `Chapter ${items.length + 1}` },
          ])}
        >
          Add
        </button>
      </header>
      <ol>
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <button type="button">{chapter.title}</button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
