import {
  Copy,
  FilePlus2,
  GripVertical,
  Layers3,
  LockKeyhole,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { useApp } from '../BookContext'
import {
  BACK_MATTER_TYPES,
  FRONT_MATTER_TYPES,
  PAGE_TYPE_LABELS,
  countWords,
} from '../data'
import { normalizedSceneTitles, sceneCount } from '../editor/scenes'
import type { Chapter } from '../types'
import './Organizer.css'

type OrganizeDrag =
  | { kind: 'page'; pageId: string }
  | { kind: 'scene'; chapterId: string; sceneIndex: number }

type OrganizeDropHint =
  | { kind: 'page'; targetId: string; placement: 'before' | 'after' }
  | { kind: 'scene'; chapterId: string; sceneIndex: number; placement: 'before' | 'after' }

type OrganizerLane = 'opening' | 'main' | 'closing'

type OrganizerInlineRename =
  | { kind: 'page'; id: string; value: string }
  | { kind: 'scene'; chapterId: string; index: number; value: string }

const protectedTypes = ['title-page', 'copyright', 'contents']

function sectionForPage(page: Chapter): OrganizerLane {
  if (FRONT_MATTER_TYPES.includes(page.type)) return 'opening'
  if (BACK_MATTER_TYPES.includes(page.type)) return 'closing'
  return 'main'
}

function isSameDropHint(current: OrganizeDropHint | null, next: OrganizeDropHint) {
  if (!current || current.kind !== next.kind) return false
  if (current.kind === 'page' && next.kind === 'page') {
    return current.targetId === next.targetId && current.placement === next.placement
  }
  return current.kind === 'scene' &&
    next.kind === 'scene' &&
    current.chapterId === next.chapterId &&
    current.sceneIndex === next.sceneIndex &&
    current.placement === next.placement
}

export function Organizer() {
  const {
    project,
    frontMatter,
    bodyChapters,
    backMatter,
    activeChapter,
    setActiveChapter,
    setMode,
    addChapter,
    addPart,
    addPage,
    addScene,
    duplicateChapter,
    duplicateScene,
    deleteChapter,
    deleteScene,
    moveChapterRelative,
    moveSceneToChapter,
    updateChapterTitle,
    updateSceneTitle,
  } = useApp()
  const [dragItem, setDragItem] = useState<OrganizeDrag | null>(null)
  const dragItemRef = useRef<OrganizeDrag | null>(null)
  const [dropHint, setDropHint] = useState<OrganizeDropHint | null>(null)
  const [trashActive, setTrashActive] = useState(false)
  const [dragAnnouncement, setDragAnnouncement] = useState('')
  const [inlineRename, setInlineRename] = useState<OrganizerInlineRename | null>(null)
  const cancelInlineRenameRef = useRef(false)
  const scheduledOpenRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(scheduledOpenRef.current), [])

  if (!project) return null

  const cancelScheduledOpen = () => {
    window.clearTimeout(scheduledOpenRef.current)
    scheduledOpenRef.current = undefined
  }

  const scheduleOpenPage = (pageId: string) => {
    cancelScheduledOpen()
    scheduledOpenRef.current = window.setTimeout(() => openPage(pageId), 220)
  }

  const scheduleOpenScene = (chapterId: string, index: number) => {
    cancelScheduledOpen()
    scheduledOpenRef.current = window.setTimeout(() => {
      setActiveChapter(chapterId)
      setMode('draft')
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('typesetly:scene', { detail: { index } }))
      })
    }, 220)
  }

  const beginInlineRename = (target: OrganizerInlineRename) => {
    cancelInlineRenameRef.current = false
    setInlineRename(target)
  }

  const finishInlineRename = (target: OrganizerInlineRename) => {
    if (cancelInlineRenameRef.current) {
      cancelInlineRenameRef.current = false
      setInlineRename(null)
      return
    }
    const name = target.value.trim()
    if (name) {
      if (target.kind === 'page') updateChapterTitle(target.id, name)
      else updateSceneTitle(target.chapterId, target.index, name)
    }
    setInlineRename(null)
  }

  const handleInlineRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      cancelInlineRenameRef.current = true
      event.currentTarget.blur()
    }
  }

  const pageById = new Map(project.chapters.map((page) => [page.id, page]))
  const partById = new Map(
    project.chapters.filter((page) => page.type === 'part').map((page) => [page.id, page.title]),
  )

  const openPage = (pageId: string) => {
    setActiveChapter(pageId)
    setMode('draft')
  }

  const canTrash = (item: OrganizeDrag) => {
    if (item.kind === 'page') {
      const page = pageById.get(item.pageId)
      return Boolean(page && !protectedTypes.includes(page.type))
    }
    const chapter = pageById.get(item.chapterId)
    return Boolean(chapter?.type === 'chapter' && sceneCount(chapter.content) > 1)
  }

  const canDropPage = (source: Chapter, target: Chapter) => {
    if (source.id === target.id || sectionForPage(source) !== sectionForPage(target)) return false
    if (protectedTypes.includes(source.type)) return false
    if (sectionForPage(source) === 'opening' && protectedTypes.includes(target.type)) return false
    if (sectionForPage(source) === 'main') return (source.type === 'part') === (target.type === 'part')
    return true
  }

  const describeDragItem = (item: OrganizeDrag) => {
    if (item.kind === 'page') return pageById.get(item.pageId)?.title || 'page'
    const chapter = pageById.get(item.chapterId)
    if (!chapter) return 'scene'
    const titles = normalizedSceneTitles(chapter.sceneTitles, sceneCount(chapter.content))
    return titles[item.sceneIndex] || `Scene ${item.sceneIndex + 1}`
  }

  const canDropScene = (
    source: Extract<OrganizeDrag, { kind: 'scene' }>,
    targetChapterId: string,
    targetSceneIndex: number,
    placement: 'before' | 'after',
  ) => {
    if (source.chapterId !== targetChapterId) return true
    let insertAt = targetSceneIndex + (placement === 'after' ? 1 : 0)
    if (source.sceneIndex < insertAt) insertAt -= 1
    return insertAt !== source.sceneIndex
  }

  const activateDropHint = (hint: OrganizeDropHint, announcement: string) => {
    setDropHint((current) => isSameDropHint(current, hint) ? current : hint)
    setDragAnnouncement(announcement)
    setTrashActive(false)
  }

  const beginDrag = (event: DragEvent, item: OrganizeDrag) => {
    dragItemRef.current = item
    setDragItem(item)
    setDropHint(null)
    setTrashActive(false)
    setDragAnnouncement(`Picked up ${describeDragItem(item)}. Move to a highlighted position.`)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', JSON.stringify(item))
  }

  const finishDrag = (announcement?: string) => {
    const hadActiveDrag = Boolean(dragItemRef.current)
    dragItemRef.current = null
    setDragItem(null)
    setDropHint(null)
    setTrashActive(false)
    if (announcement) setDragAnnouncement(announcement)
    else if (hadActiveDrag) setDragAnnouncement('Move cancelled.')
  }

  const renderPageDropGap = (
    target: Chapter,
    placement: 'before' | 'after',
  ) => {
    const currentDrag = dragItem
    const source = currentDrag?.kind === 'page' ? pageById.get(currentDrag.pageId) : null
    const available = Boolean(source && canDropPage(source, target))
    const active = dropHint?.kind === 'page' &&
      dropHint.targetId === target.id &&
      dropHint.placement === placement
    const label = `${placement === 'before' ? 'Place before' : 'Place after'} ${target.title}`

    return (
      <div
        className={`organizer-drop-gap organizer-page-gap${available ? ' available' : ''}${active ? ' active' : ''}`}
        aria-hidden={!available}
        onDragEnter={(event) => {
          if (!available) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          activateDropHint({ kind: 'page', targetId: target.id, placement }, label)
        }}
        onDragOver={(event) => {
          if (!available) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          activateDropHint({ kind: 'page', targetId: target.id, placement }, label)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const item = dragItemRef.current
          const draggedPage = item?.kind === 'page' ? pageById.get(item.pageId) : null
          if (!draggedPage || !canDropPage(draggedPage, target)) return finishDrag()
          moveChapterRelative(draggedPage.id, target.id, placement)
          finishDrag(`Moved ${draggedPage.title} ${placement} ${target.title}.`)
        }}
      >
        <span>{label}</span>
      </div>
    )
  }

  const renderSceneDropGap = (
    chapter: Chapter,
    scenes: string[],
    targetSceneIndex: number,
    placement: 'before' | 'after',
  ) => {
    const currentDrag = dragItem
    const available = Boolean(
      currentDrag?.kind === 'scene' &&
      canDropScene(currentDrag, chapter.id, targetSceneIndex, placement),
    )
    const active = dropHint?.kind === 'scene' &&
      dropHint.chapterId === chapter.id &&
      dropHint.sceneIndex === targetSceneIndex &&
      dropHint.placement === placement
    const targetTitle = scenes[targetSceneIndex] || `Scene ${targetSceneIndex + 1}`
    const label = `${placement === 'before' ? 'Place before' : 'Place after'} ${targetTitle}`

    return (
      <div
        className={`organizer-drop-gap organizer-scene-gap${available ? ' available' : ''}${active ? ' active' : ''}`}
        aria-hidden={!available}
        onDragEnter={(event) => {
          if (!available) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          activateDropHint(
            { kind: 'scene', chapterId: chapter.id, sceneIndex: targetSceneIndex, placement },
            `${label} in ${chapter.title}`,
          )
        }}
        onDragOver={(event) => {
          if (!available) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          activateDropHint(
            { kind: 'scene', chapterId: chapter.id, sceneIndex: targetSceneIndex, placement },
            `${label} in ${chapter.title}`,
          )
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const item = dragItemRef.current
          if (
            item?.kind !== 'scene' ||
            !canDropScene(item, chapter.id, targetSceneIndex, placement)
          ) return finishDrag()
          const movedTitle = describeDragItem(item)
          moveSceneToChapter(
            item.chapterId,
            item.sceneIndex,
            chapter.id,
            targetSceneIndex,
            placement,
          )
          setActiveChapter(chapter.id)
          finishDrag(`Moved ${movedTitle} ${placement} ${targetTitle} in ${chapter.title}.`)
        }}
      >
        <span>{label}</span>
      </div>
    )
  }

  const renderPage = (page: Chapter) => {
    const scenes = page.type === 'chapter'
      ? normalizedSceneTitles(page.sceneTitles, sceneCount(page.content))
      : []
    const selected = activeChapter?.id === page.id
    const pageIsDragging = dragItem?.kind === 'page' && dragItem.pageId === page.id
    const pageIsDropTarget = (
      dropHint?.kind === 'page' && dropHint.targetId === page.id
    ) || (
      dropHint?.kind === 'scene' && dropHint.chapterId === page.id
    )
    const pageRenameActive = inlineRename?.kind === 'page' && inlineRename.id === page.id
    const pageClasses = [
      'organizer-card',
      selected ? 'active' : '',
      protectedTypes.includes(page.type) ? 'protected' : '',
      pageIsDragging ? 'is-dragging' : '',
      pageIsDropTarget ? 'is-drop-target' : '',
    ].filter(Boolean).join(' ')

    return (
      <article
        key={page.id}
        className={pageClasses}
        draggable={!protectedTypes.includes(page.type) && !pageRenameActive}
        onDragStart={(event) => beginDrag(event, { kind: 'page', pageId: page.id })}
        onDragEnd={() => finishDrag()}
        onDragOver={(event) => {
          const item = dragItemRef.current
          if (!item) return
          if (item.kind === 'scene') {
            if (page.type !== 'chapter') {
              setDropHint(null)
              return
            }
            const lastSceneIndex = Math.max(0, scenes.length - 1)
            if (!canDropScene(item, page.id, lastSceneIndex, 'after')) {
              setDropHint(null)
              return
            }
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            activateDropHint(
              { kind: 'scene', chapterId: page.id, sceneIndex: lastSceneIndex, placement: 'after' },
              `Place at the end of ${page.title}`,
            )
            return
          }
          if (item.kind === 'page') {
            const source = pageById.get(item.pageId)
            if (source && canDropPage(source, page)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const bounds = event.currentTarget.getBoundingClientRect()
              const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
              activateDropHint(
                { kind: 'page', targetId: page.id, placement },
                `${placement === 'before' ? 'Place before' : 'Place after'} ${page.title}`,
              )
            }
            else setDropHint(null)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const item = dragItemRef.current
          if (!item) return
          if (item.kind === 'scene' && page.type === 'chapter') {
            const targetCount = sceneCount(page.content)
            const lastSceneIndex = Math.max(0, targetCount - 1)
            if (!canDropScene(item, page.id, lastSceneIndex, 'after')) return finishDrag()
            const movedTitle = describeDragItem(item)
            moveSceneToChapter(
              item.chapterId,
              item.sceneIndex,
              page.id,
              lastSceneIndex,
              'after',
            )
            setActiveChapter(page.id)
            finishDrag(`Moved ${movedTitle} to the end of ${page.title}.`)
            return
          } else if (item.kind === 'page') {
            const source = pageById.get(item.pageId)
            if (source && canDropPage(source, page)) {
              const bounds = event.currentTarget.getBoundingClientRect()
              const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
              moveChapterRelative(
                source.id,
                page.id,
                placement,
              )
              finishDrag(`Moved ${source.title} ${placement} ${page.title}.`)
              return
            }
          }
          finishDrag()
        }}
      >
        <div className="organizer-card-head">
          <span
            className="organizer-grip"
            title={protectedTypes.includes(page.type) ? 'Required page — fixed in place' : 'Drag to reorder'}
            aria-hidden
          >
            {protectedTypes.includes(page.type)
              ? <LockKeyhole size={12} />
              : <GripVertical size={14} />}
          </span>
          {pageRenameActive ? (
            <div className="organizer-inline-page">
              <small>{PAGE_TYPE_LABELS[page.type]}</small>
              <input
                autoFocus
                aria-label={`Rename ${page.title}`}
                value={inlineRename.value}
                onChange={(event) => setInlineRename({ ...inlineRename, value: event.target.value })}
                onKeyDown={handleInlineRenameKey}
                onBlur={() => finishInlineRename(inlineRename)}
              />
            </div>
          ) : (
            <button
              type="button"
              className="organizer-open"
              onClick={() => scheduleOpenPage(page.id)}
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                cancelScheduledOpen()
                beginInlineRename({ kind: 'page', id: page.id, value: page.title })
              }}
            >
              <small>{PAGE_TYPE_LABELS[page.type]}</small>
              <strong>{page.title}</strong>
            </button>
          )}
          {!protectedTypes.includes(page.type) && (
            <div className="organizer-card-actions">
              <button type="button" title="Duplicate page" onClick={() => duplicateChapter(page.id)}>
                <Copy size={13} />
              </button>
              <button type="button" title="Move page to Trash" onClick={() => deleteChapter(page.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        <div className="organizer-card-meta">
          <span>{countWords(page.content).toLocaleString()} words</span>
          {page.partId && <span>In {partById.get(page.partId) || 'Part'}</span>}
          {page.type === 'chapter' && <span>{scenes.length} scene{scenes.length === 1 ? '' : 's'}</span>}
        </div>

        {page.type === 'chapter' && (
          <div className="organizer-scenes">
            {scenes.map((title, sceneIndex) => (
              <Fragment key={`${page.id}-${sceneIndex}`}>
                {renderSceneDropGap(page, scenes, sceneIndex, 'before')}
                <div
                  className={`organizer-scene${
                    dragItem?.kind === 'scene' &&
                    dragItem.chapterId === page.id &&
                    dragItem.sceneIndex === sceneIndex
                      ? ' is-dragging'
                      : ''
                  }`}
                  draggable={!(
                    inlineRename?.kind === 'scene' &&
                    inlineRename.chapterId === page.id &&
                    inlineRename.index === sceneIndex
                  )}
                  onDragStart={(event) => {
                    event.stopPropagation()
                    beginDrag(event, { kind: 'scene', chapterId: page.id, sceneIndex })
                  }}
                  onDragEnd={() => finishDrag()}
                  onDragOver={(event) => {
                    const item = dragItemRef.current
                    if (item?.kind !== 'scene') return
                    event.stopPropagation()
                    const bounds = event.currentTarget.getBoundingClientRect()
                    const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                    if (!canDropScene(item, page.id, sceneIndex, placement)) {
                      setDropHint(null)
                      return
                    }
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    activateDropHint(
                      { kind: 'scene', chapterId: page.id, sceneIndex, placement },
                      `${placement === 'before' ? 'Place before' : 'Place after'} ${title} in ${page.title}`,
                    )
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const item = dragItemRef.current
                    if (item?.kind !== 'scene') return
                    const bounds = event.currentTarget.getBoundingClientRect()
                    const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                    if (!canDropScene(item, page.id, sceneIndex, placement)) return finishDrag()
                    const movedTitle = describeDragItem(item)
                    moveSceneToChapter(
                      item.chapterId,
                      item.sceneIndex,
                      page.id,
                      sceneIndex,
                      placement,
                    )
                    setActiveChapter(page.id)
                    finishDrag(`Moved ${movedTitle} ${placement} ${title} in ${page.title}.`)
                  }}
                >
                  <span className="organizer-scene-grip" title="Drag to reorder" aria-hidden>
                    <GripVertical size={11} />
                  </span>
                  {inlineRename?.kind === 'scene' &&
                  inlineRename.chapterId === page.id &&
                  inlineRename.index === sceneIndex ? (
                    <input
                      autoFocus
                      className="organizer-inline-scene"
                      aria-label={`Rename ${title}`}
                      value={inlineRename.value}
                      onChange={(event) => setInlineRename({ ...inlineRename, value: event.target.value })}
                      onKeyDown={handleInlineRenameKey}
                      onBlur={() => finishInlineRename(inlineRename)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => scheduleOpenScene(page.id, sceneIndex)}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        cancelScheduledOpen()
                        beginInlineRename({
                          kind: 'scene',
                          chapterId: page.id,
                          index: sceneIndex,
                          value: title,
                        })
                      }}
                    >
                      {title}
                    </button>
                  )}
                  <button
                    type="button"
                    title="Duplicate scene"
                    onClick={() => duplicateScene(page.id, sceneIndex)}
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    type="button"
                    title="Move scene to Trash"
                    disabled={scenes.length <= 1}
                    onClick={() => deleteScene(page.id, sceneIndex)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </Fragment>
            ))}
            {renderSceneDropGap(page, scenes, scenes.length - 1, 'after')}
            <button type="button" className="organizer-add-scene" onClick={() => addScene(page.id, scenes.length - 1)}>
              <Plus size={12} /> Scene
            </button>
          </div>
        )}
      </article>
    )
  }

  const lanes = [
    {
      key: 'opening',
      number: '01',
      title: 'Opening pages',
      description: 'Reader orientation and publishing information.',
      pages: frontMatter,
    },
    {
      key: 'main',
      number: '02',
      title: 'Main text',
      description: 'Parts, chapters, scenes, and custom content.',
      pages: bodyChapters,
    },
    {
      key: 'closing',
      number: '03',
      title: 'Closing pages',
      description: 'Notes, acknowledgements, references, and extras.',
      pages: backMatter,
    },
  ]

  return (
    <section
      className={`organizer${dragItem ? ' drag-in-progress' : ''}`}
      onDragOver={(event) => {
        if (!dragItemRef.current || event.defaultPrevented) return
        setDropHint(null)
        setTrashActive(false)
        setDragAnnouncement(
          `Moving ${describeDragItem(dragItemRef.current)}. Choose a highlighted position or Trash.`,
        )
      }}
    >
      <header className="organizer-head">
        <div>
          <span>Structure studio</span>
          <h1>Shape the reading journey</h1>
          <p>Move pages between positions, reorder scenes, or drop scenes onto another chapter.</p>
        </div>
        <div className="organizer-head-actions">
          <button type="button" onClick={addChapter}><Plus size={15} /> Chapter</button>
          <button type="button" onClick={addPart}><Layers3 size={15} /> Part</button>
          <button type="button" onClick={() => addPage('custom-page')}><FilePlus2 size={15} /> Custom page</button>
        </div>
      </header>

      <div className="organizer-board">
        {lanes.map((lane) => (
          <section className={`organizer-lane lane-${lane.key}`} key={lane.key}>
            <header>
              <span>{lane.number}</span>
              <div>
                <h2>{lane.title}</h2>
                <p>{lane.description}</p>
              </div>
              <strong>{lane.pages.length}</strong>
            </header>
            <div className="organizer-stack">
              {lane.pages.length ? (
                <>
                  {lane.pages.map((page) => (
                    <Fragment key={page.id}>
                      {renderPageDropGap(page, 'before')}
                      {renderPage(page)}
                    </Fragment>
                  ))}
                  {renderPageDropGap(lane.pages[lane.pages.length - 1], 'after')}
                </>
              ) : (
                <div className={`organizer-empty${dragItem ? ' drag-aware' : ''}`}>
                  {dragItem ? 'No compatible destination in this section.' : 'No pages in this section.'}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {dragItem && (
        <div className="organizer-drag-coach" aria-hidden>
          <GripVertical size={14} />
          <span>{dragAnnouncement}</span>
        </div>
      )}
      <span className="organizer-drag-live" role="status" aria-live="polite">
        {dragAnnouncement}
      </span>

      <div
        className={[
          'organizer-trash',
          trashActive ? 'active' : '',
          dragItem && !canTrash(dragItem) ? 'unavailable' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={(event) => {
          const item = dragItemRef.current
          if (!item || !canTrash(item)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropHint(null)
          setTrashActive(true)
          setDragAnnouncement(`Release to move ${describeDragItem(item)} into Trash.`)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTrashActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          const item = dragItemRef.current
          if (!item || !canTrash(item)) return finishDrag()
          const itemTitle = describeDragItem(item)
          if (item.kind === 'page') deleteChapter(item.pageId)
          else deleteScene(item.chapterId, item.sceneIndex)
          finishDrag(`Moved ${itemTitle} into Trash.`)
        }}
      >
        <Trash2 size={17} />
        <span>
          {trashActive
            ? 'Release to move into Trash'
            : dragItem && !canTrash(dragItem)
              ? 'This item must remain in the manuscript'
              : 'Drag a removable page or scene here'}
        </span>
      </div>
    </section>
  )
}
