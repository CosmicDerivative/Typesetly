import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../BookContext'
import { countBookWords, localDateKey, todayKey } from '../data'
import { isDarkWorkspaceTheme, WORKSPACE_THEMES } from '../themes/workspaceThemes'
import { repairLegacyRtfQuoteDamage, smartenPunctuation } from '../editor/smartQuotes'
import './SidePanels.css'
import { DrawerControls } from './DrawerControls'

const DAY_OPTIONS = [
  { label: 'S', value: 0 },
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
]

function transformTextNodes(html: string, transform: (text: string) => string) {
  const documentValue = new DOMParser().parseFromString(html, 'text/html')
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = transform(node.textContent || '')
      return
    }
    for (const child of Array.from(node.childNodes)) visit(child)
  }
  visit(documentValue.body)
  return documentValue.body.innerHTML
}

export function FindReplacePanel() {
  const { project, rightPanel, updateChapterContent } = useApp()
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [message, setMessage] = useState('')

  if (rightPanel !== 'find' || !project) return null

  const runReplace = (all: boolean) => {
    if (!find) return
    let count = 0
    for (const ch of project.chapters) {
      let replacedHere = 0
      const next = transformTextNodes(ch.content, (text) => {
        if (!all && count + replacedHere > 0) return text
        if (all) {
          replacedHere += text.split(find).length - 1
          return text.split(find).join(replace)
        }
        const changed = text.replace(find, replace)
        if (changed !== text) replacedHere += 1
        return changed
      })
      if (next !== ch.content) updateChapterContent(ch.id, next)
      count += replacedHere
      if (!all && count) break
    }
    setMessage(all ? `Replaced ${count} occurrence(s).` : count ? 'Replaced 1 occurrence.' : 'No matches.')
  }

  return (
    <aside className="side-panel">
      <div className="sp-head">
        <strong>Find & Replace</strong>
        <DrawerControls panel="find" />
      </div>
      <label>Find<input value={find} onChange={(e) => setFind(e.target.value)} /></label>
      <label>Replace<input value={replace} onChange={(e) => setReplace(e.target.value)} /></label>
      <div className="sp-actions">
        <button type="button" onClick={() => runReplace(false)}>Replace</button>
        <button type="button" className="primary" onClick={() => runReplace(true)}>Replace all</button>
      </div>
      {message && <p className="sp-msg">{message}</p>}
    </aside>
  )
}

