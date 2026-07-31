import { Extension, Mark, mergeAttributes, Node } from '@tiptap/core'
import {
  colorWithOpacity,
  decodeLitRpgColumns,
  decodeLitRpgColumnWidths,
  decodeLitRpgRows,
} from './litrpg.ts'

function styleMark(name: string, style: string, tag = 'span') {
  return Mark.create({
    name,
    parseHTML: () => [
      { tag: `${tag}[data-typesetly-mark="${name}"]` },
      { style },
    ],
    renderHTML: ({ HTMLAttributes }) => [
      tag,
      mergeAttributes(HTMLAttributes, { 'data-typesetly-mark': name, style }),
      0,
    ],
  })
}

export const SmallCaps = styleMark('smallCaps', 'font-variant: small-caps')
export const SansSerif = styleMark('sansSerif', 'font-family: sans-serif')
export const Monospace = styleMark('monospace', 'font-family: monospace')
export const Subscript = styleMark('subscript', 'vertical-align: sub; font-size: 0.8em', 'sub')
export const SuperscriptText = styleMark('superscriptText', 'vertical-align: super; font-size: 0.8em', 'sup')

/**
 * Draft-only marker for a paragraph that continues from the preceding page.
 * `joinChapterPages` removes the artificial page seam before persistence.
 */
export const PageContinuation = Extension.create({
  name: 'pageContinuation',
  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        pageContinuation: {
          default: false,
          parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-typesetly-page-continuation') === 'true',
          renderHTML: (attributes: Record<string, unknown>) =>
            attributes.pageContinuation
              ? { 'data-typesetly-page-continuation': 'true' }
              : {},
        },
        pageContinuationSpace: {
          default: false,
          parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-typesetly-page-space') === 'true',
          renderHTML: (attributes: Record<string, unknown>) =>
            attributes.pageContinuationSpace
              ? { 'data-typesetly-page-space': 'true' }
              : {},
        },
      },
    }]
  },
})

const textAppearanceAttribute = (cssProperty: keyof CSSStyleDeclaration) => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.style[cssProperty] || null,
})

/**
 * Stores flexible character-level typography without baking it into the book
 * theme. These inline styles survive HTML/EPUB output and are translated by
 * the editable DOCX exporter where the target format supports them.
 */
export const TextAppearance = Mark.create({
  name: 'textAppearance',
  addAttributes() {
    return {
      fontFamily: textAppearanceAttribute('fontFamily'),
      fontSize: textAppearanceAttribute('fontSize'),
      color: textAppearanceAttribute('color'),
      backgroundColor: textAppearanceAttribute('backgroundColor'),
      letterSpacing: textAppearanceAttribute('letterSpacing'),
      textTransform: textAppearanceAttribute('textTransform'),
    }
  },
  parseHTML: () => [
    { tag: 'span[data-typesetly-mark="textAppearance"]' },
  ],
  renderHTML: ({ HTMLAttributes }) => {
    const {
      fontFamily,
      fontSize,
      color,
      backgroundColor,
      letterSpacing,
      textTransform,
      ...rest
    } = HTMLAttributes
    const style = [
      fontFamily && `font-family:${fontFamily}`,
      fontSize && `font-size:${fontSize}`,
      color && `color:${color}`,
      backgroundColor && `background-color:${backgroundColor}`,
      letterSpacing && `letter-spacing:${letterSpacing}`,
      textTransform && `text-transform:${textTransform}`,
    ].filter(Boolean).join(';')
    return [
      'span',
      mergeAttributes(rest, {
        'data-typesetly-mark': 'textAppearance',
        style,
      }),
      0,
    ]
  },
})

function styledBlock(name: string, tag: string) {
  return Node.create({
    name,
    group: 'block',
    content: 'block+',
    defining: true,
    addAttributes() {
      return { attribution: { default: '' } }
    },
    parseHTML: () => [
      { tag: `${tag}[data-typesetly-node="${name}"]` },
    ],
    renderHTML: ({ node, HTMLAttributes }) => [
      tag,
      mergeAttributes(HTMLAttributes, {
        'data-typesetly-node': name,
        'data-attribution': node.attrs.attribution,
        class: `styled-block ${name}`,
      }),
      0,
    ],
  })
}

export const VerseBlock = styledBlock('verse', 'div')
export const HangingIndentBlock = styledBlock('hangingIndent', 'div')
export const AttributedQuote = styledBlock('attributedQuote', 'blockquote')

export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  parseHTML: () => [
    { tag: 'hr[data-typesetly-node="scene-break"]' },
    { tag: 'hr' },
  ],
  renderHTML: ({ HTMLAttributes }) => [
    'hr',
    mergeAttributes(HTMLAttributes, { 'data-typesetly-node': 'scene-break' }),
  ],
})

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  parseHTML: () => [
    { tag: 'div[data-typesetly-node="page-break"]' },
  ],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, {
      'data-typesetly-node': 'page-break',
      role: 'separator',
      'aria-label': 'Page break',
    }),
  ],
})

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: { default: null },
      text: { default: '' },
    }
  },
  parseHTML: () => [
    { tag: 'span[data-typesetly-node="footnote"]' },
  ],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, {
      'data-typesetly-node': 'footnote',
      'data-note-id': node.attrs.id,
      'data-note-text': node.attrs.text,
      class: 'footnote-token',
      title: node.attrs.text,
    }),
    ['sup', {}, '1'],
  ],
})

