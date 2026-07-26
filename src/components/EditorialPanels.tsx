import { useEffect, useState } from 'react'
import { useApp } from '../BookContext'
import './EditorialPanels.css'
import { plainTextFromHtml, wordDiff } from '../editor/diff'
import { listRevisions } from '../library/store'
import type { BookProject } from '../types'
import { Dialog } from './Dialog'
import { DrawerControls } from './DrawerControls'

export function EditorialPanel() {
  const {
    project,
    activeChapter,
    rightPanel,
    addComment,
    updateComment,
    deleteComment,
    setTrackChanges,
    resolveTrackedChange,
    setActiveChapter,
  } = useApp()
  const [body, setBody] = useState('')
  const [quote, setQuote] = useState('')

  if (rightPanel !== 'editorial' || !project) return null
  const comments = (project.comments || []).filter((comment) => comment.chapterId === activeChapter?.id)
  const changes = (project.trackedChanges || []).filter((change) => change.chapterId === activeChapter?.id && change.status === 'pending')

  const captureSelection = () => {
    const text = window.getSelection()?.toString().trim() || ''
    setQuote(text)
  }

  return (
    <aside className="side-panel editorial-panel">
      <div className="sp-head">
        <strong>Comments & Changes</strong>
        <DrawerControls panel="editorial" />
      </div>
      <label className="track-toggle">
        <input
          type="checkbox"
          checked={Boolean(project.trackChanges)}
          onChange={(event) => setTrackChanges(event.target.checked)}
        />
        Track editing sessions
      </label>
      <p className="sp-hint">Tracked sessions are preserved as named revisions. Comments stay attached to their chapter and quoted text.</p>
      {changes.length > 0 && (
        <section className="tracked-list">
          <strong>Pending changes</strong>
          {changes.map((change) => (
            <article className="tracked-card" key={change.id}>
              <div className="change-diff">
                {wordDiff(change.beforeHtml, change.afterHtml).map((part, index) => (
                  <span className={part.type} key={`${part.type}-${index}`}>{part.text}</span>
                ))}
              </div>
              <small>{new Date(change.updatedAt).toLocaleString()}</small>
              <div className="change-actions">
                <button type="button" onClick={() => resolveTrackedChange(change.id, 'rejected')}>Reject</button>
                <button type="button" className="accept" onClick={() => resolveTrackedChange(change.id, 'accepted')}>Accept</button>
              </div>
            </article>
          ))}
        </section>
      )}
      <button type="button" className="capture-selection" onClick={captureSelection}>Use selected text</button>
      {quote && <blockquote className="comment-quote">“{quote}”</blockquote>}
      <label>
        Comment
        <textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Leave an editorial note…" />
      </label>
      <button
        type="button"
        className="primary full"
        disabled={!body.trim() || !activeChapter}
        onClick={() => {
          if (!activeChapter || !body.trim()) return
          addComment({ chapterId: activeChapter.id, quote, body: body.trim(), author: 'Author' })
          setBody('')
          setQuote('')
        }}
      >
        Add Comment
      </button>
      <div className="comment-list">
        {comments.map((comment) => (
          <article className={comment.resolved ? 'comment-card resolved' : 'comment-card'} key={comment.id}>
            {comment.quote && <blockquote>“{comment.quote}”</blockquote>}
            <p>{comment.body}</p>
            <small>{new Date(comment.createdAt).toLocaleString()}</small>
            <div>
              <button type="button" onClick={() => updateComment(comment.id, { resolved: !comment.resolved })}>
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
              <button type="button" onClick={() => deleteComment(comment.id)}>Delete</button>
            </div>
          </article>
        ))}
        {!comments.length && <p className="empty-comments">No comments in this chapter.</p>}
      </div>
      {(project.comments || []).some((comment) => comment.chapterId !== activeChapter?.id && !comment.resolved) && (
        <div className="other-comments">
          <strong>Other chapters</strong>
          {(project.comments || []).filter((comment) => comment.chapterId !== activeChapter?.id && !comment.resolved).map((comment) => {
            const chapter = project.chapters.find((item) => item.id === comment.chapterId)
            return <button type="button" key={comment.id} onClick={() => setActiveChapter(comment.chapterId)}>{chapter?.title || 'Deleted chapter'} · {comment.body}</button>
          })}
        </div>
      )}
    </aside>
  )
}

