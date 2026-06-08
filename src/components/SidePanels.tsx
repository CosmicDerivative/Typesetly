import { useState } from 'react'

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="side-panel">
      <h2>{title}</h2>
      {children}
    </aside>
  )
}

export function FindReplacePanel() {
  const [query, setQuery] = useState('')
  return (
    <Panel title="Find and replace">
      <input
        aria-label="Find"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="button" disabled={!query}>Find next</button>
    </Panel>
  )
}

export function GoalsPanel() {
  const [target, setTarget] = useState(500)
  return (
    <Panel title="Writing goal">
      <input
        type="number"
        min="1"
        value={target}
        onChange={(event) => setTarget(Number(event.target.value))}
      />
      <p>Daily target: {target} words</p>
    </Panel>
  )
}

export function EditorSettingsPanel() {
  return (
    <Panel title="Editor settings">
      <label><input type="checkbox" /> Typewriter scrolling</label>
      <label><input type="checkbox" /> Highlight current line</label>
    </Panel>
  )
}

export function SmartQuotesPanel() {
  return (
    <Panel title="Smart punctuation">
      <button type="button">Convert straight quotes</button>
      <button type="button">Normalize dashes</button>
    </Panel>
  )
}
