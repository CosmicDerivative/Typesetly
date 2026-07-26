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
  /**
   * True once the open book's chapter HTML has loaded from IndexedDB. Until
   * then, chapter `content` fields are empty placeholders and the editor
   * must not write.
   */
  projectHydrated: boolean
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
  addPart: () => void
  saveActiveAsMasterPage: () => void
  savePageAsMaster: (id: string) => void
  addMasterPage: (templateId: string) => void
  duplicateChapter: (id: string) => void
  deleteChapter: (id: string) => void
  moveChapterBy: (id: string, direction: -1 | 1) => void
  moveChapterRelative: (sourceId: string, targetId: string, placement: 'before' | 'after' | 'inside') => void
  reorderChapters: (fromIndex: number, toIndex: number) => void
  moveChapterToPart: (chapterId: string, partId?: string) => void
  addManuscriptFolder: (name: string) => string
  renameManuscriptFolder: (id: string, name: string) => void
  deleteManuscriptFolder: (id: string) => void
  toggleManuscriptFolder: (id: string) => void
  addChapterToFolder: (folderId: string) => void
  moveChapterToFolder: (chapterId: string, folderId?: string) => void
  addScene: (chapterId: string, afterIndex: number) => void
  duplicateScene: (chapterId: string, sceneIndex: number) => void
  moveScene: (chapterId: string, sceneIndex: number, direction: -1 | 1) => void
  moveSceneToChapter: (
    sourceChapterId: string,
    sourceSceneIndex: number,
    targetChapterId: string,
    targetSceneIndex: number,
    placement: 'before' | 'after',
  ) => void
  deleteScene: (chapterId: string, sceneIndex: number) => void
  updateSceneTitle: (chapterId: string, sceneIndex: number, title: string) => void
  restoreTrashItem: (id: string) => void
  permanentlyDeleteTrashItem: (id: string) => void
  emptyTrash: () => void
  addCharacter: () => string
  updateCharacter: (id: string, patch: Partial<CharacterProfile>) => void
  deleteCharacter: (id: string) => void
  addWorldEntry: (category?: WorldbuildingCategory) => string
  updateWorldEntry: (id: string, patch: Partial<WorldbuildingEntry>) => void
  deleteWorldEntry: (id: string) => void
  addStoryRelationship: (sourceId: string, targetId: string, label: string) => string
  updateStoryRelationship: (id: string, patch: Partial<StoryRelationship>) => void
  deleteStoryRelationship: (id: string) => void
  addStickyNote: (
    note?: Partial<Omit<StickyNote, 'id' | 'createdAt' | 'updatedAt'>>,
  ) => string
  updateStickyNote: (id: string, patch: Partial<StickyNote>) => void
  deleteStickyNote: (id: string) => void
  applyTheme: (themeId: string) => void
  startThemeEdit: (theme?: BookTheme) => void
  updateEditingTheme: (patch: Partial<BookTheme>) => void
  saveEditingTheme: (name?: string) => void
  cancelThemeEdit: () => void
  toggleThemeFavorite: (themeId: string) => void
  deleteCustomTheme: (themeId: string) => void
  updateGoals: (goals: Partial<WritingGoals>) => void
  logWordsToday: (words: number) => void
  updateEditorPrefs: (prefs: Partial<EditorPrefs>) => void
  addComment: (comment: Omit<EditorialComment, 'id' | 'createdAt' | 'resolved'>) => void
  updateComment: (id: string, patch: Partial<EditorialComment>) => void
  deleteComment: (id: string) => void
  setTrackChanges: (enabled: boolean) => void
  resolveTrackedChange: (id: string, resolution: 'accepted' | 'rejected') => void
  saveCalloutPreset: (preset: Omit<CalloutPreset, 'id'>) => void
  deleteCalloutPreset: (id: string) => void
  createNamedRevision: (name: string) => void
  restoreNamedRevision: (id: string) => void
  toggleTimer: () => void
  resetTimer: () => void
  setSprintDuration: (seconds: number) => void
  setBreakDuration: (seconds: number) => void
  markSaved: () => void
  downloadSnapshot: () => void
  createBoxset: (bookIds: string[], title: string) => void
  dismissNotice: () => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

/** @deprecated use useApp */
export const useBook = useApp
