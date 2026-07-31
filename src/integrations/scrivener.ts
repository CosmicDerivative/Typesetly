import JSZip from 'jszip'
import { v4 as uuid } from 'uuid'
import { BACK_MATTER_TYPES, countWords, createEmptyBook, makePage } from '../data.ts'
import { inferPageTypeFromTitle } from '../manuscript/pageTypes.ts'
import type {
  BookProject,
  Chapter,
  ImportReport,
  ScrivenerSyncMapping,
  ScrivenerSyncState,
} from '../types.ts'

export interface ScrivenerSourceFile {
  relativePath: string
  text: string
  modifiedAt?: number
}

export interface ScrivenerWriteFile {
  relativePath: string
  text: string
}

export interface ScrivenerSyncOutcome {
  project: BookProject
  writes: ScrivenerWriteFile[]
  imported: number
  updated: number
  exported: number
  conflicts: number
  missing: number
}

interface XmlNode {
  name: string
  attributes: Record<string, string>
  text: string
  children: XmlNode[]
}

interface BinderItem {
  uuid: string
  legacyId: string
  type: string
  title: string
  children: BinderItem[]
}

const SCRIVENER_TEXT_EXTENSIONS = new Set(['rtf', 'txt', 'md', 'markdown'])
const SCENE_BREAK_HTML = '<hr data-typesetly-node="scene-break">'

function decodeEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: '#document', attributes: {}, text: '', children: [] }
  const stack = [root]
  const tokens = source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g) || []

  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?')) continue
    if (token.startsWith('<![CDATA[')) {
      stack.at(-1)!.text += token.slice(9, -3)
      continue
    }
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop()
      continue
    }
    if (token.startsWith('<!')) continue
    if (token.startsWith('<')) {
      const selfClosing = /\/\s*>$/.test(token)
      const body = token.slice(1, selfClosing ? token.lastIndexOf('/') : -1).trim()
      const nameMatch = body.match(/^([^\s/>]+)/)
      if (!nameMatch) continue
      const node: XmlNode = { name: nameMatch[1], attributes: {}, text: '', children: [] }
      const attributeSource = body.slice(nameMatch[0].length)
      for (const match of attributeSource.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        node.attributes[match[1]] = decodeEntities(match[2] ?? match[3] ?? '')
      }
      stack.at(-1)!.children.push(node)
      if (!selfClosing) stack.push(node)
      continue
    }
    stack.at(-1)!.text += decodeEntities(token)
  }
  return root
}

function child(node: XmlNode, name: string) {
  return node.children.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())
}

function descendants(node: XmlNode, name: string): XmlNode[] {
  const matches: XmlNode[] = []
  for (const item of node.children) {
    if (item.name.toLowerCase() === name.toLowerCase()) matches.push(item)
    matches.push(...descendants(item, name))
  }
  return matches
}

function binderItemFromXml(node: XmlNode): BinderItem {
  const childrenNode = child(node, 'Children')
  return {
    uuid: node.attributes.UUID || node.attributes.Uuid || '',
    legacyId: node.attributes.ID || '',
    type: node.attributes.Type || '',
    title: child(node, 'Title')?.text.trim() || 'Untitled',
    children: childrenNode?.children
      .filter((item) => item.name.toLowerCase() === 'binderitem')
      .map(binderItemFromXml) || [],
  }
}

export function parseScrivenerBinder(source: string) {
  const documentNode = parseXml(source)
  const binderNode = descendants(documentNode, 'Binder')[0]
  if (!binderNode) throw new Error('This project does not contain a Scrivener Binder.')
  return binderNode.children
    .filter((node) => node.name.toLowerCase() === 'binderitem')
    .map(binderItemFromXml)
}

function normalizePath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\.?\//, '')
}

function extension(path: string) {
  return path.split('.').pop()?.toLowerCase() || ''
}

function sourceMap(files: ScrivenerSourceFile[]) {
  return new Map(files.map((file) => [normalizePath(file.relativePath).toLowerCase(), file]))
}

