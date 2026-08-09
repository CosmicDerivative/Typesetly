export type FrontMatterId =
  | 'title-page'
  | 'copyright'
  | 'dedication'
  | 'epigraph'
  | 'contents'
  | 'also-by'
  | 'foreword'
  | 'preface'
  | 'prologue'

export type BackMatterId =
  | 'epilogue'
  | 'afterword'
  | 'acknowledgements'
  | 'about-author'
  | 'also-by-back'
  | 'notes'
  | 'bibliography'

export type PageType = 'chapter' | 'part' | 'full-page-image' | 'custom-page' | FrontMatterId | BackMatterId
export type OutputTarget = 'all' | 'ebook' | 'print' | 'none'
export type ImageLayout = 'inline' | 'wide' | 'full-page' | 'two-page'

export type AppMode = 'draft' | 'plan' | 'organize' | 'design' | 'publish'
export type SaveStatus = 'saved' | 'saving' | 'error'
export type BeginOn = 'either' | 'left' | 'right'
export type EditorBlockType = 'scene-break' | 'page-break' | 'callout' | 'footnote'
export type PreviewDevice =
  | 'iPad'
  | 'iPhone'
  | 'Galaxy'
  | 'Paperwhite'
  | 'Oasis'
  | 'Kindle'
  | 'Fire'
  | 'Glowlight 3'
  | 'Forma'
  | 'Print'

export type NotePlacement = 'chapter-end' | 'book-end' | 'footnotes'

export interface ChapterOptions {
  hideChapterImage: boolean
  hideChapterHeading: boolean
  hidePageNumber: boolean
  hideHeaderFooter: boolean
  hideFirstSentenceFormatting: boolean
  hideInToc: boolean
  useSmallerChapterTitle: boolean
  invertTextColor: boolean
  numbered: boolean
  beginOn: BeginOn
  includeIn: OutputTarget
  includeSubheadingsInToc: boolean
}

export interface Chapter {
  id: string
  title: string
  subtitle: string
  content: string
  /**
   * Word count captured when the chapter was last saved. Lets closed books
   * report totals without keeping their chapter HTML in memory.
   */
  wordCount?: number
  type: PageType
  partId?: string
  /**
   * Private manuscript-map organization. Folders never alter export order or
   * create headings in the finished book.
   */
  folderId?: string
  sortOrder?: number
  imageDataUrl?: string
  imageAlt?: string
  imageCaption?: string
  imageLayout?: ImageLayout
  imageWidthPx?: number
  imageHeightPx?: number
  imageBytes?: number
  sceneTitles?: string[]
  options: ChapterOptions
}

export interface ManuscriptFolder {
  id: string
  name: string
  collapsed: boolean
  /** Optional nesting imported from or arranged like a Scrivener Binder. */
  parentId?: string
  /** Parts may own private organizational folders without changing export. */
  partId?: string
}

export interface ScrivenerSyncMapping {
  chapterId: string
  relativePath: string
  lastLocalHash: string
  lastExternalHash: string
}

export interface ScrivenerSyncState {
  version: 1
  folderPath: string
  folderName: string
  format: 'rtf' | 'txt'
  lastSyncedAt: string
  files: ScrivenerSyncMapping[]
}

export interface TrashedPageItem {
  id: string
  kind: 'page'
  deletedAt: string
  page: Chapter
  originalIndex: number
  childPageIds: string[]
  stickyNotes?: StickyNote[]
}

export interface TrashedSceneItem {
  id: string
  kind: 'scene'
  deletedAt: string
  chapterId: string
  chapterTitle: string
  sceneIndex: number
  sceneTitle: string
  sceneHtml: string
  stickyNotes?: StickyNote[]
}

export type TrashItem = TrashedPageItem | TrashedSceneItem

export interface EditorialComment {
  id: string
  chapterId: string
  quote: string
  body: string
  author: string
  createdAt: string
  resolved: boolean
}

