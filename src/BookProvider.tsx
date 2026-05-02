import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import { AppContext, type RightPanel } from './BookContext'
import {
  BACK_MATTER_TYPES,
  FRONT_MATTER_TYPES,
  PAGE_TYPE_LABELS,
  countWords,
  createChapter,
  createEmptyBook,
  createPart,
  makePage,
  todayKey,
} from './data'
import {
  loadLibrary,
  parseSnapshot,
  saveLibrary,
  saveRevision,
  upsertBook,
} from './library/store'
import { convertPageType, nextChapterTitle } from './manuscript/pageTypes'
import { cloneTheme, getThemeById, PRESET_THEMES } from './themes/presets'
import {
  isDarkWorkspaceTheme,
  resolveWorkspaceTheme,
} from './themes/workspaceThemes'
import type {
  AppMode,
  BookDetails,
  BookProject,
  BookTheme,
  CharacterProfile,
  ChapterOptions,
  EditorPrefs,
  LibraryState,
  PageType,
  PreviewDevice,
  SaveStatus,
  StickyNote,
  StoryRelationship,
  WritingGoals,
  WorldbuildingCategory,
  WorldbuildingEntry,
} from './types'
import { defaultChapterOptions, defaultEditorPrefs, defaultGoals, defaultStoryBible } from './types'
import {
  duplicateSceneContent,
  insertScene,
  joinScenes,
  moveSceneContent,
  normalizedSceneTitles,
  removeSceneContent,
  sceneCount,
  splitScenes,
} from './editor/scenes'
import {
  detachSceneNotes,
  insertSceneNoteGap,
  moveSceneNotesBetweenChapters,
  reorderSceneNotes,
} from './notes/sceneNotes'
import { applyHabitWordDelta } from './goals/habitWords'

const PINNED_LAYOUT_KEY = 'typesetly-pinned-layout-v1'

function readPinnedLayout(): { sidebarPinned: boolean; pinnedRightPanel: RightPanel } {
  try {
    const value = JSON.parse(localStorage.getItem(PINNED_LAYOUT_KEY) || '{}') as {
      sidebarPinned?: unknown
      pinnedRightPanel?: unknown
    }
    const validRightPanels: RightPanel[] = [
      'none',
      'preview',
      'find',
      'goals',
      'settings',
      'quotes',
      'editorial',
      'revisions',
      'story',
      'notes',
    ]
    return {
      sidebarPinned: value.sidebarPinned === true,
      pinnedRightPanel: validRightPanels.includes(value.pinnedRightPanel as RightPanel)
        ? value.pinnedRightPanel as RightPanel
        : 'none',
    }
  } catch {
    return { sidebarPinned: false, pinnedRightPanel: 'none' }
  }
}

/**
 * Hydrates projects from every earlier schema revision. Keeping migration at
 * this boundary lets components assume optional arrays and options exist.
 */
