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
