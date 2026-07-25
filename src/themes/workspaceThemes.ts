import type { WorkspaceTheme } from '../types'

export interface WorkspaceThemePreset {
  id: WorkspaceTheme
  name: string
  description: string
  tone: 'light' | 'dark'
  swatches: readonly [string, string, string]
}

export const WORKSPACE_THEMES: readonly WorkspaceThemePreset[] = [
  { id: 'parchment', name: 'Parchment', description: 'Typesetly’s warm paper and plum palette.', tone: 'light', swatches: ['#fffdf9', '#eee4d7', '#3b1f2d'] },
  { id: 'paper', name: 'Clean Paper', description: 'A crisp white desk with calm navy details.', tone: 'light', swatches: ['#ffffff', '#edf2f7', '#18324a'] },
  { id: 'fog', name: 'Soft Fog', description: 'Low-distraction neutral grays for long sessions.', tone: 'light', swatches: ['#fbfbfa', '#e8e8e4', '#303536'] },
  { id: 'sepia', name: 'Sepia', description: 'A bookish cream palette with walnut ink.', tone: 'light', swatches: ['#fff8e8', '#ead9b9', '#503b2b'] },
  { id: 'solarized-light', name: 'Solarized Light', description: 'Balanced low-contrast color for bright rooms.', tone: 'light', swatches: ['#fdf6e3', '#eee8d5', '#268bd2'] },
  { id: 'mint', name: 'Quiet Mint', description: 'Soft eucalyptus surfaces with deep green ink.', tone: 'light', swatches: ['#f8fcf7', '#dcebe1', '#286351'] },
  { id: 'rose', name: 'Rosewater', description: 'A restrained blush workspace with berry accents.', tone: 'light', swatches: ['#fff9fa', '#f1dde2', '#8c3e59'] },
  { id: 'lavender', name: 'Lavender', description: 'Cool lilac paper with an ink-blue focus color.', tone: 'light', swatches: ['#fdfbff', '#e8e3f2', '#564a86'] },
  { id: 'midnight', name: 'Midnight', description: 'Typesetly’s warm plum dark workspace.', tone: 'dark', swatches: ['#21131a', '#402f36', '#d8aa58'] },
  { id: 'charcoal', name: 'Charcoal', description: 'Neutral graphite with cool blue focus accents.', tone: 'dark', swatches: ['#15191d', '#2b3238', '#73a9d8'] },
  { id: 'solarized-dark', name: 'Solarized Dark', description: 'Low-glare blue-green surfaces and precise accents.', tone: 'dark', swatches: ['#002b36', '#073642', '#2aa198'] },
  { id: 'forest', name: 'Forest', description: 'Deep evergreen tones for a quiet writing room.', tone: 'dark', swatches: ['#10221d', '#243a33', '#8db88a'] },
  { id: 'ocean', name: 'Deep Ocean', description: 'Night navy surfaces with clear cyan navigation.', tone: 'dark', swatches: ['#0c1b2a', '#1c3447', '#54b8c9'] },
  { id: 'aubergine', name: 'Aubergine', description: 'A dramatic violet-black desk with rose highlights.', tone: 'dark', swatches: ['#211623', '#3d2a3f', '#d68ca8'] },
  { id: 'nord', name: 'Nord', description: 'Cool polar grays with frost-blue accents.', tone: 'dark', swatches: ['#242933', '#3b4252', '#88c0d0'] },
  { id: 'high-contrast', name: 'High Contrast', description: 'Maximum separation with white text and gold focus.', tone: 'dark', swatches: ['#050505', '#1b1b1b', '#ffd84d'] },
]

const workspaceThemeIds = new Set<WorkspaceTheme>(WORKSPACE_THEMES.map((theme) => theme.id))

export function isWorkspaceTheme(value: unknown): value is WorkspaceTheme {
  return typeof value === 'string' && workspaceThemeIds.has(value as WorkspaceTheme)
}

export function isDarkWorkspaceTheme(theme: WorkspaceTheme) {
  return WORKSPACE_THEMES.find((preset) => preset.id === theme)?.tone === 'dark'
}

export function resolveWorkspaceTheme(value: unknown, legacyDarkMode = false): WorkspaceTheme {
  if (isWorkspaceTheme(value)) return value
  return legacyDarkMode ? 'midnight' : 'parchment'
}
