import assert from 'node:assert/strict'
import test from 'node:test'
import {
  duplicateSceneContent,
  insertScene,
  moveSceneContent,
  normalizedSceneTitles,
  removeSceneContent,
  sceneCount,
  splitScenes,
} from '../src/editor/scenes.ts'

const manuscript = '<p>One</p><hr data-typesetly-node="scene-break"><p>Two</p><hr><p>Three</p>'

test('scene utilities recognize editor scene breaks without double counting', () => {
  assert.equal(sceneCount(manuscript), 3)
  assert.deepEqual(splitScenes(manuscript), ['<p>One</p>', '<p>Two</p>', '<p>Three</p>'])
})

test('scene insert, duplicate, move, and delete preserve complete scene HTML', () => {
  const inserted = insertScene(manuscript, 0, '<p>New</p>')
  assert.equal(inserted.index, 1)
  assert.deepEqual(splitScenes(inserted.html), ['<p>One</p>', '<p>New</p>', '<p>Two</p>', '<p>Three</p>'])

  const duplicated = duplicateSceneContent(manuscript, 1)
  assert.ok(duplicated)
  assert.deepEqual(splitScenes(duplicated.html), ['<p>One</p>', '<p>Two</p>', '<p>Two</p>', '<p>Three</p>'])

  const moved = moveSceneContent(manuscript, 2, -1)
  assert.ok(moved)
  assert.deepEqual(splitScenes(moved.html), ['<p>One</p>', '<p>Three</p>', '<p>Two</p>'])

  const removed = removeSceneContent(manuscript, 1)
  assert.ok(removed)
  assert.equal(removed.removedHtml, '<p>Two</p>')
  assert.deepEqual(splitScenes(removed.html), ['<p>One</p>', '<p>Three</p>'])
})

test('scene titles migrate safely when older books do not have names', () => {
  assert.deepEqual(normalizedSceneTitles(undefined, 3), ['Scene 1', 'Scene 2', 'Scene 3'])
  assert.deepEqual(normalizedSceneTitles(['Opening', ''], 3), ['Opening', 'Scene 2', 'Scene 3'])
})
