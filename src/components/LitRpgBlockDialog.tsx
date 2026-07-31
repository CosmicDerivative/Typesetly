import { useState, type CSSProperties } from 'react'
import {
  LITRPG_BLOCK_PRESETS,
  litRpgPreset,
  moveLitRpgColumn,
  moveLitRpgRow,
  normalizeLitRpgDraft,
  normalizeLitRpgColumnWidths,
  resizeLitRpgColumn,
  colorWithOpacity,
  type LitRpgBlockDraft,
  type LitRpgBlockKind,
} from '../editor/litrpg'
import { Dialog } from './Dialog'
import './LitRpgBlockDialog.css'

interface LitRpgBlockDialogProps {
  editing: boolean
  initialDraft: LitRpgBlockDraft
  onCancel: () => void
  onConfirm: (draft: LitRpgBlockDraft) => void
}

export function LitRpgBlockDialog({
  editing,
  initialDraft,
  onCancel,
  onConfirm,
}: LitRpgBlockDialogProps) {
  const [draft, setDraft] = useState(() => normalizeLitRpgDraft(initialDraft))

  const patch = (next: Partial<LitRpgBlockDraft>) => {
    setDraft((current) => ({ ...current, ...next }))
  }

  const choosePreset = (kind: LitRpgBlockKind) => setDraft(litRpgPreset(kind))

  const renameColumn = (columnIndex: number, value: string) => {
    patch({
      columns: draft.columns.map((column, index) => index === columnIndex ? value : column),
    })
  }

  const addColumn = () => {
    if (draft.columns.length >= 4) return
    patch({
      columns: [...draft.columns, `Column ${draft.columns.length + 1}`],
      columnWidths: normalizeLitRpgColumnWidths([], draft.columns.length + 1),
      rows: draft.rows.map((row) => ({ cells: [...row.cells, ''] })),
    })
  }

  const removeColumn = (columnIndex: number) => {
    if (draft.columns.length <= 1) return
    patch({
      columns: draft.columns.filter((_, index) => index !== columnIndex),
      columnWidths: normalizeLitRpgColumnWidths(
        draft.columnWidths.filter((_, index) => index !== columnIndex),
        draft.columns.length - 1,
      ),
      rows: draft.rows.map((row) => ({
        cells: row.cells.filter((_, index) => index !== columnIndex),
      })),
    })
  }

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    patch({
      rows: draft.rows.map((row, index) => index === rowIndex
        ? { cells: draft.columns.map((_, cellIndex) => cellIndex === columnIndex ? value : row.cells[cellIndex] || '') }
        : row),
    })
  }

  const moveRow = (rowIndex: number, direction: -1 | 1) => {
    patch({ rows: moveLitRpgRow(draft.rows, rowIndex, direction) })
  }

  const removeRow = (rowIndex: number) => {
    if (draft.rows.length <= 1) return
    patch({ rows: draft.rows.filter((_, index) => index !== rowIndex) })
  }

  return (
    <Dialog
      wide
      title={`${editing ? 'Edit' : 'Build'} LitRPG Block`}
      description="Create a reusable in-world interface with real rows and columns."
      confirmLabel={editing ? 'Apply Changes' : 'Insert Block'}
      onCancel={onCancel}
      onConfirm={() => onConfirm(normalizeLitRpgDraft(draft))}
    >
      <div className="litrpg-builder">
        <section className="litrpg-builder-section">
          <div className="litrpg-builder-section-title">
            <strong>Starting point</strong>
            <span>Changing templates replaces the current builder values.</span>
          </div>
          <div className="litrpg-preset-grid">
            {LITRPG_BLOCK_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.kind}
                className={draft.kind === preset.kind ? 'active' : ''}
                onClick={() => choosePreset(preset.kind)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="litrpg-builder-section litrpg-builder-two-column">
          <div>
            <label>
              Title
              <input value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
            </label>
            <label>
              Subtitle
              <input value={draft.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} placeholder="Optional context or rarity" />
            </label>
            <label>
              Footer
              <textarea rows={2} value={draft.footer} onChange={(event) => patch({ footer: event.target.value })} placeholder="Optional note, warning, or flavor text" />
            </label>
          </div>
          <div className="litrpg-style-controls">
            <label>
              Appearance
              <select value={draft.appearance} onChange={(event) => patch({ appearance: event.target.value as LitRpgBlockDraft['appearance'] })}>
                <option value="panel">System panel</option>
                <option value="terminal">Terminal</option>
                <option value="minimal">Minimal</option>
                <option value="ornate">Ornate</option>
              </select>
            </label>
            <label>
              Text flow
              <select value={draft.alignment} onChange={(event) => patch({ alignment: event.target.value as LitRpgBlockDraft['alignment'] })}>
                <option value="left">Float left — wrap right</option>
                <option value="center">Centered — text above/below</option>
                <option value="right">Float right — wrap left</option>
              </select>
            </label>
            <label>
              Spacing
              <select value={draft.density} onChange={(event) => patch({ density: event.target.value as LitRpgBlockDraft['density'] })}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="litrpg-range-control">
              <span>Width <output>{Math.round(draft.widthPercent)}%</output></span>
              <input type="range" min="30" max="100" value={draft.widthPercent} onChange={(event) => patch({ widthPercent: Number(event.target.value), width: Number(event.target.value) < 95 ? 'compact' : 'full' })} />
            </label>
            <label className="litrpg-range-control">
              <span>Corner shape <output>{Math.round(draft.borderRadius)}px</output></span>
              <input type="range" min="0" max="40" value={draft.borderRadius} onChange={(event) => patch({ borderRadius: Number(event.target.value) })} />
            </label>
            <label className="litrpg-range-control">
              <span>Border <output>{Math.round(draft.borderWidth)}px</output></span>
              <input type="range" min="0" max="8" value={draft.borderWidth} onChange={(event) => patch({ borderWidth: Number(event.target.value) })} />
            </label>
            <label className="litrpg-range-control">
              <span>Cell padding <output>{Math.round(draft.cellPadding)}px</output></span>
              <input type="range" min="3" max="24" value={draft.cellPadding} onChange={(event) => patch({ cellPadding: Number(event.target.value) })} />
            </label>
            <div className="litrpg-color-grid">
              <label>Accent<input type="color" value={draft.accent} onChange={(event) => patch({ accent: event.target.value })} /></label>
              <label>Background<input type="color" value={draft.background} onChange={(event) => patch({ background: event.target.value })} /></label>
              <label>Text<input type="color" value={draft.textColor} onChange={(event) => patch({ textColor: event.target.value })} /></label>
              <label>Border<input type="color" value={draft.border} onChange={(event) => patch({ border: event.target.value })} /></label>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={draft.showColumnHeaders} onChange={(event) => patch({ showColumnHeaders: event.target.checked })} />
              Show column headings
            </label>
            <label className="check-row">
              <input type="checkbox" checked={draft.backgroundOpacity < 100} onChange={(event) => patch({ backgroundOpacity: event.target.checked ? 72 : 100 })} />
              Translucent background
            </label>
            {draft.backgroundOpacity < 100 && (
              <label className="litrpg-range-control litrpg-opacity-control">
                <span>Background opacity <output>{Math.round(draft.backgroundOpacity)}%</output></span>
                <input type="range" min="10" max="95" value={draft.backgroundOpacity} onChange={(event) => patch({ backgroundOpacity: Number(event.target.value) })} />
              </label>
            )}
            <label className="check-row">
              <input type="checkbox" checked={draft.stripedRows} onChange={(event) => patch({ stripedRows: event.target.checked })} />
              Alternate row shading
            </label>
          </div>
        </section>

        <section className="litrpg-builder-section">
          <div className="litrpg-builder-section-title inline">
            <div>
              <strong>Table structure</strong>
              <span>Up to four columns and one hundred rows.</span>
            </div>
            <button type="button" className="litrpg-add-button" disabled={draft.columns.length >= 4} onClick={addColumn}>+ Column</button>
          </div>
          <div className="litrpg-column-editor" style={{ gridTemplateColumns: `repeat(${draft.columns.length}, minmax(120px, 1fr))` }}>
            {draft.columns.map((column, columnIndex) => (
              <label key={columnIndex}>
                Column {columnIndex + 1}
                <span className="litrpg-input-action litrpg-column-input-action">
                  <input value={column} onChange={(event) => renameColumn(columnIndex, event.target.value)} />
                  <button
                    type="button"
                    disabled={columnIndex === 0}
                    onClick={() => patch(moveLitRpgColumn(draft.columns, draft.rows, columnIndex, -1, draft.columnWidths))}
                    aria-label={`Move ${column || `column ${columnIndex + 1}`} left`}
                  >←</button>
                  <button
                    type="button"
                    disabled={columnIndex === draft.columns.length - 1}
                    onClick={() => patch(moveLitRpgColumn(draft.columns, draft.rows, columnIndex, 1, draft.columnWidths))}
                    aria-label={`Move ${column || `column ${columnIndex + 1}`} right`}
                  >→</button>
                  <button type="button" disabled={draft.columns.length <= 1} onClick={() => removeColumn(columnIndex)} aria-label={`Remove ${column || `column ${columnIndex + 1}`}`}>×</button>
                </span>
                <span className="litrpg-column-width-control">
                  <input
                    type="range"
                    min="10"
                    max={100 - 10 * (draft.columns.length - 1)}
                    value={draft.columnWidths[columnIndex]}
                    onChange={(event) => patch({ columnWidths: resizeLitRpgColumn(draft.columnWidths, columnIndex, Number(event.target.value)) })}
                    aria-label={`Width of ${column || `column ${columnIndex + 1}`}`}
                  />
                  <output>{Math.round(draft.columnWidths[columnIndex])}%</output>
                </span>
              </label>
            ))}
          </div>

          <div className="litrpg-row-editor">
            {draft.rows.map((row, rowIndex) => (
              <div className="litrpg-row-editor-line" key={rowIndex}>
                <span className="litrpg-row-number">{rowIndex + 1}</span>
                <div className="litrpg-row-cells" style={{ gridTemplateColumns: `repeat(${draft.columns.length}, minmax(110px, 1fr))` }}>
                  {draft.columns.map((column, columnIndex) => (
                    <input
                      key={columnIndex}
                      aria-label={`${column || `Column ${columnIndex + 1}`}, row ${rowIndex + 1}`}
                      value={row.cells[columnIndex] || ''}
                      onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                    />
                  ))}
                </div>
                <div className="litrpg-row-actions">
                  <button type="button" disabled={rowIndex === 0} onClick={() => moveRow(rowIndex, -1)} aria-label={`Move row ${rowIndex + 1} up`}>↑</button>
                  <button type="button" disabled={rowIndex === draft.rows.length - 1} onClick={() => moveRow(rowIndex, 1)} aria-label={`Move row ${rowIndex + 1} down`}>↓</button>
                  <button type="button" disabled={draft.rows.length <= 1} onClick={() => removeRow(rowIndex)} aria-label={`Remove row ${rowIndex + 1}`}>×</button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="litrpg-add-button"
            disabled={draft.rows.length >= 100}
            onClick={() => patch({ rows: [...draft.rows, { cells: draft.columns.map(() => '') }] })}
          >
            + Add row
          </button>
        </section>

        <section className="litrpg-builder-section">
          <div className="litrpg-builder-section-title"><strong>Preview</strong></div>
          <LitRpgPreview draft={draft} />
        </section>
      </div>
    </Dialog>
  )
}

function LitRpgPreview({ draft }: { draft: LitRpgBlockDraft }) {
  return (
    <div
      className="litrpg-block litrpg-builder-preview"
      data-appearance={draft.appearance}
      data-density={draft.density}
      data-width={draft.width}
      data-width-percent={String(draft.widthPercent)}
      data-alignment={draft.alignment}
      data-striped-rows={String(draft.stripedRows)}
      style={{
        '--litrpg-accent': draft.accent,
        '--litrpg-bg': draft.background,
        '--litrpg-bg-alpha': colorWithOpacity(draft.background, draft.backgroundOpacity),
        '--litrpg-text': draft.textColor,
        '--litrpg-border': draft.border,
        '--litrpg-width': `${draft.widthPercent}%`,
        '--litrpg-radius': `${draft.borderRadius}px`,
        '--litrpg-border-width': `${draft.borderWidth}px`,
        '--litrpg-cell-padding': `${draft.cellPadding}px`,
      } as CSSProperties}
    >
      <div className="litrpg-block-heading">
        <strong className="litrpg-block-title">{draft.title || 'LitRPG Block'}</strong>
        {draft.subtitle && <span className="litrpg-block-subtitle">{draft.subtitle}</span>}
      </div>
      <table className="litrpg-block-table">
        <colgroup>{draft.columns.map((_, index) => <col key={index} style={{ width: `${draft.columnWidths[index]}%` }} />)}</colgroup>
        {draft.showColumnHeaders && (
          <thead><tr>{draft.columns.map((column, index) => <th key={index}>{column || `Column ${index + 1}`}</th>)}</tr></thead>
        )}
        <tbody>
          {draft.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{draft.columns.map((_, columnIndex) => <td key={columnIndex}>{row.cells[columnIndex] || '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {draft.footer && <div className="litrpg-block-footer">{draft.footer}</div>}
    </div>
  )
}
