import type { Editor } from '@tiptap/core'

export type LitRpgBlockKind =
  | 'stat-screen'
  | 'system-message'
  | 'skill-selection'
  | 'item-info'

export type LitRpgAppearance = 'panel' | 'terminal' | 'minimal' | 'ornate'
export type LitRpgDensity = 'compact' | 'comfortable'
export type LitRpgWidth = 'compact' | 'full'
export type LitRpgAlignment = 'left' | 'center' | 'right'
export type LitRpgLayoutMode = 'table' | 'freeform'

export interface LitRpgElementLayout {
  x: number
  y: number
  width: number
  height: number
}

export interface LitRpgRow {
  cells: string[]
}

export interface LitRpgBlockDraft {
  kind: LitRpgBlockKind
  title: string
  subtitle: string
  columns: string[]
  columnWidths: number[]
  rows: LitRpgRow[]
  footer: string
  appearance: LitRpgAppearance
  density: LitRpgDensity
  width: LitRpgWidth
  widthPercent: number
  alignment: LitRpgAlignment
  layoutMode: LitRpgLayoutMode
  canvasHeight: number
  elementLayouts: Record<string, LitRpgElementLayout>
  borderRadius: number
  borderWidth: number
  backgroundOpacity: number
  cellPadding: number
  accent: string
  background: string
  textColor: string
  border: string
  showColumnHeaders: boolean
  stripedRows: boolean
  showCellBorders: boolean
}

/** Provenance metadata stored on TipTap attrs (not part of visual draft). */
export interface LitRpgBlockProvenance {
  sourceScreenId?: string
  sourceTemplateId?: string
  revision?: string
}

export function cloneLitRpgDraft(draft: LitRpgBlockDraft): LitRpgBlockDraft {
  return normalizeLitRpgDraft(JSON.parse(JSON.stringify(draft)) as Partial<LitRpgBlockDraft>)
}

export function litRpgDraftFromStored(value: unknown): LitRpgBlockDraft {
  if (!value || typeof value !== 'object') return litRpgPreset('stat-screen')
  return normalizeLitRpgDraft(value as Partial<LitRpgBlockDraft>)
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const MAX_COLUMNS = 4
const MAX_ROWS = 100

export const litRpgElementKey = {
  title: 'title',
  subtitle: 'subtitle',
  footer: 'footer',
  column: (columnIndex: number) => `column:${columnIndex}`,
  cell: (rowIndex: number, columnIndex: number) => `cell:${rowIndex}:${columnIndex}`,
}

function safeColor(value: string, fallback: string) {
  return COLOR_PATTERN.test(value) ? value : fallback
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).replace(/\r\n?/g, '\n').trim()
}

