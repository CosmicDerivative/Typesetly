import { useApp } from '../BookContext'
import { REQUIRED_PAGE_TYPES } from '../manuscript/pageTypes'
import type { Chapter } from '../types'
import './ChapterOptionsMenu.css'
import { processImageFile } from '../images/process'
import { PageTypeSelect } from './PageTypeSelect'

export function ChapterOptionsMenu({
  chapter,
  onClose,
}: {
  chapter: Chapter
  onClose: () => void
}) {

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
