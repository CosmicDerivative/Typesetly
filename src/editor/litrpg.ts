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
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const MAX_COLUMNS = 4
const MAX_ROWS = 100

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
    },
  },
  {
    kind: 'item-info',
    label: 'Item information',
    description: 'Equipment, rarity, effects, requirements, and flavor text.',
    draft: {
      kind: 'item-info',
      title: 'Ironfang Blade',
      subtitle: 'Rare • One-Handed Sword',
      columns: ['Property', 'Details'],
      columnWidths: [36, 64],
      rows: [
        { cells: ['Damage', '18–24'] },
        { cells: ['Requirement', 'Strength 12'] },
        { cells: ['Effect', '+5% critical chance'] },
      ],
      footer: '“It remembers every battle.”',
      appearance: 'minimal',
      density: 'comfortable',
      width: 'compact',
      widthPercent: 78,
      alignment: 'center',
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
    },
  },
]

export function litRpgPreset(kind: LitRpgBlockKind): LitRpgBlockDraft {
  const preset = LITRPG_BLOCK_PRESETS.find((item) => item.kind === kind)
    || LITRPG_BLOCK_PRESETS[0]
  return structuredClone(preset.draft)
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
  })
}

export function buildLitRpgBlockNode(input: Partial<LitRpgBlockDraft>) {
  const draft = normalizeLitRpgDraft(input)
  return {
    type: 'litrpgBlock',
    attrs: {
      ...draft,
      columns: encodeLitRpgTable(draft.columns),
      columnWidths: encodeLitRpgTable(draft.columnWidths),
      rows: encodeLitRpgTable(draft.rows),
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
