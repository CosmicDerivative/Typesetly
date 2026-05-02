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
      await saveLibrary({ books: restoredBooks, openBookId: null, themes: restoredThemes })
      setNotice(`${restoredBooks.length} book(s) restored from snapshot.`)
    },
    replaceProject: (next: BookProject) => {
      setBooks((previous) => upsertBook({ books: previous, openBookId, themes }, normalizeBook(next)).books)
      setOpenBookId(next.id)
      markDirty()
    },
    updateDetails: (details: Partial<BookDetails>) =>
      mutateOpen((book) => ({ ...book, details: { ...book.details, ...details } })),
    updateBookSeries: (id: string, series: { name: string; number?: number; total?: number }) => {
      markDirty()
      setBooks((previous) => previous.map((book) => book.id === id ? {
        ...book,
        details: {
          ...book.details,
          seriesName: series.name.trim(),
          seriesNumber: series.number,
          seriesTotal: series.total,
        },
        updatedAt: new Date().toISOString(),
      } : book))
    },
    setActiveChapter: (id: string) => {
      if (!openBookId) return
      setBooks((previous) =>
        previous.map((book) => (book.id === openBookId ? { ...book, activeId: id } : book)),
      )
      if (window.innerWidth <= 760) setSidebarOpen(false)
    },
    updateChapterTitle: (id: string, title: string) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) => (chapter.id === id ? { ...chapter, title } : chapter)),
      })),
    updateChapterType: (id: string, type: PageType) => {
      mutateOpen((book) => convertPageType(book, id, type))
      setNotice(`Page type changed to ${PAGE_TYPE_LABELS[type]}.`)
    },
    updateChapterSubtitle: (id: string, subtitle: string) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) => (chapter.id === id ? { ...chapter, subtitle } : chapter)),
      })),
    updateChapterImage: (id: string, imageDataUrl?: string, metadata?: { width: number; height: number; bytes: number }) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === id ? {
            ...chapter,
            imageDataUrl,
            imageWidthPx: metadata?.width || 0,
            imageHeightPx: metadata?.height || 0,
            imageBytes: metadata?.bytes || 0,
          } : chapter,
        ),
      })),
    updateChapterImageDetails: (id: string, details: Pick<import('./types').Chapter, 'imageAlt' | 'imageCaption' | 'imageLayout'>) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === id ? { ...chapter, ...details } : chapter,
        ),
      })),
    updateChapterContent: (id: string, content: string) =>
      mutateOpen((book) => {
        const current = book.chapters.find((chapter) => chapter.id === id)
        const delta = current ? countWords(content) - countWords(current.content) : 0
        const key = todayKey()
        const trackedChanges = [...(book.trackedChanges || [])]
        if (book.trackChanges && current && current.content !== content) {
          const last = trackedChanges.at(-1)
          const canCoalesce =
            last?.chapterId === id &&
            last.status === 'pending' &&
            Date.now() - new Date(last.updatedAt).getTime() < 120_000
          if (last && canCoalesce) {
            trackedChanges[trackedChanges.length - 1] = { ...last, afterHtml: content, updatedAt: new Date().toISOString() }
          } else {
            const now = new Date().toISOString()
            trackedChanges.push({
              id: uuid(),
              chapterId: id,
              beforeHtml: current.content,
              afterHtml: content,
              author: 'Author',
              createdAt: now,
              updatedAt: now,
              status: 'pending',
            })
          }
        }
        return {
          ...book,
          trackedChanges,
          chapters: book.chapters.map((chapter) => (chapter.id === id ? { ...chapter, content } : chapter)),
          goals: applyHabitWordDelta(book.goals, key, id, delta),
        }
      }),
    splitChapter: (id: string, beforeHtml: string, afterHtml: string) =>
      mutateOpen((book) => {
        const index = book.chapters.findIndex((chapter) => chapter.id === id)
        if (index < 0 || !afterHtml.trim()) return book
        const source = book.chapters[index]
        const nextChapter = {
          ...structuredClone(source),
          id: uuid(),
          title: `${source.title} (continued)`,
          content: afterHtml,
        }
        const chapters = [...book.chapters]
        chapters[index] = { ...source, content: beforeHtml }
        chapters.splice(index + 1, 0, nextChapter)
        return { ...book, chapters, activeId: nextChapter.id }
      }),
    updateChapterOptions: (id: string, options: Partial<ChapterOptions>) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === id ? { ...chapter, options: { ...chapter.options, ...options } } : chapter,
        ),
      })),
    setEpubStartChapter: (id?: string) => mutateOpen((book) => ({ ...book, epubStartChapterId: id })),
    updateBodyChapterOptions: (options: Partial<ChapterOptions>) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.type === 'chapter'
            ? { ...chapter, options: { ...chapter.options, ...options } }
            : chapter,
        ),
      })),
    addChapter: () => {
      mutateOpen((book) => {
        const chapter = createChapter(nextChapterTitle(book.chapters))
        const backStart = book.chapters.findIndex((candidate) => BACK_MATTER_TYPES.includes(candidate.type))
        const chapters = [...book.chapters]
        chapters.splice(backStart < 0 ? chapters.length : backStart, 0, chapter)
        return { ...book, chapters, activeId: chapter.id }
      })
    },
    addChapterToFolder: (folderId: string) => {
      mutateOpen((book) => {
        if (!(book.manuscriptFolders || []).some((folder) => folder.id === folderId)) return book
        const chapter = {
          ...createChapter(nextChapterTitle(book.chapters)),
          folderId,
        }
        const backStart = book.chapters.findIndex((candidate) => BACK_MATTER_TYPES.includes(candidate.type))
        const chapters = [...book.chapters]
        chapters.splice(backStart < 0 ? chapters.length : backStart, 0, chapter)
        return { ...book, chapters, activeId: chapter.id }
      })
      setNotice('Chapter added to folder.')
    },
    addChapterToPart: (partId: string) => {
      mutateOpen((book) => {
        const partIndex = book.chapters.findIndex((candidate) => candidate.id === partId && candidate.type === 'part')
        if (partIndex < 0) return book
        const chapter = {
          ...createChapter(nextChapterTitle(book.chapters)),
          partId,
        }
        const chapters = [...book.chapters]
        let insertAt = partIndex + 1
        while (insertAt < chapters.length && chapters[insertAt].partId === partId) insertAt += 1
        chapters.splice(insertAt, 0, chapter)
        return { ...book, chapters, activeId: chapter.id }
      })
    },
    addPage: (type: PageType) => {
      const createdPage = makePage(type, PAGE_TYPE_LABELS[type])
      const page = type === 'full-page-image'
        ? {
            ...createdPage,
            imageLayout: 'full-page' as const,
            options: { ...createdPage.options, hideChapterHeading: true, hideHeaderFooter: true, hidePageNumber: true },
          }
        : createdPage
      mutateOpen((book) => {
        const chapters = [...book.chapters]
        if (FRONT_MATTER_TYPES.includes(type)) {
          const lastFront = chapters.reduce(
            (last, chapter, index) => (FRONT_MATTER_TYPES.includes(chapter.type) ? index : last),
            -1,
          )
          chapters.splice(lastFront + 1, 0, page)
        } else chapters.push(page)
        return { ...book, chapters, activeId: page.id }
      })
    },
    addPart: () => {
      const part = createPart(`Part ${(project?.chapters.filter((candidate) => candidate.type === 'part').length || 0) + 1}`)
      mutateOpen((book) => {
        const backStart = book.chapters.findIndex((candidate) => BACK_MATTER_TYPES.includes(candidate.type))
        const chapters = [...book.chapters]
        chapters.splice(backStart < 0 ? chapters.length : backStart, 0, part)
        return { ...book, chapters, activeId: part.id }
      })
    },
    saveActiveAsMasterPage: () => {
      if (!activeChapter) return
      const template = {
        ...structuredClone(activeChapter),
        id: uuid(),
        partId: undefined,
        folderId: undefined,
        title: `${activeChapter.title} Master`,
      }
      mutateOpen((book) => ({ ...book, masterPages: [...(book.masterPages || []), template] }))
      setNotice('Master page saved.')
    },
    savePageAsMaster: (id: string) => {
      mutateOpen((book) => {
        const source = book.chapters.find((chapter) => chapter.id === id)
        if (!source) return book
        const template = {
          ...structuredClone(source),
          id: uuid(),
          partId: undefined,
          folderId: undefined,
          title: `${source.title} Master`,
        }
        return { ...book, masterPages: [...(book.masterPages || []), template] }
      })
      setNotice('Master page saved.')
    },
    addMasterPage: (templateId: string) => {
      const template = project?.masterPages?.find((page) => page.id === templateId)
      if (!template) return
      const page = {
        ...structuredClone(template),
        id: uuid(),
        partId: undefined,
        folderId: undefined,
        title: template.title.replace(/\s+Master$/, ''),
      }
      mutateOpen((book) => {
        const chapters = [...book.chapters, page]
        return { ...book, chapters, activeId: page.id }
      })
      setNotice('Master page added.')
    },
    duplicateChapter: (id: string) => {
      const source = project?.chapters.find((chapter) => chapter.id === id)
      if (!source) return
      if (['title-page', 'copyright', 'contents'].includes(source.type)) {
        setNotice('Required book pages cannot be duplicated.')
        return
      }
      mutateOpen((book) => {
        const index = book.chapters.findIndex((chapter) => chapter.id === id)
        if (index < 0) return book
        const sourceChapter = book.chapters[index]
        if (['title-page', 'copyright', 'contents'].includes(sourceChapter.type)) return book
        const duplicate = {
          ...structuredClone(sourceChapter),
          id: uuid(),
          title: `${sourceChapter.title || PAGE_TYPE_LABELS[sourceChapter.type]} Copy`,
        }
        const chapters = [...book.chapters]
        chapters.splice(index + 1, 0, duplicate)
        return { ...book, chapters, activeId: duplicate.id }
      })
      setNotice('Page duplicated.')
    },
    deleteChapter: (id: string) => {
      const source = project?.chapters.find((chapter) => chapter.id === id)
      if (!source) return
      if (['title-page', 'copyright', 'contents'].includes(source.type)) {
        setNotice('Required book pages cannot be moved to Trash.')
        return
      }
      mutateOpen((book) => {
        const originalIndex = book.chapters.findIndex((chapter) => chapter.id === id)
        const target = book.chapters[originalIndex]
        if (!target || ['title-page', 'copyright', 'contents'].includes(target.type)) return book
        const childPageIds = book.chapters
          .filter((chapter) => chapter.partId === id)
          .map((chapter) => chapter.id)
        const detachedNotes = (book.stickyNotes || []).filter((note) => note.chapterId === id)
        const chapters = book.chapters
          .filter((chapter) => chapter.id !== id)
          .map((chapter) => (chapter.partId === id ? { ...chapter, partId: undefined } : chapter))
        const fallback = chapters[Math.min(originalIndex, Math.max(0, chapters.length - 1))]
        return {
          ...book,
          chapters,
          trashItems: [
            ...(book.trashItems || []),
            {
              id: uuid(),
              kind: 'page' as const,
              deletedAt: new Date().toISOString(),
              page: structuredClone(target),
              originalIndex,
              childPageIds,
              stickyNotes: detachedNotes,
            },
          ],
          stickyNotes: (book.stickyNotes || []).filter((note) => note.chapterId !== id),
          activeId: book.activeId === id ? fallback?.id || book.activeId : book.activeId,
        }
      })
      setNotice('Page moved to Trash.')
    },
    moveChapterBy: (id: string, direction: -1 | 1) =>
      mutateOpen((book) => {
        const fromIndex = book.chapters.findIndex((chapter) => chapter.id === id)
        if (fromIndex < 0) return book
        const source = book.chapters[fromIndex]
        const sameSection = (chapter: typeof source) => {
          if (FRONT_MATTER_TYPES.includes(source.type)) {
            return FRONT_MATTER_TYPES.includes(chapter.type) &&
              !['title-page', 'copyright', 'contents'].includes(chapter.type)
          }
          if (BACK_MATTER_TYPES.includes(source.type)) return BACK_MATTER_TYPES.includes(chapter.type)
          if (source.type === 'part') return chapter.type === 'part'
          if (source.partId) return chapter.partId === source.partId
          if (source.folderId) return chapter.folderId === source.folderId
          return !FRONT_MATTER_TYPES.includes(chapter.type) &&
            !BACK_MATTER_TYPES.includes(chapter.type) &&
            chapter.type !== 'part' &&
            !chapter.partId &&
            !chapter.folderId
        }
        const sectionIndices = book.chapters
          .map((chapter, index) => ({ chapter, index }))
          .filter(({ chapter }) => sameSection(chapter))
          .map(({ index }) => index)
        const sectionPosition = sectionIndices.indexOf(fromIndex)
        const targetIndex = sectionIndices[sectionPosition + direction]
        if (targetIndex === undefined) return book
        const chapters = [...book.chapters]
        ;[chapters[fromIndex], chapters[targetIndex]] = [chapters[targetIndex], chapters[fromIndex]]
        return { ...book, chapters }
      }),
    moveChapterRelative: (
      sourceId: string,
      targetId: string,
      placement: 'before' | 'after' | 'inside',
    ) =>
      mutateOpen((book) => {
        if (sourceId === targetId) return book
        const source = book.chapters.find((chapter) => chapter.id === sourceId)
        const target = book.chapters.find((chapter) => chapter.id === targetId)
        if (!source || !target || ['title-page', 'copyright', 'contents'].includes(source.type)) return book

        const section = (type: PageType) => (
          FRONT_MATTER_TYPES.includes(type)
            ? 'front'
            : BACK_MATTER_TYPES.includes(type)
              ? 'back'
              : 'body'
        )
        if (section(source.type) !== section(target.type)) return book
        if (section(source.type) === 'front' && ['title-page', 'copyright', 'contents'].includes(target.type)) return book

        if (placement === 'inside') {
          if (source.type !== 'chapter' || target.type !== 'part') return book
          const chapters = book.chapters.filter((chapter) => chapter.id !== source.id)
          const childIndices = chapters
            .map((chapter, index) => ({ chapter, index }))
            .filter(({ chapter }) => chapter.partId === target.id)
            .map(({ index }) => index)
          const partIndex = chapters.findIndex((chapter) => chapter.id === target.id)
          const insertAt = childIndices.length ? Math.max(...childIndices) + 1 : partIndex + 1
          chapters.splice(insertAt, 0, { ...source, partId: target.id, folderId: undefined })
          return { ...book, chapters }
        }

        // Parts only trade places with parts. A chapter dropped next to another
        // chapter adopts that destination chapter's parent part.
        if (section(source.type) === 'body' && (source.type === 'part') !== (target.type === 'part')) {
          return book
        }
        const moved = source.type !== 'part'
          ? {
              ...source,
              partId: target.type !== 'part' ? target.partId : undefined,
              folderId: target.type !== 'part' ? target.folderId : undefined,
            }
          : source
        const chapters = book.chapters.filter((chapter) => chapter.id !== source.id)
        const targetIndex = chapters.findIndex((chapter) => chapter.id === target.id)
        chapters.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved)
        return { ...book, chapters }
      }),
    reorderChapters: (fromIndex: number, toIndex: number) =>
      mutateOpen((book) => {
        const chapters = [...book.chapters]
        const [moved] = chapters.splice(fromIndex, 1)
        if (!moved) return book
        chapters.splice(toIndex, 0, moved)
        return { ...book, chapters }
      }),
    moveChapterToPart: (chapterId: string, partId?: string) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === chapterId
            ? { ...chapter, partId, folderId: partId ? undefined : chapter.folderId }
            : chapter,
        ),
      })),
    addManuscriptFolder: (name: string) => {
      const id = uuid()
      const trimmed = name.trim()
      mutateOpen((book) => ({
        ...book,
        manuscriptFolders: [
          ...(book.manuscriptFolders || []),
          {
            id,
            name: trimmed || `Folder ${(book.manuscriptFolders || []).length + 1}`,
            collapsed: false,
          },
        ],
      }))
      setNotice('Manuscript folder created.')
      return id
    },
    renameManuscriptFolder: (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      mutateOpen((book) => ({
        ...book,
        manuscriptFolders: (book.manuscriptFolders || []).map((folder) =>
          folder.id === id ? { ...folder, name: trimmed } : folder,
        ),
      }))
      setNotice('Folder renamed.')
    },
    deleteManuscriptFolder: (id: string) => {
      mutateOpen((book) => ({
        ...book,
        manuscriptFolders: (book.manuscriptFolders || []).filter((folder) => folder.id !== id),
        chapters: book.chapters.map((chapter) =>
          chapter.folderId === id ? { ...chapter, folderId: undefined } : chapter,
        ),
      }))
      setNotice('Folder removed. Its pages are now unfiled.')
    },
    toggleManuscriptFolder: (id: string) =>
      mutateOpen((book) => ({
        ...book,
        manuscriptFolders: (book.manuscriptFolders || []).map((folder) =>
          folder.id === id ? { ...folder, collapsed: !folder.collapsed } : folder,
        ),
      })),
    moveChapterToFolder: (chapterId: string, folderId?: string) => {
      mutateOpen((book) => {
        const validFolder = folderId
          ? (book.manuscriptFolders || []).some((folder) => folder.id === folderId)
          : true
        if (!validFolder) return book
        return {
          ...book,
          chapters: book.chapters.map((chapter) => {
            if (chapter.id !== chapterId || chapter.type === 'part') return chapter
            if (
              FRONT_MATTER_TYPES.includes(chapter.type) ||
              BACK_MATTER_TYPES.includes(chapter.type)
            ) return chapter
            return {
              ...chapter,
              folderId,
              partId: folderId ? undefined : chapter.partId,
            }
          }),
        }
      })
      setNotice(folderId ? 'Page moved into folder.' : 'Page moved out of folder.')
    },
    addScene: (chapterId: string, afterIndex: number) =>
      mutateOpen((book) => {
        const source = book.chapters.find((chapter) => chapter.id === chapterId)
        if (!source || source.type !== 'chapter') return book
        const count = sceneCount(source.content)
        const titles = normalizedSceneTitles(source.sceneTitles, count)
        const inserted = insertScene(source.content, afterIndex)
        titles.splice(inserted.index, 0, `Scene ${inserted.index + 1}`)
        return {
          ...book,
          chapters: book.chapters.map((chapter) =>
            chapter.id === chapterId
              ? { ...chapter, content: inserted.html, sceneTitles: titles }
              : chapter
          ),
          stickyNotes: insertSceneNoteGap(book.stickyNotes || [], chapterId, inserted.index),
        }
      }),
    duplicateScene: (chapterId: string, sceneIndex: number) => {
      mutateOpen((book) => {
        const source = book.chapters.find((chapter) => chapter.id === chapterId)
        if (!source || source.type !== 'chapter') return book
        const duplicated = duplicateSceneContent(source.content, sceneIndex)
        if (!duplicated) return book
        const titles = normalizedSceneTitles(source.sceneTitles, sceneCount(source.content))
        titles.splice(duplicated.index, 0, `${titles[sceneIndex]} Copy`)
        const originalNotes = (book.stickyNotes || []).filter(
          (note) =>
            note.target === 'scene' &&
            note.chapterId === chapterId &&
            note.sceneIndex === sceneIndex,
        )
        const shiftedNotes = insertSceneNoteGap(book.stickyNotes || [], chapterId, duplicated.index)
        const now = new Date().toISOString()
        const copiedNotes = originalNotes.map((note) => ({
          ...note,
          id: uuid(),
          title: `${note.title} Copy`,
          sceneIndex: duplicated.index,
          createdAt: now,
          updatedAt: now,
        }))
        return {
          ...book,
          chapters: book.chapters.map((chapter) =>
            chapter.id === chapterId
              ? { ...chapter, content: duplicated.html, sceneTitles: titles }
              : chapter
          ),
          stickyNotes: [...shiftedNotes, ...copiedNotes],
        }
      })
      setNotice('Scene duplicated.')
    },
    moveScene: (chapterId: string, sceneIndex: number, direction: -1 | 1) =>
      mutateOpen((book) => {
        const source = book.chapters.find((chapter) => chapter.id === chapterId)
        if (!source || source.type !== 'chapter') return book
        const moved = moveSceneContent(source.content, sceneIndex, direction)
        if (!moved) return book
        const titles = normalizedSceneTitles(source.sceneTitles, sceneCount(source.content))
        ;[titles[sceneIndex], titles[moved.index]] = [titles[moved.index], titles[sceneIndex]]
        return {
          ...book,
          chapters: book.chapters.map((chapter) =>
            chapter.id === chapterId
              ? { ...chapter, content: moved.html, sceneTitles: titles }
              : chapter
          ),
          stickyNotes: reorderSceneNotes(book.stickyNotes || [], chapterId, sceneIndex, moved.index),
        }
      }),
    moveSceneToChapter: (
      sourceChapterId: string,
      sourceSceneIndex: number,
      targetChapterId: string,
      targetSceneIndex: number,
      placement: 'before' | 'after',
    ) => {
      mutateOpen((book) => {
        const source = book.chapters.find((chapter) => chapter.id === sourceChapterId)
        const target = book.chapters.find((chapter) => chapter.id === targetChapterId)
        if (!source || source.type !== 'chapter' || !target || target.type !== 'chapter') return book

        const sourceScenes = splitScenes(source.content)
        if (sourceSceneIndex < 0 || sourceSceneIndex >= sourceScenes.length) return book
        const sourceTitles = normalizedSceneTitles(source.sceneTitles, sourceScenes.length)
        const [sceneHtml] = sourceScenes.splice(sourceSceneIndex, 1)
        const [sceneTitle] = sourceTitles.splice(sourceSceneIndex, 1)

        if (source.id === target.id) {
          let insertAt = targetSceneIndex + (placement === 'after' ? 1 : 0)
          if (sourceSceneIndex < insertAt) insertAt -= 1
          insertAt = Math.max(0, Math.min(insertAt, sourceScenes.length))
          sourceScenes.splice(insertAt, 0, sceneHtml)
          sourceTitles.splice(insertAt, 0, sceneTitle)
          return {
            ...book,
            chapters: book.chapters.map((chapter) =>
              chapter.id === source.id
                ? { ...chapter, content: joinScenes(sourceScenes), sceneTitles: sourceTitles }
                : chapter,
            ),
            stickyNotes: moveSceneNotesBetweenChapters(
              book.stickyNotes || [],
              source.id,
              sourceSceneIndex,
              target.id,
              insertAt,
            ),
          }
        }

        const targetScenes = splitScenes(target.content)
        const targetTitles = normalizedSceneTitles(target.sceneTitles, targetScenes.length)
        const insertAt = Math.max(
          0,
          Math.min(targetSceneIndex + (placement === 'after' ? 1 : 0), targetScenes.length),
        )
        targetScenes.splice(insertAt, 0, sceneHtml)
        targetTitles.splice(insertAt, 0, sceneTitle)
        if (!sourceScenes.length) {
          sourceScenes.push('<p></p>')
          sourceTitles.push('Scene 1')
        }
        return {
          ...book,
          chapters: book.chapters.map((chapter) => {
            if (chapter.id === source.id) {
              return { ...chapter, content: joinScenes(sourceScenes), sceneTitles: sourceTitles }
            }
            if (chapter.id === target.id) {
              return { ...chapter, content: joinScenes(targetScenes), sceneTitles: targetTitles }
            }
            return chapter
          }),
          activeId: target.id,
          stickyNotes: moveSceneNotesBetweenChapters(
            book.stickyNotes || [],
            source.id,
            sourceSceneIndex,
            target.id,
            insertAt,
          ),
        }
      })
      setNotice('Scene moved.')
    },
    deleteScene: (chapterId: string, sceneIndex: number) => {
      const source = project?.chapters.find((chapter) => chapter.id === chapterId)
      if (!source || source.type !== 'chapter') return
      if (sceneCount(source.content) <= 1) {
        setNotice('A chapter must keep at least one scene.')
        return
      }
      mutateOpen((book) => {
        const source = book.chapters.find((chapter) => chapter.id === chapterId)
        if (!source || source.type !== 'chapter') return book
        const removed = removeSceneContent(source.content, sceneIndex)
        if (!removed) return book
        const titles = normalizedSceneTitles(source.sceneTitles, sceneCount(source.content))
        const [sceneTitle] = titles.splice(sceneIndex, 1)
        const sceneNotes = detachSceneNotes(book.stickyNotes || [], chapterId, sceneIndex)
        return {
          ...book,
          chapters: book.chapters.map((chapter) =>
            chapter.id === chapterId
              ? { ...chapter, content: removed.html, sceneTitles: titles }
              : chapter,
          ),
          trashItems: [
            ...(book.trashItems || []),
            {
              id: uuid(),
              kind: 'scene' as const,
              deletedAt: new Date().toISOString(),
              chapterId,
              chapterTitle: source.title,
              sceneIndex,
              sceneTitle,
              sceneHtml: removed.removedHtml,
              stickyNotes: sceneNotes.detached,
            },
          ],
          stickyNotes: sceneNotes.remaining,
        }
      })
      setNotice('Scene moved to Trash.')
    },
    updateSceneTitle: (chapterId: string, sceneIndex: number, title: string) =>
      mutateOpen((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) => {
          if (chapter.id !== chapterId || chapter.type !== 'chapter') return chapter
          const titles = normalizedSceneTitles(chapter.sceneTitles, sceneCount(chapter.content))
          titles[sceneIndex] = title.trim() || `Scene ${sceneIndex + 1}`
          return { ...chapter, sceneTitles: titles }
        }),
      })),
    restoreTrashItem: (id: string) => {
      mutateOpen((book) => {
        const item = book.trashItems?.find((candidate) => candidate.id === id)
        if (!item) return book
        const trashItems = (book.trashItems || []).filter((candidate) => candidate.id !== id)
        if (item.kind === 'page') {
          if (book.chapters.some((chapter) => chapter.id === item.page.id)) return { ...book, trashItems }
          const chapters = [...book.chapters]
          const restoreAt = Math.max(0, Math.min(item.originalIndex, chapters.length))
          const folderStillExists = (book.manuscriptFolders || []).some(
            (folder) => folder.id === item.page.folderId,
          )
          chapters.splice(
            restoreAt,
            0,
            folderStillExists ? item.page : { ...item.page, folderId: undefined },
          )
          const reattached = chapters.map((chapter) =>
            item.childPageIds.includes(chapter.id) && !chapter.partId
              ? { ...chapter, partId: item.page.id }
              : chapter,
          )
          return {
            ...book,
            chapters: reattached,
            trashItems,
            stickyNotes: [...(book.stickyNotes || []), ...(item.stickyNotes || [])],
            activeId: item.page.id,
          }
        }
        const source = book.chapters.find((chapter) => chapter.id === item.chapterId)
        if (!source) return book
        const count = sceneCount(source.content)
        const titles = normalizedSceneTitles(source.sceneTitles, count)
        const restored = insertScene(source.content, item.sceneIndex - 1, item.sceneHtml)
        titles.splice(restored.index, 0, item.sceneTitle)
        const shiftedNotes = insertSceneNoteGap(book.stickyNotes || [], source.id, restored.index)
        const restoredNotes = (item.stickyNotes || []).map((note) => ({
          ...note,
          chapterId: source.id,
          sceneIndex: restored.index,
        }))
        return {
          ...book,
          chapters: book.chapters.map((chapter) =>
            chapter.id === source.id
              ? { ...chapter, content: restored.html, sceneTitles: titles }
              : chapter,
          ),
          trashItems,
          stickyNotes: [...shiftedNotes, ...restoredNotes],
          activeId: source.id,
        }
      })
      setNotice('Item restored from Trash.')
    },
    permanentlyDeleteTrashItem: (id: string) => {
      mutateOpen((book) => {
        const target = book.trashItems?.find((item) => item.id === id)
        return {
          ...book,
          trashItems: (book.trashItems || []).filter((item) =>
            item.id !== id &&
            !(target?.kind === 'page' && item.kind === 'scene' && item.chapterId === target.page.id),
          ),
        }
      })
      setNotice('Item permanently deleted.')
    },
    emptyTrash: () => {
      mutateOpen((book) => ({ ...book, trashItems: [] }))
      setNotice('Trash emptied.')
    },
    addCharacter: () => {
      const id = uuid()
      const character: CharacterProfile = {
        id,
        name: 'New character',
        role: '',
        pronouns: '',
        age: '',
        aliases: '',
        summary: '',
        appearance: '',
        personality: '',
        motivation: '',
        conflict: '',
        arc: '',
        relationships: '',
        notes: '',
        tags: [],
      }
      mutateOpen((book) => ({
        ...book,
        storyBible: {
          ...(book.storyBible || defaultStoryBible()),
          characters: [...(book.storyBible?.characters || []), character],
        },
      }))
      return id
    },
    updateCharacter: (id: string, patch: Partial<CharacterProfile>) =>
      mutateOpen((book) => ({
        ...book,
        storyBible: {
          ...(book.storyBible || defaultStoryBible()),
          characters: (book.storyBible?.characters || []).map((character) =>
            character.id === id ? { ...character, ...patch } : character
          ),
        },
      })),
    deleteCharacter: (id: string) => {
      mutateOpen((book) => ({
        ...book,
        storyBible: {
          ...(book.storyBible || defaultStoryBible()),
          characters: (book.storyBible?.characters || []).filter((character) => character.id !== id),
          relationships: (book.storyBible?.relationships || []).filter(
            (relationship) => relationship.sourceId !== id && relationship.targetId !== id,
          ),
        },
      }))
      setNotice('Character removed from the Story Bible.')
    },
    addWorldEntry: (category: WorldbuildingCategory = 'location') => {
      const id = uuid()
      const entry: WorldbuildingEntry = {
        id,
        name: 'New world entry',
        aliases: '',
        category,
        summary: '',
        details: '',
        rules: '',
        connections: '',
        notes: '',
        tags: [],
      }
      mutateOpen((book) => ({
        ...book,
        storyBible: {
          ...(book.storyBible || defaultStoryBible()),
          world: [...(book.storyBible?.world || []), entry],
        },
      }))
      return id
    },
    updateWorldEntry: (id: string, patch: Partial<WorldbuildingEntry>) =>
      mutateOpen((book) => ({
        ...book,
        storyBible: {
          ...(book.storyBible || defaultStoryBible()),
          world: (book.storyBible?.world || []).map((entry) =>
            entry.id === id ? { ...entry, ...patch } : entry
          ),
        },
      })),
    deleteWorldEntry: (id: string) => {
      mutateOpen((book) => ({
        ...book,
        storyBible: {
          ...(book.storyBible || defaultStoryBible()),
          world: (book.storyBible?.world || []).filter((entry) => entry.id !== id),
          relationships: (book.storyBible?.relationships || []).filter(
            (relationship) => relationship.sourceId !== id && relationship.targetId !== id,
          ),
        },
      }))
      setNotice('Worldbuilding entry removed from the Story Bible.')
    },
    addStoryRelationship: (sourceId: string, targetId: string, label: string) => {
      const id = uuid()
      const relationship: StoryRelationship = {
        id,
        sourceId,
        targetId,
        label: label.trim() || 'connected to',
        createdAt: new Date().toISOString(),
      }
      mutateOpen((book) => {
        const bible = book.storyBible || defaultStoryBible()
        const entityIds = new Set([
          ...bible.characters.map((character) => character.id),
          ...bible.world.map((entry) => entry.id),
        ])
        if (
          sourceId === targetId ||
          !entityIds.has(sourceId) ||
          !entityIds.has(targetId)
        ) return book
        return {
          ...book,
          storyBible: {
            ...bible,
            relationships: [...bible.relationships, relationship],
          },
        }
      })
      return id
}
