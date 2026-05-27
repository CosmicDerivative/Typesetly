import { useState } from 'react'
import './Previewer.css'

export function Previewer() {
  const [page, setPage] = useState(1)

  return (
    <aside className="previewer">
      <header>
        <strong>Book preview</strong>
        <span>Page {page}</span>
      </header>
      <div className="preview-page">
        <p className="chapter-number">Chapter One</p>
        <h1>Untitled Chapter</h1>
        <p>Your formatted manuscript will appear here.</p>
      </div>
      <footer>
        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <button type="button" onClick={() => setPage((value) => value + 1)}>Next</button>
      </footer>
    </aside>
  )
}
