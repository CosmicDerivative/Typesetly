import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { NodeSelection } from '@tiptap/pm/state'

const LITRPG_DRAG_TYPE = 'application/x-typesetly-litrpg-block'

interface ActiveLitRpgDrag {
  source: Editor
  from: number
  nodeSize: number
  nodeJson: Record<string, unknown>
}

let activeDrag: ActiveLitRpgDrag | null = null

export function beginLitRpgDrag(
  event: DragEvent,
  source: Editor,
  from: number,
  nodeSize: number,
  nodeJson: Record<string, unknown>,
) {
  activeDrag = { source, from, nodeSize, nodeJson }
  event.dataTransfer?.setData(LITRPG_DRAG_TYPE, 'move')
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

export function finishLitRpgDrag() {
  activeDrag = null
}

export function dropLitRpgAcrossPages(view: EditorView, event: DragEvent) {
  const drag = activeDrag
  if (!drag || drag.source.view === view) return false
  if (!event.dataTransfer?.types.includes(LITRPG_DRAG_TYPE)) return false

  const resolved = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!resolved) return false
  const bounds = view.dom.getBoundingClientRect()
  const horizontalRatio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : .5
  const alignment = horizontalRatio < .34 ? 'left' : horizontalRatio > .66 ? 'right' : 'center'
  const json = structuredClone(drag.nodeJson)
  json.attrs = { ...(json.attrs as Record<string, unknown>), alignment }

  try {
    const targetNode = view.state.schema.nodeFromJSON(json)
    const targetTransaction = view.state.tr.replaceRangeWith(resolved.pos, resolved.pos, targetNode)
    const insertedAt = targetTransaction.mapping.map(resolved.pos)
    view.dispatch(
      targetTransaction
        .setSelection(NodeSelection.create(targetTransaction.doc, Math.max(0, insertedAt - targetNode.nodeSize)))
        .scrollIntoView(),
    )

    const sourceMaximum = drag.source.state.doc.content.size
    const from = Math.max(0, Math.min(drag.from, sourceMaximum))
    const to = Math.max(from, Math.min(from + drag.nodeSize, sourceMaximum))
    if (drag.source.state.doc.nodeAt(from)?.type.name === 'litrpgBlock') {
      drag.source.view.dispatch(drag.source.state.tr.delete(from, to))
    }
    event.preventDefault()
    finishLitRpgDrag()
    return true
  } catch {
    return false
  }
}
