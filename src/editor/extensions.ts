import { Mark, mergeAttributes, Node } from '@tiptap/core'

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