export interface DocumentRevision {
  id: string
  name: string
  createdAt: string
  chapters: Array<Pick<Chapter, 'id' | 'title' | 'subtitle' | 'content'>>
}

/**
 * Lightweight listing of a named revision. Full chapter copies live in their
 * own IndexedDB store and load only when compared or restored.
 */
export type DocumentRevisionMeta = Pick<DocumentRevision, 'id' | 'name' | 'createdAt'>

export interface TrackedChange {
  id: string
  chapterId: string
  beforeHtml: string
  afterHtml: string
  author: string
  createdAt: string
  updatedAt: string
  status: 'pending' | 'accepted' | 'rejected'
}

import type { LitRpgBlockDraft, LitRpgBlockKind } from './editor/litrpg'

export interface CalloutPreset {
  id: string
  name: string
  variant: 'callout' | 'message'
  background: string
  border: string
  direction: 'incoming' | 'outgoing'
  messageTheme: 'ios' | 'android'
}

/** Reusable LitRPG layout/content shell saved at book level (not character-bound). */
export interface LitRpgUserTemplate {
  id: string
  name: string
  kind: LitRpgBlockKind
  draft: LitRpgBlockDraft
  createdAt: string
  updatedAt: string
}

/**
 * Current tip for a character (or named) status screen. Chapter inserts are
 * deep clones; updating the tip never rewrites past inserts.
 */
export interface LitRpgCharacterScreen {
  id: string
  characterId?: string
  name: string
  kind: LitRpgBlockKind
  draft: LitRpgBlockDraft
  revision: number
  createdAt: string
  updatedAt: string
}

export interface BookDetails {
  title: string
  author: string
  subtitle: string
  publisher: string
  year: string
  isbn: string
  language: string
  coverDataUrl?: string
  penName?: string
  universalBookLink?: string
  bookBrushProjectUrl?: string
  seriesName?: string
  seriesNumber?: number
  seriesTotal?: number
}

export interface CharacterProfile {
  id: string
  name: string
  role: string
  pronouns: string
  age: string
  aliases: string
  summary: string
  appearance: string
  personality: string
  motivation: string
  conflict: string
  arc: string
  relationships: string
  notes: string
  tags: string[]
}

export type WorldbuildingCategory =
  | 'location'
  | 'culture'
  | 'organization'
  | 'history'
  | 'magic'
  | 'technology'
  | 'creature'
  | 'object'
  | 'other'

export interface WorldbuildingEntry {
  id: string
  name: string
  aliases?: string
  category: WorldbuildingCategory
  summary: string
  details: string
  rules: string
  connections: string
  notes: string
  tags: string[]
}

export interface StoryRelationship {
  id: string
  sourceId: string
  targetId: string
  label: string
  createdAt: string
}

export interface StoryBible {
  characters: CharacterProfile[]
  world: WorldbuildingEntry[]
  relationships: StoryRelationship[]
}

export type StickyNoteColor = 'gold' | 'coral' | 'sage' | 'blue' | 'plum'
export type StickyNoteTarget = 'book' | 'chapter' | 'scene' | 'selection' | 'character' | 'world'

export interface StickyNote {
  id: string
  title: string
  body: string
  color: StickyNoteColor
  target: StickyNoteTarget
  chapterId?: string
  sceneIndex?: number
  characterId?: string
  worldEntryId?: string
  quote?: string
  createdAt: string
  updatedAt: string
}

export interface WritingGoals {
  bookWordTarget: number
  dueDate: string
  writingDays: number[]
  dailyHabitWords: number
  habitWritingDays: number[]
  habitStartedAt: string
  habitLog: Record<string, number>
  wordLog: Record<string, Record<string, number>>
  sprintLog: Array<{ date: string; seconds: number }>
}

