import { useState } from 'react'
import './FormattingPanel.css'

const themes = ['Classic', 'Modern', 'Literary']

export function FormattingPanel() {
  const [theme, setTheme] = useState(themes[0])
  const [fontSize, setFontSize] = useState(11)

  return (
    <aside className="formatting-panel">
      <h2>Formatting</h2>
      <label>
        Theme
        <select value={theme} onChange={(event) => setTheme(event.target.value)}>
          {themes.map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <label>
        Body size
        <input
          type="number"
          min="8"
          max="18"
          value={fontSize}
          onChange={(event) => setFontSize(Number(event.target.value))}
        />
      </label>
      <p>Previewing {theme} at {fontSize} pt.</p>
    </aside>
  )
}
