import {
  Crosshair,
  BookOpen,
  History,
  MessageSquareText,
  PanelLeft,
  Quote,
  Search,
  SquareStack,
  StickyNote,
  Target,
} from 'lucide-react'
import { useApp } from '../BookContext'
import './UtilityBar.css'

export function UtilityBar() {
  const {
    rightPanel,
    setRightPanel,
    mode,
    setMode,
    sidebarOpen,
    setSidebarOpen,
    sidebarPinned,
    pinnedRightPanel,
    setPinnedRightPanel,
  } = useApp()

  const toggle = (panel: typeof rightPanel) => {
    if (!sidebarPinned) setSidebarOpen(false)
    if (pinnedRightPanel !== 'none') {
      setPinnedRightPanel(panel)
      setRightPanel(panel)
      return
    }
    setRightPanel(rightPanel === panel ? (mode === 'publish' ? 'preview' : 'none') : panel)
  }

  return (
    <aside className="utility-bar" aria-label="Writing tools">
      <div className="utility-bar-track">
        <button
        type="button"
        className={sidebarOpen ? 'util active' : 'util'}
        title="Open manuscript map"
        onClick={() => {
          if (pinnedRightPanel === 'none') setRightPanel('none')
          setSidebarOpen(sidebarPinned ? true : !sidebarOpen)
        }}
      >
        <PanelLeft size={16} strokeWidth={2} />
        <span>Outline</span>
        </button>
        <button
        type="button"
        className={rightPanel === 'editorial' ? 'util active' : 'util'}
        title="Comments and tracked changes"
        onClick={() => toggle('editorial')}
      >
        <MessageSquareText size={16} />
        <span>Review</span>
        </button>
        <button
        type="button"
        className={rightPanel === 'revisions' ? 'util active' : 'util'}
        title="Version history"
        onClick={() => toggle('revisions')}
      >
        <History size={16} />
        <span>History</span>
        </button>
        <button
        type="button"
        className={rightPanel === 'find' ? 'util active' : 'util'}
        title="Find and replace"
        onClick={() => toggle('find')}
      >
        <Search size={16} />
        <span>Find</span>
        </button>
        <button
        type="button"
        className={rightPanel === 'goals' ? 'util active' : 'util'}
        title="Writing goals"
        onClick={() => toggle('goals')}
      >
        <Target size={16} />
        <span>Goals</span>
        </button>
  )
}
