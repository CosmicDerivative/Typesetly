import type { StickyNote } from '../types'

function isSceneNoteAt(note: StickyNote, chapterId: string, sceneIndex: number) {
  return note.target === 'scene' &&
    note.chapterId === chapterId &&
    note.sceneIndex === sceneIndex
}

export function insertSceneNoteGap(
  notes: StickyNote[],
  chapterId: string,
  insertAt: number,
) {
  return notes.map((note) =>
    note.target === 'scene' &&
    note.chapterId === chapterId &&
    typeof note.sceneIndex === 'number' &&
    note.sceneIndex >= insertAt
      ? { ...note, sceneIndex: note.sceneIndex + 1 }
      : note
  )
}

export function reorderSceneNotes(
  notes: StickyNote[],
  chapterId: string,
  fromIndex: number,
  toIndex: number,
) {
  if (fromIndex === toIndex) return notes
  return notes.map((note) => {
    if (
      note.target !== 'scene' ||
      note.chapterId !== chapterId ||
      typeof note.sceneIndex !== 'number'
    ) return note
    if (note.sceneIndex === fromIndex) return { ...note, sceneIndex: toIndex }
    if (fromIndex < toIndex && note.sceneIndex > fromIndex && note.sceneIndex <= toIndex) {
      return { ...note, sceneIndex: note.sceneIndex - 1 }
    }
    if (fromIndex > toIndex && note.sceneIndex >= toIndex && note.sceneIndex < fromIndex) {
      return { ...note, sceneIndex: note.sceneIndex + 1 }
    }
    return note
  })
}

export function moveSceneNotesBetweenChapters(
  notes: StickyNote[],
  sourceChapterId: string,
  sourceSceneIndex: number,
  targetChapterId: string,
  insertAt: number,
) {
  if (sourceChapterId === targetChapterId) {
    return reorderSceneNotes(notes, sourceChapterId, sourceSceneIndex, insertAt)
  }
  return notes.map((note) => {
    if (isSceneNoteAt(note, sourceChapterId, sourceSceneIndex)) {
      return { ...note, chapterId: targetChapterId, sceneIndex: insertAt }
    }
    if (
      note.target === 'scene' &&
      note.chapterId === sourceChapterId &&
      typeof note.sceneIndex === 'number' &&
      note.sceneIndex > sourceSceneIndex
    ) {
      return { ...note, sceneIndex: note.sceneIndex - 1 }
    }
    if (
      note.target === 'scene' &&
      note.chapterId === targetChapterId &&
      typeof note.sceneIndex === 'number' &&
      note.sceneIndex >= insertAt
    ) {
      return { ...note, sceneIndex: note.sceneIndex + 1 }
    }
    return note
  })
}

export function detachSceneNotes(
  notes: StickyNote[],
  chapterId: string,
  sceneIndex: number,
) {
  const detached = notes.filter((note) => isSceneNoteAt(note, chapterId, sceneIndex))
  const remaining = notes
    .filter((note) => !isSceneNoteAt(note, chapterId, sceneIndex))
    .map((note) =>
      note.target === 'scene' &&
      note.chapterId === chapterId &&
      typeof note.sceneIndex === 'number' &&
      note.sceneIndex > sceneIndex
        ? { ...note, sceneIndex: note.sceneIndex - 1 }
        : note
    )
  return { detached, remaining }
}
