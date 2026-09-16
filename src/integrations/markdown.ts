import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { createEmptyBook, makePage } from '../data.ts'
import type { BookProject } from '../types.ts'
import type { MarkdownFile, MarkdownMapping, MarkdownWrite, VaultSnapshot } from './markdownTypes.ts'

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const isMarkdownPath = (path: string) => /\.(md|markdown)$/i.test(path) && !path.replaceAll('\\', '/').split('/').some(p => p.startsWith('.'))

export function splitFrontmatter(source: string) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/)
  return { frontmatter: match?.[0] || '', body: source.replace(/^\uFEFF/, '').slice(match?.[0].length || 0) }
}

function resolveAsset(target: string, note: string, assets: Record<string, string>) {
  let decoded = target
  try { decoded = decodeURIComponent(target) } catch { /* literal filename */ }
  const parts = note.split('/').slice(0, -1)
  for (const part of decoded.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  const exact = assets[parts.join('/')] || assets[decoded]
  if (exact) return exact
  const matches = Object.keys(assets).filter(p => p.split('/').at(-1) === decoded)
  return matches.length === 1 ? assets[matches[0]] : undefined
}

export function markdownToHtml(source: string, path = '', assets: Record<string, string> = {}) {
  const { body } = splitFrontmatter(source)
  // Parse wikilinks as inline tokens, not regex replacements over fenced code.
  const parser = new Marked()
  parser.use({ extensions: [{
    name: 'wikilink', level: 'inline',
    start: src => src.search(/!?\[\[/),
    tokenizer(src) {
      const match = /^(!?)\[\[([^\]\n]+)\]\]/.exec(src)
      if (match) return { type: 'wikilink', raw: match[0], embed: match[1], target: match[2] }
    },
    renderer(token) {
      const [target, label] = String(token.target).split('|')
      if (token.embed) {
        const asset = resolveAsset(target, path, assets)
        if (asset) return `<img src="${escape(asset)}" alt="${escape(label || target)}">`
        return escape(token.raw) // preserve unsupported note/PDF embeds visibly
      }
      return `<a href="obsidian://open?file=${encodeURIComponent(target)}">${escape(label || target)}</a>`
    },
  }] })
  const html = parser.parse(body, { async: false }) as string
  const clean = DOMPurify.sanitize(html, { ADD_URI_SAFE_ATTR: [], ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|obsidian):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') || ''
    const asset = resolveAsset(src, path, assets)
    if (asset) img.setAttribute('src', asset)
    else if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) {
      // Do not fetch remote images or leave broken references in EPUB exports.
      img.replaceWith(doc.createTextNode(`![${img.getAttribute('alt') || 'image'}](${src})`))
    }
  }
  // Formatting whitespace between block nodes is not manuscript content. The
  // editor omits it when serializing; retaining it creates spurious local edits.
  for (const node of [...doc.body.childNodes]) {
    if (node.nodeType === 3 && !node.textContent?.trim()) node.remove()
  }
  return doc.body.innerHTML.trim() || '<p></p>'
}

export function htmlToMarkdown(html: string) {
  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  converter.addRule('wikilinks', {
    filter: node => node.nodeName === 'A' && (node.getAttribute('href') || '').startsWith('obsidian://open?file='),
    replacement: (content, node) => {
      const target = decodeURIComponent((node as HTMLElement).getAttribute('href')!.split('file=')[1])
      return `[[${target}${content === target ? '' : `|${content}`}]]`
    },
  })
  converter.keep(['table', 'del', 'u', 'sup', 'sub'])
  return converter.turndown(html).trim() + '\n'
}

function titleFromPath(path: string) { return path.split('/').at(-1)!.replace(/\.(md|markdown)$/i, '') }
export const markdownLocalValue = (chapter: { title: string; content: string }) => JSON.stringify([chapter.title, htmlToMarkdown(chapter.content)])
const localValue = markdownLocalValue

export function importMarkdown(files: MarkdownFile[], assets: Record<string, string> = {}, title = 'Markdown manuscript') {
  const notes = files.filter(f => isMarkdownPath(f.relativePath)).sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }))
  if (!notes.length) throw new Error('No Markdown notes were found in the selected files.')
  const book = createEmptyBook(title)
  book.chapters = notes.map(file => makePage('chapter', titleFromPath(file.relativePath), markdownToHtml(file.text, file.relativePath, assets)))
  book.markdownSources = notes.map((file, index) => ({ chapterId: book.chapters[index].id, relativePath: file.relativePath, source: file.text, local: localValue(book.chapters[index]) }))
  book.activeId = book.chapters[0].id
  return book
}

