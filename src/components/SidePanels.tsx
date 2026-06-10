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
            Daily word goal
            <input type="number" min={1} value={habitTarget} onChange={(event) => setHabitTarget(Number(event.target.value))} />
          </label>
          <DayPicker days={habitDays} onToggle={(day) => toggleDay(habitDays, day, setHabitDays)} />
          <button type="button" className="primary goal-save" onClick={saveHabit}>Save Writing Habit</button>

          <div className="habit-calendar">
            <div className="calendar-head">
              <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}>‹</button>
              <strong>{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <button type="button" aria-label="Next month" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>›</button>
            </div>
            <div className="calendar-grid calendar-weekdays">
              {DAY_OPTIONS.map((day) => <span key={day.value}>{day.label}</span>)}
            </div>
            <div className="calendar-grid">
              {calendarDays.map(({ date, inMonth }) => {
                const key = localDateKey(date)
                const words = project.goals.habitLog[key] || 0
                const scheduled = project.goals.habitWritingDays.includes(date.getDay())
                const success = scheduled && words >= project.goals.dailyHabitWords
                const missed = scheduled && date < startOfDay(new Date()) && !success
                const chapterWords = project.goals.wordLog[key] || {}
                const detail = Object.entries(chapterWords)
                  .map(([chapterId, count]) => `${project.chapters.find((chapter) => chapter.id === chapterId)?.title || 'Chapter'}: ${count.toLocaleString()}`)
                  .join('\n')
                const classes = [
                  'calendar-day',
                  !inMonth ? 'outside' : '',
                  success ? 'success' : '',
                  missed ? 'missed' : '',
                  key === todayKey() ? 'today' : '',
                ].filter(Boolean).join(' ')
                return <div className={classes} key={key} title={`${words.toLocaleString()} words${detail ? `\n${detail}` : ''}`}>{date.getDate()}</div>
              })}
            </div>
            <div className="calendar-legend"><span className="success-dot" /> Goal met <span className="missed-dot" /> Missed writing day</div>
          </div>
        </div>
      )}
      {savedMessage && <p className="goal-saved" role="status">✓ {savedMessage}</p>}
    </aside>
  )
}

function DayPicker({ days, onToggle }: { days: number[]; onToggle: (day: number) => void }) {
  return (
    <fieldset className="writing-days">
      <legend>Writing days</legend>
      {DAY_OPTIONS.map(({ label, value }) => (
        <label key={value}>
          <input type="checkbox" checked={days.includes(value)} onChange={() => onToggle(value)} />
          {label}
        </label>
      ))}
    </fieldset>
  )
}

