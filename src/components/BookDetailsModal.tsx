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

  return (
    <Dialog
      title="Book details"
      description="Add the metadata readers will see."
      confirmLabel="Save details"
      onCancel={onClose}
      onConfirm={save}
    >
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Author
        <input value={author} onChange={(event) => setAuthor(event.target.value)} />
      </label>
      <label>
        Language
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
        </select>
      </label>
    </Dialog>
  )
}
