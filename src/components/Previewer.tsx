import { ChevronLeft, ChevronRight, FileDown, Info, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../BookContext'
import type { PreviewDevice } from '../types'
import './Previewer.css'
import { decorateFirstSentenceHtml, headingParts, parseManuscript, type ManuscriptBlock } from '../layout/manuscript'
import { preflightBook } from '../export/preflight'
import { DEVICE_PROFILES, profileDescription, renderedDeviceWidth } from '../preview/devices'
import { estimateBookPages, readingTimeMinutes } from '../layout/pagination'
import { DrawerControls } from './DrawerControls'

export function Previewer() {
  const {
    rightPanel,
    setRightPanel,
    setMode,
    previewDevice,
    setPreviewDevice,
    activeChapter,
    bodyChapters,

  return (
    <aside className="previewer">
      <header>
        <strong>Book preview</strong>
        <span>Page {page}</span>
      </header>
      <div className="preview-page">
        <p className="chapter-number">Chapter One</p>
        <h1>Untitled Chapter</h1>
        <p>Your formatted manuscript will appear here.</p>
      </div>
      <footer>
        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <button type="button" onClick={() => setPage((value) => value + 1)}>Next</button>
      </footer>
    </aside>
  )
}
