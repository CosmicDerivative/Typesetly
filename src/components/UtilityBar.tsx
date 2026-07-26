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
import { useApp, type RightPanel } from '../BookContext'
import './UtilityBar.css'

export function UtilityBar() {
  const {
    rightPanel,
    setRightPanel,
    mode,
    sidebarOpen,
    setSidebarOpen,
  } = useApp()

  const closedPanel = (): RightPanel => (mode === 'publish' ? 'preview' : 'none')

  const toggle = (panel: Exclude<RightPanel, 'none'>) => {
    setRightPanel(rightPanel === panel ? closedPanel() : panel)
  }

  return (
    <aside className="utility-bar" aria-label="Writing tools">
      <div className="utility-bar-track">
        <button
          type="button"
          className={sidebarOpen ? 'util active' : 'util'}
          title={sidebarOpen ? 'Close manuscript map' : 'Open manuscript map'}
          onClick={() => setSidebarOpen(!sidebarOpen)}
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
        <button
          type="button"
          className={rightPanel === 'story' ? 'util active' : 'util'}
          title="Story Studio reference"
          onClick={() => toggle('story')}
        >
          <BookOpen size={16} />
          <span>Plan</span>
        </button>
        <button
          type="button"
          className={rightPanel === 'notes' ? 'util active' : 'util'}
          title="Contextual sticky notes"
          onClick={() => toggle('notes')}
        >
          <StickyNote size={16} />
          <span>Notes</span>
        </button>
        <button
          type="button"
          className={rightPanel === 'settings' ? 'util active' : 'util'}
          title="Editor settings"
          onClick={() => toggle('settings')}
        >
          <Crosshair size={16} />
          <span>Settings</span>
        </button>
        <button
          type="button"
          className={rightPanel === 'quotes' ? 'util active' : 'util'}
          title="Smart punctuation"
          onClick={() => toggle('quotes')}
        >
          <Quote size={16} />
          <span>Quotes</span>
        </button>
        <div className="util-spacer" aria-hidden="true" />
        <button
          type="button"
          className={rightPanel === 'preview' ? 'util active' : 'util'}
          title="Open reader proof"
          onClick={() => {
            if (mode === 'publish') {
              setRightPanel('preview')
              return
            }
            toggle('preview')
          }}
        >
          <SquareStack size={16} />
          <span>Proof</span>
        </button>
      </div>
    </aside>
  )
}
