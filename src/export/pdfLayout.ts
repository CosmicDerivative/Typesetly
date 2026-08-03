export interface PdfTextMeasurer {
  widthOfTextAtSize(text: string, size: number): number
}

/**
 * Wrap a paragraph while reserving space only on its first line for a
 * first-line indent. Later lines (including lines continued on another page)
 * use the full text width.
 */
export function wrapPdfParagraph(
  text: string,
  font: PdfTextMeasurer,
  size: number,
  width: number,
  hyphenate: boolean,
  firstLineWidth = width,
) {
  const wordWidth = Math.min(width, firstLineWidth)
  const words = text.split(/\s+/).filter(Boolean).flatMap((original) => {
    if (!hyphenate || font.widthOfTextAtSize(original, size) <= wordWidth) return [original]
    const approximate = Math.max(4, Math.floor((original.length * wordWidth) / font.widthOfTextAtSize(original, size)) - 1)
    const pieces: string[] = []
    let remaining = original
    while (remaining.length > approximate) {
      pieces.push(`${remaining.slice(0, approximate)}-`)
      remaining = remaining.slice(approximate)
    }
    if (remaining) pieces.push(remaining)
    return pieces
  })
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    const availableWidth = lines.length === 0 ? firstLineWidth : width
    if (line && font.widthOfTextAtSize(candidate, size) > availableWidth) {
      lines.push(line)
      line = word
    } else line = candidate
  }
  if (line) lines.push(line)
  return lines
}
