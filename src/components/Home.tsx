import { Copy, FileArchive, FolderOpen, MoreVertical, Plus, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../BookContext'
import { TYPESETLY_LOGO_URL } from '../branding'
import { countBookWords } from '../data'
import './Home.css'
import { Dialog } from './Dialog'
import type { ImportReport } from '../types'

export function Home() {
  const {
    books,
    openBook,
    createBook,
    setMode,
    duplicateBook,
    deleteBook,
    replaceProject,
    updateBookSeries,
    createBoxset,
    downloadSnapshot,
    restoreSnapshot,
  } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const scrivenerFolderRef = useRef<HTMLInputElement>(null)
  const scrivenerArchiveRef = useRef<HTMLInputElement>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [boxsetMode, setBoxsetMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'modified' | 'alpha' | 'added' | 'series'>('modified')
  const [seriesFilter, setSeriesFilter] = useState('')
  const [seriesTarget, setSeriesTarget] = useState<{
    id: string
    name: string
    number: string
    total: string
  return (
    <main className="home">
      <section className="home-intro">
        <p className="eyebrow">Your writing desk</p>
        <h1>Turn a manuscript into a finished book.</h1>
        <p>Create a project to begin writing and formatting.</p>
        <button type="button">Create a book</button>
      </section>
      <section className="project-list" aria-label="Recent projects">
        <h2>Recent projects</h2>
        <p>No projects yet.</p>
      </section>
    </main>
  )
}
