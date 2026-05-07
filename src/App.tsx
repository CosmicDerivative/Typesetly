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
import './App.css'

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
