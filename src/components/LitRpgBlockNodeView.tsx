import {
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import type { CSSProperties } from 'react'
import {
  buildLitRpgBlockNode,
  litRpgDraftFromAttrs,
  moveLitRpgColumn,
  moveLitRpgRow,
  type LitRpgBlockDraft,
} from '../editor/litrpg'

export function LitRpgBlockNodeView({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const draft = litRpgDraftFromAttrs(node.attrs as Record<string, unknown>)

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

  return (
    <NodeViewWrapper
      className={`litrpg-block litrpg-block-node-view${selected ? ' is-selected' : ''}`}
      data-kind={draft.kind}
      data-appearance={draft.appearance}
      data-density={draft.density}
      data-width={draft.width}
      data-striped-rows={String(draft.stripedRows)}
      style={{
        '--litrpg-accent': draft.accent,
        '--litrpg-bg': draft.background,
        '--litrpg-text': draft.textColor,
        '--litrpg-border': draft.border,
      } as CSSProperties}
      contentEditable={false}
      onClick={selectBlock}
    >
      <div className="litrpg-inline-tools" contentEditable={false}>
        <button
          type="button"
          className="litrpg-drag-handle"
          data-drag-handle
          title="Drag to reposition block"
          aria-label="Drag to reposition LitRPG block"
        >
          ⋮⋮
        </button>
        <span>Edit fields directly</span>
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
                        commit(moveLitRpgColumn(draft.columns, draft.rows, columnIndex, -1))
                      }}
                      aria-label={`Move ${column || `column ${columnIndex + 1}`} left`}
                    >←</button>
                    <button
                      type="button"
                      disabled={columnIndex === draft.columns.length - 1}
                      onClick={(event) => {
                        event.stopPropagation()
                        commit(moveLitRpgColumn(draft.columns, draft.rows, columnIndex, 1))
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
    </NodeViewWrapper>
  )
}
