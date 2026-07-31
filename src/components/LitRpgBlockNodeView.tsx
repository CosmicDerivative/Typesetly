import {
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useApp } from '../BookContext'
import {
  buildLitRpgBlockNode,
  cloneLitRpgDraft,
  colorWithOpacity,
  litRpgDraftFromAttrs,
  litRpgDraftFromStored,
  moveLitRpgColumn,
  moveLitRpgRow,
  litRpgElementKey,
  readLitRpgSnapPref,
  softSnapLitRpgLayout,
  writeLitRpgSnapPref,
  type LitRpgBlockDraft,
  type LitRpgElementLayout,
  type LitRpgSnapGuides,
} from '../editor/litrpg'
import { beginLitRpgDrag, finishLitRpgDrag } from '../editor/litrpgDrag'

type LibraryMenu = 'template' | 'screen' | null

function clearSnapGuides(canvas: HTMLElement) {
  canvas.querySelectorAll('.litrpg-snap-guide').forEach((node) => node.remove())
}

function paintSnapGuides(canvas: HTMLElement, guides: LitRpgSnapGuides) {
  clearSnapGuides(canvas)
  for (const x of guides.vertical) {
    const line = document.createElement('div')
    line.className = 'litrpg-snap-guide is-vertical'
    line.style.left = `${x}px`
    canvas.appendChild(line)
  }
  for (const y of guides.horizontal) {
    const line = document.createElement('div')
    line.className = 'litrpg-snap-guide is-horizontal'
    line.style.top = `${y}px`
    canvas.appendChild(line)
  }
}