export function RevisionsPanel() {
  const { project, rightPanel, createNamedRevision, restoreNamedRevision, replaceProject } = useApp()
  const [name, setName] = useState('')
  const [compareId, setCompareId] = useState('')
  const [automatic, setAutomatic] = useState<Array<{ id: string; createdAt: string; book: BookProject }>>([])
  const [restoreTarget, setRestoreTarget] = useState<{ kind: 'named'; id: string; label: string } | { kind: 'automatic'; book: BookProject; label: string } | null>(null)
  const projectId = project?.id

  useEffect(() => {
    if (rightPanel !== 'revisions' || !projectId) return
    let active = true
    void listRevisions(projectId, 8).then((items) => {
      if (active) setAutomatic(items)
    }).catch(() => {
      if (active) setAutomatic([])
    })
    return () => { active = false }
  }, [projectId, rightPanel])

  if (rightPanel !== 'revisions' || !project) return null

  return (
    <>
      <aside className="side-panel editorial-panel">
      <div className="sp-head">
        <strong>Version History</strong>
        <DrawerControls panel="revisions" />
      </div>
      <p className="sp-hint">Save a local milestone before major edits. Restoring replaces chapter text while keeping current settings and comments.</p>
      <label>
        Version name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Before editor pass" />
      </label>
      <button type="button" className="primary full" onClick={() => { createNamedRevision(name); setName('') }}>Save Current Version</button>
      {compareId && (() => {
        const revision = project.revisions?.find((item) => item.id === compareId)
        if (!revision) return null
        const changed = revision.chapters.map((saved) => {
          const current = project.chapters.find((chapter) => chapter.id === saved.id)
          const before = plainTextFromHtml(saved.content)
          const after = plainTextFromHtml(current?.content || '')
          return {
            title: current?.title || saved.title,
            added: Math.max(0, after.split(/\s+/).filter(Boolean).length - before.split(/\s+/).filter(Boolean).length),
            removed: Math.max(0, before.split(/\s+/).filter(Boolean).length - after.split(/\s+/).filter(Boolean).length),
            changed: before !== after,
          }
        }).filter((item) => item.changed)
        return (
          <section className="revision-compare">
            <strong>Changes since {revision.name}</strong>
            {changed.map((item) => <div key={item.title}><span>{item.title}</span><small>+{item.added} / −{item.removed} words</small></div>)}
            {!changed.length && <p>No chapter text has changed.</p>}
          </section>
        )
      })()}
      <div className="revision-list">
        {[...(project.revisions || [])].reverse().map((revision) => (
          <article key={revision.id}>
            <div><strong>{revision.name}</strong><small>{new Date(revision.createdAt).toLocaleString()}</small></div>
            <div className="revision-actions">
              <button type="button" onClick={() => setCompareId(compareId === revision.id ? '' : revision.id)}>Compare</button>
              <button type="button" onClick={() => setRestoreTarget({ kind: 'named', id: revision.id, label: revision.name })}>Restore</button>
            </div>
          </article>
        ))}
        {!project.revisions?.length && <p className="empty-comments">No named versions yet.</p>}
      </div>
      {automatic.length > 0 && (
        <section className="automatic-recovery">
          <strong>Automatic recovery points</strong>
          <p className="sp-hint">Created in the background after successful local saves.</p>
          {automatic.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setRestoreTarget({
                kind: 'automatic',
                book: item.book,
                label: new Date(item.createdAt).toLocaleString(),
              })}
            >
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <small>{item.book.chapters.length} pages</small>
            </button>
          ))}
        </section>
      )}
      </aside>
      {restoreTarget && (
        <Dialog
          title="Restore Version?"
          description={`Restore ${restoreTarget.label}? Your current manuscript will be replaced, so save a named version first if needed.`}
          confirmLabel="Restore"
          danger
          onCancel={() => setRestoreTarget(null)}
          onConfirm={() => {
            if (restoreTarget.kind === 'named') restoreNamedRevision(restoreTarget.id)
            else replaceProject({
              ...restoreTarget.book,
              // Automatic recovery points intentionally omit named versions to
              // stay compact; restoring one must not erase the current history.
              revisions: project.revisions,
            })
            setRestoreTarget(null)
          }}
        />
      )}
    </>
  )
}
