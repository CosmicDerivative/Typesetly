export interface MarkdownFile {
  relativePath: string
  text: string
}

export interface MarkdownMapping {
  chapterId: string
  relativePath: string
  local: string
  source: string
  conflict?: boolean
}

export interface ObsidianConnection {
  folderPath: string
  folderName: string
  files: MarkdownMapping[]
  lastSyncedAt: string
  ignoredChapterIds?: string[]
}

export interface VaultSnapshot {
  ok: boolean
  folderPath?: string
  folderName?: string
  files?: MarkdownFile[]
  assets?: Record<string, string>
  error?: string
}

export interface MarkdownWrite extends MarkdownFile {
  expected: string | null
}
