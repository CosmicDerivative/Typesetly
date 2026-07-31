import {
  litRpgElementKey,
  type LitRpgBlockDraft,
  type LitRpgElementLayout,
} from '../editor/litrpg.ts'

/** Parse `#rrggbb` into 0-1 RGB channels for pdf-lib. */
export function litRpgRgb(hex: string, fallback = { r: 0.1, g: 0.1, b: 0.1 }) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return fallback
  const value = Number.parseInt(match[1], 16)
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  }
}

/** Word/DOCX wants uppercase RRGGBB without `#`. */
export function litRpgWordColor(hex: string, fallback = '111111') {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  return match ? match[1].toUpperCase() : fallback
}

export function mixLitRpgRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  amount: number,
) {
  const t = Math.min(1, Math.max(0, amount))
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

/** Approximate translucent fill by mixing with paper white (DOCX has no alpha). */
export function litRpgOpaqueFill(
  background: string,
  backgroundOpacity: number,
  paper = { r: 1, g: 1, b: 1 },
) {
  const opacity = Math.min(1, Math.max(0, backgroundOpacity / 100))
  return mixLitRpgRgb(paper, litRpgRgb(background), opacity)
}

export function litRpgOpaqueWordFill(background: string, backgroundOpacity: number) {
  const mixed = litRpgOpaqueFill(background, backgroundOpacity)
  const channel = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0').toUpperCase()
  return `${channel(mixed.r)}${channel(mixed.g)}${channel(mixed.b)}`
}

/** Matches the builder checkbox: any opacity below 100% is translucent. */
export function litRpgIsTranslucent(
  block: Pick<LitRpgBlockDraft, 'backgroundOpacity'>,
  threshold = 100,
) {
  return (block.backgroundOpacity ?? 100) < threshold
}

export function litRpgTitleDisplay(block: Pick<LitRpgBlockDraft, 'title' | 'appearance'>) {
  const title = block.title || 'LitRPG Block'
  return block.appearance === 'minimal' ? title : title.toLocaleUpperCase()
}

export function litRpgColumnWidthFractions(block: Pick<LitRpgBlockDraft, 'columns' | 'columnWidths'>) {
  const count = Math.max(1, block.columns.length)
  const widths = block.columnWidths.slice(0, count)
  if (widths.length !== count || widths.some((width) => !(width > 0))) {
    return Array.from({ length: count }, () => 1 / count)
  }
  const total = widths.reduce((sum, width) => sum + width, 0)
  return widths.map((width) => width / total)
}

export type LitRpgExportFieldKind = 'title' | 'subtitle' | 'column' | 'cell' | 'footer'

export interface LitRpgExportField {
  key: string
  kind: LitRpgExportFieldKind
  text: string
  layout: LitRpgElementLayout
}

/** Flatten freeform placements for PDF/DOCX exporters. */
export function litRpgFreeformFields(
  block: LitRpgBlockDraft,
  options?: { preserveAuthoredCase?: boolean },
): LitRpgExportField[] {
  const fields: LitRpgExportField[] = []
  const push = (key: string, kind: LitRpgExportFieldKind, text: string) => {
    const layout = block.elementLayouts[key]
    if (!layout || !text) return
    fields.push({ key, kind, text, layout })
  }

  const authoredTitle = (block.title || 'LitRPG Block').trim() || 'LitRPG Block'
  push(
    litRpgElementKey.title,
    'title',
    options?.preserveAuthoredCase ? authoredTitle : litRpgTitleDisplay(block),
  )
  if (block.subtitle) push(litRpgElementKey.subtitle, 'subtitle', block.subtitle)
  block.columns.forEach((column, columnIndex) => {
    if (block.showColumnHeaders) {
      const label = (column || `Column ${columnIndex + 1}`).trim() || `Column ${columnIndex + 1}`
      push(
        litRpgElementKey.column(columnIndex),
        'column',
        options?.preserveAuthoredCase ? label : label.toLocaleUpperCase(),
      )
    }
    block.rows.forEach((row, rowIndex) => {
      const value = row.cells[columnIndex]?.trim() ? row.cells[columnIndex] : '-'
      push(litRpgElementKey.cell(rowIndex, columnIndex), 'cell', value)
    })
  })
  if (block.footer) push(litRpgElementKey.footer, 'footer', block.footer)
  return fields
}

/**
 * Group freeform fields into visual rows by canvas Y, left-to-right by X.
 * Keeps Attribute | Value (and other side-by-side fields) on the same band.
 */
export function litRpgFreeformBands(
  fields: LitRpgExportField[],
  yThreshold = 18,
): LitRpgExportField[][] {
  const sorted = [...fields].sort(
    (a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x,
  )
  const bands: LitRpgExportField[][] = []
  for (const field of sorted) {
    const band = bands.find((entry) => Math.abs(entry[0].layout.y - field.layout.y) <= yThreshold)
    if (band) {
      band.push(field)
      band.sort((a, b) => a.layout.x - b.layout.x)
    } else {
      bands.push([field])
    }
  }
  return bands
}

export function litRpgUsesBoxedFields(block: Pick<LitRpgBlockDraft, 'layoutMode'>) {
  return block.layoutMode !== 'table'
}

export type LitRpgManuscriptLineKind = 'title' | 'subtitle' | 'header' | 'row' | 'footer'

export interface LitRpgManuscriptLine {
  kind: LitRpgManuscriptLineKind
  text: string
}

/**
 * Authored-text snapshot for translucent / manuscript export.
 * Keeps spatial pairing (Attribute | Value on one band) without inventing
 * Attribute: / bullet chrome. Prefer `litRpgFreeformFields` / bands for layout.
 */
export function litRpgManuscriptLines(block: LitRpgBlockDraft): LitRpgManuscriptLine[] {
  if (block.layoutMode !== 'table') {
    const fields = litRpgFreeformFields(block, { preserveAuthoredCase: true })
    return litRpgFreeformBands(fields).map((band) => {
      const kind: LitRpgManuscriptLineKind = band.some((field) => field.kind === 'title')
        ? 'title'
        : band.some((field) => field.kind === 'subtitle')
          ? 'subtitle'
          : band.some((field) => field.kind === 'footer')
            ? 'footer'
            : band.some((field) => field.kind === 'column')
              ? 'header'
              : 'row'
      return { kind, text: band.map((field) => field.text).join('  ') }
    })
  }

  const lines: LitRpgManuscriptLine[] = []
  const title = (block.title || 'LitRPG Block').trim() || 'LitRPG Block'
  lines.push({ kind: 'title', text: title })
  if (block.subtitle.trim()) {
    lines.push({ kind: 'subtitle', text: block.subtitle.trim() })
  }

  const columns = block.columns.length ? block.columns : ['Value']
  if (block.showColumnHeaders) {
    lines.push({
      kind: 'header',
      text: columns.map((column, index) => (column || `Column ${index + 1}`).trim()).join('  '),
    })
  }

  for (const row of block.rows) {
    const cells = columns.map((_, index) => (row.cells[index]?.trim() ? row.cells[index].trim() : ''))
    if (cells.some(Boolean)) {
      lines.push({ kind: 'row', text: cells.join('  ') })
    }
  }

  if (block.footer.trim()) {
    lines.push({ kind: 'footer', text: block.footer.trim() })
  }
  return lines
}

/** Title text as shown for translucent / paper ink exports (no forced uppercase). */
export function litRpgAuthoredTitle(block: Pick<LitRpgBlockDraft, 'title'>) {
  return (block.title || 'LitRPG Block').trim() || 'LitRPG Block'
}

/** Freeform canvas markup with absolute field placement for EPUB / HTML export. */
export function litRpgFreeformExportMarkup(
  block: LitRpgBlockDraft,
  escapeXml: (value: string) => string,
) {
  const entries: Array<{ key: string; className: string; value: string }> = [
    { key: litRpgElementKey.title, className: 'is-title', value: block.title || 'LitRPG Block' },
    { key: litRpgElementKey.subtitle, className: 'is-subtitle', value: block.subtitle },
    ...block.columns.flatMap((column, columnIndex) => [
      ...(block.showColumnHeaders
        ? [{ key: litRpgElementKey.column(columnIndex), className: 'is-column', value: column }]
        : []),
      ...block.rows.map((row, rowIndex) => ({
        key: litRpgElementKey.cell(rowIndex, columnIndex),
        className: 'is-cell',
        value: row.cells[columnIndex] || '',
      })),
    ]),
    { key: litRpgElementKey.footer, className: 'is-footer', value: block.footer },
  ]
  const items = entries
    .filter((entry) => entry.value)
    .map((entry) => {
      const layout = block.elementLayouts[entry.key]
      if (!layout) return ''
      return `<div class="litrpg-freeform-item ${entry.className}" style="position:absolute;left:${layout.x}%;top:${layout.y}px;width:${layout.width}%;height:${layout.height}px">${escapeXml(entry.value)}</div>`
    })
    .join('')
  return `<div class="litrpg-freeform-canvas" style="position:relative;height:${block.canvasHeight}px">${items}</div>`
}

/** Dark ink for translucent manuscript export on paper (game light-on-dark colors would vanish). */
export function litRpgManuscriptInk() {
  return {
    title: { r: 0.12, g: 0.15, b: 0.2 },
    body: { r: 0.2, g: 0.24, b: 0.3 },
    muted: { r: 0.38, g: 0.42, b: 0.48 },
    border: { r: 0.42, g: 0.48, b: 0.55 },
  }
}

export function litRpgManuscriptWordInk() {
  return {
    title: '1F2937',
    body: '334155',
    muted: '64748B',
    border: '64748B',
  }
}