export function GoalsPanel() {
  const { project, rightPanel, updateGoals } = useApp()
  const [activeGoal, setActiveGoal] = useState<'book' | 'habit'>('book')
  const [bookTarget, setBookTarget] = useState(50000)
  const [dueDate, setDueDate] = useState('')
  const [bookDays, setBookDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [habitTarget, setHabitTarget] = useState(500)
  const [habitDays, setHabitDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    if (!project) return
    setBookTarget(project.goals.bookWordTarget)
    setDueDate(project.goals.dueDate)
    setBookDays(project.goals.writingDays)
    setHabitTarget(project.goals.dailyHabitWords)
    setHabitDays(project.goals.habitWritingDays)
  }, [project])

  const calendarDays = useMemo(() => buildCalendar(calendarMonth), [calendarMonth])

  if (rightPanel !== 'goals' || !project) return null

  const total = countBookWords(project)
  const target = project.goals.bookWordTarget || 1
  const pct = Math.min(100, Math.round((total / target) * 100))
  const today = project.goals.habitLog[todayKey()] || 0
  const habitMet = today >= project.goals.dailyHabitWords
  const writingDaysLeft = daysLeft(project.goals.dueDate, project.goals.writingDays)
  const dailyNeeded = writingDaysLeft > 0 ? Math.ceil(Math.max(0, target - total) / writingDaysLeft) : 0
  const stats = habitStats(
    project.goals.habitLog,
    project.goals.dailyHabitWords,
    project.goals.habitWritingDays,
    project.goals.habitStartedAt,
  )

  const toggleDay = (days: number[], day: number, setDays: (value: number[]) => void) => {
    setDays(days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort())
  }

  const saveBookGoal = () => {
    updateGoals({ bookWordTarget: Math.max(1, bookTarget), dueDate, writingDays: bookDays })
    setSavedMessage('Book goal saved')
  }

  const saveHabit = () => {
    updateGoals({
      dailyHabitWords: Math.max(1, habitTarget),
      habitWritingDays: habitDays,
      habitStartedAt: project.goals.habitStartedAt || todayKey(),
    })
    setSavedMessage('Writing habit saved')
  }

  return (
    <aside className="side-panel goals-panel">
      <div className="sp-head">
        <strong>Goals</strong>
        <DrawerControls panel="goals" />
      </div>

      <div className="goals-tabs" role="tablist" aria-label="Goal type">
        <button
          type="button"
          role="tab"
          aria-selected={activeGoal === 'book'}
          className={activeGoal === 'book' ? 'active' : ''}
          onClick={() => { setActiveGoal('book'); setSavedMessage('') }}
        >
          Book Goal
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeGoal === 'habit'}
          className={activeGoal === 'habit' ? 'active' : ''}
          onClick={() => { setActiveGoal('habit'); setSavedMessage('') }}
        >
          Writing Habit
        </button>
      </div>

      {activeGoal === 'book' ? (
        <div className="goal-view" role="tabpanel">
          <p className="goal-intro">Set a finish line and choose the days you plan to write. Your daily target updates as your manuscript grows.</p>

          <div className="goal-summary-card">
            <div className="goal-summary-heading"><span>Book progress</span><strong>{pct}%</strong></div>
            <div className="goal-progress"><span style={{ width: `${pct}%` }} /></div>
            <div className="goal-progress-copy">
              <span>{total.toLocaleString()} written</span>
              <span>{target.toLocaleString()} goal</span>
            </div>
            {project.goals.dueDate && (
              <div className="daily-target">
                <strong>{dailyNeeded.toLocaleString()}</strong>
                <span>words per writing day</span>
              </div>
            )}
          </div>

          <label>
            Total word count goal
            <input type="number" min={1} value={bookTarget} onChange={(event) => setBookTarget(Number(event.target.value))} />
          </label>
          <label>
            Finish by
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <DayPicker days={bookDays} onToggle={(day) => toggleDay(bookDays, day, setBookDays)} />
          <button type="button" className="primary goal-save" onClick={saveBookGoal}>Save Book Goal</button>
        </div>
      ) : (
        <div className="goal-view" role="tabpanel">
          <p className="goal-intro">Build a consistent writing routine. Net words added to your manuscript are counted automatically, so deleting words written today reduces today’s progress.</p>

          <div className={`today-habit ${habitMet ? 'met' : ''}`}>
            <span className="habit-icon" aria-hidden="true">{habitMet ? '🔥' : '❄️'}</span>
            <div>
              <strong>{habitMet ? 'Goal met today!' : 'Today’s progress'}</strong>
              <span>{today.toLocaleString()} of {project.goals.dailyHabitWords.toLocaleString()} words</span>
            </div>
          </div>

          <div className="habit-stats">
            <div><strong>{stats.successRate}%</strong><span>Success rate</span></div>
            <div><strong>{stats.currentStreak}</strong><span>Current streak</span></div>
            <div><strong>{stats.longestStreak}</strong><span>Longest streak</span></div>
            <div><strong>{project.goals.sprintLog.length}</strong><span>Writing sprints</span></div>
          </div>

          <label>
  )
}

export function GoalsPanel() {
  const [target, setTarget] = useState(500)
  return (
    <Panel title="Writing goal">
      <input
        type="number"
        min="1"
        value={target}
        onChange={(event) => setTarget(Number(event.target.value))}
      />
      <p>Daily target: {target} words</p>
    </Panel>
  )
}

export function EditorSettingsPanel() {
  return (
    <Panel title="Editor settings">
      <label><input type="checkbox" /> Typewriter scrolling</label>
      <label><input type="checkbox" /> Highlight current line</label>
    </Panel>
  )
}

export function SmartQuotesPanel() {
  return (
    <Panel title="Smart punctuation">
      <button type="button">Convert straight quotes</button>
      <button type="button">Normalize dashes</button>
    </Panel>
  )
}
