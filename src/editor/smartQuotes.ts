const OPENING_CONTEXT = /[\s([{—–-]/
const WORD_CHARACTER = /[\p{L}\p{N}]/u

function isWordCharacter(value: string) {
  return Boolean(value && WORD_CHARACTER.test(value))
}

/**
 * Converts straight punctuation using both sides of the character. Apostrophes
 * inside words are always closing marks, so contractions and possessives cannot
 * be mistaken for opening quotations.
 */
export function smartenPunctuation(text: string) {
  let output = ''
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character !== '"' && character !== "'") {
      output += character
      continue
    }
    const previous = text[index - 1] || ''
    const next = text[index + 1] || ''
    const opening = !previous || OPENING_CONTEXT.test(previous)
    if (character === '"') {
      output += opening ? '“' : '”'
    } else if (isWordCharacter(previous) && isWordCharacter(next)) {
      output += '’'
    } else if (opening && /\d/.test(next)) {
      output += '’'
    } else {
      output += opening ? '‘' : '’'
    }
  }
  return output
}

export function smartQuoteForInsertion(
  character: '"' | "'",
  previousCharacter: string,
) {
  if (character === "'" && isWordCharacter(previousCharacter)) return '’'
  const opening = !previousCharacter || OPENING_CONTEXT.test(previousCharacter)
  if (character === '"') return opening ? '“' : '”'
  return opening ? '‘' : '’'
}

export interface SmartDashInsertion {
  deleteBefore: number
  text: string
}

/**
 * Returns the replacement when typed text completes a common dash sequence.
 * Browsers normally deliver one character at a time, while IMEs and assistive
 * input can deliver a phrase at once, so both paths are normalized here.
 */
export function smartDashForInsertion(
  text: string,
  previousCharacter: string,
): SmartDashInsertion | undefined {
  if (!text.includes('-')) return undefined
  const includePrevious = previousCharacter === '-' || previousCharacter === '–'
  const combined = `${includePrevious ? previousCharacter : ''}${text}`
  const converted = combined
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/–-/g, '—')
  if (converted === combined) return undefined
  return { deleteBefore: includePrevious ? 1 : 0, text: converted }
}

const NEGATIVE_CONTRACTION_STEMS = new Set([
  'ain',
  'aren',
  'can',
  'couldn',
  'daren',
  'didn',
  'doesn',
  'don',
  'hadn',
  'hasn',
  'haven',
  'isn',
  'mightn',
  'mustn',
  'needn',
  'shan',
  'shouldn',
  'wasn',
  'weren',
  'won',
  'wouldn',
])

const AMBIGUOUS_BARE_STEMS = new Set([
  'he',
  'i',
  'it',
  'she',
  'that',
  'there',
  'they',
  'we',
  'what',
  'who',
  'you',
])

export interface QuoteDamageRepair {
  text: string
  repaired: number
  unresolved: number
}

/**
 * Repairs the precise damage produced by the older Scrivener RTF fallback bug:
 * a duplicated apostrophe followed by one swallowed character. Only unambiguous
 * negative contractions, doubled-L endings, and ordinary possessives are
 * restored automatically; ambiguous pronoun contractions remain for review.
 */
export function repairLegacyRtfQuoteDamage(text: string): QuoteDamageRepair {
  let repaired = 0
  let unresolved = 0
  const next = text.replace(
    /([\p{L}]+)(?:’{2}|'{2})([\p{L}]*)/gu,
    (match, left: string, right: string) => {
      const stem = left.toLocaleLowerCase()
      if (!right && NEGATIVE_CONTRACTION_STEMS.has(stem)) {
        repaired += 1
        return `${left}’t`
      }
      if (right.toLocaleLowerCase().startsWith('l')) {
        repaired += 1
        return `${left}’l${right}`
      }
      if (!right && !AMBIGUOUS_BARE_STEMS.has(stem)) {
        repaired += 1
        return `${left}’s`
      }
      unresolved += 1
      return match
    },
  )
  return { text: next, repaired, unresolved }
}
