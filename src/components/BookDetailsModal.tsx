import { useState } from 'react'
import { Dialog } from './Dialog'

export function BookDetailsModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [language, setLanguage] = useState('en')

  const save = () => {
    if (!title.trim()) return
    onClose()
  }

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
