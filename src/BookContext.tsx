import { createContext, useContext } from 'react'
import type {
  AppMode,
  BookDetails,
  BookProject,
  BookTheme,
  CalloutPreset,
  Chapter,
  ChapterOptions,
  CharacterProfile,
  EditorialComment,
  EditorPrefs,
  PageType,
  PreviewDevice,
  SaveStatus,
  StickyNote,
  StoryRelationship,
  WritingGoals,
  WorldbuildingCategory,
  WorldbuildingEntry,
} from './types'

export type RightPanel =
  | 'none'
  | 'preview'
  | 'find'
  | 'goals'
  | 'settings'
  | 'quotes'
  | 'editorial'
  | 'revisions'
  | 'story'
  | 'notes'

export interface AppContextValue {
  books: BookProject[]
  loading: boolean
  openBookId: string | null
  project: BookProject | null
  themes: BookTheme[]
  activeTheme: BookTheme
  mode: AppMode
  previewDevice: PreviewDevice
  saved: boolean
  saveStatus: SaveStatus
  saveError: string
  notice: string
  timerRunning: boolean
  timerSeconds: number
  timerPhase: 'sprint' | 'break'
  sprintDuration: number
  breakDuration: number
  rightPanel: RightPanel
  sidebarOpen: boolean
  sidebarPinned: boolean
  pinnedRightPanel: RightPanel
  editingTheme: BookTheme | null
  frontMatter: Chapter[]
  bodyChapters: Chapter[]
  backMatter: Chapter[]
  activeChapter: Chapter | undefined
  setMode: (mode: AppMode) => void
  setPreviewDevice: (device: PreviewDevice) => void
  setRightPanel: (panel: RightPanel) => void
  setSidebarOpen: (open: boolean) => void
  setSidebarPinned: (pinned: boolean) => void
  setPinnedRightPanel: (panel: RightPanel) => void
  openBook: (id: string) => void
  goHome: () => void
  createBook: (title?: string) => void
  duplicateBook: (id: string) => void
  deleteBook: (id: string) => void
  importBookFromDocx: (file: File) => Promise<void>
  importChaptersFromDocx: (file: File) => Promise<void>
  connectScrivenerSync: (format?: 'rtf' | 'txt') => Promise<void>
  syncScrivener: () => Promise<void>
  disconnectScrivenerSync: () => void
  restoreSnapshot: (file: File) => Promise<void>
  replaceProject: (project: BookProject) => void
  updateDetails: (details: Partial<BookDetails>) => void
  updateBookSeries: (id: string, series: { name: string; number?: number; total?: number }) => void
  setActiveChapter: (id: string) => void
  updateChapterTitle: (id: string, title: string) => void
  updateChapterType: (id: string, type: PageType) => void
  updateChapterSubtitle: (id: string, subtitle: string) => void
  updateChapterImage: (id: string, imageDataUrl?: string, metadata?: { width: number; height: number; bytes: number }) => void
  updateChapterImageDetails: (id: string, details: Pick<Chapter, 'imageAlt' | 'imageCaption' | 'imageLayout'>) => void
  updateChapterContent: (id: string, content: string) => void
  splitChapter: (id: string, beforeHtml: string, afterHtml: string) => void
  updateChapterOptions: (id: string, options: Partial<ChapterOptions>) => void
  setEpubStartChapter: (id?: string) => void
  updateBodyChapterOptions: (options: Partial<ChapterOptions>) => void
  addChapter: () => void
  addChapterToPart: (partId: string) => void
  addPage: (type: PageType) => void
  markSaved: () => void
}

export const BookContext = createContext<BookContextValue | null>(null)

export function useBook() {
  const value = useContext(BookContext)
  if (!value) {
    throw new Error('useBook must be used within BookProvider')
  }
  return value
}

export function getActiveChapter(project: BookProject) {
  return project.chapters.find((chapter) => chapter.id === project.activeId)
}

export function selectChapter(project: BookProject, chapterId: string): BookProject {
  if (!project.chapters.some((chapter) => chapter.id === chapterId)) {
    return project
  }
  return { ...project, activeId: chapterId }
}

export function renameBook(project: BookProject, title: string): BookProject {
  return {
    ...project,
    details: { ...project.details, title },
    updatedAt: new Date().toISOString(),
  }
}
