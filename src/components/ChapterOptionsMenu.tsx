import { useApp } from '../BookContext'
import { REQUIRED_PAGE_TYPES } from '../manuscript/pageTypes'
import type { Chapter } from '../types'
import './ChapterOptionsMenu.css'
import { processImageFile } from '../images/process'
import { PageTypeSelect } from './PageTypeSelect'

export function ChapterOptionsMenu({
  chapter,
  onClose,
}: {
  chapter: Chapter
  onClose: () => void
}) {
  const {
    project,
    updateChapterOptions,
    updateChapterType,
    updateChapterImage,
    updateChapterImageDetails,
    setEpubStartChapter,
  } = useApp()
  const o = chapter.options
  type BooleanOption = Exclude<keyof typeof o, 'beginOn' | 'includeIn'>
  const toggle = (key: BooleanOption) =>
    updateChapterOptions(chapter.id, { [key]: !o[key] })

  const items: { key: BooleanOption; label: string }[] = [
    { key: 'hideChapterImage', label: 'Hide Chapter Image' },
    { key: 'hideChapterHeading', label: 'Hide Chapter Heading' },
    { key: 'hidePageNumber', label: 'Hide Page Number' },
    { key: 'hideHeaderFooter', label: 'Hide Header/Footer' },
    { key: 'hideFirstSentenceFormatting', label: 'Hide First Sentence Formatting' },
    { key: 'hideInToc', label: 'Hide in Table of Contents' },
    { key: 'useSmallerChapterTitle', label: 'Use Smaller Chapter Title' },
    { key: 'invertTextColor', label: 'Invert Text Color' },
    { key: 'numbered', label: 'Include in Chapter Numbering' },
    { key: 'includeSubheadingsInToc', label: 'Include Subheadings in Contents' },
  ]

  return (
    <div className="chapter-options">
      <div className="co-head">
        <strong>Chapter options</strong>
        <button type="button" onClick={onClose}>
          ×
        </button>
      </div>
      {!REQUIRED_PAGE_TYPES.includes(chapter.type) && (
        <label className="co-select">
          Page type
          <PageTypeSelect
            value={chapter.type}
            onChange={(type) => updateChapterType(chapter.id, type)}
          />
        </label>
      )}
      {items.map((item) => (
        <label key={item.key} className="co-row">
          <input type="checkbox" checked={o[item.key]} onChange={() => toggle(item.key)} />
          {item.label}
        </label>
      ))}
      <label className="co-select">
        Include in
      </label>
      <label>
        Begin chapter on
        <select value={beginOn} onChange={(event) => setBeginOn(event.target.value)}>
          <option value="next">Next page</option>
          <option value="right">Right-hand page</option>
          <option value="left">Left-hand page</option>
        </select>
      </label>
    </aside>
  )
}