export const Callout = Node.create({
  name: 'callout',
  priority: 1000,
  group: 'block',
  content: 'paragraph+',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      variant: {
        default: 'callout',
        parseHTML: (element) => element.getAttribute('data-variant') || 'callout',
      },
      sender: { default: '', parseHTML: (element) => element.getAttribute('data-sender') || '' },
      direction: { default: 'outgoing', parseHTML: (element) => element.getAttribute('data-direction') || 'outgoing' },
      theme: { default: 'ios', parseHTML: (element) => element.getAttribute('data-theme') || 'ios' },
      background: { default: '#f2f6fa', parseHTML: (element) => element.getAttribute('data-background') || '#f2f6fa' },
      border: { default: '#9aa7b2', parseHTML: (element) => element.getAttribute('data-border') || '#9aa7b2' },
    }
  },
  parseHTML: () => [
    { tag: 'div[data-typesetly-node="callout"]' },
    { tag: 'blockquote[data-typesetly-node="callout"]' },
  ],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, {
      'data-typesetly-node': 'callout',
      'data-variant': node.attrs.variant,
      'data-sender': node.attrs.sender,
      'data-direction': node.attrs.direction,
      'data-theme': node.attrs.theme,
      'data-background': node.attrs.background,
      'data-border': node.attrs.border,
      style: `--callout-bg:${node.attrs.background};--callout-border:${node.attrs.border}`,
      class: node.attrs.variant === 'message' ? 'callout text-message' : 'callout',
    }),
    0,
  ],
})

export const LitRpgBlock = Node.create({
  name: 'litrpgBlock',
  priority: 1000,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      kind: { default: 'stat-screen', parseHTML: (element) => element.getAttribute('data-kind') || 'stat-screen' },
      title: { default: 'Character Status', parseHTML: (element) => element.getAttribute('data-title') || '' },
      subtitle: { default: '', parseHTML: (element) => element.getAttribute('data-subtitle') || '' },
      columns: { default: '["Attribute","Value"]', parseHTML: (element) => element.getAttribute('data-columns') || '[]' },
      columnWidths: { default: '[50,50]', parseHTML: (element) => element.getAttribute('data-column-widths') || '[]' },
      rows: { default: '[]', parseHTML: (element) => element.getAttribute('data-rows') || '[]' },
      footer: { default: '', parseHTML: (element) => element.getAttribute('data-footer') || '' },
      appearance: { default: 'panel', parseHTML: (element) => element.getAttribute('data-appearance') || 'panel' },
      density: { default: 'comfortable', parseHTML: (element) => element.getAttribute('data-density') || 'comfortable' },
      width: { default: 'full', parseHTML: (element) => element.getAttribute('data-width') || 'full' },
      widthPercent: { default: 100, parseHTML: (element) => Number(element.getAttribute('data-width-percent') || 100) },
      alignment: { default: 'center', parseHTML: (element) => element.getAttribute('data-alignment') || 'center' },
      borderRadius: { default: 8, parseHTML: (element) => Number(element.getAttribute('data-border-radius') || 8) },
      borderWidth: { default: 1, parseHTML: (element) => Number(element.getAttribute('data-border-width') || 1) },
      backgroundOpacity: { default: 100, parseHTML: (element) => Number(element.getAttribute('data-background-opacity') || 100) },
      cellPadding: { default: 8, parseHTML: (element) => Number(element.getAttribute('data-cell-padding') || 8) },
      accent: { default: '#5eead4', parseHTML: (element) => element.getAttribute('data-accent') || '#5eead4' },
      background: { default: '#102a2d', parseHTML: (element) => element.getAttribute('data-background') || '#102a2d' },
      textColor: { default: '#ecfeff', parseHTML: (element) => element.getAttribute('data-text-color') || '#ecfeff' },
      border: { default: '#2dd4bf', parseHTML: (element) => element.getAttribute('data-border') || '#2dd4bf' },
      showColumnHeaders: { default: true, parseHTML: (element) => element.getAttribute('data-show-headers') !== 'false' },
      stripedRows: { default: true, parseHTML: (element) => element.getAttribute('data-striped-rows') !== 'false' },
    }
  },
  parseHTML: () => [{ tag: 'div[data-typesetly-node="litrpg-block"]' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const columns = decodeLitRpgColumns(node.attrs.columns)
    const columnWidths = decodeLitRpgColumnWidths(node.attrs.columnWidths)
    const rows = decodeLitRpgRows(node.attrs.rows)
    const heading = ['div', { class: 'litrpg-block-heading' },
      ['strong', { class: 'litrpg-block-title' }, node.attrs.title || 'LitRPG Block'],
      ...(node.attrs.subtitle
        ? [['span', { class: 'litrpg-block-subtitle' }, node.attrs.subtitle]]
        : []),
    ]
    const tableChildren = [
      ...(node.attrs.showColumnHeaders
        ? [['thead', {}, ['tr', {}, ...columns.map((column) => ['th', {}, column])]]]
        : []),
      ['tbody', {}, ...rows.map((row) => [
        'tr',
        {},
        ...columns.map((_, index) => ['td', {}, row.cells[index] || '']),
      ])],
    ]
    const children = [
      heading,
      ['table', { class: 'litrpg-block-table' },
        ['colgroup', {}, ...columns.map((_, index) => [
          'col',
          { style: `width:${columnWidths[index] || (100 / Math.max(1, columns.length))}%` },
        ])],
        ...tableChildren,
      ],
      ...(node.attrs.footer
        ? [['div', { class: 'litrpg-block-footer' }, node.attrs.footer]]
        : []),
    ]

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-typesetly-node': 'litrpg-block',
        'data-kind': node.attrs.kind,
        'data-title': node.attrs.title,
        'data-subtitle': node.attrs.subtitle,
        'data-columns': node.attrs.columns,
        'data-column-widths': node.attrs.columnWidths,
        'data-rows': node.attrs.rows,
        'data-footer': node.attrs.footer,
        'data-appearance': node.attrs.appearance,
        'data-density': node.attrs.density,
        'data-width': node.attrs.width,
        'data-width-percent': String(node.attrs.widthPercent),
        'data-alignment': node.attrs.alignment,
        'data-border-radius': String(node.attrs.borderRadius),
        'data-border-width': String(node.attrs.borderWidth),
        'data-background-opacity': String(node.attrs.backgroundOpacity),
        'data-cell-padding': String(node.attrs.cellPadding),
        'data-accent': node.attrs.accent,
        'data-background': node.attrs.background,
        'data-text-color': node.attrs.textColor,
        'data-border': node.attrs.border,
        'data-show-headers': String(node.attrs.showColumnHeaders),
        'data-striped-rows': String(node.attrs.stripedRows),
        class: 'litrpg-block',
        style: `--litrpg-accent:${node.attrs.accent};--litrpg-bg:${node.attrs.background};--litrpg-bg-alpha:${colorWithOpacity(node.attrs.background, node.attrs.backgroundOpacity)};--litrpg-text:${node.attrs.textColor};--litrpg-border:${node.attrs.border};--litrpg-width:${node.attrs.widthPercent}%;--litrpg-radius:${node.attrs.borderRadius}px;--litrpg-border-width:${node.attrs.borderWidth}px;--litrpg-cell-padding:${node.attrs.cellPadding}px`,
      }),
      ...children,
    ]
  },
})

