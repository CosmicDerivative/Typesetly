import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../BookContext'
import { countBookWords, localDateKey, todayKey } from '../data'
import { isDarkWorkspaceTheme, WORKSPACE_THEMES } from '../themes/workspaceThemes'
import { repairLegacyRtfQuoteDamage, smartenPunctuation } from '../editor/smartQuotes'
import './SidePanels.css'
import { DrawerControls } from './DrawerControls'

const DAY_OPTIONS = [
  { label: 'S', value: 0 },
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
]

function transformTextNodes(html: string, transform: (text: string) => string) {
  const documentValue = new DOMParser().parseFromString(html, 'text/html')
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = transform(node.textContent || '')
      return
    }
    for (const child of Array.from(node.childNodes)) visit(child)
  }
  visit(documentValue.body)
  return documentValue.body.innerHTML
}

export function FindReplacePanel() {
  const { project, rightPanel, updateChapterContent } = useApp()
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [message, setMessage] = useState('')

  if (rightPanel !== 'find' || !project) return null

  const runReplace = (all: boolean) => {
    if (!find) return
    let count = 0
    for (const ch of project.chapters) {
      let replacedHere = 0
      const next = transformTextNodes(ch.content, (text) => {
        if (!all && count + replacedHere > 0) return text
        if (all) {
          replacedHere += text.split(find).length - 1
          return text.split(find).join(replace)
        }
        const changed = text.replace(find, replace)
        if (changed !== text) replacedHere += 1
        return changed
      })
      if (next !== ch.content) updateChapterContent(ch.id, next)
      count += replacedHere
      if (!all && count) break
    }
    setMessage(all ? `Replaced ${count} occurrence(s).` : count ? 'Replaced 1 occurrence.' : 'No matches.')
  }

  return (
    <aside className="side-panel">
      <div className="sp-head">
        <strong>Find & Replace</strong>
        <DrawerControls panel="find" />
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
