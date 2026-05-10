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
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [boxsetTitle, setBoxsetTitle] = useState('Box Set')
  const [namingBoxset, setNamingBoxset] = useState(false)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const [importKind, setImportKind] = useState<'word' | 'scrivener'>('word')
  const [scrivenerPickerOpen, setScrivenerPickerOpen] = useState(false)
  const [scrivenerImportError, setScrivenerImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [includedChapters, setIncludedChapters] = useState<string[]>([])
  const [starterTitle, setStarterTitle] = useState('')

  useEffect(() => {
    const closeBookMenu = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest('.book-menu, .book-dropdown')) setMenuId(null)
    }
    document.addEventListener('pointerdown', closeBookMenu)
    return () => document.removeEventListener('pointerdown', closeBookMenu)
  }, [])

  const availableSeries = useMemo(() => {
    const counts = new Map<string, [string, number]>()
    for (const book of books) {
      const name = book.details.seriesName?.trim()
      if (name) {
        const key = name.toLocaleLowerCase()
        const existing = counts.get(key)
        counts.set(key, [existing?.[0] || name, (existing?.[1] || 0) + 1])
      }
    }
    return [...counts.values()].sort(([left], [right]) => left.localeCompare(right))
  }, [books])

  useEffect(() => {
    if (seriesFilter && !availableSeries.some(([name]) => name === seriesFilter)) {
      setSeriesFilter('')
    }
  }, [availableSeries, seriesFilter])

  const filtered = useMemo(() => {
    let list = [...books]
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (b) =>
          b.details.title.toLowerCase().includes(q) ||
          b.details.author.toLowerCase().includes(q) ||
          b.details.seriesName?.toLowerCase().includes(q),
      )
    }
    if (seriesFilter) {
      list = list.filter((book) =>
        book.details.seriesName?.localeCompare(seriesFilter, undefined, { sensitivity: 'base' }) === 0
      )
    }
    list.sort((a, b) => {
      if (sort === 'alpha') return a.details.title.localeCompare(b.details.title)
      if (sort === 'added') return b.createdAt.localeCompare(a.createdAt)
      if (sort === 'series') {
        const leftSeries = a.details.seriesName || '\uffff'
        const rightSeries = b.details.seriesName || '\uffff'
        return leftSeries.localeCompare(rightSeries) ||
          (a.details.seriesNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.details.seriesNumber ?? Number.MAX_SAFE_INTEGER) ||
          a.details.title.localeCompare(b.details.title)
      }
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return list
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
