import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createEmptyBook, makePage } from '../src/data.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser })
const { markdownToHtml, htmlToMarkdown, importMarkdown, syncMarkdown, splitFrontmatter, requiresPreservation, isMarkdownPath } = await import('../src/integrations/markdown.ts')
const snapshot = (text = 'Hello **world**.') => ({ ok: true, folderPath: '/vault', folderName: 'Novel', files: [{ relativePath: 'Draft/01 Start.md', text }] })
const connected = () => syncMarkdown({ ...createEmptyBook(), chapters: [] }, snapshot()).project

test('Markdown imports common formatting, nested lists, fenced code and tables', () => {
  const html = markdownToHtml('# Heading\n\nText **bold** *italic* [link](https://example.org).\n\n> Quote\n\n- One\n  - Two\n\n```js\n[[literal]]\n```\n\n| A | B |\n|---|---|\n| x | y |')
  for (const tag of ['h1', 'strong', 'em', 'a', 'blockquote', 'ul', 'pre', 'table']) assert.match(html, new RegExp(`<${tag}[ >]`))
  assert.match(html, /\[\[literal\]\]/)
})

test('imported blocks do not create pending editor edits from parser whitespace', () => {
  assert.equal(markdownToHtml('First\n\nSecond'), '<p>First</p><p>Second</p>')
})

test('editor-only link attributes do not count as a local Markdown edit', () => {
  const s = snapshot('[Link](https://example.org)')
  const book = syncMarkdown({ ...createEmptyBook(), chapters: [] }, s).project
  book.chapters[0].content = '<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.org">Link</a></p>'
  assert.equal(syncMarkdown(book, s).writes.length, 0)
})

test('Markdown import sanitizes scripts, event handlers and unsafe URLs', () => {
  const html = markdownToHtml('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[unsafe](javascript:alert)')
  assert.doesNotMatch(html, /<script|onerror|href="javascript:/)
})

test('frontmatter remains exact, including CRLF and nested YAML', () => {
  const source = '---\r\ntags: [novel]\r\ncustom:\r\n  draft: true\r\n---\r\nBody'
  assert.equal(splitFrontmatter(source).body, 'Body')
  assert.equal(splitFrontmatter(source).frontmatter + 'Body', source)
  assert.doesNotMatch(markdownToHtml(source), /tags|custom/)
})

test('Obsidian wikilinks retain aliases on export and code stays literal', () => {
  const html = markdownToHtml('[[Folder/Note#Heading|Alias]] and `[[literal]]`')
  assert.match(html, /obsidian:\/\/open\?file=Folder%2FNote%23Heading/)
  assert.match(htmlToMarkdown(html), /\[\[Folder\/Note#Heading\|Alias\]\]/)
})

test('vault images resolve relative paths and unique names, unresolved embeds stay visible', () => {
  const data = 'data:image/png;base64,aGVsbG8='
  const html = markdownToHtml('![[cover.png]]\n\n![cover](../assets/cover.png)\n\n![[Missing note]]', 'Draft/one.md', { 'assets/cover.png': data })
  assert.equal((html.match(/<img /g) || []).length, 2)
  assert.match(html, /Missing note/)
  assert.doesNotMatch(markdownToHtml('![[cover.png]]', '', { 'one/cover.png': data, 'two/cover.png': data }), /<img/)
})

test('imports naturally sort notes and exclude hidden folders', () => {
  const book = importMarkdown([{ relativePath: '10 End.md', text: 'end' }, { relativePath: '.obsidian/private.md', text: 'private' }, { relativePath: '2 Start.MD', text: 'start' }])
  assert.deepEqual(book.chapters.map(c => c.title), ['2 Start', '10 End'])
  assert.equal(book.markdownSources?.[0].source, 'start')
  assert.equal(isMarkdownPath('.trash/deleted.md'), false)
  assert.throws(() => importMarkdown([]), /No Markdown/)
})

test('unchanged repeated sync is a no-op, local edits are written with exact preconditions', () => {
  const book = connected()
  assert.equal(book.activeId, book.chapters[0].id)
  assert.equal(syncMarkdown(book, snapshot()).writes.length, 0)
  book.chapters[0].content = '<p>Local edit</p>'
  const result = syncMarkdown(book, snapshot())
  assert.equal(result.writes.length, 1)
  assert.equal(result.writes[0].expected, 'Hello **world**.')
  assert.equal(result.writes[0].text, 'Local edit\n')
  assert.equal(syncMarkdown(result.project, snapshot('Local edit\n')).writes.length, 0)
})

test('external edits update chapters; conflicts preserve both and remain locked on later sync', () => {
  const book = connected()
  const imported = syncMarkdown(book, snapshot('External edit'))
  assert.match(imported.project.chapters[0].content, /External edit/)
  book.chapters[0].content = '<p>Local edit</p>'
  const conflict = syncMarkdown(book, snapshot('External edit'))
  assert.equal(conflict.writes.length, 0)
  assert.equal(conflict.project.chapters.length, 2)
  assert.match(conflict.project.chapters[0].content, /Local edit/)
  const again = syncMarkdown(conflict.project, snapshot('External edit'))
  assert.equal(again.writes.length, 0)
  assert.equal(again.project.chapters.length, 2)
  assert.equal(again.project.obsidianSync?.files[0].conflict, true)
})

test('missing or locally deleted notes are not recreated or deleted on the other side', () => {
  const book = connected()
  const missing = syncMarkdown(book, { ...snapshot(), files: [] })
  assert.equal(missing.writes.length, 0)
  assert.equal(missing.project.obsidianSync?.files.length, 1)
  book.chapters = []
  assert.equal(syncMarkdown(book, snapshot()).project.chapters.length, 0)
})

test('new local chapters use unique ID-based paths; existing unrelated chapters remain local', () => {
  const base = createEmptyBook()
  const first = syncMarkdown(base, snapshot())
  assert.equal(first.writes.length, 0)
  first.project.chapters.push(makePage('chapter', 'Same title', '<p>New</p>'), makePage('chapter', 'Same title', '<p>Other</p>'))
  const result = syncMarkdown(first.project, snapshot())
  assert.equal(result.writes.length, 2)
  assert.notEqual(result.writes[0].relativePath, result.writes[1].relativePath)
  assert.equal(result.writes[0].expected, null)
})

test('advanced syntax is never silently overwritten; frontmatter survives ordinary edits', () => {
  for (const source of ['![[note]]', '> [!note] Title', '- [x] task', '%%private%%', '$math$', '==highlight==', '| A | B |']) assert.equal(requiresPreservation(source), true)
  const s = snapshot('---\ntags: [draft]\n---\nHello')
  const book = syncMarkdown({ ...createEmptyBook(), chapters: [] }, s).project
  book.chapters[0].content = '<p>Changed</p>'
  assert.equal(syncMarkdown(book, s).writes[0].text, '---\ntags: [draft]\n---\nChanged\n')
  const advanced = snapshot('![[cover.png]]')
  const other = syncMarkdown({ ...createEmptyBook(), chapters: [] }, advanced).project
  other.chapters[0].content = '<p>Local change</p>'
  const result = syncMarkdown(other, advanced)
  assert.equal(result.writes.length, 0)
  assert.match(result.messages[0], /Not overwritten/)
})
