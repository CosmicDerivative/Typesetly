import { useApp } from '../BookContext'
import { REQUIRED_PAGE_TYPES } from '../manuscript/pageTypes'
import type { Chapter } from '../types'
import './ChapterOptionsMenu.css'
import { processImageFile } from '../images/process'
import { dataUrlToBlob, imageRef } from '../library/images'
import { storeNewImage } from '../library/store'
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
        <select
          value={o.includeIn}
          onChange={(event) => updateChapterOptions(chapter.id, { includeIn: event.target.value as typeof o.includeIn })}
        >
          <option value="all">Ebook and print</option>
          <option value="ebook">Ebook only</option>
          <option value="print">Print only</option>
          <option value="none">Do not export</option>
        </select>
      </label>
      <label className="co-select">
        EPUB opening location
        <button
          type="button"
          onClick={() => setEpubStartChapter(project?.epubStartChapterId === chapter.id ? undefined : chapter.id)}
        >
          {project?.epubStartChapterId === chapter.id ? 'Use normal book order' : 'Start EPUB at this page'}
        </button>
      </label>
      <label className="co-select">
        Begin on
        <select
          value={o.beginOn}
          onChange={(event) =>
            updateChapterOptions(chapter.id, {
              beginOn: event.target.value as typeof o.beginOn,
            })
          }
        >
          <option value="either">Either side</option>
          <option value="right">Right side</option>
          <option value="left">Left side</option>
        </select>
      </label>
      <label className="co-select">
        Individual chapter image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file || !project) return
            try {
              const processed = await processImageFile(file)
              const blob = dataUrlToBlob(processed.dataUrl)
              if (!blob) throw new Error('The selected image is not supported.')
              const stored = await storeNewImage(project.id, blob)
              // Keep the tiny persistent ref in project state; the ornament
              // resolves an object URL only while this chapter is on screen.
              updateChapterImage(chapter.id, imageRef(stored.id), {
                width: processed.width,
                height: processed.height,
                bytes: processed.bytes,
              })
            } catch (error) {
              window.dispatchEvent(new CustomEvent('typesetly:notice', {
                detail: error instanceof Error ? error.message : 'The image could not be imported.',
              }))
            }
          }}
        />
        {chapter.imageDataUrl && (
          <>
            <input
              value={chapter.imageAlt || ''}
              maxLength={140}
              placeholder="Alt text (leave blank if decorative)"
              onChange={(event) => updateChapterImageDetails(chapter.id, {
                imageAlt: event.target.value,
                imageCaption: chapter.imageCaption,
                imageLayout: chapter.imageLayout,
              })}
            />
            <input
              value={chapter.imageCaption || ''}
              placeholder="Visible caption"
              onChange={(event) => updateChapterImageDetails(chapter.id, {
                imageAlt: chapter.imageAlt,
                imageCaption: event.target.value,
                imageLayout: chapter.imageLayout,
              })}
            />
            <select
              value={chapter.imageLayout || 'inline'}
              onChange={(event) => updateChapterImageDetails(chapter.id, {
                imageAlt: chapter.imageAlt,
                imageCaption: chapter.imageCaption,
                imageLayout: event.target.value as NonNullable<typeof chapter.imageLayout>,
              })}
            >
              <option value="inline">Inline chapter image</option>
              <option value="wide">Wide image</option>
              <option value="full-page">Full page</option>
              <option value="two-page">Two-page spread</option>
            </select>
            <button type="button" onClick={() => updateChapterImage(chapter.id, undefined)}>Remove image</button>
          </>
        )}
      </label>
    </div>
  )
}
