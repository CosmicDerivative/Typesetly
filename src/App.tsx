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

  const workspaceTheme = resolveWorkspaceTheme(
    project.editorPrefs.workspaceTheme,
    project.editorPrefs.darkMode,
  )

  return (
    <div
      data-workspace-theme={workspaceTheme}
      className={[
        'app-shell',
        `workspace-${mode}`,
        `theme-${workspaceTheme}`,
        sidebarOpen && sidebarPinned ? 'has-pinned-left' : '',
        rightPanel !== 'none' &&
        rightPanel === pinnedRightPanel &&
        !(mode === 'publish' && rightPanel === 'preview')
          ? 'has-pinned-right'
          : '',
        isDarkWorkspaceTheme(workspaceTheme) ? 'dark' : '',
      ].filter(Boolean).join(' ')}
    >
      <Header />
      <div className="workspace">
        {sidebarOpen && !sidebarPinned && (
          <button
            type="button"
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {sidebarOpen && <LeftSidebar />}
        {mode === 'draft' && <EditorPane />}
        {mode === 'plan' && <StoryBiblePanel />}
        {mode === 'organize' && <Organizer />}
        {mode === 'design' && <div className="formatting-host"><FormattingPanel /></div>}
        {rightPanel !== 'none' &&
          rightPanel !== 'preview' &&
          rightPanel !== pinnedRightPanel && (
          <button
            type="button"
            className="panel-scrim"
            aria-label="Close tool drawer"
            onClick={() => setRightPanel(mode === 'publish' ? 'preview' : 'none')}
          />
        )}
        <Previewer />
        <FindReplacePanel />
        <GoalsPanel />
        <EditorSettingsPanel />
        <SmartQuotesPanel />
        <EditorialPanel />
        <RevisionsPanel />
        {mode !== 'plan' && <StoryBiblePanel />}
        <NotesPanel />
        {mode !== 'plan' && <UtilityBar />}
      </div>
      {(notice || saveStatus === 'error') && (
        <div className={saveStatus === 'error' ? 'app-toast error' : 'app-toast'} role="status">
          <span>{saveStatus === 'error' ? `Save failed: ${saveError}` : notice}</span>
          <button type="button" onClick={dismissNotice} aria-label="Dismiss notification">×</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <BookProvider>
      <Workspace />
    </BookProvider>
  )
}
