export {}

declare global {
  interface Window {
    typesetly?: {
      saveDocx: (payload: {
        defaultName: string
        buffer: ArrayBuffer
      }) => Promise<{ ok: boolean; filePath?: string }>
      saveJson: (payload: {
        defaultName: string
        data: unknown
      }) => Promise<{ ok: boolean; filePath?: string }>
      openJson: () => Promise<{ ok: boolean; data?: unknown; filePath?: string }>
      chooseScrivenerSyncFolder: () => Promise<{
        ok: boolean
        folderPath?: string
        folderName?: string
        files?: Array<{ relativePath: string; text: string; modifiedAt?: number }>
        error?: string
      }>
      readScrivenerSyncFolder: (payload: { folderPath: string }) => Promise<{
        ok: boolean
        folderPath?: string
        folderName?: string
        files?: Array<{ relativePath: string; text: string; modifiedAt?: number }>
        error?: string
      }>
      writeScrivenerSyncFiles: (payload: {
        folderPath: string
        files: Array<{ relativePath: string; text: string }>
      }) => Promise<{ ok: boolean; written?: number; error?: string }>
      checkForUpdates: (payload?: { force?: boolean }) => Promise<{
        ok: boolean
        currentVersion: string
        latestVersion?: string
        updateAvailable?: boolean
        releaseUrl?: string
        installer?: { name: string; url: string; size: number }
        error?: string
      }>
      downloadLatestInstaller: () => Promise<{
        ok: boolean
        canceled?: boolean
        filePath?: string
        version?: string
        verified?: boolean
        error?: string
      }>
      onUpdateDownloadProgress: (callback: (progress: {
        received: number
        total: number
        percent: number
      }) => void) => () => void
    }
  }
}
