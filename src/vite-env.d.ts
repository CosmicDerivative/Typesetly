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
    }
  }
}
