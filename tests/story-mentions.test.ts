import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMentionIndex,
  characterMentionTerms,
  countNamedMentions,
} from '../src/story/mentions.ts'
import type { BookProject, CharacterProfile } from '../src/types.ts'

const character: CharacterProfile = {
  id: 'pip',
  name: 'Pip Barker',
  role: 'Protagonist',
  pronouns: '',
  age: '',
  aliases: 'Pip, Pips',
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

test('character mention terms include names and normalized aliases', () => {
  assert.deepEqual(characterMentionTerms(character), ['pip barker', 'pip', 'pips'])
})

test('mention counting respects word boundaries and longest aliases', () => {
  assert.equal(countNamedMentions('Pip met Pip Barker. Pippin did not.', ['Pip Barker', 'Pip']), 2)
})

test('mention index maps story entities to the chapters that name them', () => {
  const project = {
    chapters: [
      { id: 'one', title: 'Arrival', subtitle: '', content: '<p>Pip entered Boston.</p>' },
      { id: 'two', title: 'Elsewhere', subtitle: '', content: '<p>Beantown was quiet.</p>' },
    ],
    storyBible: {
      characters: [character],
      world: [{
        id: 'boston',
        name: 'Boston',
        aliases: 'Beantown',
        category: 'location',
        summary: '',
        details: '',
        rules: '',
        connections: '',
        notes: '',
        tags: [],
      }],
      relationships: [],
    },
  } as BookProject

  const index = buildMentionIndex(project)
  assert.equal(index.pip.total, 1)
  assert.equal(index.boston.total, 2)
  assert.deepEqual(index.pip.chapters.map((chapter) => chapter.chapterId), ['one'])
  assert.deepEqual(index.boston.chapters.map((chapter) => chapter.chapterId), ['one', 'two'])
})
