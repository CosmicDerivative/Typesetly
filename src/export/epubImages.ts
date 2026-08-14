import type { PageType, ThemeChapterDecoration } from '../types'

export type EpubImageFile = {
  id: string
  href: string
  mediaType: string
  base64: string
}

export type EpubImageSource = Omit<EpubImageFile, 'id' | 'href'> & { extension: string }

function canonicalImageMediaType(mediaType: string) {
  const normalized = mediaType.toLowerCase()
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

function canonicalImageExtension(mediaType: string, extension: string) {
  return canonicalImageMediaType(mediaType) === 'image/jpeg' ? 'jpg' : extension.toLowerCase()
}

function canonicalBase64(base64: string) {
  const unpadded = base64.replace(/\s+/g, '').replace(/=+$/, '')
  return `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`
}

function imageContentKey(image: EpubImageSource) {
  // Padding is optional in base64, and browsers disagree on whether a .jpg
  // Blob is reported as image/jpg or image/jpeg. Neither difference means the
  // underlying image should be packaged again.
  return `${canonicalImageMediaType(image.mediaType)}:${canonicalBase64(image.base64).replace(/=+$/, '')}`
}

/**
 * EPUB documents may reference the same artwork from many chapters. Package
 * identical bytes once and let every XHTML document point to that resource.
 */
export function createEpubImageRegistry() {
  const files: EpubImageFile[] = []
  const byContent = new Map<string, EpubImageFile>()
  let references = 0
  let reusedReferences = 0

  return {
    files,
    add(image: EpubImageSource) {
      references += 1
      const key = imageContentKey(image)
      const existing = byContent.get(key)
      if (existing) {
        reusedReferences += 1
        return existing
      }
      const id = `image-${files.length + 1}`
      const file = {
        id,
        href: `images/${id}.${canonicalImageExtension(image.mediaType, image.extension)}`,
        mediaType: canonicalImageMediaType(image.mediaType),
        base64: canonicalBase64(image.base64),
      }
      files.push(file)
      byContent.set(key, file)
      return file
    },
    addNamed(image: EpubImageSource, id: string, href: string) {
      references += 1
      const key = imageContentKey(image)
      const existing = byContent.get(key)
      if (existing) {
        reusedReferences += 1
        existing.id = id
        return existing
      }
      const file = {
        id,
        href,
        mediaType: canonicalImageMediaType(image.mediaType),
        base64: canonicalBase64(image.base64),
      }
      files.push(file)
      byContent.set(key, file)
      return file
    },
    stats() {
      return { references, uniqueFiles: files.length, reusedReferences }
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

/**
 * Empty and unresolved local image sources cannot be packaged into an EPUB.
 * They can be left behind by old imports or by a missing IndexedDB image blob.
 */
export function epubImageSourceIsUnavailable(source: string | null | undefined) {
  const normalized = source?.trim() || ''
  return !normalized
    || normalized.startsWith('typesetly-image://')
    || normalized.startsWith('blob:')
}

export function pageUsesChapterThemeArtwork(type: PageType) {
  return type === 'chapter'
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
