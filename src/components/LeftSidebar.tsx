import { useState } from 'react'
import './LeftSidebar.css'

type DraftChapter = {
  id: number
  title: string
}

export function LeftSidebar() {
  const [chapters, setChapters] = useState<DraftChapter[]>([
    { id: 1, title: 'Chapter One' },
  ])

  return (
    <aside className="left-sidebar">
      <header>
        <strong>Book</strong>
        <button
          type="button"
          onClick={() => setChapters((items) => [
            ...items,
            { id: Date.now(), title: `Chapter ${items.length + 1}` },
          ])}
        >
          Add
        </button>
      </header>
      <ol>
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <button type="button">{chapter.title}</button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