function daysLeft(dueDate: string, writingDays: number[]) {
  if (!dueDate) return 0
  const end = startOfDay(new Date(`${dueDate}T00:00:00`))
  const now = startOfDay(new Date())
  let count = 0
  const cursor = new Date(now)
  while (cursor <= end) {
    if (writingDays.includes(cursor.getDay())) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function buildCalendar(month: Date) {
  const first = startOfMonth(month)
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - first.getDay())
  return Array.from({ length: 42 }, () => {
    const date = new Date(cursor)
    cursor.setDate(cursor.getDate() + 1)
    return { date, inMonth: date.getMonth() === month.getMonth() }
  })
}

function habitStats(log: Record<string, number>, target: number, writingDays: number[], startedAt: string) {
  const today = startOfDay(new Date())
  const loggedDates = Object.keys(log).sort()
  const inferredStart = loggedDates[0] ? new Date(`${loggedDates[0]}T00:00:00`) : today
  const start = startedAt ? new Date(`${startedAt}T00:00:00`) : inferredStart
  let scheduled = 0
  let successes = 0
  let longestStreak = 0
  let runningStreak = 0
  const successfulKeys = new Set<string>()

  for (const cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    if (!writingDays.includes(cursor.getDay())) continue
    scheduled += 1
    const success = (log[localDateKey(cursor)] || 0) >= target
    if (success) {
      successes += 1
      runningStreak += 1
      longestStreak = Math.max(longestStreak, runningStreak)
      successfulKeys.add(localDateKey(cursor))
    } else {
      runningStreak = 0
    }
  }

  let currentStreak = 0
  const cursor = new Date(today)
  if (writingDays.includes(cursor.getDay()) && !successfulKeys.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  for (; cursor >= start; cursor.setDate(cursor.getDate() - 1)) {
    if (!writingDays.includes(cursor.getDay())) continue
    if (!successfulKeys.has(localDateKey(cursor))) break
    currentStreak += 1
  }

  return {
    successRate: scheduled ? Math.round((successes / scheduled) * 100) : 0,
    currentStreak,
    longestStreak,
  }
}

export function EditorSettingsPanel() {
  const { project, rightPanel, updateEditorPrefs } = useApp()
  if (rightPanel !== 'settings' || !project) return null
  const p = project.editorPrefs
  return (
    <aside className="side-panel">
      <div className="sp-head">
        <strong>Editor settings</strong>
        <DrawerControls panel="settings" />
      </div>
      <p className="sp-hint">Shape your workspace without changing the book’s export design or reader preview.</p>
      <fieldset className="appearance-picker">
        <legend>Workspace appearance</legend>
        <div className="appearance-grid">
          {WORKSPACE_THEMES.map((theme) => {
            const active = p.workspaceTheme === theme.id
            return (
              <button
                type="button"
                key={theme.id}
                className={active ? 'appearance-option active' : 'appearance-option'}
                aria-pressed={active}
                title={theme.description}
                onClick={() => updateEditorPrefs({
                  workspaceTheme: theme.id,
                  darkMode: isDarkWorkspaceTheme(theme.id),
                })}
              >
                <span className="appearance-swatches" aria-hidden="true">
                  {theme.swatches.map((color) => (
                    <span key={color} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="appearance-name">{theme.name}</span>
                <span className="appearance-tone">{theme.tone}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <label>
        Font
        <select value={p.fontFamily} onChange={(e) => updateEditorPrefs({ fontFamily: e.target.value })}>
          <option>Libre Baskerville</option>
          <option>Georgia</option>
          <option>Palatino Linotype</option>
          <option>Source Sans 3</option>
          <option>Times New Roman</option>
        </select>
      </label>
      <label>
        Size
        <input type="number" min={12} max={28} value={p.fontSize} onChange={(e) => updateEditorPrefs({ fontSize: Number(e.target.value) })} />
      </label>
      <label>
        Line height
        <input type="number" min={1.2} max={2.4} step={0.05} value={p.lineHeight} onChange={(e) => updateEditorPrefs({ lineHeight: Number(e.target.value) })} />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={p.typewriterScrolling}
          onChange={(event) => updateEditorPrefs({ typewriterScrolling: event.target.checked })}
        />
        Keep the current line centered while typing
      </label>
      <label className="check-row">
        <input type="checkbox" checked={p.spellcheck} onChange={(event) => updateEditorPrefs({ spellcheck: event.target.checked })} />
        Check spelling while writing
      </label>
      <label>
        Paragraphs
        <select value={p.paragraphStyle} onChange={(event) => updateEditorPrefs({ paragraphStyle: event.target.value as typeof p.paragraphStyle })}>
          <option value="indent">First-line indent</option>
          <option value="space">Space between paragraphs</option>
        </select>
      </label>
      <label>
        Alignment
        <select value={p.textAlign} onChange={(event) => updateEditorPrefs({ textAlign: event.target.value as typeof p.textAlign })}>
          <option value="left">Left aligned</option>
          <option value="justify">Justified</option>
        </select>
      </label>
    </aside>
  )
}

export function SmartQuotesPanel() {
  const {
    project,
    rightPanel,
    updateEditorPrefs,
    updateChapterContent,
    createNamedRevision,
  return (
    <Panel title="Smart punctuation">
      <button type="button">Convert straight quotes</button>
      <button type="button">Normalize dashes</button>
    </Panel>
  )
}