export function LitRpgBlockNodeView({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const {
    project,
    saveLitRpgTemplate,
    saveLitRpgCharacterScreen,
  } = useApp()
  const draft = litRpgDraftFromAttrs(node.attrs as Record<string, unknown>)
  const sourceScreenId = String(node.attrs.sourceScreenId || '')
  const linkedScreen = (project?.litrpgCharacterScreens || []).find((screen) => screen.id === sourceScreenId)
  const characters = project?.storyBible?.characters || []
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    parentWidth: number
  } | null>(null)
  const [snapToGrid, setSnapToGrid] = useState(readLitRpgSnapPref)
  const snapToGridRef = useRef(snapToGrid)
  snapToGridRef.current = snapToGrid
  const libraryMenuRef = useRef<HTMLDivElement | null>(null)
  const [libraryMenu, setLibraryMenu] = useState<LibraryMenu>(null)
  const linkedCharacterId = linkedScreen?.characterId
    || characters.find((character) => character.name && draft.title.includes(character.name))?.id
    || ''
  const defaultScreenName = linkedScreen?.name
    || (linkedCharacterId
      ? `${characters.find((character) => character.id === linkedCharacterId)?.name || 'Character'} - Status`
      : draft.title.trim() || 'Character screen')
  const [templateName, setTemplateName] = useState(draft.title.trim() || 'Untitled template')
  const [screenName, setScreenName] = useState(defaultScreenName)
  const [screenCharacterId, setScreenCharacterId] = useState(linkedCharacterId)
  useEffect(() => {
    const onPref = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') setSnapToGrid(detail)
    }
    window.addEventListener('typesetly:litrpg-snap-pref', onPref)
    return () => window.removeEventListener('typesetly:litrpg-snap-pref', onPref)
  }, [])
  useEffect(() => {
    if (!libraryMenu) return
    const onPointerDown = (event: PointerEvent) => {
      if (!libraryMenuRef.current?.contains(event.target as Node)) setLibraryMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLibraryMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [libraryMenu])
  const itemMoveRef = useRef<{
    pointerId: number
    key: string
    mode: 'move' | 'resize'
    startX: number
    startY: number
    canvasWidth: number
    layout: LitRpgElementLayout
    nextLayout: LitRpgElementLayout
    nextCanvasHeight: number
    siblings: LitRpgElementLayout[]
    canvas: HTMLElement
    item: HTMLElement
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

  const openTemplateMenu = () => {
    setTemplateName(draft.title.trim() || 'Untitled template')
    setLibraryMenu('template')
  }

  const openScreenMenu = () => {
    setScreenName(defaultScreenName)
    setScreenCharacterId(linkedCharacterId)
    setLibraryMenu('screen')
  }

  const saveAsTemplate = () => {
    const id = saveLitRpgTemplate({
      name: templateName.trim() || draft.title.trim() || 'Untitled template',
      draft: cloneLitRpgDraft(draft),
    })
    updateAttributes({
      ...buildLitRpgBlockNode({
        ...draft,
        sourceTemplateId: id,
        sourceScreenId: '',
        revision: '',
      }).attrs,
    })
    setLibraryMenu(null)
  }

  const saveAsLatestForCharacter = () => {
    const existingId = sourceScreenId || undefined
    const saved = saveLitRpgCharacterScreen({
      id: existingId,
      characterId: screenCharacterId || undefined,
      name: screenName.trim() || defaultScreenName,
      draft: cloneLitRpgDraft(draft),
    })
    updateAttributes({
      ...buildLitRpgBlockNode({
        ...draft,
        sourceScreenId: saved.id,
        sourceTemplateId: '',
        revision: String(saved.revision),
      }).attrs,
    })
    setLibraryMenu(null)
  }

  const replaceFromLatest = () => {
    if (!sourceScreenId) return
    const screen = (project?.litrpgCharacterScreens || []).find((item) => item.id === sourceScreenId)
    if (!screen) return
    updateAttributes({
      ...buildLitRpgBlockNode({
        ...cloneLitRpgDraft(litRpgDraftFromStored(screen.draft)),
        sourceScreenId: screen.id,
        revision: String(screen.revision),
      }).attrs,
    })
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

  const beginItemMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    mode: 'move' | 'resize',
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const canvas = event.currentTarget.closest<HTMLElement>('.litrpg-freeform-canvas')
    const item = event.currentTarget.closest<HTMLElement>('.litrpg-freeform-item')
    const layout = draft.elementLayouts[key]
    if (!canvas || !item || !layout) return
    itemMoveRef.current = {
      pointerId: event.pointerId,
      key,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      canvasWidth: canvas.clientWidth || 1,
      layout: { ...layout },
      nextLayout: { ...layout },
      nextCanvasHeight: draft.canvasHeight,
      siblings: Object.entries(draft.elementLayouts)
        .filter(([entryKey]) => entryKey !== key)
        .map(([, entry]) => entry),
      canvas,
      item,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateItemMovement = (clientX: number, clientY: number) => {
    const movement = itemMoveRef.current
    if (!movement) return
    const deltaX = ((clientX - movement.startX) / movement.canvasWidth) * 100
    const deltaY = clientY - movement.startY
    let nextLayout = movement.mode === 'move'
      ? {
        ...movement.layout,
        x: Math.min(100 - movement.layout.width, Math.max(0, movement.layout.x + deltaX)),
        y: Math.max(0, movement.layout.y + deltaY),
      }
      : {
        ...movement.layout,
        width: Math.min(100 - movement.layout.x, Math.max(8, movement.layout.width + deltaX)),
        height: Math.max(24, movement.layout.height + deltaY),
      }
    if (snapToGridRef.current) {
      const snapped = softSnapLitRpgLayout({
        layout: nextLayout,
        mode: movement.mode,
        canvasWidth: movement.canvasWidth,
        canvasHeight: Math.max(
          draft.canvasHeight,
          Math.ceil(nextLayout.y + nextLayout.height + 18),
        ),
        siblings: movement.siblings,
      })
      nextLayout = snapped.layout
      paintSnapGuides(movement.canvas, snapped.guides)
    } else {
      clearSnapGuides(movement.canvas)
    }
    movement.nextLayout = nextLayout
    movement.nextCanvasHeight = Math.max(
      draft.canvasHeight,
      Math.ceil(nextLayout.y + nextLayout.height + 18),
    )
    movement.item.style.left = `${nextLayout.x}%`
    movement.item.style.top = `${nextLayout.y}px`
    movement.item.style.width = `${nextLayout.width}%`
    movement.item.style.height = `${nextLayout.height}px`
    movement.canvas.style.height = `${movement.nextCanvasHeight}px`
  }

  const moveItem = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const movement = itemMoveRef.current
    if (!movement || movement.pointerId !== event.pointerId) return
    updateItemMovement(event.clientX, event.clientY)
  }

  const commitItemMovement = () => {
    const movement = itemMoveRef.current
    if (!movement) return
    clearSnapGuides(movement.canvas)
    itemMoveRef.current = null
    commit({
      elementLayouts: { ...draft.elementLayouts, [movement.key]: movement.nextLayout },
      canvasHeight: movement.nextCanvasHeight,
    })
  }

  const endItemMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (itemMoveRef.current?.pointerId !== event.pointerId) return
    commitItemMovement()
  }

  const beginItemDrag = (event: ReactDragEvent<HTMLButtonElement>, key: string) => {
    event.stopPropagation()
    const canvas = event.currentTarget.closest<HTMLElement>('.litrpg-freeform-canvas')
    const item = event.currentTarget.closest<HTMLElement>('.litrpg-freeform-item')
    const layout = draft.elementLayouts[key]
    if (!canvas || !item || !layout) return
    itemMoveRef.current = {
      pointerId: -1,
      key,
      mode: 'move',
      startX: event.clientX,
      startY: event.clientY,
      canvasWidth: canvas.clientWidth || 1,
      layout: { ...layout },
      nextLayout: { ...layout },
      nextCanvasHeight: draft.canvasHeight,
      siblings: Object.entries(draft.elementLayouts)
        .filter(([entryKey]) => entryKey !== key)
        .map(([, entry]) => entry),
      canvas,
      item,
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
  }

  const dragItem = (event: ReactDragEvent<HTMLButtonElement>) => {
    if (event.clientX || event.clientY) updateItemMovement(event.clientX, event.clientY)
  }

  const endItemDrag = (event: ReactDragEvent<HTMLButtonElement>) => {
    if (event.clientX || event.clientY) updateItemMovement(event.clientX, event.clientY)
    commitItemMovement()
  }

  const freeformEntries = [
    {
      key: litRpgElementKey.title,
      className: 'is-title',
      value: draft.title,
      label: 'Title',
      update: (value: string) => commit({ title: value }),
    },
    {
      key: litRpgElementKey.subtitle,
      className: 'is-subtitle',
      value: draft.subtitle,
      label: 'Subtitle',
      update: (value: string) => commit({ subtitle: value }),
    },
    ...draft.columns.flatMap((column, columnIndex) => [
      ...(draft.showColumnHeaders ? [{
        key: litRpgElementKey.column(columnIndex),
        className: 'is-column',
        value: column,
        label: `Column ${columnIndex + 1}`,
        update: (value: string) => commit({
          columns: draft.columns.map((entry, index) => index === columnIndex ? value : entry),
        }),
      }] : []),
      ...draft.rows.map((row, rowIndex) => ({
        key: litRpgElementKey.cell(rowIndex, columnIndex),
        className: 'is-cell',
        value: row.cells[columnIndex] || '',
        label: `${column || `Column ${columnIndex + 1}`}, row ${rowIndex + 1}`,
        update: (value: string) => updateCell(rowIndex, columnIndex, value),
      })),
    ]),
    {
      key: litRpgElementKey.footer,
      className: 'is-footer',
      value: draft.footer,
      label: 'Footer',
      update: (value: string) => commit({ footer: value }),
    },
  ]

  return (
    <NodeViewWrapper
      className={`litrpg-block litrpg-block-node-view${selected ? ' is-selected' : ''}`}
      data-kind={draft.kind}
      data-appearance={draft.appearance}
      data-density={draft.density}
      data-width={draft.width}
      data-width-percent={String(draft.widthPercent)}
      data-alignment={draft.alignment}
      data-layout-mode={draft.layoutMode}
      data-striped-rows={String(draft.stripedRows)}
      data-show-cell-borders={String(draft.showCellBorders)}
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
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            commit({ layoutMode: draft.layoutMode === 'freeform' ? 'table' : 'freeform' })
          }}
          title="Switch between structured rows and freely positioned entries"
        >{draft.layoutMode === 'freeform' ? 'Free canvas' : 'Table'}</button>
        {draft.layoutMode === 'freeform' && (
          <button
            type="button"
            className={snapToGrid ? 'active' : ''}
            onClick={(event) => {
              event.stopPropagation()
              const next = !snapToGrid
              setSnapToGrid(next)
              writeLitRpgSnapPref(next)
            }}
            title="Soft-snap fields to the canvas grid and sibling edges while dragging"
            aria-pressed={snapToGrid}
          >Snap to grid</button>
        )}
        <button type="button" onClick={openBuilder}>Full builder</button>
        <div className="litrpg-inline-library-wrap" ref={libraryMenuRef}>
          <button
            type="button"
            className={libraryMenu === 'template' ? 'active' : ''}
            onClick={(event) => {
              event.stopPropagation()
              if (libraryMenu === 'template') setLibraryMenu(null)
              else openTemplateMenu()
            }}
            title="Save this block as a reusable template for this book"
            aria-expanded={libraryMenu === 'template'}
          >Save template</button>
          <button
            type="button"
            className={libraryMenu === 'screen' ? 'active' : ''}
            onClick={(event) => {
              event.stopPropagation()
              if (libraryMenu === 'screen') setLibraryMenu(null)
              else openScreenMenu()
            }}
            title={sourceScreenId
              ? 'Update the linked character tip only; past chapter inserts stay frozen'
              : 'Save as a new character tip; past chapter inserts stay frozen'}
            aria-expanded={libraryMenu === 'screen'}
          >{sourceScreenId ? 'Update tip' : 'Save as latest'}</button>
          {sourceScreenId && linkedScreen && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setLibraryMenu(null)
                replaceFromLatest()
              }}
              title="Replace this insert from the character current tip"
            >Load latest</button>
          )}
          {libraryMenu === 'template' && (
            <div
              className="litrpg-inline-library-menu"
              role="dialog"
              aria-label="Save LitRPG template"
              onClick={(event) => event.stopPropagation()}
            >
              <strong>Save as template</strong>
              <label>
                Template name
                <input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="litrpg-inline-library-actions">
                <button type="button" onClick={() => setLibraryMenu(null)}>Cancel</button>
                <button type="button" onClick={saveAsTemplate}>Save</button>
              </div>
            </div>
          )}
          {libraryMenu === 'screen' && (
            <div
              className="litrpg-inline-library-menu"
              role="dialog"
              aria-label={sourceScreenId ? 'Update character tip' : 'Save character tip'}
              onClick={(event) => event.stopPropagation()}
            >
              <strong>{sourceScreenId ? 'Update tip' : 'Save as latest'}</strong>
              <label>
                Screen name
                <input
                  value={screenName}
                  onChange={(event) => setScreenName(event.target.value)}
                  autoFocus
                />
              </label>
              <label>
                Character
                <select
                  value={screenCharacterId}
                  onChange={(event) => setScreenCharacterId(event.target.value)}
                >
                  <option value="">No character link</option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name || 'Unnamed character'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="litrpg-inline-library-actions">
                <button type="button" onClick={() => setLibraryMenu(null)}>Cancel</button>
                <button type="button" onClick={saveAsLatestForCharacter}>
                  {sourceScreenId ? 'Update tip' : 'Save new'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {draft.layoutMode === 'freeform' ? (
        <div className="litrpg-freeform-canvas" style={{ height: `${draft.canvasHeight}px` }}>
          {freeformEntries.map((entry) => {
            const layout = draft.elementLayouts[entry.key]
            if (!layout) return null
            return (
              <div
                key={entry.key}
                className={`litrpg-freeform-item ${entry.className}`}
                style={{
                  left: `${layout.x}%`,
                  top: `${layout.y}px`,
                  width: `${layout.width}%`,
                  height: `${layout.height}px`,
                }}
              >
                <button
                  type="button"
                  className="litrpg-freeform-move"
                  draggable
                  onDragStart={(event) => beginItemDrag(event, entry.key)}
                  onDrag={dragItem}
                  onDragEnd={endItemDrag}
                  onPointerDown={(event) => beginItemMove(event, entry.key, 'move')}
                  onPointerMove={moveItem}
                  onPointerUp={endItemMove}
                  onPointerCancel={endItemMove}
                  aria-label={`Move ${entry.label}`}
                  title={`Drag ${entry.label} anywhere`}
                >{'\u22ee\u22ee'}</button>
                <textarea
                  value={entry.value}
                  onChange={(event) => entry.update(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={entry.label}
                />
                <button
                  type="button"
                  className="litrpg-freeform-resize"
                  onPointerDown={(event) => beginItemMove(event, entry.key, 'resize')}
                  onPointerMove={moveItem}
                  onPointerUp={endItemMove}
                  onPointerCancel={endItemMove}
                  aria-label={`Resize ${entry.label}`}
                  title={`Resize ${entry.label}`}
                >{'\u2198'}</button>
              </div>
            )
          })}
        </div>
      ) : <>
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
                    >{'<'}</button>
                    <button
                      type="button"
                      disabled={columnIndex === draft.columns.length - 1}
                      onClick={(event) => {
                        event.stopPropagation()
                        commit(moveLitRpgColumn(draft.columns, draft.rows, columnIndex, 1, draft.columnWidths))
                      }}
                      aria-label={`Move ${column || `column ${columnIndex + 1}`} right`}
                    >{'>'}</button>
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
                >^</button>
                <button
                  type="button"
                  disabled={rowIndex === draft.rows.length - 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    commit({ rows: moveLitRpgRow(draft.rows, rowIndex, 1) })
                  }}
                  aria-label={`Move row ${rowIndex + 1} down`}
                >v</button>
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
      </>}
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
