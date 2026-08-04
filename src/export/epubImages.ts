import type { PageType, ThemeChapterDecoration } from '../types'

export type EpubImageFile = {
  id: string
  href: string
  mediaType: string
  base64: string
}

export type EpubImageSource = Omit<EpubImageFile, 'id' | 'href'> & { extension: string }

/**
 * EPUB documents may reference the same artwork from many chapters. Package
 * identical bytes once and let every XHTML document point to that resource.
 */
export function createEpubImageRegistry() {
  const files: EpubImageFile[] = []
  const byContent = new Map<string, EpubImageFile>()

  return {
    files,
    add(image: EpubImageSource) {
      const key = `${image.mediaType}:${image.base64}`
      const existing = byContent.get(key)
      if (existing) return existing
      const id = `image-${files.length + 1}`
      const file = {
        id,
        href: `images/${id}.${image.extension}`,
        mediaType: image.mediaType,
        base64: image.base64,
      }
      files.push(file)
      byContent.set(key, file)
      return file
    },
    addNamed(image: EpubImageSource, id: string, href: string) {
      const file = { id, href, mediaType: image.mediaType, base64: image.base64 }
      files.push(file)
      return file
    },
  }
}

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

export function epubChapterDecorationStyle(decoration: ThemeChapterDecoration) {
  const flowAlignment = decoration.align === 'center'
    ? 'margin-left:auto;margin-right:auto;'
    : decoration.align === 'right'
      ? 'margin-left:auto;'
      : 'margin-right:auto;'
  const transform = `translate(${decoration.offsetX}%,${decoration.offsetY}px) rotate(${decoration.rotation}deg)`
  const position = decoration.placement === 'header-overlay'
    ? decoration.align === 'center'
      ? `position:absolute;top:0;left:50%;transform:translate(calc(-50% + ${decoration.offsetX}%),${decoration.offsetY}px) rotate(${decoration.rotation}deg);`
      : decoration.align === 'right'
        ? `position:absolute;top:0;right:0;transform:${transform};`
        : `position:absolute;top:0;left:0;transform:${transform};`
    : `transform:${transform};${flowAlignment}`
  return `width:${decoration.width}%;opacity:${decoration.opacity / 100};${position}`
}

export function epubImageHrefMatchesMediaType(href: string, mediaType: string) {
  const extension = EPUB_IMAGE_EXTENSIONS[mediaType.toLowerCase()]
  return Boolean(extension && href.toLowerCase().endsWith(`.${extension}`))
}
