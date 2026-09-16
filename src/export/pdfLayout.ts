export interface PdfTextMeasurer {
  widthOfTextAtSize(text: string, size: number): number
}

/** Avoid the conspicuous rivers created by stretching sparse PDF lines. */
export function pdfJustifiedWordGap(
  availableWidth: number,
  wordsWidth: number,
  gapCount: number,
  naturalSpaceWidth: number,
) {
  if (gapCount < 1 || naturalSpaceWidth <= 0) return null
  const gap = (availableWidth - wordsWidth) / gapCount
  if (gap < naturalSpaceWidth * 0.72 || gap > naturalSpaceWidth * 1.8) return null
  return gap
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
  const wordWidth = Math.max(1, Math.min(width, firstLineWidth))
  const words = text.split(/\s+/).filter(Boolean).flatMap((original) => {
    if (font.widthOfTextAtSize(original, size) <= wordWidth) return [original]
    // Even with hyphenation disabled an unbroken URL/token must stay within
    // the print area. Measure actual glyphs rather than estimating by length.
    const pieces: string[] = []
    let remaining = Array.from(original)
    while (remaining.length && font.widthOfTextAtSize(remaining.join(''), size) > wordWidth) {
      let count = 1
      const suffix = hyphenate ? '-' : ''
      while (count < remaining.length && font.widthOfTextAtSize(remaining.slice(0, count + 1).join('') + suffix, size) <= wordWidth) count++
      const part = remaining.slice(0, count).join('')
      pieces.push(part + (font.widthOfTextAtSize(part + suffix, size) <= wordWidth ? suffix : ''))
      remaining = remaining.slice(count)
    }
    if (remaining.length) pieces.push(remaining.join(''))
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
