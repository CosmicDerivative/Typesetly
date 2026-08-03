import type { CSSProperties } from 'react'
import type { ThemeChapterDecoration } from '../types'
import { useResolvedImageSrc } from '../library/useResolvedImageSrc'

function DecorationImage({ decoration }: { decoration: ThemeChapterDecoration }) {
  const src = useResolvedImageSrc(decoration.imageDataUrl)
  if (!src) return null
  const alignTransform = decoration.align === 'center'
    ? 'translateX(-50%)'
    : decoration.align === 'right'
      ? 'translateX(-100%)'
      : ''
  const style = {
    '--decoration-width': `${decoration.width}%`,
    '--decoration-x': `${decoration.offsetX}%`,
    '--decoration-y': `${decoration.offsetY}px`,
    '--decoration-opacity': decoration.opacity / 100,
    '--decoration-rotation': `${decoration.rotation}deg`,
    '--decoration-anchor': decoration.align === 'left' ? '0%' : decoration.align === 'right' ? '100%' : '50%',
    '--decoration-anchor-transform': alignTransform,
    marginLeft: decoration.align === 'center' || decoration.align === 'right' ? 'auto' : undefined,
    marginRight: decoration.align === 'center' || decoration.align === 'left' ? 'auto' : undefined,
  } as CSSProperties
  return <img src={src} alt="" aria-hidden className="chapter-decoration-image" style={style} />
}

export function ChapterDecorations({
  decorations,
  placement,
  className = '',
}: {
  decorations: ThemeChapterDecoration[]
  placement: ThemeChapterDecoration['placement']
  className?: string
}) {
  const selected = decorations.filter((item) => item.placement === placement && item.imageDataUrl)
  if (!selected.length) return null
  return (
    <div className={`chapter-decorations ${placement} ${className}`.trim()} aria-hidden>
      {selected.map((decoration) => <DecorationImage key={decoration.id} decoration={decoration} />)}
    </div>
  )
}
