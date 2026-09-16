const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('typesetly', {
  chooseObsidianVault: () => ipcRenderer.invoke('choose-obsidian-vault'),
  readObsidianVault: (payload) => ipcRenderer.invoke('read-obsidian-vault', payload),
  writeObsidianVault: (payload) => ipcRenderer.invoke('write-obsidian-vault', payload),
  saveDocx: (payload) => ipcRenderer.invoke('save-docx', payload),
  saveJson: (payload) => ipcRenderer.invoke('save-json', payload),
  openJson: () => ipcRenderer.invoke('open-json'),
  chooseScrivenerSyncFolder: () => ipcRenderer.invoke('choose-scrivener-sync-folder'),
  readScrivenerSyncFolder: (payload) => ipcRenderer.invoke('read-scrivener-sync-folder', payload),
  writeScrivenerSyncFiles: (payload) => ipcRenderer.invoke('write-scrivener-sync-files', payload),
  checkForUpdates: (payload) => ipcRenderer.invoke('check-for-updates', payload),
  installLatestUpdate: () => ipcRenderer.invoke('install-latest-update'),
  onUpdateDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update-download-progress', listener)
    return () => ipcRenderer.removeListener('update-download-progress', listener)
  },
})
