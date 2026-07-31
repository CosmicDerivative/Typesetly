import {
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useRef, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  buildLitRpgBlockNode,
  colorWithOpacity,
  litRpgDraftFromAttrs,
  moveLitRpgColumn,
  moveLitRpgRow,
  type LitRpgBlockDraft,
} from '../editor/litrpg'
import { beginLitRpgDrag, finishLitRpgDrag } from '../editor/litrpgDrag'

export function LitRpgBlockNodeView({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const draft = litRpgDraftFromAttrs(node.attrs as Record<string, unknown>)
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    parentWidth: number
  } | null>(null)

  const commit = (next: Partial<LitRpgBlockDraft>) => {
    updateAttributes(buildLitRpgBlockNode({ ...draft, ...next }).attrs)
  }

  const selectBlock = () => {
    const position = getPos()
    if (typeof position !== 'number') return
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)),
    )
  }

  const openBuilder = () => {
    const position = getPos()
    if (typeof position !== 'number') return
    selectBlock()
    window.dispatchEvent(new CustomEvent('typesetly:edit-litrpg-block', {
      detail: {
        editor,
        from: position,
        to: position + node.nodeSize,
        attrs: node.attrs,
      },
    }))
  }

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    commit({
      rows: draft.rows.map((row, index) => index === rowIndex
        ? { cells: draft.columns.map((_, cellIndex) => cellIndex === columnIndex ? value : row.cells[cellIndex] || '') }
        : row),
    })
  }

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const root = event.currentTarget.closest<HTMLElement>('.litrpg-block-node-view')
    const parentWidth = root?.parentElement?.clientWidth || root?.clientWidth || 1
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: draft.widthPercent,
      parentWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resizeBlock = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const direction = draft.alignment === 'right' ? -1 : 1
    const centeredMultiplier = draft.alignment === 'center' ? 2 : 1
    const delta = ((event.clientX - resize.startX) / resize.parentWidth) * 100
      * direction
      * centeredMultiplier
    commit({ widthPercent: Math.min(100, Math.max(30, resize.startWidth + delta)) })
  }

  const endResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null
  }

  const finishMove = (event: ReactDragEvent<HTMLButtonElement>) => {
    const bounds = editor.view.dom.getBoundingClientRect()
    const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : .5
    commit({ alignment: ratio < .34 ? 'left' : ratio > .66 ? 'right' : 'center' })
    finishLitRpgDrag()
  }

  const beginMove = (event: ReactDragEvent<HTMLButtonElement>) => {
    const position = getPos()
    if (typeof position !== 'number') return
    beginLitRpgDrag(
      event.nativeEvent,
      editor,
      position,
      node.nodeSize,
      buildLitRpgBlockNode(draft) as unknown as Record<string, unknown>,
    )
  }

  return (
    <NodeViewWrapper
      className={`litrpg-block litrpg-block-node-view${selected ? ' is-selected' : ''}`}
      data-kind={draft.kind}
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
      contentEditable={false}
      onClick={selectBlock}
    >
      <div className="litrpg-inline-tools" contentEditable={false}>
        <button
          type="button"
          className="litrpg-drag-handle"
          data-drag-handle
          draggable
          onDragStart={beginMove}
          onDragEnd={finishMove}
          title="Drag anywhere in the manuscript; horizontal drop position controls text wrapping"
          aria-label="Drag to reposition LitRPG block"
        >
          ⋮⋮
        </button>
        <span>Edit fields directly</span>
        <span>{Math.round(draft.widthPercent)}%</span>
        <span className="litrpg-inline-alignment" aria-label="Text wrapping position">
          {(['left', 'center', 'right'] as const).map((alignment) => (
            <button
              type="button"
              key={alignment}
              className={draft.alignment === alignment ? 'active' : ''}
              onClick={(event) => {
                event.stopPropagation()
                commit({ alignment })
              }}
              title={alignment === 'center' ? 'Inline center; text stays above and below' : `Float ${alignment}; text wraps around block`}
              aria-label={`Position block ${alignment}`}
            >{alignment === 'left' ? '⇤' : alignment === 'right' ? '⇥' : '↔'}</button>
          ))}
        </span>
        <button type="button" onClick={openBuilder}>Full builder</button>
      </div>

      <div className="litrpg-block-heading">
        <input
          className="litrpg-inline-title"
          value={draft.title}
          onChange={(event) => commit({ title: event.target.value })}
          onClick={(event) => event.stopPropagation()}
          aria-label="LitRPG block title"
        />
        <input
          className="litrpg-inline-subtitle"
          value={draft.subtitle}
          onChange={(event) => commit({ subtitle: event.target.value })}
          onClick={(event) => event.stopPropagation()}
          placeholder="Add subtitle"
          aria-label="LitRPG block subtitle"
        />
      </div>

      <table className="litrpg-block-table">
        <colgroup>
          {draft.columns.map((_, columnIndex) => (
            <col key={columnIndex} style={{ width: `${draft.columnWidths[columnIndex]}%` }} />
          ))}
        </colgroup>
        {draft.showColumnHeaders && (
          <thead>
            <tr>
              {draft.columns.map((column, columnIndex) => (
                <th key={columnIndex}>
                  <input
                    value={column}
                    onChange={(event) => commit({
                      columns: draft.columns.map((value, index) => index === columnIndex ? event.target.value : value),
                    })}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Column ${columnIndex + 1} heading`}
                  />
                  <span className="litrpg-inline-column-actions">
                    <button
                      type="button"
                      disabled={columnIndex === 0}
                      onClick={(event) => {
                        event.stopPropagation()
                        commit(moveLitRpgColumn(draft.columns, draft.rows, columnIndex, -1, draft.columnWidths))
                      }}
                      aria-label={`Move ${column || `column ${columnIndex + 1}`} left`}
                    >←</button>
                    <button
                      type="button"
                      disabled={columnIndex === draft.columns.length - 1}
                      onClick={(event) => {
                        event.stopPropagation()
                        commit(moveLitRpgColumn(draft.columns, draft.rows, columnIndex, 1, draft.columnWidths))
                      }}
                      aria-label={`Move ${column || `column ${columnIndex + 1}`} right`}
                    >→</button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {draft.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {draft.columns.map((column, columnIndex) => (
                <td key={columnIndex}>
                  <textarea
                    rows={1}
                    value={row.cells[columnIndex] || ''}
                    onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${column || `Column ${columnIndex + 1}`}, row ${rowIndex + 1}`}
                  />
                </td>
              ))}
              <td className="litrpg-inline-row-actions">
                <button
                  type="button"
                  disabled={rowIndex === 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    commit({ rows: moveLitRpgRow(draft.rows, rowIndex, -1) })
                  }}
                  aria-label={`Move row ${rowIndex + 1} up`}
                >↑</button>
                <button
                  type="button"
                  disabled={rowIndex === draft.rows.length - 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    commit({ rows: moveLitRpgRow(draft.rows, rowIndex, 1) })
                  }}
                  aria-label={`Move row ${rowIndex + 1} down`}
                >↓</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <textarea
        className="litrpg-inline-footer"
        rows={1}
        value={draft.footer}
        onChange={(event) => commit({ footer: event.target.value })}
        onClick={(event) => event.stopPropagation()}
        placeholder="Add footer"
        aria-label="LitRPG block footer"
      />
      <button
        type="button"
        className="litrpg-inline-resize-handle"
        onPointerDown={beginResize}
        onPointerMove={resizeBlock}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        aria-label="Drag to resize LitRPG block"
        title="Drag horizontally to resize"
      >↘</button>
    </NodeViewWrapper>
  )
}
