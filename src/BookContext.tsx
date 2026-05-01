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

export type WorkspaceMode = 'writing' | 'preview'

export type BookContextValue = {
  project: BookProject
  activeChapter: Chapter | undefined
  mode: WorkspaceMode
  saved: boolean
  setMode: (mode: WorkspaceMode) => void
  setActiveChapter: (chapterId: string) => void
  updateBookDetails: (details: Partial<BookDetails>) => void
  updateChapterTitle: (chapterId: string, title: string) => void
  updateChapterContent: (chapterId: string, content: string) => void
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
