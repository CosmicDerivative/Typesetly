import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneLitRpgDraft, litRpgPreset } from '../src/editor/litrpg.ts'
import {
  filterLitRpgScreenGroups,
  filterLitRpgTemplates,
  listLitRpgScreensByCharacter,
  normalizeLitRpgCharacterScreen,
  normalizeLitRpgUserTemplate,
} from '../src/editor/litrpgLibrary.ts'
import type { BookProject, CharacterProfile, LitRpgCharacterScreen } from '../src/types.ts'

function character(id: string, name: string): CharacterProfile {
  return {
    id,
    name,
    role: '',
    pronouns: '',
    age: '',
    aliases: '',
    summary: '',
    appearance: '',
    personality: '',
    motivation: '',
    conflict: '',
    arc: '',
    relationships: '',
    notes: '',
    tags: [],
  }
}

function screen(partial: Partial<LitRpgCharacterScreen> & { id: string; name: string }): LitRpgCharacterScreen {
  return normalizeLitRpgCharacterScreen({
    ...partial,
    draft: partial.draft || litRpgPreset('stat-screen'),
  })
}

test('listLitRpgScreensByCharacter groups characters first and Unassigned last', () => {
  const characters = [character('c-a', 'Ava'), character('c-b', 'Bram')]
  const project = {
    litrpgCharacterScreens: [
      screen({ id: 's-orphan', name: 'Orphan tip', characterId: 'missing' }),
      screen({ id: 's-b', name: 'Bram Status', characterId: 'c-b' }),
      screen({ id: 's-unlinked', name: 'Loose tip' }),
      screen({ id: 's-a', name: 'Ava Status', characterId: 'c-a' }),
    ],
    storyBible: { characters, world: [], relationships: [] },
  } as Pick<BookProject, 'litrpgCharacterScreens' | 'storyBible'>

  const groups = listLitRpgScreensByCharacter(project)
  assert.deepEqual(groups.map((group) => group.characterName), ['Ava', 'Bram', 'Unassigned'])
  assert.equal(groups[0].characterId, 'c-a')
  assert.equal(groups[1].characterId, 'c-b')
  assert.equal(groups[2].characterId, undefined)
  assert.deepEqual(groups[0].screens.map((item) => item.id), ['s-a'])
  assert.deepEqual(groups[1].screens.map((item) => item.id), ['s-b'])
  assert.deepEqual(groups[2].screens.map((item) => item.id).sort(), ['s-orphan', 's-unlinked'])
})

test('normalizeLitRpgCharacterScreen create vs update shapes', () => {
  const draft = litRpgPreset('system-message')
  draft.title = 'Daily Quests'
  const createShape = normalizeLitRpgCharacterScreen({
    name: 'Kharem - Quests',
    characterId: 'c-1',
    draft,
  })
  assert.equal(createShape.id, '')
  assert.equal(createShape.revision, 1)
  assert.equal(createShape.kind, 'system-message')

  const updateShape = normalizeLitRpgCharacterScreen({
    id: 'screen-1',
    name: 'Kharem - Quests',
    characterId: 'c-1',
    draft,
    revision: 4,
  })
  assert.equal(updateShape.id, 'screen-1')
  assert.equal(updateShape.revision, 4)
})

test('cloneLitRpgDraft isolates mutations from the source tip', () => {
  const tip = litRpgPreset('stat-screen')
  tip.title = 'Kharem'
  tip.rows = [{ cells: ['STR', '10'] }]
  const snapshot = cloneLitRpgDraft(tip)
  tip.title = 'Kharem - Late'
  tip.rows[0].cells[1] = '22'
  assert.equal(snapshot.title, 'Kharem')
  assert.equal(snapshot.rows[0].cells[1], '10')
  snapshot.rows[0].cells[0] = 'Strength'
  assert.equal(tip.rows[0].cells[0], 'STR')
})

test('filter helpers match name, kind, and character grouping text', () => {
  const templates = [
    normalizeLitRpgUserTemplate({
      id: 't1',
      name: 'Boss panel',
      draft: { ...litRpgPreset('stat-screen'), title: 'Raid Boss' },
    }),
    normalizeLitRpgUserTemplate({
      id: 't2',
      name: 'Loot card',
      draft: litRpgPreset('item-info'),
    }),
  ]
  assert.deepEqual(filterLitRpgTemplates(templates, 'boss').map((item) => item.id), ['t1'])
  assert.deepEqual(filterLitRpgTemplates(templates, 'item').map((item) => item.id), ['t2'])

  const groups = listLitRpgScreensByCharacter({
    litrpgCharacterScreens: [
      screen({ id: 's1', name: 'Status', characterId: 'c-a', draft: { ...litRpgPreset('stat-screen'), title: 'Ava' } }),
      screen({ id: 's2', name: 'Inventory', characterId: 'c-b', draft: litRpgPreset('skill-selection') }),
    ],
    storyBible: {
      characters: [character('c-a', 'Ava'), character('c-b', 'Bram')],
      world: [],
      relationships: [],
    },
  })
  const filtered = filterLitRpgScreenGroups(groups, 'inventory', [character('c-a', 'Ava'), character('c-b', 'Bram')])
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].screens[0].id, 's2')
})