function findItemContent(item: BinderItem, files: Map<string, ScrivenerSourceFile>) {
  const candidates = [
    `Files/Data/${item.uuid}/content.rtf`,
    `Files/Data/${item.uuid}/content.txt`,
    `Files/Docs/${item.legacyId}.rtf`,
    `Files/Docs/${item.uuid}.rtf`,
  ].map((path) => path.toLowerCase())
  for (const [path, file] of files) {
    if (candidates.some((candidate) => path.endsWith(candidate))) return file
  }
  return undefined
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function plainTextToHtml(value: string) {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return '<p></p>'
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')
}

interface RtfState {
  skip: boolean
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  unicodeFallback: number
}

function formatTransition(from: RtfState, to: RtfState) {
  let output = ''
  if (from.strike && !to.strike) output += '</s>'
  if (from.underline && !to.underline) output += '</u>'
  if (from.italic && !to.italic) output += '</em>'
  if (from.bold && !to.bold) output += '</strong>'
  if (!from.bold && to.bold) output += '<strong>'
  if (!from.italic && to.italic) output += '<em>'
  if (!from.underline && to.underline) output += '<u>'
  if (!from.strike && to.strike) output += '<s>'
  return output
}

export function rtfToHtml(rtf: string) {
  const defaultState: RtfState = {
    skip: false,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    unicodeFallback: 1,
  }
  const stack: RtfState[] = []
  let state = { ...defaultState }
  let output = '<p>'
  let index = 0
  let skipFallback = 0
  const skipDestinations = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object',
    'header', 'footer', 'generator', 'listtable', 'listoverridetable',
  ])

  const applyFormat = (patch: Partial<RtfState>) => {
    const next = { ...state, ...patch }
    if (!state.skip) output += formatTransition(state, next)
    state = next
  }

  while (index < rtf.length) {
    const character = rtf[index]
    if (character === '{') {
      stack.push({ ...state })
      index += 1
      continue
    }
    if (character === '}') {
      const previous = stack.pop() || defaultState
      if (!state.skip && !previous.skip) output += formatTransition(state, previous)
      state = { ...previous }
      index += 1
      continue
    }
    if (character !== '\\') {
      if (!state.skip && character !== '\r' && character !== '\n') {
        if (skipFallback > 0) skipFallback -= 1
        else output += escapeHtml(character)
      }
      index += 1
      continue
    }

    index += 1
    const symbol = rtf[index]
    if (symbol === '\\' || symbol === '{' || symbol === '}') {
      if (!state.skip) {
        if (skipFallback > 0) skipFallback -= 1
        else output += escapeHtml(symbol)
      }
      index += 1
      continue
    }
    if (symbol === "'") {
      const value = Number.parseInt(rtf.slice(index + 1, index + 3), 16)
      if (!state.skip && Number.isFinite(value)) {
        if (skipFallback > 0) skipFallback -= 1
        else output += escapeHtml(new TextDecoder('windows-1252').decode(Uint8Array.of(value)))
      }
      index += 3
      continue
    }
    if (symbol === '*') {
      state.skip = true
      index += 1
      continue
    }
    if (symbol === '~') {
      if (!state.skip) {
        if (skipFallback > 0) skipFallback -= 1
        else output += '&nbsp;'
      }
      index += 1
      continue
    }
    if (symbol === '-') {
      if (!state.skip) {
        if (skipFallback > 0) skipFallback -= 1
        else output += '&shy;'
      }
      index += 1
      continue
    }
    if (!/[a-z]/i.test(symbol || '')) {
      index += 1
      continue
    }

    const controlMatch = rtf.slice(index).match(/^([a-z]+)(-?\d+)? ?/i)
    if (!controlMatch) continue
    const word = controlMatch[1].toLowerCase()
    const parameter = controlMatch[2] == null ? undefined : Number(controlMatch[2])
    index += controlMatch[0].length

    if (skipDestinations.has(word)) {
      state.skip = true
      continue
    }
    if (state.skip) continue
    if (word === 'b') applyFormat({ bold: parameter !== 0 })
    else if (word === 'i') applyFormat({ italic: parameter !== 0 })
    else if (word === 'ul') applyFormat({ underline: parameter !== 0 })
    else if (word === 'ulnone') applyFormat({ underline: false })
    else if (word === 'strike') applyFormat({ strike: parameter !== 0 })
    else if (word === 'plain') applyFormat({ bold: false, italic: false, underline: false, strike: false })
    else if (word === 'par') output += `${formatTransition(state, defaultState)}</p><p>${formatTransition(defaultState, state)}`
    else if (word === 'line') output += '<br>'
    else if (word === 'tab') output += '&emsp;'
    else if (word === 'emdash') output += '—'
    else if (word === 'endash') output += '–'
    else if (word === 'lquote' || word === 'rquote') output += word === 'lquote' ? '‘' : '’'
    else if (word === 'ldblquote' || word === 'rdblquote') output += word === 'ldblquote' ? '“' : '”'
    else if (word === 'uc' && parameter != null) state.unicodeFallback = Math.max(0, parameter)
    else if (word === 'u' && parameter != null) {
      const unsigned = parameter < 0 ? parameter + 65_536 : parameter
      output += escapeHtml(String.fromCharCode(unsigned))
      skipFallback = state.unicodeFallback
    }
  }

  output += `${formatTransition(state, defaultState)}</p>`
  return output
    .replace(/<p>(?:\s|&nbsp;|<br>)*<\/p>/g, '')
    .replace(/<p><\/p>/g, '')
    .trim() || '<p></p>'
}

