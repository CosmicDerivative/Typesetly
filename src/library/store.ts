import { PRESET_THEMES } from '../themes/presets.ts'
import type { BookProject, BookTheme, LibraryState, SnapshotFile } from '../types.ts'

const DB_NAME = 'typesetly-local'
const DB_VERSION = 2
const STATE_STORE = 'state'
const REVISION_STORE = 'revisions'
const STATE_KEY = 'library-v3'
const MAX_REVISIONS_PER_BOOK = 20

export function isUntouchedLegacySample(book: BookProject): boolean {
  const titles = book.chapters.map((chapter) => chapter.title)
  const opening = book.chapters.find((chapter) => chapter.title === 'Little Dog')?.content || ''
  const ending = book.chapters.find((chapter) => chapter.title === 'Good Boy, Pip')?.content || ''
  return (
    book.createdAt === book.updatedAt &&
    book.details.title === 'The Little Dog' &&
    book.details.author === 'Jordan' &&
    book.details.subtitle === 'A Love Story in Three Chapters' &&
    titles.join('|') ===
      'Title Page|Copyright|Dedication|Contents|Little Dog|Sit Down|Good Boy, Pip|About the Author' &&
    opening.includes('When Pip first came home') &&
    ending.includes('This book is for him')
  )
}

export function createInitialLibraryState(): LibraryState {
  return { books: [], openBookId: null, themes: PRESET_THEMES }
}

function normalizeState(value: Partial<LibraryState> | null | undefined): LibraryState {
  const customThemes = (value?.themes || []).filter((theme) => !theme.preset)
  const books = (value?.books || []).filter((book) => !isUntouchedLegacySample(book))
  const openBookId = books.some((book) => book.id === value?.openBookId)
    ? value?.openBookId ?? null
    : null
  return {
    books,
    openBookId,
    themes: [...PRESET_THEMES, ...customThemes],
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  const request = indexedDB.open(name, DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE)
    if (!db.objectStoreNames.contains(REVISION_STORE)) {
      const revisions = db.createObjectStore(REVISION_STORE, { keyPath: 'id' })
      revisions.createIndex('bookId', 'bookId')
      revisions.createIndex('createdAt', 'createdAt')
      revisions.createIndex('bookCreatedAt', ['bookId', 'createdAt'])
    } else {
      const revisions = request.transaction?.objectStore(REVISION_STORE)
      if (revisions && !revisions.indexNames.contains('bookCreatedAt')) {
        revisions.createIndex('bookCreatedAt', ['bookId', 'createdAt'])
      }
    }
  }
  return requestResult(request)
}

async function readDatabase(name: string): Promise<LibraryState | null> {
  const db = await openDatabase(name)
  const stateTx = db.transaction(STATE_STORE, 'readonly')
  const state = await requestResult(stateTx.objectStore(STATE_STORE).get(STATE_KEY))
  await transactionDone(stateTx)
  db.close()
  return state ? normalizeState(state as LibraryState) : null
}

export async function loadLibrary(): Promise<LibraryState> {
  try {
    const current = await readDatabase(DB_NAME)
    if (current) return current
  } catch {
    // IndexedDB can be unavailable in hardened browser contexts.
  }

  const initial = createInitialLibraryState()
  await saveLibrary(initial)
  return initial
}

export async function saveLibrary(state: LibraryState): Promise<void> {
  const payload: LibraryState = {
    books: state.books,
    openBookId: state.openBookId,
    themes: state.themes.filter((theme) => !theme.preset),
  }
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (estimate?.quota && estimate.usage && estimate.usage / estimate.quota > .96) {
      throw new Error('Local storage is almost full. Download a snapshot and remove unused image-heavy books before continuing.')
    }
    const db = await openDatabase()
    const tx = db.transaction(STATE_STORE, 'readwrite')
    tx.objectStore(STATE_STORE).put(payload, STATE_KEY)
    await transactionDone(tx)
    db.close()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('This device has run out of local storage. Download a snapshot before removing images or unused books.')
    }
    throw error
  }
}

export async function saveRevision(book: BookProject): Promise<void> {
  const db = await openDatabase()
  const id = `${book.id}:${Date.now()}`
  const write = db.transaction(REVISION_STORE, 'readwrite')
  write.objectStore(REVISION_STORE).put({
    id,
    bookId: book.id,
    createdAt: new Date().toISOString(),
    // Named versions already live in the main library record. Do not copy all
    // of them into every automatic recovery point.
    book: structuredClone({ ...book, revisions: [] }),
  })
  await transactionDone(write)

  const read = db.transaction(REVISION_STORE, 'readonly')
  const all = (await requestResult(
    read.objectStore(REVISION_STORE).index('bookId').getAll(book.id),
  )) as Array<{ id: string; createdAt: string }>
  await transactionDone(read)

  const excess = all
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(MAX_REVISIONS_PER_BOOK)
  if (excess.length) {
    const remove = db.transaction(REVISION_STORE, 'readwrite')
    for (const revision of excess) remove.objectStore(REVISION_STORE).delete(revision.id)
    await transactionDone(remove)
  }
  db.close()
}

export async function listRevisions(
  bookId: string,
  limit = 8,
): Promise<Array<{ id: string; createdAt: string; book: BookProject }>> {
  const db = await openDatabase()
  const tx = db.transaction(REVISION_STORE, 'readonly')
  const index = tx.objectStore(REVISION_STORE).index('bookCreatedAt')
  const range = IDBKeyRange.bound([bookId, ''], [bookId, '\uffff'])
  const result = await new Promise<Array<{ id: string; createdAt: string; book: BookProject }>>((resolve, reject) => {
    const items: Array<{ id: string; createdAt: string; book: BookProject }> = []
    const request = index.openCursor(range, 'prev')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || items.length >= limit) {
        resolve(items)
        return
      }
      items.push(cursor.value as { id: string; createdAt: string; book: BookProject })
      cursor.continue()
    }
  })
  await transactionDone(tx)
  db.close()
  return result
}

export function parseSnapshot(raw: string): SnapshotFile {
  const parsed = JSON.parse(raw) as Partial<SnapshotFile>
  if (!Array.isArray(parsed.books)) throw new Error('This file does not contain a Typesetly library.')
  return {
    version: 3,
    books: parsed.books,
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    exportedAt: parsed.exportedAt || new Date().toISOString(),
  }
}

export function upsertBook(state: LibraryState, book: BookProject): LibraryState {
  const idx = state.books.findIndex((candidate) => candidate.id === book.id)
  const books = [...state.books]
  const next = { ...book, schemaVersion: 4, updatedAt: new Date().toISOString() }
  if (idx >= 0) books[idx] = next
  else books.unshift(next)
  return { ...state, books }
}

export function allThemes(state: LibraryState): BookTheme[] {
  const custom = state.themes.filter((theme) => !theme.preset)
  return [
    ...PRESET_THEMES.map((theme) => state.themes.find((candidate) => candidate.id === theme.id) || theme),
    ...custom,
  ]
}
