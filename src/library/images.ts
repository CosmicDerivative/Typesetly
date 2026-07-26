/**
 * Manuscript images live as Blobs in IndexedDB. Closed books keep only tiny
 * `typesetly-image://` refs in metadata. Visible images hydrate to data URLs
 * on demand (object URLs from IDB blobs do not paint reliably here). Export
 * and snapshots also inline data URLs only when packaging a file.
 */

export const IMAGE_REF_PREFIX = 'typesetly-image://'

export interface StoredImageRecord {
  id: string
  /** Owning book, or 'library' for theme-level images shared across books. */
  bookId: string
  blob: Blob
  createdAt: string
}

const IMAGE_REF_PATTERN = /typesetly-image:\/\/([A-Za-z0-9-]+)/g
const OBJECT_URL_PATTERN = /blob:[^"'\\\s)<>]+/g
const DATA_URL_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{64,}/gi

const urlById = new Map<string, string>()
const idByUrl = new Map<string, string>()

export function imageRef(id: string): string {
  return `${IMAGE_REF_PREFIX}${id}`
}

export function isImageRef(src: string | undefined): src is string {
  return Boolean(src?.startsWith(IMAGE_REF_PREFIX))
}

export function imageIdFromRef(src: string): string | undefined {
  if (!src.startsWith(IMAGE_REF_PREFIX)) return undefined
  return src.slice(IMAGE_REF_PREFIX.length)
}

/**
 * Registers a session display URL for a stored blob.
 *
 * Uses a data URL rather than `URL.createObjectURL`. Object URLs created from
 * IndexedDB blobs (and even fresh Blobs) fail to paint in the desktop shell
 * and IDE browser we ship against; data URLs always render. Callers should
 * only register images that are actually on screen so memory stays bounded.
 */
export async function registerImageUrl(id: string, blob: Blob): Promise<string> {
  const existing = urlById.get(id)
  if (existing) return existing
  const url = await blobToDataUrl(blob)
  urlById.set(id, url)
  idByUrl.set(url, id)
  return url
}

export function imageUrlFor(id: string): string | undefined {
  return urlById.get(id)
}

export function imageIdForUrl(url: string): string | undefined {
  return idByUrl.get(url)
}

/** Sync resolve: registry hit, passthrough for data/blob/http, else undefined for refs. */
export function displayImageSrc(src?: string): string | undefined {
  if (!src) return undefined
  if (src.startsWith(IMAGE_REF_PREFIX)) {
    return imageUrlFor(src.slice(IMAGE_REF_PREFIX.length))
  }
  return src
}

/** Test-only: clears the session URL registry. */
export function resetImageRegistry() {
  urlById.clear()
  idByUrl.clear()
}

export function collectImageRefIds(text: string): string[] {
  const ids = new Set<string>()
  for (const match of text.matchAll(IMAGE_REF_PATTERN)) ids.add(match[1])
  return [...ids]
}

export function hydrateImageRefs(
  text: string,
  resolve: (id: string) => string | undefined,
): string {
  if (!text.includes(IMAGE_REF_PREFIX)) return text
  return text.replace(IMAGE_REF_PATTERN, (whole, id: string) => resolve(id) ?? whole)
}

/**
 * Maps session display URLs back to persistent refs. Unmapped `blob:` URLs are
 * removed so a dead session URL cannot be written into IndexedDB.
 */
export function dehydrateImageUrls(text: string): string {
  let result = text
  if (result.includes('blob:')) {
    result = result.replace(OBJECT_URL_PATTERN, (url) => {
      const id = idByUrl.get(url)
      return id ? imageRef(id) : ''
    })
  }
  for (const [url, id] of idByUrl) {
    if (!url.startsWith('data:') || !result.includes(url)) continue
    result = result.split(url).join(imageRef(id))
  }
  return result
}

/**
 * Pulls base64 images out of a string, replacing each with a persistent ref
 * only when the payload can actually be stored as a Blob. Failed conversions
 * leave the original data URL in place so we never create orphan refs.
 */
export function extractDataUrlImages(
  text: string,
  makeId: () => string,
  cache: Map<string, string>,
): { text: string; images: Array<{ id: string; dataUrl: string }> } {
  if (!text.includes('data:image/')) return { text, images: [] }
  const images: Array<{ id: string; dataUrl: string }> = []
  const next = text.replace(DATA_URL_PATTERN, (dataUrl) => {
    let id = cache.get(dataUrl)
    if (!id) {
      if (!dataUrlToBlob(dataUrl)) return dataUrl
      id = makeId()
      cache.set(dataUrl, id)
      images.push({ id, dataUrl })
    }
    return imageRef(id)
  })
  return { text: next, images }
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: match[1] })
  } catch {
    return null
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

/**
 * Export/snapshot only: expand refs (and known object URLs) to inline data URLs.
 */
export async function inlineImagesAsDataUrls(
  text: string,
  loadBlob: (id: string) => Promise<Blob | null>,
): Promise<string> {
  const wanted = new Map<string, string>()
  for (const id of collectImageRefIds(text)) wanted.set(imageRef(id), id)
  for (const match of text.matchAll(OBJECT_URL_PATTERN)) {
    const id = idByUrl.get(match[0])
    if (id) wanted.set(match[0], id)
  }
  if (!wanted.size) return text
  const dataUrlById = new Map<string, string>()
  for (const id of new Set(wanted.values())) {
    const blob = await loadBlob(id)
    if (blob) dataUrlById.set(id, await blobToDataUrl(blob))
  }
  let result = text
  for (const [needle, id] of wanted) {
    const dataUrl = dataUrlById.get(id)
    if (dataUrl) result = result.split(needle).join(dataUrl)
  }
  return result
}
