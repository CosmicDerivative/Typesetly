import { inlineImagesAsDataUrls } from '../library/images'
import { getImageBlob } from '../library/store'

/**
 * Exports and print output must be self-contained, but manuscript images live
 * as IndexedDB blobs referenced by session object URLs (or persistent refs in
 * stored data). This rewrites every image reference in the given value to an
 * inline data URL, matching what the exporters have always consumed.
 */
export async function prepareForExport<T>(value: T): Promise<T> {
  const raw = JSON.stringify(value)
  const inlined = await inlineImagesAsDataUrls(raw, (id) => getImageBlob(id))
  return inlined === raw ? value : (JSON.parse(inlined) as T)
}
