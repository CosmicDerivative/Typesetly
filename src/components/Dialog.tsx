import { useEffect, useId, useRef, type ReactNode } from 'react'
import './Dialog.css'

interface DialogProps {
  title: string
  description?: string
  children?: ReactNode
  confirmLabel?: string
  danger?: boolean
  wide?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function Dialog({
  title,
  description,
  children,
  confirmLabel = 'Continue',
  danger,
  wide = false,
  onCancel,
  onConfirm,
}: DialogProps) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog-card" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {children}
        <footer>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className={danger ? 'danger' : ''} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