function normalizeBook(book: BookProject): BookProject {
  const partIds = new Set(book.chapters.filter((chapter) => chapter.type === 'part').map((chapter) => chapter.id))
  const manuscriptFolders = (book.manuscriptFolders || []).map((folder, index) => ({
    id: folder.id || uuid(),
    name: folder.name?.trim() || `Folder ${index + 1}`,
    collapsed: folder.collapsed === true,
  }))
  const folderIds = new Set(manuscriptFolders.map((folder) => folder.id))
  const workspaceTheme = resolveWorkspaceTheme(
    book.editorPrefs?.workspaceTheme,
    book.editorPrefs?.darkMode,
  )
  return {
    ...book,
    schemaVersion: 3,
    goals: { ...defaultGoals(), ...book.goals },
    editorPrefs: {
      ...defaultEditorPrefs(),
      ...book.editorPrefs,
      workspaceTheme,
      darkMode: isDarkWorkspaceTheme(workspaceTheme),
    },
    customThemes: book.customThemes || [],
    masterPages: book.masterPages || [],
    comments: book.comments || [],
    revisions: book.revisions || [],
    trackedChanges: book.trackedChanges || [],
    calloutPresets: book.calloutPresets || [],
    trashItems: book.trashItems || [],
    storyBible: {
      ...defaultStoryBible(),
      ...book.storyBible,
      characters: book.storyBible?.characters || [],
      world: book.storyBible?.world || [],
      relationships: book.storyBible?.relationships || [],
    },
    stickyNotes: book.stickyNotes || [],
    manuscriptFolders,
    trackChanges: book.trackChanges || false,
    themeId: book.themeId || 'theme-classic',
    chapters: book.chapters.map((chapter, index) => ({
      ...chapter,
      sortOrder: chapter.sortOrder ?? index,
      partId: chapter.partId && partIds.has(chapter.partId) ? chapter.partId : undefined,
      folderId:
        !(chapter.partId && partIds.has(chapter.partId)) &&
        chapter.folderId &&
        folderIds.has(chapter.folderId)
          ? chapter.folderId
          : undefined,
      options: { ...defaultChapterOptions(), ...chapter.options },
      subtitle: chapter.subtitle ?? '',
      imageAlt: chapter.imageAlt ?? '',
      imageCaption: chapter.imageCaption ?? '',
      imageLayout: chapter.imageLayout ?? 'inline',
      imageWidthPx: chapter.imageWidthPx ?? 0,
      imageHeightPx: chapter.imageHeightPx ?? 0,
      imageBytes: chapter.imageBytes ?? 0,
      sceneTitles: chapter.sceneTitles || [],
    })),
  }
}

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const anchor = document.createElement('a')
  const url = URL.createObjectURL(blob)
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function BookProvider({ children }: { children: ReactNode }) {
  const initialPinnedLayout = useMemo(readPinnedLayout, [])
  const [books, setBooks] = useState<BookProject[]>([])
  const [openBookId, setOpenBookId] = useState<string | null>(null)
  const [themes, setThemes] = useState<BookTheme[]>(PRESET_THEMES)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<AppMode>('draft')
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('iPad')
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerPhase, setTimerPhase] = useState<'sprint' | 'break'>('sprint')
  const [sprintDuration, setSprintDurationState] = useState(25 * 60)
  const [breakDuration, setBreakDurationState] = useState(5 * 60)
  const [rightPanel, setRightPanel] = useState<RightPanel>(initialPinnedLayout.pinnedRightPanel)
  const [sidebarOpen, setSidebarOpen] = useState(initialPinnedLayout.sidebarPinned)
  const [sidebarPinned, setSidebarPinned] = useState(initialPinnedLayout.sidebarPinned)
  const [pinnedRightPanel, setPinnedRightPanel] = useState<RightPanel>(initialPinnedLayout.pinnedRightPanel)
  const [editingTheme, setEditingTheme] = useState<BookTheme | null>(null)
  const hydrated = useRef(false)
  const saveGeneration = useRef(0)
  const lastRevisionAt = useRef<Record<string, number>>({})

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_LAYOUT_KEY, JSON.stringify({ sidebarPinned, pinnedRightPanel }))
    } catch {
      // A hardened browser may disable localStorage. Book data still persists
      // independently through IndexedDB.
    }
  }, [pinnedRightPanel, sidebarPinned])

  useEffect(() => {
    let active = true
    void loadLibrary()
      .then((library) => {
        if (!active) return
        setBooks(library.books.map(normalizeBook))
        setOpenBookId(library.openBookId)
        setThemes([...PRESET_THEMES, ...library.themes.filter((theme) => !theme.preset)])
        hydrated.current = true
      })
      .catch((error: unknown) => {
        if (!active) return
        setSaveStatus('error')
        setSaveError(error instanceof Error ? error.message : 'The local library could not be opened.')
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const showNotice = (event: Event) => setNotice((event as CustomEvent<string>).detail)
    window.addEventListener('typesetly:notice', showNotice)
    return () => window.removeEventListener('typesetly:notice', showNotice)
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    const generation = ++saveGeneration.current
    const timer = window.setTimeout(() => {
      const state: LibraryState = { books, openBookId, themes }
      void saveLibrary(state)
        .then(() => {
          if (saveGeneration.current !== generation) return
          setSaveStatus('saved')
          setSaveError('')
        })
        .catch((error: unknown) => {
          if (saveGeneration.current !== generation) return
          setSaveStatus('error')
          setSaveError(error instanceof Error ? error.message : 'Changes could not be saved.')
        })
    }, 550)
    return () => window.clearTimeout(timer)
  }, [books, openBookId, themes])

  useEffect(() => {
    if (!timerRunning) return
    const interval = window.setInterval(() => {
      setTimerSeconds((seconds) => {
        const duration = timerPhase === 'sprint' ? sprintDuration : breakDuration
        if (seconds + 1 < duration) return seconds + 1
        const nextPhase = timerPhase === 'sprint' ? 'break' : 'sprint'
        if (timerPhase === 'sprint' && openBookId) {
          setBooks((previous) => previous.map((book) => book.id === openBookId ? {
            ...book,
            goals: {
              ...book.goals,
              sprintLog: [...(book.goals.sprintLog || []), { date: todayKey(), seconds: duration }],
            },
          } : book))
        }
        setTimerPhase(nextPhase)
        setNotice(nextPhase === 'break' ? 'Sprint complete. Take a break.' : 'Break complete. Ready for another sprint.')
        return 0
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [breakDuration, openBookId, sprintDuration, timerPhase, timerRunning])

  const project = useMemo(
    () => books.find((book) => book.id === openBookId) ?? null,
    [books, openBookId],
  )

  const markDirty = useCallback(() => {
    setSaveStatus('saving')
    setSaveError('')
  }, [])

  const mutateOpen = useCallback(
    (updater: (previous: BookProject) => BookProject) => {
      if (!openBookId) return
      markDirty()
      // All project writes pass through one functional update so rapid editor,
      // drag/drop, and timer changes cannot overwrite one another.
      setBooks((previous) =>
        previous.map((book) =>
          book.id === openBookId
            ? normalizeBook({ ...updater(book), updatedAt: new Date().toISOString() })
            : book,
        ),
      )
    },
    [markDirty, openBookId],
  )

  useEffect(() => {
    if (!project || saveStatus !== 'saved') return
    const now = Date.now()
    if (now - (lastRevisionAt.current[project.id] || 0) < 30_000) return
    lastRevisionAt.current[project.id] = now
    void saveRevision(project)
  }, [project, saveStatus])

  const activeTheme = useMemo(() => {
    if (editingTheme) return editingTheme
    return getThemeById(themes, project?.themeId || 'theme-classic')
  }, [editingTheme, project?.themeId, themes])

  const frontMatter = useMemo(
    () => project?.chapters.filter((chapter) => FRONT_MATTER_TYPES.includes(chapter.type)) ?? [],
    [project],
  )
  const bodyChapters = useMemo(
    () => project?.chapters.filter((chapter) =>
      chapter.type === 'chapter' || chapter.type === 'part' || chapter.type === 'full-page-image' || chapter.type === 'custom-page'
    ) ?? [],
    [project],
  )
  const backMatter = useMemo(
    () => project?.chapters.filter((chapter) => BACK_MATTER_TYPES.includes(chapter.type)) ?? [],
    [project],
  )
  const activeChapter = useMemo(
    () => project?.chapters.find((chapter) => chapter.id === project.activeId),
    [project],
  )

  const value = {
    books,
    loading,
    openBookId,
    project,
    themes,
    activeTheme,
    mode,
    previewDevice,
    saved: saveStatus === 'saved',
    saveStatus,
    saveError,
    notice,
    timerRunning,
    timerSeconds,
    timerPhase,
    sprintDuration,
    breakDuration,
    rightPanel,
    sidebarOpen,
    sidebarPinned,
    pinnedRightPanel,
    editingTheme,
    frontMatter,
    bodyChapters,
    backMatter,
    activeChapter,
    setMode,
    setPreviewDevice,
    setRightPanel,
    setSidebarOpen,
    setSidebarPinned,
    setPinnedRightPanel,
    openBook: (id: string) => {
      setOpenBookId(id)
      setMode('draft')
      setRightPanel(pinnedRightPanel)
      setSidebarOpen(sidebarPinned)
    },
    goHome: () => setOpenBookId(null),
    createBook: (title?: string) => {
      const book = normalizeBook(createEmptyBook(title))
      markDirty()
      setBooks((previous) => [book, ...previous])
      setOpenBookId(book.id)
      setNotice('New book created.')
    },
    duplicateBook: (id: string) => {
      const source = books.find((book) => book.id === id)
      if (!source) return
      const idMap = new Map(source.chapters.map((chapter) => [chapter.id, uuid()]))
      const folderIdMap = new Map(
        (source.manuscriptFolders || []).map((folder) => [folder.id, uuid()]),
      )
      const copy = normalizeBook({
        ...structuredClone(source),
        id: uuid(),
        details: { ...source.details, title: `${source.details.title} (Copy)` },
        chapters: source.chapters.map((chapter) => ({
          ...structuredClone(chapter),
          id: idMap.get(chapter.id)!,
          partId: chapter.partId ? idMap.get(chapter.partId) : undefined,
          folderId: chapter.folderId ? folderIdMap.get(chapter.folderId) : undefined,
        })),
        manuscriptFolders: (source.manuscriptFolders || []).map((folder) => ({
          ...structuredClone(folder),
          id: folderIdMap.get(folder.id)!,
        })),
        activeId: idMap.get(source.activeId) || idMap.get(source.chapters[0].id)!,
        trashItems: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      markDirty()
      setBooks((previous) => [copy, ...previous])
      setNotice('Book duplicated.')
    },
    deleteBook: (id: string) => {
      markDirty()
      setBooks((previous) => previous.filter((book) => book.id !== id))
      if (openBookId === id) setOpenBookId(null)
      setNotice('Book deleted.')
    },
    importBookFromDocx: async (file: File) => {
      const { importDocxToBook } = await import('./import/docx')
      const report = await importDocxToBook(file)
      markDirty()
      setBooks((previous) => [normalizeBook(report.book), ...previous])
      setOpenBookId(report.book.id)
      setNotice(
        report.warnings.length
          ? `Book imported with ${report.warnings.length} warning(s): ${report.warnings[0]}`
          : 'Book imported successfully.',
      )
    },
    importChaptersFromDocx: async (file: File) => {
      const { importDocxToBook } = await import('./import/docx')
      const report = await importDocxToBook(file)
      const incoming = report.book.chapters.filter((chapter) => chapter.type === 'chapter')
      mutateOpen((book) => {
        const insertAt = book.chapters.findIndex((chapter) => BACK_MATTER_TYPES.includes(chapter.type))
        const chapters = [...book.chapters]
        chapters.splice(insertAt < 0 ? chapters.length : insertAt, 0, ...incoming)
        return { ...book, chapters, activeId: incoming[0]?.id || book.activeId }
      })
      setNotice(`${incoming.length} chapter(s) imported.${report.warnings[0] ? ` ${report.warnings[0]}` : ''}`)
    },
    connectScrivenerSync: async (format: 'rtf' | 'txt' = 'rtf') => {
      if (!project) return
      const bridge = window.typesetly
      if (!bridge?.chooseScrivenerSyncFolder || !bridge.writeScrivenerSyncFiles) {
        setNotice('Live Scrivener folder sync is available in the Typesetly desktop app.')
        return
      }
      const snapshot = await bridge.chooseScrivenerSyncFolder()
      if (!snapshot.ok || !snapshot.folderPath) {
        if (snapshot.error) setNotice(snapshot.error)
        return
      }
      const { syncScrivenerSources } = await import('./integrations/scrivener')
      const outcome = syncScrivenerSources(project, snapshot.files || [], {
        folderPath: snapshot.folderPath,
        folderName: snapshot.folderName || 'Scrivener Sync',
        format,
      })
      if (outcome.writes.length) {
        const writeResult = await bridge.writeScrivenerSyncFiles({
          folderPath: snapshot.folderPath,
          files: outcome.writes,
        })
        if (!writeResult.ok) {
          setNotice(writeResult.error || 'Typesetly could not write to the Scrivener sync folder.')
          return
        }
      }
      mutateOpen(() => outcome.project)
      setNotice([
        'Scrivener sync folder connected.',
        outcome.imported ? `${outcome.imported} imported.` : '',
        outcome.exported ? `${outcome.exported} exported.` : '',
        outcome.conflicts ? `${outcome.conflicts} conflict copy added.` : '',
      ].filter(Boolean).join(' '))
    },
    syncScrivener: async () => {
      if (!project?.scrivenerSync) return
      const bridge = window.typesetly
      if (!bridge?.readScrivenerSyncFolder || !bridge.writeScrivenerSyncFiles) {
        setNotice('Live Scrivener folder sync is available in the Typesetly desktop app.')
        return
      }
      const snapshot = await bridge.readScrivenerSyncFolder({
        folderPath: project.scrivenerSync.folderPath,
      })
      if (!snapshot.ok || !snapshot.folderPath) {
        setNotice(snapshot.error || 'The Scrivener sync folder could not be opened.')
        return
      }
      const { syncScrivenerSources } = await import('./integrations/scrivener')
      const outcome = syncScrivenerSources(project, snapshot.files || [], {
        folderPath: snapshot.folderPath,
        folderName: snapshot.folderName || project.scrivenerSync.folderName,
        format: project.scrivenerSync.format,
      })
      if (outcome.writes.length) {
        const writeResult = await bridge.writeScrivenerSyncFiles({
          folderPath: snapshot.folderPath,
          files: outcome.writes,
        })
        if (!writeResult.ok) {
          setNotice(writeResult.error || 'Typesetly could not write to the Scrivener sync folder.')
          return
        }
      }
      mutateOpen(() => outcome.project)
      const changes = outcome.imported + outcome.updated + outcome.exported + outcome.conflicts
      setNotice([
        changes ? 'Scrivener sync complete.' : 'Scrivener files are already up to date.',
        outcome.imported ? `${outcome.imported} imported.` : '',
        outcome.updated ? `${outcome.updated} updated from Scrivener.` : '',
        outcome.exported ? `${outcome.exported} sent to Scrivener.` : '',
        outcome.conflicts ? `${outcome.conflicts} conflict copy added for review.` : '',
        outcome.missing ? `${outcome.missing} missing external file left unchanged.` : '',
      ].filter(Boolean).join(' '))
    },
    disconnectScrivenerSync: () => {
      mutateOpen((book) => ({ ...book, scrivenerSync: undefined }))
      setNotice('Scrivener sync folder disconnected. No external files were removed.')
    },
    restoreSnapshot: async (file: File) => {
      const snapshot = parseSnapshot(await file.text())
      const restoredThemes = [...PRESET_THEMES, ...snapshot.themes.filter((theme) => !theme.preset)]
      const restoredBooks = snapshot.books.map(normalizeBook)
      setBooks(restoredBooks)
      setThemes(restoredThemes)
      setOpenBookId(null)
      markDirty()
        ...book,
        details: { ...book.details, ...details },
      }))
    },
    updateChapterTitle: (chapterId: string, title: string) => {
      changeProject((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, title } : chapter
        ),
      }))
    },
    updateChapterContent: (chapterId: string, content: string) => {
      changeProject((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, content } : chapter
        ),
      }))
    },
    addChapter: () => {
      changeProject((book) => {
        const chapter = createChapter(`Chapter ${book.chapters.length + 1}`, book.chapters.length)
        return { ...book, chapters: [...book.chapters, chapter], activeId: chapter.id }
      })
    },
    removeChapter: (chapterId: string) => {
      changeProject((book) => {
        const chapters = book.chapters.filter((chapter) => chapter.id !== chapterId)
        return { ...book, chapters, activeId: chapters[0]?.id ?? '' }
      })
    },
    markSaved: () => setSaved(true),
  }), [mode, project, saved])

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>
}
