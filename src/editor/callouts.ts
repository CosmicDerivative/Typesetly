import type { Editor } from '@tiptap/core'

export type CalloutVariant = 'callout' | 'message'
export type MessageDirection = 'incoming' | 'outgoing'
export type MessageTheme = 'ios' | 'android'

export interface CalloutDraft {
  variant: CalloutVariant
  background: string
  border: string
  sender: string
  direction: MessageDirection
  theme: MessageTheme
}

function safeColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

/**
 * Produces one unambiguous ProseMirror node for both callout boxes and message
 * bubbles. Building the entire node before dispatch avoids partially-updated
 * attributes and content during modal insertion.
 */
export function buildCalloutNode(draft: CalloutDraft, text: string) {
  const fallback = draft.variant === 'message' ? 'New message' : 'Callout text'
  const normalized = text.replace(/\r\n?/g, '\n').trim() || fallback
  const paragraphs = normalized.split('\n').map((line) => ({
    type: 'paragraph',
    ...(line ? { content: [{ type: 'text', text: line }] } : {}),
  }))

  return {
    type: 'callout',
    attrs: {
      variant: draft.variant,
      background: safeColor(draft.background, '#f2f6fa'),
      border: safeColor(draft.border, '#9aa7b2'),
      sender: draft.sender.trim(),
      direction: draft.direction,
      theme: draft.theme,
    },
    content: paragraphs,
  }
}

/**
 * Inserts a pre-built callout with a direct ProseMirror transaction. This
 * avoids reparsing the node through TipTap's generic insertContent command,
 * which can become expensive or fail to fit a block while a modal owns focus.
 */
export function replaceCalloutRange(
  editor: Editor,
  range: { from: number; to: number },
  nodeJson: ReturnType<typeof buildCalloutNode>,
) {
  const maximum = editor.state.doc.content.size
  const from = Math.max(0, Math.min(range.from, maximum))
  const to = Math.max(from, Math.min(range.to, maximum))
  const callout = editor.state.schema.nodeFromJSON(nodeJson)
  const transaction = editor.state.tr
    .replaceRangeWith(from, to, callout)
    .scrollIntoView()
  editor.view.dispatch(transaction)
  return true
}
