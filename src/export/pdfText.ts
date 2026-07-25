const PRINT_FALLBACKS: Record<string, string> = {
  '\u00a0': ' ',
  '⁂': '* * *',
  '❀': '*',
  '◆': '*',
  '❖': '*',
  '◇': '*',
  '★': '*',
  '☆': '*',
  '♥': '*',
  '🐾': '* * *',
}

export interface PdfSafeText {
  text: string
  replaced: string[]
}

/**
 * Standard PDF fonts only support a Windows ANSI character set. Keep export
 * resilient by retaining supported glyphs, transliterating accented Latin
 * characters where possible, and substituting print-safe ornaments.
 */
export function pdfSafeText(value: string, characterSet: Iterable<number>): PdfSafeText {
  const supported = characterSet instanceof Set ? characterSet : new Set(characterSet)
  const replaced = new Set<string>()
  let text = ''

  for (const character of Array.from(value.normalize('NFC'))) {
    const codePoint = character.codePointAt(0)
    if (codePoint != null && supported.has(codePoint)) {
      text += character
      continue
    }

    replaced.add(character)
    const fallback = PRINT_FALLBACKS[character]
      || character.normalize('NFKD').replace(/\p{Mark}/gu, '')
    const printableFallback = Array.from(fallback)
      .filter((candidate) => supported.has(candidate.codePointAt(0) || -1))
      .join('')
    text += printableFallback || '?'
  }

  return { text, replaced: [...replaced] }
}