export const ManuscriptImage = Node.create({
  name: 'manuscriptImage',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      title: { default: null },
      caption: { default: '', parseHTML: (element) => element.getAttribute('data-caption') || '' },
      layout: { default: 'inline', parseHTML: (element) => element.getAttribute('data-layout') || 'inline' },
      width: { default: 100, parseHTML: (element) => Number(element.getAttribute('data-width') || 100) },
      link: { default: '', parseHTML: (element) => element.getAttribute('data-link') || '' },
      decorative: { default: false, parseHTML: (element) => element.getAttribute('data-decorative') === 'true' },
      naturalWidth: { default: 0, parseHTML: (element) => Number(element.getAttribute('data-natural-width') || 0) },
      naturalHeight: { default: 0, parseHTML: (element) => Number(element.getAttribute('data-natural-height') || 0) },
      bytes: { default: 0, parseHTML: (element) => Number(element.getAttribute('data-bytes') || 0) },
      focalX: { default: 50, parseHTML: (element) => Number(element.getAttribute('data-focal-x') || 50) },
      focalY: { default: 50, parseHTML: (element) => Number(element.getAttribute('data-focal-y') || 50) },
    }
  },
  parseHTML: () => [{ tag: 'img[src]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'img',
    mergeAttributes(HTMLAttributes, {
      'data-typesetly-node': 'image',
      'data-caption': HTMLAttributes.caption,
      'data-layout': HTMLAttributes.layout,
      'data-width': HTMLAttributes.width,
      'data-link': HTMLAttributes.link,
      'data-decorative': HTMLAttributes.decorative,
      'data-natural-width': HTMLAttributes.naturalWidth,
      'data-natural-height': HTMLAttributes.naturalHeight,
      'data-bytes': HTMLAttributes.bytes,
      'data-focal-x': HTMLAttributes.focalX,
      'data-focal-y': HTMLAttributes.focalY,
      style: `width:${HTMLAttributes.width || 100}%;object-position:${HTMLAttributes.focalX || 50}% ${HTMLAttributes.focalY || 50}%`,
    }),
  ],
})
