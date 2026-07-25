import assert from 'node:assert/strict'
import test from 'node:test'
import { applyHabitWordDelta } from '../src/goals/habitWords.ts'
import { defaultGoals } from '../src/types.ts'

const dateKey = '2026-07-23'

test('deleting words written today reduces habit progress', () => {
  const added = applyHabitWordDelta(defaultGoals(), dateKey, 'chapter-1', 100)
  const deleted = applyHabitWordDelta(added, dateKey, 'chapter-1', -30)

  assert.equal(deleted.habitLog[dateKey], 70)
  assert.equal(deleted.wordLog[dateKey]['chapter-1'], 70)
})

test('deleting pre-existing words cannot create negative habit progress', () => {
  const goals = applyHabitWordDelta(defaultGoals(), dateKey, 'chapter-1', 20)
  const deleted = applyHabitWordDelta(goals, dateKey, 'chapter-1', -50)

  assert.equal(deleted.habitLog[dateKey], 0)
  assert.equal(deleted.wordLog[dateKey]['chapter-1'], undefined)
})

test('deletions preserve manual progress and other chapters', () => {
  const goals = {
    ...defaultGoals(),
    habitLog: { [dateKey]: 150 },
    wordLog: {
      [dateKey]: {
        'chapter-1': 60,
        'chapter-2': 40,
      },
    },
  }
  const deleted = applyHabitWordDelta(goals, dateKey, 'chapter-1', -100)

  assert.equal(deleted.habitLog[dateKey], 90)
  assert.equal(deleted.wordLog[dateKey]['chapter-1'], undefined)
  assert.equal(deleted.wordLog[dateKey]['chapter-2'], 40)
})

test('retyping deleted words restores only the net daily total', () => {
  const added = applyHabitWordDelta(defaultGoals(), dateKey, 'chapter-1', 75)
  const deleted = applyHabitWordDelta(added, dateKey, 'chapter-1', -25)
  const retyped = applyHabitWordDelta(deleted, dateKey, 'chapter-1', 10)

  assert.equal(retyped.habitLog[dateKey], 60)
  assert.equal(retyped.wordLog[dateKey]['chapter-1'], 60)
})
