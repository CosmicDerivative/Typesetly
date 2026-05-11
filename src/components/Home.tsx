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
  }, [books, query, seriesFilter, sort])

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-brand">
          <img src={TYPESETLY_LOGO_URL} alt="" />
          <div>
            <h1>Typesetly</h1>
            <p>Your private workshop for finished books</p>
          </div>
        </div>
        <div className="home-actions">
          <button type="button" className="ghost" onClick={() => restoreRef.current?.click()}>
            Restore snapshot
          </button>
          <button type="button" className="ghost" onClick={downloadSnapshot}>
            Backup snapshot
          </button>
          <input
            ref={restoreRef}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) await restoreSnapshot(file)
              event.target.value = ''
            }}
          />
        </div>
      </header>

      <section className="home-cta">
        <button type="button" className="cta-card" onClick={() => createBook()}>
          <Plus size={22} />
          <span>New manuscript</span>
        </button>
        <button type="button" className="cta-card" onClick={() => fileRef.current?.click()}>
          <Upload size={22} />
          <span>Bring in a Word file</span>
        </button>
        <button
          type="button"
          className="cta-card"
          onClick={() => {
            setScrivenerImportError('')
            setScrivenerPickerOpen(true)
          }}
        >
          <FolderOpen size={22} />
          <span>Import a Scrivener project</span>
        </button>
        <button
          type="button"
          className={boxsetMode ? 'cta-card active' : 'cta-card'}
          onClick={() => {
            setBoxsetMode((v) => !v)
            setSelected([])
          }}
        >
          <Copy size={22} />
          <span>Build a collection</span>
        </button>
        <input
          ref={scrivenerFolderRef}
          type="file"
          multiple
          hidden
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={async (event) => {
            const files = [...(event.target.files || [])]
            if (files.length) {
              setImporting(true)
              try {
                const {
                  importScrivenerSources,
                  sourceFilesFromSelection,
                } = await import('../integrations/scrivener')
                const report = importScrivenerSources(await sourceFilesFromSelection(files))
                setImportKind('scrivener')
                setImportReport(report)
                setIncludedChapters(report.book.chapters.map((chapter) => chapter.id))
                setScrivenerPickerOpen(false)
              } catch (error) {
                setScrivenerImportError(
                  error instanceof Error ? error.message : 'The Scrivener project could not be imported.',
                )
              } finally {
                setImporting(false)
              }
            }
            event.target.value = ''
          }}
        />
        <input
          ref={scrivenerArchiveRef}
          type="file"
          accept=".zip,.scrivzip,application/zip"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (file) {
              setImporting(true)
              try {
                const {
                  importScrivenerSources,
                  sourceFilesFromArchive,
                } = await import('../integrations/scrivener')
                const report = importScrivenerSources(await sourceFilesFromArchive(file))
                setImportKind('scrivener')
                setImportReport(report)
                setIncludedChapters(report.book.chapters.map((chapter) => chapter.id))
                setScrivenerPickerOpen(false)
              } catch (error) {
                setScrivenerImportError(
                  error instanceof Error ? error.message : 'The Scrivener backup could not be imported.',
                )
              } finally {
                setImporting(false)
              }
            }
            event.target.value = ''
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) {
              setImporting(true)
              try {
                const { importDocxToBook } = await import('../import/docx')
                const report = await importDocxToBook(file)
                setImportKind('word')
                setImportReport(report)
                setIncludedChapters(report.book.chapters.map((chapter) => chapter.id))
              } finally {
                setImporting(false)
              }
            }
            e.target.value = ''
          }}
        />
        {importing && <p className="import-progress" role="status">Reading manuscript and detecting chapters…</p>}
      </section>

      {scrivenerPickerOpen && (
        <Dialog
          title="Import from Scrivener"
          description="Typesetly reads a copy of the project. It never changes files inside the original .scriv project."
          confirmLabel="Cancel"
          onCancel={() => setScrivenerPickerOpen(false)}
          onConfirm={() => setScrivenerPickerOpen(false)}
        >
          <div className="scrivener-import-choices">
            <button type="button" onClick={() => scrivenerFolderRef.current?.click()}>
              <FolderOpen size={20} />
              <span>
                <strong>Select .scriv project folder</strong>
                <small>Best for an uncompressed project on this computer.</small>
              </span>
            </button>
            <button type="button" onClick={() => scrivenerArchiveRef.current?.click()}>
              <FileArchive size={20} />
              <span>
                <strong>Select zipped project backup</strong>
                <small>Imports .zip and .scrivzip backups without extracting them.</small>
              </span>
            </button>
          </div>
          <p className="scrivener-import-note">
            Draft folders become chapters or parts, and their text documents become editable scenes.
            Research, snapshots, comments, and Compile settings stay in Scrivener.
          </p>
          {scrivenerImportError && <p className="scrivener-import-error" role="alert">{scrivenerImportError}</p>}
        </Dialog>
      )}

      {boxsetMode && (
        <div className="boxset-bar">
          <span>Select books in order, then create.</span>
          <button
            type="button"
            disabled={selected.length < 2}
            onClick={() => {
              setBoxsetTitle('Box Set')
              setNamingBoxset(true)
            }}
          >
            Create boxset ({selected.length})
          </button>
        </div>
      )}
  )
}