function numberWithin(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

export function normalizeLitRpgColumnWidths(value: unknown, columnCount: number) {
  const count = Math.max(1, columnCount)
  const source = Array.isArray(value)
    ? value.slice(0, count).map((entry) => Number(entry))
    : []
  if (source.length !== count || source.some((entry) => !Number.isFinite(entry) || entry <= 0)) {
    const equal = 100 / count
    return Array.from({ length: count }, (_, index) => index === count - 1
      ? 100 - equal * (count - 1)
      : equal)
  }
  const total = source.reduce((sum, entry) => sum + entry, 0)
  const normalized = source.map((entry) => (entry / total) * 100)
  normalized[normalized.length - 1] = 100 - normalized
    .slice(0, -1)
    .reduce((sum, entry) => sum + entry, 0)
  return normalized
}

export function resizeLitRpgColumn(
  value: number[],
  columnIndex: number,
  requestedWidth: number,
) {
  const widths = normalizeLitRpgColumnWidths(value, value.length)
  if (widths.length <= 1) return [100]
  if (columnIndex < 0 || columnIndex >= widths.length) return widths

  const minimum = 10
  const maximum = 100 - minimum * (widths.length - 1)
  const nextWidth = numberWithin(requestedWidth, minimum, maximum, widths[columnIndex])
  const otherTotal = 100 - widths[columnIndex]
  const remaining = 100 - nextWidth
  const next = widths.map((width, index) => {
    if (index === columnIndex) return nextWidth
    return otherTotal > 0
      ? (width / otherTotal) * remaining
      : remaining / (widths.length - 1)
  })
  return normalizeLitRpgColumnWidths(next, widths.length)
}

export function colorWithOpacity(color: string, opacity: number) {
  const safe = safeColor(color, '#ffffff')
  const red = Number.parseInt(safe.slice(1, 3), 16)
  const green = Number.parseInt(safe.slice(3, 5), 16)
  const blue = Number.parseInt(safe.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${numberWithin(opacity, 0, 100, 100) / 100})`
}

function defaultElementLayouts(columns: string[], rows: LitRpgRow[]) {
  const layouts: Record<string, LitRpgElementLayout> = {
    [litRpgElementKey.title]: { x: 4, y: 14, width: 58, height: 34 },
    [litRpgElementKey.subtitle]: { x: 4, y: 52, width: 58, height: 28 },
    [litRpgElementKey.footer]: {
      x: 4,
      y: 126 + rows.length * 46,
      width: 92,
      height: 32,
    },
  }
  const columnWidth = 92 / Math.max(1, columns.length)
  columns.forEach((_, columnIndex) => {
    const x = 4 + columnIndex * columnWidth
    layouts[litRpgElementKey.column(columnIndex)] = {
      x,
      y: 88,
      width: columnWidth,
      height: 32,
    }
    rows.forEach((__, rowIndex) => {
      layouts[litRpgElementKey.cell(rowIndex, columnIndex)] = {
        x,
        y: 124 + rowIndex * 46,
        width: columnWidth,
        height: 42,
      }
    })
  })
  return layouts
}

export function normalizeLitRpgElementLayouts(
  value: unknown,
  columns: string[],
  rows: LitRpgRow[],
) {
  const defaults = defaultElementLayouts(columns, rows)
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Partial<LitRpgElementLayout>>
    : {}
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const candidate = source[key] || {}
    const width = numberWithin(candidate.width, 8, 100, fallback.width)
    return [key, {
      x: numberWithin(candidate.x, 0, 100 - Math.min(width, 100), fallback.x),
      y: numberWithin(candidate.y, 0, 2000, fallback.y),
      width,
      height: numberWithin(candidate.height, 24, 500, fallback.height),
    }]
  }))
}

/** Matches `.litrpg-freeform-canvas` background-size. */
export const LITRPG_FREEFORM_GRID_SIZE = 16
/** Soft magnetic pull — only snap when within this many CSS pixels. */
export const LITRPG_SNAP_THRESHOLD = 6
export const LITRPG_SNAP_PREF_KEY = 'typesetly:litrpg-snap-to-grid'

export interface LitRpgSnapGuides {
  vertical: number[]
  horizontal: number[]
}

export function readLitRpgSnapPref(): boolean {
  try {
    return localStorage.getItem(LITRPG_SNAP_PREF_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeLitRpgSnapPref(enabled: boolean) {
  try {
    localStorage.setItem(LITRPG_SNAP_PREF_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('typesetly:litrpg-snap-pref', { detail: enabled }))
  }
}

function collectGridTargets(extent: number, gridSize: number) {
  const targets: number[] = [0]
  if (extent <= 0 || gridSize <= 0) return targets
  const last = Math.ceil(extent / gridSize) * gridSize
  for (let value = gridSize; value <= last; value += gridSize) targets.push(value)
  return targets
}

function collectSiblingAxisTargets(
  siblings: readonly LitRpgElementLayout[],
  canvasWidth: number,
  axis: 'x' | 'y',
) {
  const targets: number[] = []
  for (const sibling of siblings) {
    if (axis === 'x') {
      const left = (sibling.x / 100) * canvasWidth
      const width = (sibling.width / 100) * canvasWidth
      targets.push(left, left + width / 2, left + width)
    } else {
      targets.push(sibling.y, sibling.y + sibling.height / 2, sibling.y + sibling.height)
    }
  }
  return targets
}

function nearestSoftSnap(
  points: readonly number[],
  targets: readonly number[],
  threshold: number,
): { delta: number; guide: number } | null {
  let best: { delta: number; guide: number; distance: number } | null = null
  for (const point of points) {
    for (const target of targets) {
      const delta = target - point
      const distance = Math.abs(delta)
      if (distance > threshold) continue
      if (!best || distance < best.distance) {
        best = { delta, guide: target, distance }
      }
    }
  }
  return best ? { delta: best.delta, guide: best.guide } : null
}

/**
 * Soft (threshold) snap for freeform fields: pulls edges/centers toward the
 * 16px canvas grid and sibling edges/centers only when within the magnet range.
 */
export function softSnapLitRpgLayout(options: {
  layout: LitRpgElementLayout
  mode: 'move' | 'resize'
  canvasWidth: number
  canvasHeight: number
  siblings?: readonly LitRpgElementLayout[]
  gridSize?: number
  threshold?: number
}): { layout: LitRpgElementLayout; guides: LitRpgSnapGuides } {
  const {
    layout,
    mode,
    canvasWidth,
    canvasHeight,
    siblings = [],
    gridSize = LITRPG_FREEFORM_GRID_SIZE,
    threshold = LITRPG_SNAP_THRESHOLD,
  } = options
  const widthPx = Math.max(1, canvasWidth)
  const left = (layout.x / 100) * widthPx
  const width = (layout.width / 100) * widthPx
  const right = left + width
  const top = layout.y
  const bottom = layout.y + layout.height
  const verticalTargets = [
    ...collectGridTargets(widthPx, gridSize),
    ...collectSiblingAxisTargets(siblings, widthPx, 'x'),
  ]
  const horizontalTargets = [
    ...collectGridTargets(Math.max(canvasHeight, bottom + gridSize), gridSize),
    ...collectSiblingAxisTargets(siblings, widthPx, 'y'),
  ]
  const guides: LitRpgSnapGuides = { vertical: [], horizontal: [] }

  if (mode === 'move') {
    const xSnap = nearestSoftSnap(
      [left, left + width / 2, right],
      verticalTargets,
      threshold,
    )
    const ySnap = nearestSoftSnap(
      [top, top + layout.height / 2, bottom],
      horizontalTargets,
      threshold,
    )
    let nextX = layout.x
    let nextY = layout.y
    if (xSnap) {
      nextX = ((left + xSnap.delta) / widthPx) * 100
      guides.vertical.push(xSnap.guide)
    }
    if (ySnap) {
      nextY = top + ySnap.delta
      guides.horizontal.push(ySnap.guide)
    }
    const widthPct = layout.width
    return {
      layout: {
        ...layout,
        x: Math.min(100 - widthPct, Math.max(0, nextX)),
        y: Math.max(0, nextY),
      },
      guides,
    }
  }

  const rightSnap = nearestSoftSnap([right], verticalTargets, threshold)
  const bottomSnap = nearestSoftSnap([bottom], horizontalTargets, threshold)
  let nextWidth = layout.width
  let nextHeight = layout.height
  if (rightSnap) {
    nextWidth = Math.max(8, ((width + rightSnap.delta) / widthPx) * 100)
    guides.vertical.push(rightSnap.guide)
  }
  if (bottomSnap) {
    nextHeight = Math.max(24, layout.height + bottomSnap.delta)
    guides.horizontal.push(bottomSnap.guide)
  }
  return {
    layout: {
      ...layout,
      width: Math.min(100 - layout.x, nextWidth),
      height: nextHeight,
    },
    guides,
  }
}

export function decodeLitRpgElementLayouts(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, LitRpgElementLayout>
      : {}
  } catch {
    return {}
  }
}

export const LITRPG_BLOCK_PRESETS: ReadonlyArray<{
  kind: LitRpgBlockKind
  label: string
  description: string
  draft: LitRpgBlockDraft
}> = [
  {
    kind: 'stat-screen',
    label: 'Stat screen',
    description: 'Attributes, resources, levels, and character progression.',
    draft: {
      kind: 'stat-screen',
      title: 'Character Status',
      subtitle: 'Level 1 Adventurer',
      columns: ['Attribute', 'Value'],
      columnWidths: [50, 50],
      rows: [
        { cells: ['Strength', '10'] },
        { cells: ['Agility', '10'] },
        { cells: ['Vitality', '10'] },
        { cells: ['Mana', '100 / 100'] },
      ],
      footer: 'Unspent attribute points: 0',
      appearance: 'panel',
      density: 'comfortable',
      width: 'full',
      widthPercent: 100,
      alignment: 'center',
      layoutMode: 'freeform',
      canvasHeight: 354,
      elementLayouts: {},
      borderRadius: 8,
      borderWidth: 1,
      backgroundOpacity: 100,
      cellPadding: 8,
      accent: '#5eead4',
      background: '#102a2d',
      textColor: '#ecfeff',
      border: '#2dd4bf',
      showColumnHeaders: true,
      stripedRows: true,
      showCellBorders: true,
    },
  },
  {
    kind: 'system-message',
    label: 'System message',
    description: 'Notifications, warnings, quests, and achievements.',
    draft: {
      kind: 'system-message',
      title: 'SYSTEM NOTIFICATION',
      subtitle: 'Quest Updated',
      columns: ['Message'],
      columnWidths: [100],
      rows: [{ cells: ['Survive until dawn.'] }],
      footer: '',
      appearance: 'terminal',
      density: 'compact',
      width: 'compact',
      widthPercent: 74,
      alignment: 'center',
      layoutMode: 'freeform',
      canvasHeight: 220,
      elementLayouts: {},
      borderRadius: 2,
      borderWidth: 1,
      backgroundOpacity: 92,
      cellPadding: 7,
      accent: '#86efac',
      background: '#0a170f',
      textColor: '#dcfce7',
      border: '#22c55e',
      showColumnHeaders: false,
      stripedRows: false,
      showCellBorders: true,
    },
  },
  {
    kind: 'skill-selection',
    label: 'Skill selection',
    description: 'Present skills, ranks, costs, and selectable effects.',
    draft: {
      kind: 'skill-selection',
      title: 'Choose a Skill',
      subtitle: 'One selection available',
      columns: ['Skill', 'Rank', 'Effect'],
      columnWidths: [34, 20, 46],
      rows: [
        { cells: ['Power Strike', 'Common', '+25% melee damage'] },
        { cells: ['Quick Step', 'Uncommon', '+15% movement speed'] },
        { cells: ['Arcane Sight', 'Rare', 'Reveal hidden mana'] },
      ],
      footer: 'Selection cannot be changed.',
      appearance: 'ornate',
      density: 'comfortable',
      width: 'full',
      widthPercent: 100,
      alignment: 'center',
      layoutMode: 'freeform',
      canvasHeight: 350,
      elementLayouts: {},
      borderRadius: 14,
      borderWidth: 3,
      backgroundOpacity: 96,
      cellPadding: 9,
      accent: '#c4b5fd',
      background: '#241b35',
      textColor: '#f5f3ff',
      border: '#8b5cf6',
      showColumnHeaders: true,
      stripedRows: true,
      showCellBorders: true,
    },
  },
  {
    kind: 'item-info',
    label: 'Item information',
    description: 'Equipment, rarity, effects, requirements, and flavor text.',
    draft: {
      kind: 'item-info',
      title: 'Ironfang Blade',
      subtitle: 'Rare - One-Handed Sword',
      columns: ['Property', 'Details'],
      columnWidths: [36, 64],
      rows: [
        { cells: ['Damage', '18–24'] },
        { cells: ['Requirement', 'Strength 12'] },
        { cells: ['Effect', '+5% critical chance'] },
      ],
      footer: '"It remembers every battle."',
      appearance: 'minimal',
      density: 'comfortable',
      width: 'compact',
      widthPercent: 78,
      alignment: 'center',
      layoutMode: 'freeform',
      canvasHeight: 310,
      elementLayouts: {},
      borderRadius: 0,
      borderWidth: 4,
      backgroundOpacity: 88,
      cellPadding: 8,
      accent: '#fbbf24',
      background: '#fffbeb',
      textColor: '#3f2d0c',
      border: '#d97706',
      showColumnHeaders: true,
      stripedRows: false,
      showCellBorders: true,
    },
  },
]

export function litRpgPreset(kind: LitRpgBlockKind): LitRpgBlockDraft {
  const preset = LITRPG_BLOCK_PRESETS.find((item) => item.kind === kind)
    || LITRPG_BLOCK_PRESETS[0]
  const draft = structuredClone(preset.draft)
  draft.elementLayouts = normalizeLitRpgElementLayouts({}, draft.columns, draft.rows)
  return draft
}

export function normalizeLitRpgDraft(input: Partial<LitRpgBlockDraft>): LitRpgBlockDraft {
  const kind = LITRPG_BLOCK_PRESETS.some((item) => item.kind === input.kind)
    ? input.kind as LitRpgBlockKind
    : 'stat-screen'
  const fallback = litRpgPreset(kind)
  const columns = (Array.isArray(input.columns) ? input.columns : fallback.columns)
    .slice(0, MAX_COLUMNS)
    .map((column, index) => cleanText(column, `Column ${index + 1}`) || `Column ${index + 1}`)
  if (!columns.length) columns.push('Value')
  const sourceRows = Array.isArray(input.rows) ? input.rows : fallback.rows
  const rows = sourceRows.slice(0, MAX_ROWS).map((row) => ({
    cells: columns.map((_, index) => cleanText(row?.cells?.[index])),
  }))
  if (!rows.length) rows.push({ cells: columns.map(() => '') })
  const elementLayouts = normalizeLitRpgElementLayouts(input.elementLayouts, columns, rows)
  const minimumCanvasHeight = Math.max(
    160,
    ...Object.values(elementLayouts).map((layout) => layout.y + layout.height + 18),
  )
  const widthFallback = input.widthPercent == null
    ? input.width === 'compact'
      ? 78
      : input.width === 'full'
        ? 100
        : fallback.widthPercent
    : fallback.widthPercent

  return {
    kind,
    title: cleanText(input.title, fallback.title),
    subtitle: cleanText(input.subtitle),
    columns,
    columnWidths: normalizeLitRpgColumnWidths(input.columnWidths, columns.length),
    rows,
    footer: cleanText(input.footer),
    appearance: ['panel', 'terminal', 'minimal', 'ornate'].includes(input.appearance || '')
      ? input.appearance as LitRpgAppearance
      : fallback.appearance,
    density: input.density === 'compact' ? 'compact' : 'comfortable',
    width: input.width === 'compact' ? 'compact' : 'full',
    widthPercent: numberWithin(input.widthPercent, 30, 100, widthFallback),
    alignment: ['left', 'center', 'right'].includes(input.alignment || '')
      ? input.alignment as LitRpgAlignment
      : fallback.alignment,
    layoutMode: input.layoutMode === 'table' ? 'table' : 'freeform',
    canvasHeight: Math.max(
      minimumCanvasHeight,
      numberWithin(input.canvasHeight, 160, 2000, fallback.canvasHeight),
    ),
    elementLayouts,
    borderRadius: numberWithin(input.borderRadius, 0, 40, fallback.borderRadius),
    borderWidth: numberWithin(input.borderWidth, 0, 8, fallback.borderWidth),
    backgroundOpacity: numberWithin(input.backgroundOpacity, 0, 100, fallback.backgroundOpacity),
    cellPadding: numberWithin(input.cellPadding, 3, 24, fallback.cellPadding),
    accent: safeColor(input.accent || '', fallback.accent),
    background: safeColor(input.background || '', fallback.background),
    textColor: safeColor(input.textColor || '', fallback.textColor),
    border: safeColor(input.border || '', fallback.border),
    showColumnHeaders: input.showColumnHeaders ?? fallback.showColumnHeaders,
    stripedRows: input.stripedRows ?? fallback.stripedRows,
    showCellBorders: input.showCellBorders ?? true,
  }
}

export function encodeLitRpgTable(value: string[] | number[] | LitRpgRow[]) {
  return JSON.stringify(value)
}

export function decodeLitRpgColumnWidths(value: unknown): number[] {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map((item) => Number(item)) : []
  } catch {
    return []
  }
}

export function decodeLitRpgColumns(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

export function decodeLitRpgRows(value: unknown): LitRpgRow[] {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    if (!Array.isArray(parsed)) return []
    return parsed.map((row) => ({
      cells: Array.isArray(row?.cells) ? row.cells.map((cell: unknown) => String(cell)) : [],
    }))
  } catch {
    return []
  }
}

export function litRpgDraftFromAttrs(attrs: Record<string, unknown>): LitRpgBlockDraft {
  const showHeaders = attrs.showColumnHeaders ?? attrs.showHeaders
  const stripedRows = attrs.stripedRows
  const showCellBorders = attrs.showCellBorders
  return normalizeLitRpgDraft({
    kind: attrs.kind as LitRpgBlockKind,
    title: String(attrs.title || ''),
    subtitle: String(attrs.subtitle || ''),
    columns: decodeLitRpgColumns(attrs.columns),
    columnWidths: decodeLitRpgColumnWidths(attrs.columnWidths),
    rows: decodeLitRpgRows(attrs.rows),
    footer: String(attrs.footer || ''),
    appearance: attrs.appearance as LitRpgAppearance,
    density: attrs.density as LitRpgDensity,
    width: attrs.width as LitRpgWidth,
    widthPercent: Number(attrs.widthPercent),
    alignment: attrs.alignment as LitRpgAlignment,
    layoutMode: attrs.layoutMode as LitRpgLayoutMode,
    canvasHeight: Number(attrs.canvasHeight),
    elementLayouts: decodeLitRpgElementLayouts(attrs.elementLayouts),
    borderRadius: Number(attrs.borderRadius),
    borderWidth: Number(attrs.borderWidth),
    backgroundOpacity: Number(attrs.backgroundOpacity),
    cellPadding: Number(attrs.cellPadding),
    accent: String(attrs.accent || ''),
    background: String(attrs.background || ''),
    textColor: String(attrs.textColor || ''),
    border: String(attrs.border || ''),
    showColumnHeaders: showHeaders !== false && showHeaders !== 'false',
    stripedRows: stripedRows === true || stripedRows === 'true',
    showCellBorders: showCellBorders !== false && showCellBorders !== 'false',
  })
}

export function buildLitRpgBlockNode(
  input: Partial<LitRpgBlockDraft> & LitRpgBlockProvenance,
) {
  const draft = normalizeLitRpgDraft(input)
  return {
    type: 'litrpgBlock',
    attrs: {
      ...draft,
      columns: encodeLitRpgTable(draft.columns),
      columnWidths: encodeLitRpgTable(draft.columnWidths),
      rows: encodeLitRpgTable(draft.rows),
      elementLayouts: JSON.stringify(draft.elementLayouts),
      sourceScreenId: String(input.sourceScreenId || ''),
      sourceTemplateId: String(input.sourceTemplateId || ''),
      revision: String(input.revision || ''),
    },
  }
}

export function moveLitRpgRow(
  rows: LitRpgRow[],
  rowIndex: number,
  direction: -1 | 1,
) {
  const destination = rowIndex + direction
  if (rowIndex < 0 || rowIndex >= rows.length || destination < 0 || destination >= rows.length) {
    return rows
  }
  const next = rows.map((row) => ({ cells: [...row.cells] }))
  ;[next[rowIndex], next[destination]] = [next[destination], next[rowIndex]]
  return next
}

export function moveLitRpgColumn(
  columns: string[],
  rows: LitRpgRow[],
  columnIndex: number,
  direction: -1 | 1,
  columnWidths = normalizeLitRpgColumnWidths([], columns.length),
) {
  const destination = columnIndex + direction
  if (
    columnIndex < 0
    || columnIndex >= columns.length
    || destination < 0
    || destination >= columns.length
  ) return { columns, rows, columnWidths }

  const nextColumns = [...columns]
  ;[nextColumns[columnIndex], nextColumns[destination]] = [
    nextColumns[destination],
    nextColumns[columnIndex],
  ]
  const nextRows = rows.map((row) => {
    const cells = columns.map((_, index) => row.cells[index] || '')
    ;[cells[columnIndex], cells[destination]] = [cells[destination], cells[columnIndex]]
    return { cells }
  })
  const nextWidths = normalizeLitRpgColumnWidths(columnWidths, columns.length)
  ;[nextWidths[columnIndex], nextWidths[destination]] = [
    nextWidths[destination],
    nextWidths[columnIndex],
  ]
  return { columns: nextColumns, rows: nextRows, columnWidths: nextWidths }
}

export function replaceLitRpgBlockRange(
  editor: Editor,
  range: { from: number; to: number },
  nodeJson: ReturnType<typeof buildLitRpgBlockNode>,
) {
  const maximum = editor.state.doc.content.size
  const from = Math.max(0, Math.min(range.from, maximum))
  const to = Math.max(from, Math.min(range.to, maximum))
  const node = editor.state.schema.nodeFromJSON(nodeJson)
  editor.view.dispatch(editor.state.tr.replaceRangeWith(from, to, node).scrollIntoView())
  return true
}
