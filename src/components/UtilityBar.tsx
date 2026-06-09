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
          {tool}
        </button>
      ))}
    </nav>
  )
}