// Unsupported Obsidian/plugin constructs remain in their original files. Never
// overwrite a source that cannot safely round-trip through the rich-text editor.
export function requiresPreservation(source: string) {
  const body = splitFrontmatter(source).body
  return /!\[|%%|\$|^\s*>\s*\[!|^\s*[-*+]\s+\[[ xX]\]|\^[\w-]+\s*$|==|<\/?[a-z]|\[\^|^\s*\|/m.test(body)
}

export function syncMarkdown(project: BookProject, snapshot: VaultSnapshot) {
  if (!snapshot.ok || !snapshot.folderPath) throw new Error(snapshot.error || 'The vault is unavailable.')
  const next = structuredClone(project)
  const previous = project.obsidianSync?.files || []
  const files = (snapshot.files || []).filter(f => isMarkdownPath(f.relativePath))
  const mappings: MarkdownMapping[] = []
  const writes: MarkdownWrite[] = []
  const messages: string[] = []
  const linked = new Set(previous.map(m => m.relativePath))
  const ignoredChapterIds = [...(project.obsidianSync?.ignoredChapterIds || (project.obsidianSync ? [] : project.chapters.map(c => c.id)))]
  for (const mapping of previous) {
    const chapter = next.chapters.find(c => c.id === mapping.chapterId)
    const file = files.find(f => f.relativePath === mapping.relativePath)
    if (!chapter || !file) {
      mappings.push(mapping) // tombstone: deletions are never propagated or reimported
      messages.push(`Missing note or chapter kept unchanged: ${mapping.relativePath}`)
      continue
    }
    const local = localValue(chapter)
    const localChanged = local !== mapping.local
    const externalChanged = file.text !== mapping.source
    if ((localChanged && externalChanged) || mapping.conflict) {
      if (externalChanged && file.text !== mapping.source) {
        const copy = makePage('chapter', `${chapter.title} — Obsidian conflict`, markdownToHtml(file.text, file.relativePath, snapshot.assets))
        next.chapters.push(copy)
        ignoredChapterIds.push(copy.id)
      }
      mappings.push({ ...mapping, source: file.text, conflict: true })
      messages.push(`Conflict preserved; vault note not overwritten: ${file.relativePath}. Choose which version to keep in Book profile.`)
    } else if (externalChanged) {
      chapter.content = markdownToHtml(file.text, file.relativePath, snapshot.assets)
      mappings.push({ ...mapping, local: localValue(chapter), source: file.text })
    } else if (localChanged) {
      if (requiresPreservation(file.text) || /<(?:img|table)|typesetly-image:|data-typesetly-/i.test(chapter.content)) {
        mappings.push(mapping)
        messages.push(`Not overwritten: ${file.relativePath} contains images or advanced formatting. Export a separate Markdown copy to review.`)
        continue
      }
      const text = splitFrontmatter(file.text).frontmatter + htmlToMarkdown(chapter.content)
      writes.push({ relativePath: file.relativePath, text, expected: file.text })
      mappings.push({ ...mapping, local, source: text })
    } else mappings.push(mapping)
  }
  for (const file of files) {
    if (linked.has(file.relativePath)) continue
    const chapter = makePage('chapter', titleFromPath(file.relativePath), markdownToHtml(file.text, file.relativePath, snapshot.assets))
    next.chapters.push(chapter)
    mappings.push({ chapterId: chapter.id, relativePath: file.relativePath, local: localValue(chapter), source: file.text })
  }
  const mappedIds = new Set(mappings.map(m => m.chapterId))
  for (const chapter of next.chapters) {
    if (chapter.type !== 'chapter' || mappedIds.has(chapter.id) || ignoredChapterIds.includes(chapter.id)) continue
    if (/<(?:img|table)|typesetly-image:|data-typesetly-/i.test(chapter.content)) {
      messages.push(`New chapter not sent because it contains advanced formatting: ${chapter.title}. Export Markdown ZIP instead.`)
      continue
    }
    // Stable IDs prevent same-title collisions and never rename existing notes.
    const filename = [...chapter.title].filter(c => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c)).join('').slice(0, 70) || 'Untitled'
    const relativePath = `Typesetly/${filename}-${chapter.id}.md`
    const text = htmlToMarkdown(chapter.content)
    if (files.some(f => f.relativePath.toLowerCase() === relativePath.toLowerCase())) {
      messages.push(`New chapter path already exists; not overwritten: ${relativePath}`)
      continue
    }
    writes.push({ relativePath, text, expected: null })
    mappings.push({ chapterId: chapter.id, relativePath, local: localValue(chapter), source: text })
  }
  next.obsidianSync = { folderPath: snapshot.folderPath, folderName: snapshot.folderName || 'Obsidian', files: mappings, ignoredChapterIds, lastSyncedAt: new Date().toISOString() }
  if (!next.chapters.some(c => c.id === next.activeId)) next.activeId = next.chapters[0]?.id || ''
  next.updatedAt = new Date().toISOString()
  return { project: next, writes, messages }
}

export async function readMarkdownSelection(selection: File[]) {
  const files: MarkdownFile[] = []
  const assets: Record<string, string> = {}
  let bytes = 0
  for (const file of selection) {
    const path = file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name
    if (path.split('/').some(p => p.startsWith('.'))) continue
    if (!/\.(md|markdown|png|jpe?g|gif|webp)$/i.test(path)) continue
    bytes += file.size
    if (file.size > 20 * 1024 * 1024 || bytes > 100 * 1024 * 1024 || files.length >= 2000) throw new Error('Select a smaller manuscript subfolder (maximum 2,000 notes / 100 MB; 20 MB per file).')
    if (isMarkdownPath(path)) files.push({ relativePath: path, text: await file.text() })
    else if (/\.(png|jpe?g|gif|webp)$/i.test(path) && file.size <= 20 * 1024 * 1024) {
      assets[path] = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    }
  }
  return { files, assets }
}
