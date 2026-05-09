import { useState } from 'react'
import './Editor.css'

export function EditorPane() {
  const [text, setText] = useState('')

  return (
    <main className="editor-pane">
      <header className="editor-toolbar">
        <button type="button"><strong>B</strong></button>
        <button type="button"><em>I</em></button>
        <span aria-live="polite">{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
      </header>
      <textarea
        aria-label="Manuscript"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Begin writing..."
      />
    </main>
  )
}
