export interface DiffPart {
  type: 'same' | 'deleted' | 'inserted'
  text: string
}

export function plainTextFromHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordDiff(beforeHtml: string, afterHtml: string): DiffPart[] {
  const before = plainTextFromHtml(beforeHtml).split(/(\s+)/)
  const after = plainTextFromHtml(afterHtml).split(/(\s+)/)
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1
  const parts: DiffPart[] = []
  if (prefix) parts.push({ type: 'same', text: before.slice(0, prefix).join('') })
  const removed = before.slice(prefix, before.length - suffix).join('')
  const added = after.slice(prefix, after.length - suffix).join('')
  if (removed) parts.push({ type: 'deleted', text: removed })
  if (added) parts.push({ type: 'inserted', text: added })
  if (suffix) parts.push({ type: 'same', text: before.slice(before.length - suffix).join('') })
  return parts
}
