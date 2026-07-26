import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
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

const PINNED_PANEL_SIZE_KEY = 'typesetly-pinned-panel-sizes-v1'
const DEFAULT_LEFT_PANEL_WIDTH = 292
const DEFAULT_RIGHT_PANEL_WIDTH = 360

function clampPanelWidth(side: 'left' | 'right', value: number) {
  const minimum = side === 'left' ? 220 : 280
  const maximum = Math.min(side === 'left' ? 520 : 620, Math.max(minimum, window.innerWidth * .46))
  return Math.round(Math.min(maximum, Math.max(minimum, value)))
}

function readPinnedPanelSizes() {
  try {
    const saved = JSON.parse(localStorage.getItem(PINNED_PANEL_SIZE_KEY) || '{}') as {
      left?: unknown
      right?: unknown
    }
    return {
      left: clampPanelWidth('left', typeof saved.left === 'number' ? saved.left : DEFAULT_LEFT_PANEL_WIDTH),
      right: clampPanelWidth('right', typeof saved.right === 'number' ? saved.right : DEFAULT_RIGHT_PANEL_WIDTH),
    }
  } catch {
    return { left: DEFAULT_LEFT_PANEL_WIDTH, right: DEFAULT_RIGHT_PANEL_WIDTH }
  }
}

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
    setSidebarPinned,
    pinnedRightPanel,
    setPinnedRightPanel,
  } = useApp()
  const [panelSizes, setPanelSizes] = useState(readPinnedPanelSizes)

  useEffect(() => {
    localStorage.setItem(PINNED_PANEL_SIZE_KEY, JSON.stringify(panelSizes))
  }, [panelSizes])

  useEffect(() => {
    const compactWorkspace = window.matchMedia('(max-width: 980px)')
    const unpinForCompactWorkspace = () => {
      if (!compactWorkspace.matches) return
      if (pinnedRightPanel !== 'none') {
        setPinnedRightPanel('none')
        if (sidebarPinned) setSidebarOpen(false)
      }
      if (sidebarPinned) setSidebarPinned(false)
    }

    unpinForCompactWorkspace()
    compactWorkspace.addEventListener('change', unpinForCompactWorkspace)
    return () => compactWorkspace.removeEventListener('change', unpinForCompactWorkspace)
  }, [
    pinnedRightPanel,
    setPinnedRightPanel,
    setSidebarOpen,
    setSidebarPinned,
    sidebarPinned,
  ])

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
  const hasPinnedRight =
    rightPanel !== 'none'
    && rightPanel === pinnedRightPanel
    && !(mode === 'publish' && rightPanel === 'preview')

  const beginPanelResize = (
    side: 'left' | 'right',
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const startX = event.clientX
    const startWidth = panelSizes[side]
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)
    document.documentElement.classList.add('resizing-pinned-panel')

    const resize = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const width = clampPanelWidth(side, startWidth + (side === 'left' ? delta : -delta))
      setPanelSizes((current) => ({ ...current, [side]: width }))
    }
    const finish = () => {
      document.documentElement.classList.remove('resizing-pinned-panel')
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const resizePanelByKeyboard = (side: 'left' | 'right', key: string) => {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return
    const direction = key === 'ArrowRight' ? 1 : -1
    const delta = side === 'left' ? direction * 16 : direction * -16
    setPanelSizes((current) => ({
      ...current,
      [side]: clampPanelWidth(side, current[side] + delta),
    }))
  }

  return (
    <div
      data-workspace-theme={workspaceTheme}
      style={{
        '--pinned-left-width': `${panelSizes.left}px`,
        '--pinned-right-width': `${panelSizes.right}px`,
      } as CSSProperties}
      className={[
        'app-shell',
        `workspace-${mode}`,
        `theme-${workspaceTheme}`,
        sidebarOpen && sidebarPinned ? 'has-pinned-left' : '',
        hasPinnedRight ? 'has-pinned-right' : '',
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
        {sidebarOpen && sidebarPinned && (
          <div
            className="pinned-panel-resizer left"
            role="separator"
            tabIndex={0}
            aria-label="Resize manuscript map"
            aria-orientation="vertical"
            aria-valuemin={220}
            aria-valuemax={520}
            aria-valuenow={panelSizes.left}
            title="Drag to resize; double-click to reset"
            onPointerDown={(event) => beginPanelResize('left', event)}
            onKeyDown={(event) => resizePanelByKeyboard('left', event.key)}
            onDoubleClick={() => setPanelSizes((current) => ({ ...current, left: DEFAULT_LEFT_PANEL_WIDTH }))}
          />
        )}
        {mode === 'draft' && <EditorPane />}
        {mode === 'plan' && <StoryBiblePanel />}
        {mode === 'organize' && <Organizer />}
        {mode === 'design' && <div className="formatting-host"><FormattingPanel /></div>}
        {hasPinnedRight && (
          <div
            className="pinned-panel-resizer right"
            role="separator"
            tabIndex={0}
            aria-label="Resize pinned tool panel"
            aria-orientation="vertical"
            aria-valuemin={280}
            aria-valuemax={620}
            aria-valuenow={panelSizes.right}
            title="Drag to resize; double-click to reset"
            onPointerDown={(event) => beginPanelResize('right', event)}
            onKeyDown={(event) => resizePanelByKeyboard('right', event.key)}
            onDoubleClick={() => setPanelSizes((current) => ({ ...current, right: DEFAULT_RIGHT_PANEL_WIDTH }))}
          />
        )}
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
