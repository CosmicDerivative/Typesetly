import { useMemo, useState, type ReactNode } from 'react'
import { BookContext, getActiveChapter, selectChapter, type WorkspaceMode } from './BookContext'
import { createChapter, createEmptyBook } from './data'
import type { BookDetails, BookProject } from './types'

export function BookProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<BookProject>(() => createEmptyBook())
  const [mode, setMode] = useState<WorkspaceMode>('writing')
  const [saved, setSaved] = useState(true)

  const changeProject = (update: (book: BookProject) => BookProject) => {
    setProject((book) => ({
      ...update(book),
      updatedAt: new Date().toISOString(),
    }))
    setSaved(false)
  }

  const value = useMemo(() => ({
    project,
    activeChapter: getActiveChapter(project),
    mode,
    saved,
    setMode,
    setActiveChapter: (chapterId: string) => {
      changeProject((book) => selectChapter(book, chapterId))
    },
    updateBookDetails: (details: Partial<BookDetails>) => {
      changeProject((book) => ({
        ...book,
        details: { ...book.details, ...details },
      }))
    },
    updateChapterTitle: (chapterId: string, title: string) => {
      changeProject((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, title } : chapter
        ),
      }))
    },
    updateChapterContent: (chapterId: string, content: string) => {
      changeProject((book) => ({
        ...book,
        chapters: book.chapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, content } : chapter
        ),
      }))
    },
    addChapter: () => {
      changeProject((book) => {
        const chapter = createChapter(`Chapter ${book.chapters.length + 1}`, book.chapters.length)
        return { ...book, chapters: [...book.chapters, chapter], activeId: chapter.id }
      })
    },
    removeChapter: (chapterId: string) => {
      changeProject((book) => {
        const chapters = book.chapters.filter((chapter) => chapter.id !== chapterId)
        return { ...book, chapters, activeId: chapters[0]?.id ?? '' }
      })
    },
    markSaved: () => setSaved(true),
  }), [mode, project, saved])

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>
}
