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
  )
}