export function scrivenerFileToHtml(file: ScrivenerSourceFile) {
  return extension(file.relativePath) === 'rtf' ? rtfToHtml(file.text) : plainTextToHtml(file.text)
}

function contentForItem(
  item: BinderItem,
  files: Map<string, ScrivenerSourceFile>,
) {
  const file = findItemContent(item, files)
  return file ? scrivenerFileToHtml(file) : ''
}

function importedChapter(
  title: string,
  scenes: Array<{ title: string; content: string }>,
  classifyMatter = true,
) {
  const usableScenes = scenes.filter((scene) => scene.content)
  const content = usableScenes.map((scene) => scene.content).join(SCENE_BREAK_HTML) || '<p></p>'
  const type = classifyMatter ? inferPageTypeFromTitle(title) : 'chapter'
  return makePage(type, title, content, {
    sceneTitles:
      type === 'chapter' && usableScenes.length > 1
        ? usableScenes.map((scene) => scene.title)
        : [],
  })
}

const SCRIVENER_CONTAINER_TITLE = /^(?:(?:part|arc|act|book|volume|section|phase)(?:\s+|$)|(?:draft|manuscript)\s+\d+)/i

function isStructuralContainer(item: BinderItem) {
  if (!item.children.length) return false
  if (SCRIVENER_CONTAINER_TITLE.test(item.title.trim())) return true
  // A folder containing other folders represents a level above chapters in
  // the Binder. The child folders remain chapters and their documents scenes.
  return item.children.some((candidate) => candidate.children.length > 0)
}

function scenesForChapterFolder(
  item: BinderItem,
  files: Map<string, ScrivenerSourceFile>,
  warnings: string[],
) {
  const ownContent = contentForItem(item, files)
  const scenes = [
    ...(ownContent ? [{ title: item.title, content: ownContent }] : []),
    ...item.children.map((scene) => ({
      title: scene.title,
      content: contentForItem(scene, files),
    })),
  ]
  if (item.children.some((scene) => scene.children.length)) {
    warnings.push(`Nested Binder items under “${item.title}” were flattened into one chapter.`)
  }
  return scenes
}

function importDraftItems(
  items: BinderItem[],
  files: Map<string, ScrivenerSourceFile>,
  warnings: string[],
): Chapter[] {
  const chapters: Chapter[] = []
  for (const item of items) {
    const ownContent = contentForItem(item, files)
    if (!item.children.length) {
      chapters.push(importedChapter(item.title, [{ title: item.title, content: ownContent }]))
      continue
    }

    if (isStructuralContainer(item)) {
      const part = makePage('part', item.title)
      chapters.push(part)
      for (const childItem of item.children) {
        if (!childItem.children.length) {
          chapters.push({
            ...importedChapter(childItem.title, [{
              title: childItem.title,
              content: contentForItem(childItem, files),
            }], false),
            partId: part.id,
          })
          continue
        }
        const scenes = scenesForChapterFolder(childItem, files, warnings)
        chapters.push({ ...importedChapter(childItem.title, scenes, false), partId: part.id })
      }
      continue
    }

    const scenes = scenesForChapterFolder(item, files, warnings)
    chapters.push(importedChapter(item.title, scenes))
  }
  return chapters
}

