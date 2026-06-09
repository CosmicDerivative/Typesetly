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

  return (
    <nav className="utility-bar" aria-label="Writing tools">
      {tools.map((tool) => (
        <button
          key={tool}
          type="button"
          className={activeTool === tool ? 'active' : ''}
          onClick={() => setActiveTool((current) => current === tool ? null : tool)}
        >
          {tool}
        </button>
      ))}
    </nav>
  )
}
