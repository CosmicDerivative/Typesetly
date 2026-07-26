const { app, BrowserWindow, ipcMain, dialog, net, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { createHash, randomUUID } = require('node:crypto')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const {
  GITHUB_RELEASES_API,
  describeRelease,
  parseChecksumFile,
  selectChecksumAsset,
} = require('./updater.cjs')

const isDev = !app.isPackaged
const RELEASE_CACHE_DURATION = 5 * 60 * 1000
let cachedRelease
let cachedReleaseAt = 0

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf-8'))
    return {
      width: Math.max(480, Number(state.width) || 1440),
      height: Math.max(560, Number(state.height) || 900),
      x: Number.isFinite(state.x) ? state.x : undefined,
      y: Number.isFinite(state.y) ? state.y : undefined,
      maximized: Boolean(state.maximized),
    }
  } catch {
    return { width: 1440, height: 900, x: undefined, y: undefined, maximized: false }
  }
}

function createWindow() {
  const state = loadWindowState()
  const windowIcon = isDev
    ? path.join(__dirname, '../build/icon.png')
    : path.join(__dirname, '../dist/typesetly-logo.png')
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 480,
    minHeight: 560,
    backgroundColor: '#1a1a1a',
    icon: windowIcon,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  win.removeMenu()

  if (state.maximized) win.maximize()
  let saveTimer
  const persistWindowState = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
      try {
        fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true })
        fs.writeFileSync(windowStatePath(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }), 'utf-8')
      } catch {
        // Window-state persistence should never prevent the editor from closing.
      }
    }, 250)
  }
  win.on('resize', persistWindowState)
  win.on('move', persistWindowState)
  win.on('maximize', persistWindowState)
  win.on('unmaximize', persistWindowState)
  win.on('close', persistWindowState)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) require('electron').shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file:')
    if (!allowed) event.preventDefault()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

