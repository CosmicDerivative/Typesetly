import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detachSceneNotes,
  insertSceneNoteGap,
  moveSceneNotesBetweenChapters,
  reorderSceneNotes,
} from '../src/notes/sceneNotes.ts'
import type { StickyNote } from '../src/types.ts'

function sceneNote(id: string, chapterId: string, sceneIndex: number): StickyNote {
  return {
    id,
    title: id,
    body: '',
    color: 'gold',
    target: 'scene',
    chapterId,
    sceneIndex,
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
  }
}

test('scene-note indices follow inserts and within-chapter reordering', () => {
  const notes = [
    sceneNote('first', 'chapter-a', 0),
    sceneNote('second', 'chapter-a', 1),
    sceneNote('third', 'chapter-a', 2),
  ]
  const inserted = insertSceneNoteGap(notes, 'chapter-a', 1)
  assert.deepEqual(inserted.map((note) => note.sceneIndex), [0, 2, 3])

  const reordered = reorderSceneNotes(notes, 'chapter-a', 0, 2)
  assert.deepEqual(reordered.map((note) => note.sceneIndex), [2, 0, 1])
})

test('scene notes move with their scene across chapters', () => {
  const notes = [
    sceneNote('moved', 'chapter-a', 1),
    sceneNote('source-after', 'chapter-a', 2),
    sceneNote('target-after', 'chapter-b', 1),
  ]
  const moved = moveSceneNotesBetweenChapters(notes, 'chapter-a', 1, 'chapter-b', 1)
  assert.deepEqual(
    moved.map((note) => [note.id, note.chapterId, note.sceneIndex]),
    [
      ['moved', 'chapter-b', 1],
      ['source-after', 'chapter-a', 1],
      ['target-after', 'chapter-b', 2],
    ],
  )
})

test('deleting a scene detaches its notes and closes the remaining index gap', () => {
  const notes = [
    sceneNote('before', 'chapter-a', 0),
    sceneNote('deleted', 'chapter-a', 1),
    sceneNote('after', 'chapter-a', 2),
  ]
  const result = detachSceneNotes(notes, 'chapter-a', 1)
  assert.deepEqual(result.detached.map((note) => note.id), ['deleted'])
  assert.deepEqual(
    result.remaining.map((note) => [note.id, note.sceneIndex]),
    [['before', 0], ['after', 1]],
  )
})