export async function sourceFilesFromSelection(files: File[]) {
  return Promise.all(files.map(async (file) => ({
    relativePath: normalizePath(
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    ),
    text: await file.text(),
    modifiedAt: file.lastModified,
  })))
}

export async function sourceFilesFromArchive(file: File) {
  const archive = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(archive.files).filter((entry) => !entry.dir)
  return Promise.all(entries.map(async (entry) => ({
    relativePath: normalizePath(entry.name),
    text: await entry.async('string'),
    modifiedAt: entry.date?.getTime(),
  })))
}

export function importScrivenerSources(files: ScrivenerSourceFile[]): ImportReport {
  const projectFile = files.find((file) => extension(file.relativePath) === 'scrivx')
  if (!projectFile) {
    throw new Error('No .scrivx Binder file was found. Select the complete .scriv project folder or a zipped backup.')
  }
  const binder = parseScrivenerBinder(projectFile.text)
  const draft = binder.find((item) =>
    /draft|manuscript/i.test(item.type) || /^(draft|manuscript)$/i.test(item.title),
  )
  if (!draft) throw new Error('The Scrivener Draft or Manuscript Binder was not found.')

  const warnings = [
    'Compile settings, custom metadata, snapshots, comments, and research files are not imported.',
  ]
  const chapters = importDraftItems(draft.children, sourceMap(files), warnings)
  if (!chapters.length) warnings.push('The Draft Binder did not contain any text documents.')

  const required = createEmptyBook().chapters.filter((chapter) => chapter.type !== 'chapter')
  const title = projectFile.relativePath
    .split('/')
    .pop()!
    .replace(/\.scrivx$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Imported Scrivener Project'
  const base = createEmptyBook(title)
  const imported = {
    ...base,
    details: { ...base.details, title },
    chapters: [...required, ...chapters],
    activeId: chapters.find((chapter) => chapter.type === 'chapter')?.id || required[0].id,
  }
  const bodyChapters = chapters.filter((chapter) => chapter.type === 'chapter')
  return {
    book: imported,
    warnings: [...new Set(warnings)],
    summary: {
      chapters: bodyChapters.length,
      words: bodyChapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0),
      images: 0,
      footnotes: 0,
      links: 0,
    },
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&emsp;/g, '\t')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
}

