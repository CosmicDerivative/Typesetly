const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('typesetly', {
  saveDocx: (payload) => ipcRenderer.invoke('save-docx', payload),
  saveJson: (payload) => ipcRenderer.invoke('save-json', payload),
  openJson: () => ipcRenderer.invoke('open-json'),
  chooseScrivenerSyncFolder: () => ipcRenderer.invoke('choose-scrivener-sync-folder'),
  readScrivenerSyncFolder: (payload) => ipcRenderer.invoke('read-scrivener-sync-folder', payload),
  writeScrivenerSyncFiles: (payload) => ipcRenderer.invoke('write-scrivener-sync-files', payload),
})