async function fetchLatestRelease(force = false) {
  if (!force && cachedRelease && Date.now() - cachedReleaseAt < RELEASE_CACHE_DURATION) {
    return cachedRelease
  }
  const response = await net.fetch(GITHUB_RELEASES_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Typesetly/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub update check failed (${response.status}).`)
  }
  const release = await response.json()
  cachedRelease = release
  cachedReleaseAt = Date.now()
  return release
}

function sendDownloadProgress(event, payload) {
  if (!event.sender.isDestroyed()) {
    event.sender.send('update-download-progress', payload)
  }
}

ipcMain.handle('check-for-updates', async (_event, payload = {}) => {
  try {
    const release = await fetchLatestRelease(Boolean(payload?.force))
    return describeRelease(release, app.getVersion(), process.platform, process.arch)
  } catch (error) {
    return {
      ok: false,
      currentVersion: app.getVersion(),
      error: error instanceof Error ? error.message : 'Typesetly could not check for updates.',
    }
  }
})

ipcMain.handle('download-latest-installer', async (event) => {
  let temporaryPath
  try {
    const release = await fetchLatestRelease(true)
    const status = describeRelease(release, app.getVersion(), process.platform, process.arch)
    if (!status.updateAvailable) {
      return { ok: false, error: `Typesetly ${status.currentVersion} is already up to date.` }
    }
    if (!status.installer) {
      return {
        ok: false,
        error: `Typesetly ${status.latestVersion} does not include an installer for this device.`,
      }
    }

    const checksumAsset = selectChecksumAsset(release.assets)
    if (!checksumAsset) {
      throw new Error('The release checksum file is missing, so the installer was not downloaded.')
    }
    const checksumResponse = await net.fetch(checksumAsset.browser_download_url)
    if (!checksumResponse.ok) {
      throw new Error(`The release checksum could not be downloaded (${checksumResponse.status}).`)
    }
    const expectedHash = parseChecksumFile(await checksumResponse.text(), status.installer.name)
    if (!expectedHash) {
      throw new Error('The selected installer is not listed in the release checksum file.')
    }

    const owner = BrowserWindow.fromWebContents(event.sender)
    const saveOptions = {
      title: `Download Typesetly ${status.latestVersion}`,
      defaultPath: path.join(app.getPath('downloads'), status.installer.name),
      buttonLabel: 'Download',
    }
    const choice = owner
      ? await dialog.showSaveDialog(owner, saveOptions)
      : await dialog.showSaveDialog(saveOptions)
    if (choice.canceled || !choice.filePath) return { ok: false, canceled: true }

    const response = await net.fetch(status.installer.url, {
      headers: { 'User-Agent': `Typesetly/${app.getVersion()}` },
    })
    if (!response.ok || !response.body) {
      throw new Error(`The installer download failed (${response.status}).`)
    }

    const total = Number(response.headers.get('content-length')) || status.installer.size || 0
    let received = 0
    let lastPercent = -1
    const hash = createHash('sha256')
    temporaryPath = path.join(
      app.getPath('temp'),
      `typesetly-update-${randomUUID()}-${path.basename(status.installer.name)}`,
    )
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length
        hash.update(chunk)
        const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0
        if (percent !== lastPercent) {
          lastPercent = percent
          sendDownloadProgress(event, { received, total, percent })
        }
        callback(null, chunk)
      },
    })

    await pipeline(
      Readable.fromWeb(response.body),
      progress,
      fs.createWriteStream(temporaryPath, { flags: 'wx' }),
    )
    const actualHash = hash.digest('hex').toLowerCase()
    if (actualHash !== expectedHash) {
      throw new Error('Installer verification failed. The downloaded file was discarded.')
    }

    fs.copyFileSync(temporaryPath, choice.filePath)
    fs.unlinkSync(temporaryPath)
    temporaryPath = undefined
    sendDownloadProgress(event, { received, total: total || received, percent: 100 })
    shell.showItemInFolder(choice.filePath)
    return {
      ok: true,
      filePath: choice.filePath,
      version: status.latestVersion,
      verified: true,
    }
  } catch (error) {
    if (temporaryPath && fs.existsSync(temporaryPath)) {
      try {
        fs.unlinkSync(temporaryPath)
      } catch {
        // A failed cleanup should not hide the actual download error.
      }
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The installer could not be downloaded.',
    }
  }
})

ipcMain.handle('save-docx', async (_event, { defaultName, buffer }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export DOCX',
    defaultPath: defaultName || 'book.docx',
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, Buffer.from(buffer))
  return { ok: true, filePath }
})

ipcMain.handle('save-json', async (_event, { defaultName, data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Book',
    defaultPath: defaultName || 'book.json',
    filters: [{ name: 'Typesetly Book', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return { ok: true, filePath }
})

ipcMain.handle('open-json', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Book',
    filters: [{ name: 'Typesetly Book', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths?.[0]) return { ok: false }
  const raw = fs.readFileSync(filePaths[0], 'utf-8')
  return { ok: true, data: JSON.parse(raw), filePath: filePaths[0] }
})

function findChildDirectory(parentPath, names) {
  if (!fs.existsSync(parentPath)) return undefined
  const entries = fs.readdirSync(parentPath, { withFileTypes: true })
  const match = entries.find((entry) =>
    entry.isDirectory() && names.includes(entry.name.toLowerCase()),
  )
  return match ? path.join(parentPath, match.name) : undefined
}

function resolveScrivenerSyncFolder(selectedPath) {
  const baseName = path.basename(selectedPath).toLowerCase()
  if (baseName === 'draft' || baseName === 'drafts') {
    return { rootPath: path.dirname(selectedPath), draftPath: selectedPath }
  }
  const draftPath = findChildDirectory(selectedPath, ['draft', 'drafts'])
  if (!draftPath) {
    throw new Error('Choose the external sync folder created by Scrivener, or its Draft subfolder.')
  }
  return { rootPath: selectedPath, draftPath }
}

function readScrivenerSyncFiles(rootPath) {
  const { draftPath } = resolveScrivenerSyncFolder(rootPath)
  const files = []
  const visit = (folderPath) => {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const filePath = path.join(folderPath, entry.name)
      if (entry.isDirectory()) {
        visit(filePath)
        continue
      }
      if (!/\.(rtf|txt|md|markdown)$/i.test(entry.name)) continue
      files.push({
        relativePath: path.relative(rootPath, filePath).split(path.sep).join('/'),
        text: fs.readFileSync(filePath, 'utf-8'),
        modifiedAt: fs.statSync(filePath).mtimeMs,
      })
    }
  }
  visit(draftPath)
  return files
}

ipcMain.handle('choose-scrivener-sync-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Choose Scrivener External Sync Folder',
    message: 'Choose the folder configured in Scrivener under File > Sync > with External Folder.',
    properties: ['openDirectory'],
  })
  if (canceled || !filePaths?.[0]) return { ok: false }
  try {
    const { rootPath } = resolveScrivenerSyncFolder(filePaths[0])
    return {
      ok: true,
      folderPath: rootPath,
      folderName: path.basename(rootPath),
      files: readScrivenerSyncFiles(rootPath),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The sync folder could not be opened.' }
  }
})

ipcMain.handle('read-scrivener-sync-folder', async (_event, { folderPath }) => {
  try {
    if (typeof folderPath !== 'string' || !folderPath.trim()) {
      throw new Error('No Scrivener sync folder is connected.')
    }
    const resolved = path.resolve(String(folderPath || ''))
    if (!path.isAbsolute(resolved) || !fs.existsSync(resolved)) {
      throw new Error('The saved Scrivener sync folder is no longer available.')
    }
    return {
      ok: true,
      folderPath: resolved,
      folderName: path.basename(resolved),
      files: readScrivenerSyncFiles(resolved),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The sync folder could not be read.' }
  }
})

ipcMain.handle('write-scrivener-sync-files', async (_event, { folderPath, files }) => {
  try {
    if (typeof folderPath !== 'string' || !folderPath.trim()) {
      throw new Error('No Scrivener sync folder is connected.')
    }
    const rootPath = path.resolve(String(folderPath || ''))
    resolveScrivenerSyncFolder(rootPath)
    let written = 0
    for (const file of Array.isArray(files) ? files : []) {
      const relativePath = String(file.relativePath || '').replaceAll('\\', '/')
      if (!/^drafts?\//i.test(relativePath) || path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
        throw new Error('A sync file path was outside the Scrivener Draft folder.')
      }
      if (!/\.(rtf|txt|md|markdown)$/i.test(relativePath)) {
        throw new Error('Only Scrivener-compatible text files can be synchronized.')
      }
      const targetPath = path.resolve(rootPath, ...relativePath.split('/'))
      const relativeTarget = path.relative(rootPath, targetPath)
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        throw new Error('A sync file path was outside the selected folder.')
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.writeFileSync(targetPath, String(file.text ?? ''), 'utf-8')
      written += 1
    }
    return { ok: true, written }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The sync files could not be written.' }
  }
})
