import type { PageType } from '../types'

const EPUB_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export function epubImageDataUrlParts(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  const mediaType = match[1]!.toLowerCase()
  const extension = EPUB_IMAGE_EXTENSIONS[mediaType]
  if (!extension) return null
  return {
    mediaType,
    extension,
    base64: match[2]!.replace(/\s+/g, ''),
  }
}

export function pageUsesChapterThemeArtwork(type: PageType) {
  return type === 'chapter' || type === 'part'
}

export function epubImageHrefMatchesMediaType(href: string, mediaType: string) {
  const extension = EPUB_IMAGE_EXTENSIONS[mediaType.toLowerCase()]
  return Boolean(extension && href.toLowerCase().endsWith(`.${extension}`))
}
