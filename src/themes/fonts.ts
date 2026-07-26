export interface FontFamilyGroup {
  label: string
  fonts: readonly string[]
}

/**
 * A broad set of publication-friendly system and commonly installed fonts.
 * Custom and embedded fonts remain supported by the Design workspace.
 */
export const FONT_FAMILY_GROUPS: readonly FontFamilyGroup[] = [
  {
    label: 'Book serif',
    fonts: [
      'Palatino Linotype',
      'Book Antiqua',
      'Garamond',
      'EB Garamond',
      'Georgia',
      'Libre Baskerville',
      'Baskerville',
      'Times New Roman',
      'Cambria',
      'Charter',
      'Constantia',
      'Crimson Pro',
      'Iowan Old Style',
      'Literata',
      'Lora',
      'Merriweather',
      'Noto Serif',
      'Source Serif 4',
    ],
  },
  {
    label: 'Sans serif',
    fonts: [
      'Source Sans 3',
      'Arial',
      'Helvetica',
      'Aptos',
      'Avenir Next',
      'Calibri',
      'Candara',
      'Century Gothic',
      'Franklin Gothic Book',
      'Futura',
      'Gill Sans',
      'Inter',
      'Noto Sans',
      'Segoe UI',
      'Tahoma',
      'Trebuchet MS',
      'Verdana',
    ],
  },
  {
    label: 'Monospace and accessible',
    fonts: [
      'Atkinson Hyperlegible',
      'OpenDyslexic',
      'Cascadia Mono',
      'Consolas',
      'Courier New',
      'Lucida Console',
      'Noto Sans Mono',
      'Source Code Pro',
    ],
  },
] as const

export const FONT_FAMILIES = FONT_FAMILY_GROUPS.flatMap((group) => group.fonts)

export function fontStack(font: string) {
  const escaped = font.replaceAll('"', '\\"')
  const normalized = font.toLocaleLowerCase()
  if (
    normalized.includes('sans')
    || normalized.includes('arial')
    || normalized.includes('helvetica')
    || normalized.includes('aptos')
    || normalized.includes('avenir')
    || normalized.includes('calibri')
    || normalized.includes('candara')
    || normalized.includes('gothic')
    || normalized.includes('franklin')
    || normalized.includes('futura')
    || normalized.includes('gill')
    || normalized.includes('inter')
    || normalized.includes('segoe')
    || normalized.includes('tahoma')
    || normalized.includes('trebuchet')
    || normalized.includes('verdana')
    || normalized.includes('hyperlegible')
    || normalized.includes('dyslexic')
  ) {
    return `"${escaped}", "Segoe UI", Arial, sans-serif`
  }
  if (
    normalized.includes('mono')
    || normalized.includes('consolas')
    || normalized.includes('courier')
    || normalized.includes('console')
    || normalized.includes('code')
  ) {
    return `"${escaped}", Consolas, "Courier New", monospace`
  }
  return `"${escaped}", Palatino, "Book Antiqua", Georgia, serif`
}
