import { FolderSync, RefreshCw, Unplug } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../BookContext'
import './BookDetailsModal.css'
import { processImageFile } from '../images/process'

export function BookDetailsModal({ onClose }: { onClose: () => void }) {
  const {
    project,
    activeTheme,
    updateDetails,
    downloadSnapshot,
    connectScrivenerSync,
    syncScrivener,
    disconnectScrivenerSync,
  } = useApp()
  const coverRef = useRef<HTMLInputElement>(null)
  const [syncFormat, setSyncFormat] = useState<'rtf' | 'txt'>(
    project?.scrivenerSync?.format || 'rtf',
  )
  const [syncBusy, setSyncBusy] = useState(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  if (!project) return null
  const d = project.details

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="book-details-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="book-details-title">Book details</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-grid">
          <label>
            Title
            <input
              value={d.title}
              onChange={(e) => updateDetails({ title: e.target.value })}
            />
          </label>
          <label>
            Subtitle
            <input
              value={d.subtitle}
              onChange={(e) => updateDetails({ subtitle: e.target.value })}
            />
          </label>
          <label>
            Author
            <input
              value={d.author}
              onChange={(e) => updateDetails({ author: e.target.value })}
            />
          </label>
          <label>
            Pen name
            <input
              value={d.penName || ''}
              onChange={(e) => updateDetails({ penName: e.target.value })}
            />
          </label>
          <label>
            Publisher
            <input
              value={d.publisher}
              onChange={(e) => updateDetails({ publisher: e.target.value })}
            />
          </label>
          <label>
            Year
            <input value={d.year} onChange={(e) => updateDetails({ year: e.target.value })} />
          </label>
          <label>
            ISBN
            <input value={d.isbn} onChange={(e) => updateDetails({ isbn: e.target.value })} />
          </label>
          <label>
            Language
            <input
              value={d.language}
              onChange={(e) => updateDetails({ language: e.target.value })}
            />
          </label>
          <label>
            Series name
            <input
              value={d.seriesName || ''}
              placeholder="Leave blank for a standalone"
              onChange={(e) => updateDetails({ seriesName: e.target.value })}
            />
          </label>
          <label>
            Book number
            <input
              type="number"
              min="0"
              step="0.5"
              value={d.seriesNumber ?? ''}
              placeholder="1"
              onChange={(e) => updateDetails({
                seriesNumber: e.target.value ? Number(e.target.value) : undefined,
              })}
            />
          </label>
          <label>
            Planned books in series
            <input
              type="number"
              min="1"
              value={d.seriesTotal ?? ''}
              placeholder="Optional"
              onChange={(e) => updateDetails({
                seriesTotal: e.target.value ? Number(e.target.value) : undefined,
              })}
            />
          </label>
          <label>
            Universal book link
            <input
              type="url"
              value={d.universalBookLink || ''}
              placeholder="https://books2read.com/…"
              onChange={(e) => updateDetails({ universalBookLink: e.target.value })}
            />
          </label>
          <label>
            Book Brush project
            <input
              type="url"
              value={d.bookBrushProjectUrl || ''}
              placeholder="https://bookbrush.com/…"
              onChange={(e) => updateDetails({ bookBrushProjectUrl: e.target.value })}
            />
          </label>
        </div>
        {(d.universalBookLink || d.bookBrushProjectUrl) && (
          <div className="integration-actions">
            {d.universalBookLink && <button type="button" onClick={() => window.open(d.universalBookLink, '_blank', 'noopener,noreferrer')}>Open universal link</button>}
            {d.bookBrushProjectUrl && <button type="button" onClick={() => window.open(d.bookBrushProjectUrl, '_blank', 'noopener,noreferrer')}>Open Book Brush</button>}
          </div>
        )}
        <div className="cover-row">
          <div
            className="cover-preview"
            style={d.coverDataUrl ? { backgroundImage: `url(${d.coverDataUrl})` } : undefined}
          />
          <div>
            <button type="button" onClick={() => coverRef.current?.click()}>
              Upload ebook cover
            </button>
            {d.coverDataUrl && (
              <button type="button" className="linkish" onClick={() => updateDetails({ coverDataUrl: undefined })}>
                Remove cover
              </button>
            )}
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const processed = await processImageFile(file, 3000)
                updateDetails({ coverDataUrl: processed.dataUrl })
              }}
            />
          </div>
        </div>
        <div className="details-export">
          <div className="scrivener-sync">
            <div className="scrivener-sync-heading">
              <span><FolderSync size={17} /></span>
              <div>
                <strong>Scrivener round-trip</strong>
                <p>Uses Scrivener’s External Folder Sync. Typesetly never writes inside the .scriv project.</p>
              </div>
            </div>
            {project.scrivenerSync ? (
              <>
                <div className="scrivener-sync-status">
                  <span>Connected</span>
                  <strong>{project.scrivenerSync.folderName}</strong>
                  <small>
                    {project.scrivenerSync.files.length} linked chapter(s) · Last synced{' '}
                    {new Date(project.scrivenerSync.lastSyncedAt).toLocaleString()}
                  </small>
                </div>
                <div className="scrivener-sync-actions">
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={async () => {
                      setSyncBusy(true)
                      try {
                        await syncScrivener()
                      } finally {
                        setSyncBusy(false)
                      }
                    }}
                  >
                    <RefreshCw size={14} /> {syncBusy ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={async () => {
                      setSyncBusy(true)
                      try {
                        await connectScrivenerSync(project.scrivenerSync?.format)
                      } finally {
                        setSyncBusy(false)
  )
}