export type WorkspaceTheme =
  | 'parchment'
  | 'paper'
  | 'fog'
  | 'sepia'
  | 'solarized-light'
  | 'mint'
  | 'rose'
  | 'lavender'
  | 'midnight'
  | 'charcoal'
  | 'solarized-dark'
  | 'forest'
  | 'ocean'
  | 'aubergine'
  | 'nord'
  | 'high-contrast'

export interface EditorPrefs {
  fontFamily: string
  fontSize: number
  lineHeight: number
  smartQuotes: boolean
  typewriterScrolling: boolean
  workspaceTheme: WorkspaceTheme
  /** Kept in saved projects so releases before workspace themes can still open them. */
  darkMode: boolean
  spellcheck: boolean
  externalProofreading: 'auto' | 'always' | 'off'
  /** Minutes between automatic recovery points. Zero disables them. */
  recoveryIntervalMinutes: number
  paragraphStyle: 'indent' | 'space'
  textAlign: 'left' | 'justify'
}

export interface ThemeChapterHeading {
  showNumber: boolean
  showTitle: boolean
  showSubtitle: boolean
  numberView: 'arabic' | 'roman' | 'words' | 'none'
  titleFont: string
  titleSize: number
  titleAlign: 'left' | 'center' | 'right'
  titleWeight: 'normal' | 'bold'
  subtitleFont: string
  subtitleSize: number
  numberFont: string
  numberSize: number
  imageEnabled: boolean
  imagePlacement: 'above' | 'below' | 'background'
  imageSize: number
  imageAlign: 'left' | 'center' | 'right'
  sharedImageDataUrl?: string
  useIndividualImages: boolean
  backgroundOpacity: number
  lightText: boolean
  decorations?: ThemeChapterDecoration[]
}

export interface ThemeChapterDecoration {
  id: string
  name: string
  imageDataUrl: string
  placement: 'above-heading' | 'header-overlay' | 'below-heading' | 'before-opening' | 'chapter-footer'
  align: 'left' | 'center' | 'right'
  width: number
  offsetX: number
  offsetY: number
  opacity: number
  rotation: number
}

export interface ThemeParagraph {
  dropCaps: boolean
  leadInSmallCaps: boolean
  firstSentenceMode: 'chapter' | 'chapter-and-scene'
  paragraphStyle: 'indent' | 'space'
  /** Gap after each paragraph in em units when paragraphStyle is "space". */
  paragraphSpacingEm: number
  bodyAlign: 'left' | 'justify'
}

export interface ThemeSubheading {
  h2Size: number
  h3Size: number
  h4Size: number
  h5Size: number
  h6Size: number
  font: string
  weight: 'normal' | 'bold'
  align: 'left' | 'center' | 'right'
}

export interface ThemeSceneBreak {
  style: 'ornament' | 'space' | 'none'
  ornament: string
  size: number
  customImageDataUrl?: string
}

export interface ThemeSpecialBlocks {
  verseIndentEm: number
  verseLineSpacing: number
  hangingIndentEm: number
  quoteIndentEm: number
  quoteBorderWidth: number
  quoteItalic: boolean
}

export interface ThemeNotes {
  epubPlacement: NotePlacement
  printPlacement: NotePlacement
  fontSize: number
}

export interface ThemePrint {
  trimWidthIn: number
  trimHeightIn: number
  marginInside: number
  marginOutside: number
  marginTop: number
  marginBottom: number
  justified: boolean
  hyphens: boolean
  keepSubheadings: boolean
  keepSceneBreaks: boolean
  layoutPriority: 'widows-orphans' | 'balanced' | 'best-of-both'
  largePrint: boolean
}

export interface ThemeTypography {
  bodyFont: string
  bodySize: number
  lineSpacing: number
  embeddedFontName?: string
  embeddedFontDataUrl?: string
}

export interface ThemeHeaderFooter {
  layout: 'none' | 'page-center' | 'title-author' | 'chapter-page' | 'author-title-page'
  font: string
  size: number
}

