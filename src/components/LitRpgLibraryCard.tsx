import type { CSSProperties } from 'react'
import { colorWithOpacity, type LitRpgBlockDraft } from '../editor/litrpg'
import { litRpgElementKey } from '../editor/litrpg'
import './LitRpgLibraryCard.css'

interface LitRpgLibraryCardProps {
  title: string
  subtitle?: string
  draft: LitRpgBlockDraft
  active?: boolean
  meta?: string
  onUse: () => void
  onUpdate?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}

export function LitRpgLibraryCard({
  title,
  subtitle,
  draft,
  active,
  meta,
  onUse,
  onUpdate,
  onDuplicate,
  onDelete,
}: LitRpgLibraryCardProps) {
  const previewStyle = {
    '--litrpg-accent': draft.accent,
    '--litrpg-bg': draft.background,
    '--litrpg-bg-alpha': colorWithOpacity(draft.background, draft.backgroundOpacity),
    '--litrpg-text': draft.textColor,
    '--litrpg-border': draft.border,
    '--litrpg-radius': `${Math.min(12, draft.borderRadius)}px`,
    '--litrpg-border-width': `${Math.min(2, draft.borderWidth)}px`,
    '--litrpg-cell-padding': '4px',
  } as CSSProperties

  return (
    <article className={`litrpg-library-card${active ? ' active' : ''}`}>
      <button type="button" className="litrpg-library-card-main" onClick={onUse} title="Use in Design">
        <div
          className={`litrpg-library-preview appearance-${draft.appearance} density-compact`}
          data-translucent={draft.backgroundOpacity < 100 ? 'true' : 'false'}
          style={previewStyle}
        >
          {draft.layoutMode === 'freeform' ? (
            <div className="litrpg-library-preview-freeform" style={{ height: 72 }}>
              {draft.title && (
                <span
                  className="is-title"
                  style={{
                    left: `${draft.elementLayouts[litRpgElementKey.title]?.x ?? 8}%`,
                    top: `${Math.min(48, draft.elementLayouts[litRpgElementKey.title]?.y ?? 8)}px`,
                    width: `${draft.elementLayouts[litRpgElementKey.title]?.width ?? 80}%`,
                  }}
                >{draft.title}</span>
              )}
              {draft.subtitle && (
                <span
                  className="is-subtitle"
                  style={{
                    left: `${draft.elementLayouts[litRpgElementKey.subtitle]?.x ?? 8}%`,
                    top: `${Math.min(56, draft.elementLayouts[litRpgElementKey.subtitle]?.y ?? 28)}px`,
                    width: `${draft.elementLayouts[litRpgElementKey.subtitle]?.width ?? 70}%`,
                  }}
                >{draft.subtitle}</span>
              )}
            </div>
          ) : (
            <div className="litrpg-library-preview-table">
              <strong>{draft.title || 'LitRPG'}</strong>
              {draft.subtitle && <span>{draft.subtitle}</span>}
              <div className="litrpg-library-preview-rows">
                {draft.rows.slice(0, 3).map((row, index) => (
                  <div key={index}>
                    <span>{row.cells[0] || '—'}</span>
                    <span>{row.cells[1] || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="litrpg-library-card-copy">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
          {meta && <span className="litrpg-library-card-meta">{meta}</span>}
        </div>
      </button>
      <div className="litrpg-library-card-actions">
        <button type="button" onClick={onUse}>Use</button>
        {onUpdate && <button type="button" onClick={onUpdate}>Update tip</button>}
        {onDuplicate && <button type="button" onClick={onDuplicate}>Duplicate</button>}
        {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </article>
  )
}
