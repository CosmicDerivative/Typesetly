import { useState } from 'react'
import type { Chapter } from '../types'

export function ChapterOptionsMenu({
  chapter,
  onClose,
}: {
  chapter: Chapter
  onClose: () => void
}) {
  const [hideHeading, setHideHeading] = useState(false)
  const [beginOn, setBeginOn] = useState('next')

  return (
    <aside className="chapter-options">
      <header>
        <strong>{chapter.title}</strong>
        <button type="button" onClick={onClose}>Close</button>
      </header>
      <label>
        <input
          type="checkbox"
          checked={hideHeading}
          onChange={(event) => setHideHeading(event.target.checked)}
        />
        Hide chapter heading
      </label>
      <label>
        Begin chapter on
        <select value={beginOn} onChange={(event) => setBeginOn(event.target.value)}>
          <option value="next">Next page</option>
          <option value="right">Right-hand page</option>
          <option value="left">Left-hand page</option>
        </select>
      </label>
    </aside>
  )
}
