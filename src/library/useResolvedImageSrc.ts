import { useEffect, useState } from 'react'
import {
  IMAGE_REF_PREFIX,
  displayImageSrc,
  imageIdFromRef,
  imageUrlFor,
  isImageRef,
} from './images'
import { ensureImageDisplayUrl } from './store'

/**
 * Resolves a stored image ref to a displayable data URL on demand so React
 * state can keep `typesetly-image://` refs without holding image bytes.
 */
export function useResolvedImageSrc(src?: string): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() => {
    if (!src || src.startsWith('blob:')) return undefined
    return displayImageSrc(src) ?? (!isImageRef(src) ? src : undefined)
  })

  useEffect(() => {
    if (!src || src.startsWith('blob:')) {
      // Stale session object URLs cannot be revived after a reload.
      setResolved(undefined)
      return
    }
    if (!src.startsWith(IMAGE_REF_PREFIX)) {
      setResolved(src)
      return
    }
    const id = imageIdFromRef(src)
    if (!id) {
      setResolved(undefined)
      return
    }
    const cached = imageUrlFor(id)
    if (cached) {
      setResolved(cached)
      return
    }
    let active = true
    void ensureImageDisplayUrl(id).then((url) => {
      if (active) setResolved(url)
    })
    return () => {
      active = false
    }
  }, [src])

  return resolved
}
