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
  const titleId = useId()
  const cardRef = useRef<HTMLElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelCallbackRef = useRef(onCancel)

  useEffect(() => {
    cancelCallbackRef.current = onCancel
  }, [onCancel])

  useEffect(() => {
    const firstField = cardRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
    )
    // Focus only on mount. Refocusing after every controlled-input render
    // would make modal fields lose focus after the first character.
    ;(firstField || confirmRef.current)?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelCallbackRef.current()
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
