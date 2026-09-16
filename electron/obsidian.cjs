const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function safeTarget(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '..' || p === '.' || p.startsWith('.') || p.includes(':') || [...p].some(c => c.charCodeAt(0) < 32))) {
    throw new Error('Invalid vault path.')
  }
  let target = fs.realpathSync(root)
  for (const part of relative.split('/')) {
    target = path.join(target, part)
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Symbolic links are not supported in vault sync.')
  }
  return target
}

function readVault(root) {
  const files = []
  const assets = {}
  let bytes = 0
  const visit = folder => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const full = path.join(folder, entry.name)
      if (entry.isDirectory()) { visit(full); continue }
      if (!entry.isFile() || !/\.(md|markdown|png|jpe?g|gif|webp)$/i.test(entry.name)) continue
      const size = fs.statSync(full).size
      bytes += size
      if (size > 20 * 1024 * 1024 || bytes > 100 * 1024 * 1024 || files.length >= 2000) throw new Error('Select a smaller manuscript subfolder (maximum 2,000 notes / 100 MB; 20 MB per file).')
      const relativePath = path.relative(root, full).split(path.sep).join('/')
      if (/\.(md|markdown)$/i.test(entry.name)) files.push({ relativePath, text: fs.readFileSync(full, 'utf8') })
      else {
        const ext = path.extname(full).slice(1).toLowerCase().replace('jpg', 'jpeg')
        assets[relativePath] = `data:image/${ext};base64,${fs.readFileSync(full).toString('base64')}`
      }
    }
  }
  visit(root)
  return { ok: true, folderPath: root, folderName: path.basename(root), files, assets }
}

function writeVault(root, files) {
  if (!Array.isArray(files) || files.length > 2000) throw new Error('Invalid sync batch.')
  const seen = new Set()
  const check = file => {
    const target = safeTarget(root, file.relativePath)
    if (!/\.(md|markdown)$/i.test(target) || typeof file.text !== 'string' || file.text.length > 20 * 1024 * 1024) throw new Error('Only Markdown notes can be written.')
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
    if (current !== file.expected) throw new Error(`The note changed since it was read: ${file.relativePath}. Sync again; nothing will be overwritten.`)
    return target
  }
  for (const file of files) {
    const target = check(file)
    const key = target.toLowerCase()
    if (seen.has(key)) throw new Error('Duplicate sync path.')
    seen.add(key)
  }
  for (const file of files) {
    const target = check(file)
    const backupDir = path.join(fs.realpathSync(root), '.typesetly-backups')
    if (fs.existsSync(backupDir) && fs.lstatSync(backupDir).isSymbolicLink()) throw new Error('Backup folder cannot be a symbolic link.')
    fs.mkdirSync(backupDir, { recursive: true })
    if (file.expected !== null) fs.writeFileSync(path.join(backupDir, `${Date.now()}-${crypto.randomUUID()}-${path.basename(target)}`), file.expected, { flag: 'wx' })
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const temporary = path.join(path.dirname(target), `.typesetly-${crypto.randomUUID()}.tmp`)
    try {
      fs.writeFileSync(temporary, file.text, { flag: 'wx' })
      check(file)
      fs.renameSync(temporary, target)
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }
  return { ok: true, written: files.length }
}

function registerObsidian(ipcMain, dialog) {
  const approved = new Set()
  const wrap = fn => async (_event, payload) => {
    try { return await fn(payload) } catch (error) { return { ok: false, error: error.message } }
  }
  const authorize = async folderPath => {
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) throw new Error('Invalid vault folder.')
    const root = fs.realpathSync(folderPath)
    if (!approved.has(root)) {
      const result = await dialog.showMessageBox({ type: 'question', buttons: ['Cancel', 'Allow sync'], defaultId: 0, cancelId: 0, message: 'Allow Typesetly to read and synchronize Markdown notes?', detail: root })
      if (result.response !== 1) throw new Error('Vault access was not approved.')
      approved.add(root)
    }
    return root
  }
  ipcMain.handle('choose-obsidian-vault', wrap(async () => {
    const result = await dialog.showOpenDialog({ title: 'Choose Obsidian vault or manuscript subfolder', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return { ok: false }
    const root = fs.realpathSync(result.filePaths[0])
    approved.add(root)
    return readVault(root)
  }))
  ipcMain.handle('read-obsidian-vault', wrap(async ({ folderPath }) => readVault(await authorize(folderPath))))
  ipcMain.handle('write-obsidian-vault', wrap(async ({ folderPath, files }) => writeVault(await authorize(folderPath), files)))
}

module.exports = { readVault, writeVault, safeTarget, registerObsidian }
