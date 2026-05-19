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
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={cardRef}
        className={`dialog-card${wide ? ' dialog-card-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {description && <p>{description}</p>}
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
