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

export function BookProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<BookProject>(() => createEmptyBook())
  const [mode, setMode] = useState<WorkspaceMode>('writing')
  const [saved, setSaved] = useState(true)

  const changeProject = (update: (book: BookProject) => BookProject) => {
    setProject((book) => ({
      ...update(book),
      updatedAt: new Date().toISOString(),
    }))
    setSaved(false)
  }

  const value = useMemo(() => ({
    project,
    activeChapter: getActiveChapter(project),
    mode,
    saved,
    setMode,
    setActiveChapter: (chapterId: string) => {
      changeProject((book) => selectChapter(book, chapterId))
    },
    updateBookDetails: (details: Partial<BookDetails>) => {
      changeProject((book) => ({
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
