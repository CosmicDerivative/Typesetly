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
  addChapter: () => void
  removeChapter: (chapterId: string) => void
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
