import type { Editor } from '@tiptap/core'

export type LitRpgBlockKind =
  | 'stat-screen'
  | 'system-message'
  | 'skill-selection'
  | 'item-info'

export type LitRpgAppearance = 'panel' | 'terminal' | 'minimal' | 'ornate'
export type LitRpgDensity = 'compact' | 'comfortable'
export type LitRpgWidth = 'compact' | 'full'

export interface LitRpgRow {
  cells: string[]
}

export interface LitRpgBlockDraft {
  kind: LitRpgBlockKind
  title: string
  subtitle: string
  columns: string[]
  rows: LitRpgRow[]
  footer: string
  appearance: LitRpgAppearance
  density: LitRpgDensity
  width: LitRpgWidth
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
      rows: [{ cells: ['Survive until dawn.'] }],
      footer: '',
      appearance: 'terminal',
      density: 'compact',
      width: 'compact',
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
      rows: [
        { cells: ['Power Strike', 'Common', '+25% melee damage'] },
        { cells: ['Quick Step', 'Uncommon', '+15% movement speed'] },
        { cells: ['Arcane Sight', 'Rare', 'Reveal hidden mana'] },
      ],
      footer: 'Selection cannot be changed.',
      appearance: 'ornate',
      density: 'comfortable',
      width: 'full',
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
      rows: [
        { cells: ['Damage', '18–24'] },
        { cells: ['Requirement', 'Strength 12'] },
        { cells: ['Effect', '+5% critical chance'] },
      ],
      footer: '“It remembers every battle.”',
      appearance: 'minimal',
      density: 'comfortable',
      width: 'compact',
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

  return {
    kind,
    title: cleanText(input.title, fallback.title),
    subtitle: cleanText(input.subtitle),
    columns,
    rows,
    footer: cleanText(input.footer),
    appearance: ['panel', 'terminal', 'minimal', 'ornate'].includes(input.appearance || '')
      ? input.appearance as LitRpgAppearance
      : fallback.appearance,
    density: input.density === 'compact' ? 'compact' : 'comfortable',
    width: input.width === 'compact' ? 'compact' : 'full',
    accent: safeColor(input.accent || '', fallback.accent),
    background: safeColor(input.background || '', fallback.background),
    textColor: safeColor(input.textColor || '', fallback.textColor),
    border: safeColor(input.border || '', fallback.border),
    showColumnHeaders: input.showColumnHeaders ?? fallback.showColumnHeaders,
    stripedRows: input.stripedRows ?? fallback.stripedRows,
  }
}

export function encodeLitRpgTable(value: string[] | LitRpgRow[]) {
  return JSON.stringify(value)
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
    rows: decodeLitRpgRows(attrs.rows),
    footer: String(attrs.footer || ''),
    appearance: attrs.appearance as LitRpgAppearance,
    density: attrs.density as LitRpgDensity,
    width: attrs.width as LitRpgWidth,
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
) {
  const destination = columnIndex + direction
  if (
    columnIndex < 0
    || columnIndex >= columns.length
    || destination < 0
    || destination >= columns.length
  ) return { columns, rows }

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
  return { columns: nextColumns, rows: nextRows }
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
