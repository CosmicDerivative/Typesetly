const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const { describeUpdateCheck } = require('./updater.cjs')

const isDev = !app.isPackaged
let latestUpdateCheck
let updateDownloadInProgress

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.autoRunAppAfterInstall = true
autoUpdater.allowPrerelease = false
autoUpdater.disableWebInstaller = true

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

function broadcastUpdateProgress(payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('update-download-progress', payload)
    }
  }
}

autoUpdater.on('download-progress', (progress) => {
  broadcastUpdateProgress({
    received: progress.transferred,
    total: progress.total,
    percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
  })
})

// checkForUpdates rejects as well; registering this listener prevents an
// EventEmitter "error" from becoming an uncaught main-process exception.
autoUpdater.on('error', (error) => {
  console.error('Typesetly updater:', error)
})

async function checkForDesktopUpdate() {
  if (!app.isPackaged) {
    return {
      ok: true,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      updateAvailable: false,
      development: true,
    }
  }
  latestUpdateCheck = await autoUpdater.checkForUpdates()
  return describeUpdateCheck(latestUpdateCheck, app.getVersion())
}

ipcMain.handle('check-for-updates', async () => {
  try {
    return await checkForDesktopUpdate()
  } catch (error) {
    return {
      ok: false,
      currentVersion: app.getVersion(),
      error: error instanceof Error ? error.message : 'Typesetly could not check for updates.',
    }
  }
})

ipcMain.handle('install-latest-update', async () => {
  try {
    if (!app.isPackaged) {
      return { ok: false, error: 'Automatic updates are available in packaged desktop builds.' }
    }
    if (!latestUpdateCheck?.isUpdateAvailable) {
      await checkForDesktopUpdate()
    }
    if (!latestUpdateCheck?.isUpdateAvailable) {
      return { ok: false, error: `Typesetly ${app.getVersion()} is already up to date.` }
    }
    if (!updateDownloadInProgress) {
      updateDownloadInProgress = autoUpdater.downloadUpdate()
        .finally(() => { updateDownloadInProgress = undefined })
    }
    await updateDownloadInProgress
    const version = latestUpdateCheck.updateInfo.version
    broadcastUpdateProgress({ received: 1, total: 1, percent: 100 })

    // Resolve the renderer request first so it can announce the restart, then
    // let electron-updater close the app, install silently on Windows, and
    // relaunch. Other supported targets use their native install handoff.
    setTimeout(() => {
      autoUpdater.quitAndInstall(process.platform === 'win32', true)
    }, 500)
    return {
      ok: true,
      version,
      verified: true,
      installing: true,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The update could not be installed.',
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
