import { BookProvider } from './BookProvider'
import { useApp } from './BookContext'
import { TYPESETLY_LOGO_URL } from './branding'
import { EditorPane } from './components/Editor'
import { EditorialPanel, RevisionsPanel } from './components/EditorialPanels'
import { FormattingPanel } from './components/FormattingPanel'
import { Header } from './components/Header'
import { Home } from './components/Home'
import { LeftSidebar } from './components/LeftSidebar'
import { Organizer } from './components/Organizer'
import { Previewer } from './components/Previewer'
import {
  EditorSettingsPanel,
  FindReplacePanel,
  GoalsPanel,
  SmartQuotesPanel,
} from './components/SidePanels'
import { UtilityBar } from './components/UtilityBar'
import { StoryBiblePanel } from './components/StoryBiblePanel'
import { NotesPanel } from './components/NotesPanel'
import { isDarkWorkspaceTheme, resolveWorkspaceTheme } from './themes/workspaceThemes'
import './App.css'
import './workspace-themes.css'

function Workspace() {
  const {
    project,
    mode,
    loading,
    notice,
    dismissNotice,
    saveStatus,
    saveError,
    sidebarOpen,
    setSidebarOpen,
    rightPanel,
    setRightPanel,
    sidebarPinned,
    pinnedRightPanel,
  } = useApp()

  if (loading) {
    return (
      <div className="app-loading" role="status">
        <div className="loading-mark"><img src={TYPESETLY_LOGO_URL} alt="" /></div>
        <p>Opening your library…</p>
      </div>
    )
  }
  if (!project) return <Home />
export default function App() {
  return (
    <main className="app">
      <header className="app-header">
        <img src="/typesetly-logo.png" alt="Typesetly" />
      </header>
      <section className="app-welcome">
        <p>Your book workspace is being prepared.</p>
      </section>
    </main>
  )
}