export function htmlToPlainText(html: string) {
  return decodeHtmlEntities(html
    .replace(/<hr[^>]*data-typesetly-node=["']scene-break["'][^>]*>/gi, '\n\n***\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|blockquote|li)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function rtfEscape(value: string) {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '\\' || character === '{' || character === '}') {
      output += `\\${character}`
    } else if (character === '\n') {
      output += '\\par\n'
    } else {
      const code = value.charCodeAt(index)
      output += code > 127 ? `\\u${code > 32_767 ? code - 65_536 : code}?` : character
    }
  }
  return output
}

export function htmlToRtf(html: string) {
  let body = ''
  const tokens = html.match(/<[^>]+>|[^<]+/g) || []
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      body += rtfEscape(decodeHtmlEntities(token))
      continue
    }
    const tag = token.toLowerCase()
    if (/^<(strong|b)(?:\s|>)/.test(tag)) body += '\\b '
    else if (/^<\/(strong|b)>/.test(tag)) body += '\\b0 '
    else if (/^<(em|i)(?:\s|>)/.test(tag)) body += '\\i '
    else if (/^<\/(em|i)>/.test(tag)) body += '\\i0 '
    else if (/^<u(?:\s|>)/.test(tag)) body += '\\ul '
    else if (/^<\/u>/.test(tag)) body += '\\ulnone '
    else if (/^<(s|strike)(?:\s|>)/.test(tag)) body += '\\strike '
    else if (/^<\/(s|strike)>/.test(tag)) body += '\\strike0 '
    else if (/^<br\s*\/?>/.test(tag)) body += '\\line '
    else if (/^<hr[^>]*data-typesetly-node=["']scene-break["']/.test(tag)) body += '\\par ***\\par '
    else if (/^<li(?:\s|>)/.test(tag)) body += '\\bullet\\tab '
    else if (/^<\/(p|div|h[1-6]|blockquote|li)>/.test(tag)) body += '\\par '
  }
  body = body.replace(/(?:\\par\s*){3,}/g, '\\par\\par ')
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Georgia;}}\\viewkind4\\uc1\\pard\\f0\\fs24 ${body}\\par}`
}

export function contentHash(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function scrivenerTitleFromPath(path: string) {
  const name = normalizePath(path).split('/').pop() || ''
  return name
    .replace(/\.(?:rtf|txt|md|markdown)$/i, '')
    .replace(/^\s*\d+[\s._-]+/, '')
    .replace(/\s+\[\d+\]\s*$/, '')
    .trim() || 'Untitled'
}

function normalizedTitle(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function safeFileName(value: string) {
  const invalid = '<>:"/\\|?*'
  return [...value]
    .filter((character) => character.charCodeAt(0) >= 32 && !invalid.includes(character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'Untitled'
}

function newSyncPath(index: number, title: string, format: 'rtf' | 'txt') {
  return `Draft/${String(index + 1).padStart(3, '0')} ${safeFileName(title)}.${format}`
}

function makeConflictCopy(chapter: Chapter, externalHtml: string) {
  return {
    ...structuredClone(chapter),
    id: uuid(),
    title: `${chapter.title} — Scrivener conflict`,
    content: externalHtml,
    partId: undefined,
    folderId: undefined,
  }
}

function insertBeforeBackMatter(chapters: Chapter[], incoming: Chapter) {
  const index = chapters.findIndex((chapter) => BACK_MATTER_TYPES.includes(chapter.type))
  chapters.splice(index < 0 ? chapters.length : index, 0, incoming)
}

export function syncScrivenerSources(
  project: BookProject,
  externalFiles: ScrivenerSourceFile[],
  connection: Pick<ScrivenerSyncState, 'folderPath' | 'folderName' | 'format'>,
): ScrivenerSyncOutcome {
  const compatible = externalFiles
    .filter((file) => {
      const path = normalizePath(file.relativePath)
      return /^drafts?\//i.test(path) && SCRIVENER_TEXT_EXTENSIONS.has(extension(path))
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true }))
  const existingBody = project.chapters.filter((chapter) => chapter.type === 'chapter')
  const placeholderId = !project.scrivenerSync &&
    compatible.length > 0 &&
    existingBody.length === 1 &&
    existingBody[0].title === 'Chapter 1' &&
    !htmlToPlainText(existingBody[0].content)
      ? existingBody[0].id
      : undefined
  const chapters = project.chapters
    .filter((chapter) => chapter.id !== placeholderId)
    .map((chapter) => structuredClone(chapter))
  const externalByPath = new Map(compatible.map((file) => [
    normalizePath(file.relativePath).toLowerCase(),
    file,
  ]))
  const availableExternal = new Set(externalByPath.keys())
  const mappings: ScrivenerSyncMapping[] = []
  const writes: ScrivenerWriteFile[] = []
  const processedChapters = new Set<string>()
  let imported = 0
  let updated = 0
  let exported = 0
  let conflicts = 0
  let missing = 0

  for (const previous of project.scrivenerSync?.files || []) {
    const chapterIndex = chapters.findIndex((chapter) => chapter.id === previous.chapterId)
    if (chapterIndex < 0) continue
    const chapter = chapters[chapterIndex]
    processedChapters.add(chapter.id)
    let pathKey = normalizePath(previous.relativePath).toLowerCase()
    let external = externalByPath.get(pathKey)
    if (!external) {
      const titleKey = normalizedTitle(chapter.title)
      const replacement = compatible.find((file) =>
        availableExternal.has(normalizePath(file.relativePath).toLowerCase()) &&
        normalizedTitle(scrivenerTitleFromPath(file.relativePath)) === titleKey
      )
      if (replacement) {
        external = replacement
        pathKey = normalizePath(replacement.relativePath).toLowerCase()
      }
    }
    if (!external) {
      missing += 1
      continue
    }
    availableExternal.delete(pathKey)
    const localHash = contentHash(chapter.content)
    const externalHtml = scrivenerFileToHtml(external)
    const externalHash = contentHash(externalHtml)
    const localChanged = localHash !== previous.lastLocalHash
    const externalChanged = externalHash !== previous.lastExternalHash

    if (localChanged && externalChanged && localHash !== externalHash) {
      const conflictCopy = makeConflictCopy(chapter, externalHtml)
      chapters.splice(chapterIndex + 1, 0, conflictCopy)
      processedChapters.add(conflictCopy.id)
      conflicts += 1
    } else if (externalChanged && localHash !== externalHash) {
      chapters[chapterIndex] = { ...chapter, content: externalHtml }
      updated += 1
    } else if (localChanged && localHash !== externalHash) {
      writes.push({
        relativePath: normalizePath(external.relativePath),
        text: extension(external.relativePath) === 'rtf'
          ? htmlToRtf(chapter.content)
          : htmlToPlainText(chapter.content),
      })
      exported += 1
    }

    const finalChapter = chapters.find((candidate) => candidate.id === chapter.id)!
    mappings.push({
      chapterId: chapter.id,
      relativePath: normalizePath(external.relativePath),
      lastLocalHash: contentHash(finalChapter.content),
      lastExternalHash: localChanged && !externalChanged
        ? contentHash(finalChapter.content)
        : externalHash,
    })
  }

  for (const pathKey of availableExternal) {
    const external = externalByPath.get(pathKey)!
    const title = scrivenerTitleFromPath(external.relativePath)
    const externalHtml = scrivenerFileToHtml(external)
    const externalHash = contentHash(externalHtml)
    const matching = chapters.find((chapter) =>
      chapter.type === 'chapter' &&
      !processedChapters.has(chapter.id) &&
      normalizedTitle(chapter.title) === normalizedTitle(title)
    )
    if (matching) {
      processedChapters.add(matching.id)
      const localHash = contentHash(matching.content)
      if (localHash !== externalHash) {
        const conflictCopy = makeConflictCopy(matching, externalHtml)
        const index = chapters.findIndex((chapter) => chapter.id === matching.id)
        chapters.splice(index + 1, 0, conflictCopy)
        processedChapters.add(conflictCopy.id)
        conflicts += 1
      }
      mappings.push({
        chapterId: matching.id,
        relativePath: normalizePath(external.relativePath),
        lastLocalHash: localHash,
        lastExternalHash: externalHash,
      })
      continue
    }

    const incoming = makePage('chapter', title, externalHtml)
    insertBeforeBackMatter(chapters, incoming)
    processedChapters.add(incoming.id)
    imported += 1
    mappings.push({
      chapterId: incoming.id,
      relativePath: normalizePath(external.relativePath),
      lastLocalHash: externalHash,
      lastExternalHash: externalHash,
    })
  }

  const format = connection.format
  const bodyChapters = chapters.filter((chapter) => chapter.type === 'chapter')
  for (const chapter of bodyChapters) {
    if (processedChapters.has(chapter.id)) continue
    const relativePath = newSyncPath(mappings.length, chapter.title, format)
    const hash = contentHash(chapter.content)
    writes.push({
      relativePath,
      text: format === 'rtf' ? htmlToRtf(chapter.content) : htmlToPlainText(chapter.content),
    })
    mappings.push({
      chapterId: chapter.id,
      relativePath,
      lastLocalHash: hash,
      lastExternalHash: hash,
    })
    exported += 1
  }

  const now = new Date().toISOString()
  return {
    project: {
      ...project,
      chapters,
      activeId: chapters.some((chapter) => chapter.id === project.activeId)
        ? project.activeId
        : chapters.find((chapter) => chapter.type === 'chapter')?.id || chapters[0].id,
      scrivenerSync: {
        version: 1,
        ...connection,
        lastSyncedAt: now,
        files: mappings,
      },
      updatedAt: now,
    },
    writes,
    imported,
    updated,
    exported,
    conflicts,
    missing,
  }
}
