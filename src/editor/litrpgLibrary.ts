import type { BookProject, CharacterProfile, LitRpgCharacterScreen, LitRpgUserTemplate } from '../types.ts'
import {
  cloneLitRpgDraft,
  litRpgDraftFromStored,
  litRpgPreset,
  normalizeLitRpgDraft,
  type LitRpgBlockDraft,
  type LitRpgBlockKind,
  type LitRpgBlockProvenance,
} from './litrpg.ts'

export interface LitRpgScreenGroup {
  characterId?: string
  characterName: string
  screens: LitRpgCharacterScreen[]
}

export interface OpenLitRpgLibraryRequest {
  draft: LitRpgBlockDraft
  provenance?: LitRpgBlockProvenance
  initialTab?: 'design' | 'library'
}

let pendingOpenLitRpgLibrary: OpenLitRpgLibraryRequest | null = null

export function requestOpenLitRpgLibrary(detail: OpenLitRpgLibraryRequest) {
  pendingOpenLitRpgLibrary = {
    draft: cloneLitRpgDraft(detail.draft),
    provenance: detail.provenance ? { ...detail.provenance } : undefined,
    initialTab: detail.initialTab || 'design',
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('typesetly:open-litrpg-library', {
      detail: pendingOpenLitRpgLibrary,
    }))
  }
}

export function consumePendingOpenLitRpgLibrary(): OpenLitRpgLibraryRequest | null {
  const next = pendingOpenLitRpgLibrary
  pendingOpenLitRpgLibrary = null
  return next
}

export function normalizeStoredLitRpgDraft(value: unknown): LitRpgBlockDraft {
  return cloneLitRpgDraft(litRpgDraftFromStored(value))
}

export function serializeLitRpgDraft(draft: LitRpgBlockDraft): LitRpgBlockDraft {
  return cloneLitRpgDraft(normalizeLitRpgDraft(draft))
}

export function litRpgScreenDisplayLabel(
  screen: LitRpgCharacterScreen,
  characters: CharacterProfile[] = [],
): string {
  const character = characters.find((item) => item.id === screen.characterId)
  const title = String((screen.draft as { title?: string } | undefined)?.title || '').trim()
  if (screen.name?.trim()) return screen.name.trim()
  if (character?.name?.trim() && title) return `${character.name.trim()} · ${title}`
  if (character?.name?.trim()) return `${character.name.trim()} · Status`
  if (title) return title
  return 'Untitled screen'
}

export function normalizeLitRpgUserTemplate(template: Partial<LitRpgUserTemplate> & { id?: string }): LitRpgUserTemplate {
  const now = new Date().toISOString()
  const draft = normalizeStoredLitRpgDraft(template.draft)
  return {
    id: template.id || '',
    name: template.name?.trim() || draft.title.trim() || 'Untitled template',
    kind: draft.kind,
    draft,
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || template.createdAt || now,
  }
}

export function normalizeLitRpgCharacterScreen(
  screen: Partial<LitRpgCharacterScreen> & { id?: string },
): LitRpgCharacterScreen {
  const now = new Date().toISOString()
  const draft = normalizeStoredLitRpgDraft(screen.draft)
  return {
    id: screen.id || '',
    characterId: screen.characterId || undefined,
    name: screen.name?.trim() || draft.title.trim() || 'Untitled screen',
    kind: (screen.kind as LitRpgBlockKind | undefined) || draft.kind,
    draft,
    revision: Number.isFinite(screen.revision) ? Math.max(1, Math.floor(Number(screen.revision))) : 1,
    createdAt: screen.createdAt || now,
    updatedAt: screen.updatedAt || screen.createdAt || now,
  }
}

export function listLitRpgScreensByCharacter(
  project: Pick<BookProject, 'litrpgCharacterScreens' | 'storyBible'>,
): LitRpgScreenGroup[] {
  const characters = project.storyBible?.characters || []
  const screens = (project.litrpgCharacterScreens || []).map((screen) => normalizeLitRpgCharacterScreen(screen))
  const byCharacter = new Map<string, LitRpgScreenGroup>()

  for (const character of characters) {
    byCharacter.set(character.id, {
      characterId: character.id,
      characterName: character.name?.trim() || 'Unnamed character',
      screens: [],
    })
  }

  const unassigned: LitRpgScreenGroup = {
    characterId: undefined,
    characterName: 'Unassigned',
    screens: [],
  }

  for (const screen of screens) {
    const group = screen.characterId && byCharacter.has(screen.characterId)
      ? byCharacter.get(screen.characterId)!
      : unassigned
    group.screens.push(screen)
  }

  const groups = [...byCharacter.values()].filter((group) => group.screens.length > 0)
  if (unassigned.screens.length) groups.push(unassigned)
  return groups
}

export function filterLitRpgTemplates(
  templates: LitRpgUserTemplate[],
  query: string,
): LitRpgUserTemplate[] {
  const needle = query.trim().toLowerCase()
  const normalized = templates.map((template) => normalizeLitRpgUserTemplate(template))
  if (!needle) return normalized
  return normalized.filter((template) => {
    const haystack = [
      template.name,
      template.kind,
      template.draft.title,
      template.draft.subtitle,
      template.draft.footer,
    ].join(' ').toLowerCase()
    return haystack.includes(needle)
  })
}

export function filterLitRpgScreenGroups(
  groups: LitRpgScreenGroup[],
  query: string,
  characters: CharacterProfile[] = [],
): LitRpgScreenGroup[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return groups
  return groups
    .map((group) => ({
      ...group,
      screens: group.screens.filter((screen) => {
        const haystack = [
          litRpgScreenDisplayLabel(screen, characters),
          screen.name,
          screen.kind,
          screen.draft.title,
          screen.draft.subtitle,
          group.characterName,
        ].join(' ').toLowerCase()
        return haystack.includes(needle)
      }),
    }))
    .filter((group) => group.screens.length > 0)
}

export function emptyLitRpgDraftForKind(kind: LitRpgBlockKind = 'stat-screen'): LitRpgBlockDraft {
  return cloneLitRpgDraft(litRpgPreset(kind))
}
