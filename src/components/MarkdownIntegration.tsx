import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { useApp } from '../BookContext'
import { createEmptyBook } from '../data'
import type { BookProject } from '../types'
import './MarkdownIntegration.css'

export function MarkdownIntegration({ home = false }: { home?: boolean }) {
  const { project, projectHydrated, replaceProject } = useApp()
  const latest = useRef(project)
  latest.current = project
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const ready = home || projectHydrated
  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setMessage('')
    flushSync(() => window.dispatchEvent(new Event('typesetly:flush-draft')))
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Markdown operation failed.') }
    finally { running.current = false; setBusy(false) }
  }
  async function importFiles(selection: File[]) {
    await run(async () => {
      const { readMarkdownSelection, importMarkdown } = await import('../integrations/markdown')
      const { files, assets } = await readMarkdownSelection(selection)
      const book = importMarkdown(files, assets, selection[0]?.webkitRelativePath.split('/')[0] || selection[0]?.name.replace(/\.(md|markdown)$/i, '') || 'Markdown manuscript')
      replaceProject(book)
      setMessage(`${files.length} notes imported as a new manuscript. The originals were not changed.`)
    })
  }
  async function sync(connect: boolean) {
    await run(async () => {
      const bridge = window.typesetly
      if (!bridge?.chooseObsidianVault) throw new Error('Two-way vault sync requires the desktop app. Use Import vault folder in the browser.')
      const original = home ? null : latest.current
      const snapshot = connect
        ? await bridge.chooseObsidianVault()
        : await bridge.readObsidianVault({ folderPath: original!.obsidianSync!.folderPath })
      if (!snapshot.ok) { if (snapshot.error) throw new Error(snapshot.error); return }
      if (connect && !snapshot.files?.length) throw new Error('No Markdown notes found. Choose a vault or manuscript subfolder containing .md files.')
      if (!home && latest.current !== original) throw new Error('The manuscript changed while the vault was opening. Please sync again.')
      const { syncMarkdown } = await import('../integrations/markdown')
      const base: BookProject = original || { ...createEmptyBook(snapshot.folderName), chapters: [] }
      const result = syncMarkdown(connect ? { ...base, obsidianSync: undefined } : base, snapshot)
      if (result.writes.length) {
        const written = await bridge.writeObsidianVault({ folderPath: snapshot.folderPath!, files: result.writes })
        if (!written.ok) throw new Error(written.error || 'The vault could not be written. Sync again to review its current state.')
      }
      if (!home && latest.current !== original) throw new Error('The manuscript changed during sync. Your local edits were kept; sync again to reconcile any completed vault writes.')
      result.project.activeId ||= result.project.chapters[0]?.id || ''
      replaceProject(result.project)
      setMessage([`Sync complete. ${result.writes.length} note(s) written.`, ...result.messages].join('\n'))
    })
  }
  async function exportMarkdown() {
    await run(async () => {
      const project = latest.current
      if (!project) return
      const { htmlToMarkdown, splitFrontmatter, markdownLocalValue } = await import('../integrations/markdown')
      const zip = new JSZip()
      for (const [index, chapter] of project.chapters.entries()) {
        const name = [...chapter.title].map(c => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? '-' : c).join('').slice(0, 100) || 'Untitled'
        const linked = project.obsidianSync?.files.find(f => f.chapterId === chapter.id) || project.markdownSources?.find(f => f.chapterId === chapter.id)
        const unchanged = linked?.local === markdownLocalValue(chapter)
        const notePath = linked && !linked.relativePath.split(/[\\/]/).some(p => !p || p === '..' || p.startsWith('.'))
          ? linked.relativePath : `${String(index + 1).padStart(3, '0')} ${name}.md`
        const assetPrefix = '../'.repeat(notePath.split('/').length - 1)
        const doc = new DOMParser().parseFromString(chapter.content, 'text/html')
        for (const [imageIndex, img] of [...doc.querySelectorAll('img')].entries()) {
          const src = img.getAttribute('src') || ''
          const data = /^data:image\/(png|jpeg|gif|webp);base64,([\s\S]+)$/i.exec(src)
          if (data) {
            const asset = `assets/${index + 1}-${imageIndex + 1}.${data[1].toLowerCase()}`
            zip.file(asset, data[2], { base64: true })
            img.setAttribute('src', assetPrefix + asset)
          } else if (!/^https?:/i.test(src)) throw new Error('An image is not available for Markdown export. Reopen the manuscript and try again.')
        }
        // Preserve original note syntax only if no local attachments need repackaging.
        const raw = unchanged && !doc.querySelector('img') ? linked!.source : (linked ? splitFrontmatter(linked.source).frontmatter : '') + htmlToMarkdown(doc.body.innerHTML)
        zip.file(notePath, raw)
      }
      saveAs(await zip.generateAsync({ type: 'blob' }), 'typesetly-markdown.zip')
      setMessage('Markdown ZIP exported. Book layout, chapter options, and Typesetly-specific blocks are not a lossless Markdown format; keep a Typesetly backup too.')
    })
  }
  async function resolveConflict(chapterId: string, keepLocal: boolean) {
    await run(async () => {
      const project = latest.current
      if (!project?.obsidianSync) return
      const next = structuredClone(project)
      const mapping = next.obsidianSync!.files.find(f => f.chapterId === chapterId)!
      const chapter = next.chapters.find(c => c.id === chapterId)
      if (!chapter) throw new Error('This chapter no longer exists.')
      if (keepLocal) mapping.local = '' // explicit choice; next sync still checks the current vault
      else {
        const { markdownToHtml, markdownLocalValue } = await import('../integrations/markdown')
        const snapshot = await window.typesetly!.readObsidianVault({ folderPath: next.obsidianSync!.folderPath })
        if (!snapshot.ok) throw new Error(snapshot.error || 'Cannot read vault.')
        const file = snapshot.files?.find(f => f.relativePath === mapping.relativePath)
        if (!file) throw new Error('The vault note is missing.')
        if (latest.current !== project) throw new Error('The manuscript changed; try again.')
        chapter.content = markdownToHtml(file.text, file.relativePath, snapshot.assets)
        mapping.source = file.text
        mapping.local = markdownLocalValue(chapter)
      }
      mapping.conflict = false
      replaceProject(next)
      setMessage(keepLocal ? 'Local version selected. Press Sync now to send it; advanced syntax remains protected.' : 'Vault version loaded. The conflict copy was kept for reference.')
    })
  }
  return <section className="markdown-integration" aria-label="Markdown and Obsidian">
    <h3>Markdown &amp; Obsidian</h3>
    <p>One note per chapter, sorted by filename. Choose a manuscript subfolder to leave unrelated vault notes out.</p>
    <div className="markdown-actions">
      <button type="button" disabled={busy || !ready} onClick={() => filesRef.current?.click()}>Import Markdown files</button>
      <button type="button" disabled={busy || !ready} onClick={() => folderRef.current?.click()}>Import vault folder (copy)</button>
      {(!project?.obsidianSync || home) && <button type="button" disabled={busy || !ready || !window.typesetly?.chooseObsidianVault} onClick={() => void sync(true)}>Connect Obsidian vault</button>}
      {!home && project?.obsidianSync && <>
        <button type="button" disabled={busy || !ready} onClick={() => void sync(false)}>Sync now</button>
        <button type="button" disabled={busy || !ready} onClick={() => { replaceProject({ ...project, obsidianSync: undefined }); setMessage('Disconnected. No vault notes were deleted.') }}>Disconnect vault</button>
      </>}
      {!home && <button type="button" disabled={busy || !ready} onClick={() => void exportMarkdown()}>Export Markdown ZIP</button>}
    </div>
    <input ref={filesRef} type="file" accept=".md,.markdown" multiple hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void importFiles(files) }} />
    <input ref={folderRef} type="file" multiple {...{ webkitdirectory: '', directory: '' }} hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void importFiles(files) }} />
    {!home && project?.obsidianSync && <p>Connected: {project.obsidianSync.folderName} · {project.obsidianSync.files.length} linked notes. Last sync: {new Date(project.obsidianSync.lastSyncedAt).toLocaleString()}</p>}
    {!home && project?.obsidianSync?.files.filter(f => f.conflict).map(mapping => <div key={mapping.chapterId}>
      <p>Conflict: {mapping.relativePath}</p>
      <div className="markdown-actions">
        <button type="button" disabled={busy} onClick={() => void resolveConflict(mapping.chapterId, true)}>Keep Typesetly version</button>
        <button type="button" disabled={busy} onClick={() => void resolveConflict(mapping.chapterId, false)}>Use current vault version</button>
      </div>
    </div>)}
    <p>Desktop sync is manual. New vault notes are imported; chapters created after connection are sent to the vault’s Typesetly folder. Existing unrelated chapters stay local. Deletions and renames are never written to the vault. Originals are backed up in .typesetly-backups before each write. Conflicts and advanced syntax are kept for review.</p>
    <p>Imports create a new manuscript; connecting from Book details appends notes to the current manuscript. Plugin queries and note/PDF embeds are not executed. Missing images stay visible as Markdown text.</p>
    {(busy || message) && <p className="markdown-status" role="status">{busy ? 'Processing Markdown…' : message}</p>}
  </section>
}