export interface BookTheme {
  id: string
  name: string
  preset: boolean
  favorite: boolean
  chapterHeading: ThemeChapterHeading
  paragraph: ThemeParagraph
  subheading: ThemeSubheading
  sceneBreak: ThemeSceneBreak
  specialBlocks: ThemeSpecialBlocks
  notes: ThemeNotes
  print: ThemePrint
  typography: ThemeTypography
  headerFooter: ThemeHeaderFooter
}

export interface BookProject {
  id: string
  details: BookDetails
  chapters: Chapter[]
  activeId: string
  themeId: string
  customThemes: BookTheme[]
  goals: WritingGoals
  editorPrefs: EditorPrefs
  updatedAt: string
  createdAt: string
  isBoxset?: boolean
  volumeBookIds?: string[]
  schemaVersion?: number
  masterPages?: Chapter[]
  comments?: EditorialComment[]
  revisions?: DocumentRevisionMeta[]
  trackChanges?: boolean
  trackedChanges?: TrackedChange[]
  calloutPresets?: CalloutPreset[]
  litrpgTemplates?: LitRpgUserTemplate[]
  litrpgCharacterScreens?: LitRpgCharacterScreen[]
  epubStartChapterId?: string
  trashItems?: TrashItem[]
  storyBible?: StoryBible
  stickyNotes?: StickyNote[]
  manuscriptFolders?: ManuscriptFolder[]
  scrivenerSync?: ScrivenerSyncState
}

export interface LibraryState {
  books: BookProject[]
  openBookId: string | null
  themes: BookTheme[]
}

/**
 * Snapshot files stay fully self-contained: chapter HTML, named revisions,
 * and images (as data URLs) are all inlined so a snapshot can be restored on
 * any device or older Typesetly release.
 */
export type SnapshotBook = Omit<BookProject, 'revisions'> & {
  revisions?: DocumentRevision[]
}

export interface SnapshotFile {
  version: 3
  books: SnapshotBook[]
  themes: BookTheme[]
  exportedAt: string
}

export interface ImportReport {
  book: BookProject
  warnings: string[]
  summary?: {
    chapters: number
    words: number
    images: number
    footnotes: number
    links: number
  }
}

export interface ExportResult {
  ok: boolean
  fileName?: string
  warnings?: string[]
}

export const defaultChapterOptions = (): ChapterOptions => ({
  hideChapterImage: false,
  hideChapterHeading: false,
  hidePageNumber: false,
  hideHeaderFooter: false,
  hideFirstSentenceFormatting: false,
  hideInToc: false,
  useSmallerChapterTitle: false,
  invertTextColor: false,
  numbered: true,
  beginOn: 'either',
  includeIn: 'all',
  includeSubheadingsInToc: false,
})

export const defaultGoals = (): WritingGoals => ({
  bookWordTarget: 50000,
  dueDate: '',
  writingDays: [1, 2, 3, 4, 5],
  dailyHabitWords: 500,
  habitWritingDays: [1, 2, 3, 4, 5],
  habitStartedAt: '',
  habitLog: {},
  wordLog: {},
  sprintLog: [],
})

export const defaultEditorPrefs = (): EditorPrefs => ({
  fontFamily: 'Libre Baskerville',
  fontSize: 16.5,
  lineHeight: 1.75,
  smartQuotes: true,
  typewriterScrolling: false,
  workspaceTheme: 'parchment',
  darkMode: false,
  spellcheck: true,
  // Allow browser grammar extensions (LanguageTool, etc.) on the active
  // chapter by default. Automatic mode pauses only on very long chapters.
  externalProofreading: 'auto',
  recoveryIntervalMinutes: 5,
  paragraphStyle: 'indent',
  textAlign: 'left',
})

export const defaultStoryBible = (): StoryBible => ({
  characters: [],
  world: [],
  relationships: [],
})
