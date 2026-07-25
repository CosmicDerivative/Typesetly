import type { WritingGoals } from '../types'

/**
 * Applies a manuscript word-count change to today's habit ledger.
 *
 * A chapter can only give back words that it earned today. This means typing
 * 100 words and deleting 30 reports 70, while deleting pre-existing prose does
 * not create negative daily progress or erase manually logged work.
 */
export function applyHabitWordDelta(
  goals: WritingGoals,
  dateKey: string,
  chapterId: string,
  wordDelta: number,
): WritingGoals {
  if (!Number.isFinite(wordDelta) || wordDelta === 0) return goals

  const previousChapterWords = goals.wordLog?.[dateKey]?.[chapterId] || 0
  const nextChapterWords = Math.max(0, previousChapterWords + Math.trunc(wordDelta))
  const appliedDelta = nextChapterWords - previousChapterWords
  if (appliedDelta === 0) return goals

  const dayChapters = {
    ...(goals.wordLog?.[dateKey] || {}),
    [chapterId]: nextChapterWords,
  }
  if (nextChapterWords === 0) delete dayChapters[chapterId]

  return {
    ...goals,
    habitLog: {
      ...goals.habitLog,
      [dateKey]: Math.max(0, (goals.habitLog[dateKey] || 0) + appliedDelta),
    },
    wordLog: {
      ...(goals.wordLog || {}),
      [dateKey]: dayChapters,
    },
  }
}
