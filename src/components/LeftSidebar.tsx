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

  return (
    <aside className="left-sidebar">
      <header>
        <strong>Book</strong>
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
