import { v4 as uuid } from 'uuid'
import { countWords } from '../data.ts'
import { PRESET_THEMES } from '../themes/presets.ts'
import type {
  BookProject,
  BookTheme,
  DocumentRevision,
  LibraryState,
  SnapshotBook,
  SnapshotFile,
} from '../types.ts'
import {
  collectImageRefIds,
  dataUrlToBlob,
  dehydrateImageUrls,
  extractDataUrlImages,
  hydrateImageRefs,
  imageRef,
  imageUrlFor,
  inlineImagesAsDataUrls,
  registerImageUrl,
  type StoredImageRecord,
} from './images.ts'

const DB_NAME = 'typesetly-local'
const DB_VERSION = 3
const STATE_STORE = 'state'
const REVISION_STORE = 'revisions'
const CHAPTER_STORE = 'chapters'
const NAMED_REVISION_STORE = 'namedRevisions'
const IMAGE_STORE = 'images'
/** Monolithic pre-sharding record. Kept untouched after migration as a backup. */
const LEGACY_STATE_KEY = 'library-v3'
const STATE_KEY = 'library-v4'
const MAX_REVISIONS_PER_BOOK = 20
/** Owner id for theme images that are not tied to a single book. */
const LIBRARY_IMAGE_OWNER = 'library'

export interface ChapterContentRecord {
  key: string
  bookId: string
  chapterId: string
  content: string
}

export interface PersistLibraryPayload {
  /** Metadata-only library: chapter content stripped, revisions as metas. */
  state: LibraryState
  /** Chapter contents (hydrated form) that changed since the last save. */
  dirtyChapters: Array<{ bookId: string; chapterId: string; content: string }>
  deletedChapterKeys: string[]
  deletedBookIds: string[]
}

/**
 * Deduplicates base64 payloads across saves within this session so repeated
 * autosaves of unchanged legacy data URLs reuse one stored blob.
 */
const sessionDataUrlCache = new Map<string, string>()

export function chapterKey(bookId: string, chapterId: string): string {
  return `${bookId}/${chapterId}`
}

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
  const books = value?.books || []
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

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION)
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
    if (!db.objectStoreNames.contains(CHAPTER_STORE)) {
      const chapters = db.createObjectStore(CHAPTER_STORE, { keyPath: 'key' })
      chapters.createIndex('bookId', 'bookId')
    }
    if (!db.objectStoreNames.contains(NAMED_REVISION_STORE)) {
      const named = db.createObjectStore(NAMED_REVISION_STORE, { keyPath: 'id' })
      named.createIndex('bookId', 'bookId')
    }
    if (!db.objectStoreNames.contains(IMAGE_STORE)) {
      const images = db.createObjectStore(IMAGE_STORE, { keyPath: 'id' })
      images.createIndex('bookId', 'bookId')
    }
  }
  return requestResult(request)
}

/**
 * Serializes a value, moves any base64 images into blob rows, swaps session
 * object URLs for persistent refs, and returns the cleaned value. Works on
 * whole records so covers, chapter ornaments, theme art, trash pages, and
 * tracked-change HTML are all handled in one place.
 */
function dehydrateValue<T>(value: T, ownerId: string, imageRows: StoredImageRecord[]): T {
  const raw = JSON.stringify(value)
  const withoutUrls = dehydrateImageUrls(raw)
  const extracted = extractDataUrlImages(withoutUrls, uuid, sessionDataUrlCache)
  for (const image of extracted.images) {
    const blob = dataUrlToBlob(image.dataUrl)
    if (blob) {
      imageRows.push({ id: image.id, bookId: ownerId, blob, createdAt: new Date().toISOString() })
    }
  }
  return JSON.parse(extracted.text) as T
}

function dehydrateText(text: string, ownerId: string, imageRows: StoredImageRecord[]): string {
  const withoutUrls = dehydrateImageUrls(text)
  const extracted = extractDataUrlImages(withoutUrls, uuid, sessionDataUrlCache)
  for (const image of extracted.images) {
    const blob = dataUrlToBlob(image.dataUrl)
    if (blob) {
      imageRows.push({ id: image.id, bookId: ownerId, blob, createdAt: new Date().toISOString() })
    }
  }
  return extracted.text
}

async function loadImageBlobs(db: IDBDatabase, ids: string[]): Promise<Map<string, Blob>> {
  const blobs = new Map<string, Blob>()
  const missing = ids.filter((id) => !imageUrlFor(id))
  if (!missing.length) return blobs
  const tx = db.transaction(IMAGE_STORE, 'readonly')
  const store = tx.objectStore(IMAGE_STORE)
  const reads = missing.map(async (id) => {
    const record = (await requestResult(store.get(id))) as StoredImageRecord | undefined
    if (record?.blob) blobs.set(id, record.blob)
  })
  await Promise.all(reads)
  await transactionDone(tx)
  return blobs
}

/** Registers object URLs for every image ref in the text and rewrites it. */
async function hydrateTextImages(db: IDBDatabase, text: string): Promise<string> {
  const ids = collectImageRefIds(text)
  if (!ids.length) return text
  const blobs = await loadImageBlobs(db, ids)
  for (const [id, blob] of blobs) await registerImageUrl(id, blob)
  return hydrateImageRefs(text, imageUrlFor)
}

async function hydrateValueImages<T>(db: IDBDatabase, value: T): Promise<T> {
  const raw = JSON.stringify(value)
  const hydrated = await hydrateTextImages(db, raw)
  return hydrated === raw ? value : (JSON.parse(hydrated) as T)
}

/**
 * One-time split of the monolithic `library-v3` record into per-chapter,
 * per-revision, and per-image rows. Runs inside a single transaction so a
 * failure leaves the legacy record as the untouched source of truth; the
 * legacy record is intentionally preserved afterwards as a local backup.
 */
function migrateLegacyLibrary(db: IDBDatabase, legacy: LibraryState): Promise<void> {
  const tx = db.transaction(
    [STATE_STORE, CHAPTER_STORE, NAMED_REVISION_STORE, IMAGE_STORE],
    'readwrite',
  )
  const chapterStore = tx.objectStore(CHAPTER_STORE)
  const namedStore = tx.objectStore(NAMED_REVISION_STORE)
  const imageStore = tx.objectStore(IMAGE_STORE)

  const metaBooks: BookProject[] = []
  for (const book of legacy.books) {
    if (isUntouchedLegacySample(book)) continue
    const imageRows: StoredImageRecord[] = []
    const cache = new Map<string, string>()
    const extractOwned = (text: string) => {
      const extracted = extractDataUrlImages(text, uuid, cache)
      for (const image of extracted.images) {
        const blob = dataUrlToBlob(image.dataUrl)
        if (blob) {
          imageRows.push({ id: image.id, bookId: book.id, blob, createdAt: new Date().toISOString() })
        }
      }
      return extracted.text
    }

    const metaChapters = book.chapters.map((chapter) => {
      const content = extractOwned(chapter.content || '')
      chapterStore.put({
        key: chapterKey(book.id, chapter.id),
        bookId: book.id,
        chapterId: chapter.id,
        content,
      } satisfies ChapterContentRecord)
      return { ...chapter, content: '', wordCount: countWords(chapter.content || '') }
    })

    const legacyRevisions = (book.revisions || []) as unknown as DocumentRevision[]
    const revisionMetas = legacyRevisions.map((revision) => {
      if (Array.isArray(revision.chapters)) {
        namedStore.put({
          ...revision,
          bookId: book.id,
          chapters: revision.chapters.map((chapter) => ({
            ...chapter,
            content: extractOwned(chapter.content || ''),
          })),
        })
      }
      return { id: revision.id, name: revision.name, createdAt: revision.createdAt }
    })

    // Serialize the remaining metadata (covers, ornaments, trash pages,
    // master pages, tracked changes…) and sweep any base64 images it holds.
    const metaJson = extractOwned(
      JSON.stringify({ ...book, chapters: metaChapters, revisions: revisionMetas }),
    )
    for (const row of imageRows) imageStore.put(row)
    metaBooks.push(JSON.parse(metaJson) as BookProject)
  }

  const themeRows: StoredImageRecord[] = []
  const themes = dehydrateValue(
    (legacy.themes || []).filter((theme) => !theme.preset),
    LIBRARY_IMAGE_OWNER,
    themeRows,
  )
  for (const row of themeRows) imageStore.put(row)

  const openBookId = metaBooks.some((book) => book.id === legacy.openBookId)
    ? legacy.openBookId
    : null
  tx.objectStore(STATE_STORE).put({ books: metaBooks, openBookId, themes }, STATE_KEY)
  return transactionDone(tx)
}

let loadLibraryInFlight: Promise<LibraryState> | null = null

/**
 * Single-flight so overlapping boot effects (React StrictMode mounts twice in
 * development) can never run the legacy migration concurrently.
 */
export function loadLibrary(): Promise<LibraryState> {
  if (!loadLibraryInFlight) {
    loadLibraryInFlight = loadLibraryOnce().finally(() => {
      loadLibraryInFlight = null
    })
  }
  return loadLibraryInFlight
}

function scrubDeadBlobUrls(value?: string): string | undefined {
  if (!value) return value
  return value.startsWith('blob:') ? undefined : value
}

function scrubBookImageFields(book: BookProject): BookProject {
  return {
    ...book,
    details: {
      ...book.details,
      coverDataUrl: scrubDeadBlobUrls(book.details.coverDataUrl),
    },
    chapters: book.chapters.map((chapter) => ({
      ...chapter,
      imageDataUrl: scrubDeadBlobUrls(chapter.imageDataUrl),
    })),
  }
}

function scrubThemeImageFields(theme: BookTheme): BookTheme {
  return {
    ...theme,
    chapterHeading: {
      ...theme.chapterHeading,
      sharedImageDataUrl: scrubDeadBlobUrls(theme.chapterHeading.sharedImageDataUrl),
    },
    sceneBreak: {
      ...theme.sceneBreak,
      customImageDataUrl: scrubDeadBlobUrls(theme.sceneBreak.customImageDataUrl),
    },
  }
}

/**
 * Restores missing image blobs (and dead `blob:` metadata) from the untouched
 * library-v3 backup. IndexedDB writes stay fully synchronous inside one
 * transaction so the store cannot auto-commit between an awaited get and put.
 */
async function repairMissingMetadataImages(
  db: IDBDatabase,
  state: LibraryState,
): Promise<LibraryState> {
  const legacy = (await requestResult(
    db.transaction(STATE_STORE, 'readonly').objectStore(STATE_STORE).get(LEGACY_STATE_KEY),
  )) as LibraryState | undefined

  const legacyById = new Map((legacy?.books || []).map((book) => [book.id, book]))
  const candidates: StoredImageRecord[] = []
  let metadataChanged = false

  const restoreField = (
    current: string | undefined,
    legacyValue: string | undefined,
    ownerId: string,
  ): string | undefined => {
    if (current?.startsWith('typesetly-image://')) {
      if (legacyValue?.startsWith('data:image/')) {
        const id = current.slice('typesetly-image://'.length)
        const blob = dataUrlToBlob(legacyValue)
        if (blob) {
          candidates.push({ id, bookId: ownerId, blob, createdAt: new Date().toISOString() })
        }
      }
      return current
    }
    if (current && !current.startsWith('blob:')) return current
    // Dead session object URLs (or cleared fields) can still be recovered from
    // the pre-migration backup when it still holds the original data URL.
    if (!legacyValue?.startsWith('data:image/')) return scrubDeadBlobUrls(current)
    const blob = dataUrlToBlob(legacyValue)
    if (!blob) return scrubDeadBlobUrls(current)
    const id = uuid()
    candidates.push({ id, bookId: ownerId, blob, createdAt: new Date().toISOString() })
    metadataChanged = true
    return imageRef(id)
  }

  const books = state.books.map((book) => {
    const source = legacyById.get(book.id)
    const coverDataUrl = restoreField(
      book.details.coverDataUrl,
      source?.details.coverDataUrl,
      book.id,
    )
    const chapters = book.chapters.map((chapter) => {
      const legacyChapter = source?.chapters.find((candidate) => candidate.id === chapter.id)
      const imageDataUrl = restoreField(chapter.imageDataUrl, legacyChapter?.imageDataUrl, book.id)
      return { ...chapter, imageDataUrl }
    })
    const next = scrubBookImageFields({
      ...book,
      details: { ...book.details, coverDataUrl },
      chapters,
    })
    if (
      next.details.coverDataUrl !== book.details.coverDataUrl ||
      next.chapters.some((chapter, index) => chapter.imageDataUrl !== book.chapters[index]?.imageDataUrl)
    ) {
      metadataChanged = true
    }
    return next
  })

  const legacyThemes = new Map((legacy?.themes || []).map((theme) => [theme.id, theme]))
  const themes = (state.themes || []).map((theme) => {
    if (theme.preset) return theme
    const sourceTheme = legacyThemes.get(theme.id)
    const sharedImageDataUrl = restoreField(
      theme.chapterHeading.sharedImageDataUrl,
      sourceTheme?.chapterHeading.sharedImageDataUrl,
      LIBRARY_IMAGE_OWNER,
    )
    const customImageDataUrl = restoreField(
      theme.sceneBreak.customImageDataUrl,
      sourceTheme?.sceneBreak.customImageDataUrl,
      LIBRARY_IMAGE_OWNER,
    )
    const next = scrubThemeImageFields({
      ...theme,
      chapterHeading: { ...theme.chapterHeading, sharedImageDataUrl },
      sceneBreak: { ...theme.sceneBreak, customImageDataUrl },
    })
    if (
      next.chapterHeading.sharedImageDataUrl !== theme.chapterHeading.sharedImageDataUrl ||
      next.sceneBreak.customImageDataUrl !== theme.sceneBreak.customImageDataUrl
    ) {
      metadataChanged = true
    }
    return next
  })

  // Deduplicate candidate ids; prefer the first blob we built for each id.
  const uniqueCandidates = [...new Map(candidates.map((row) => [row.id, row])).values()]
  if (uniqueCandidates.length) {
    const existingIds = new Set<string>()
    const readTx = db.transaction(IMAGE_STORE, 'readonly')
    const readStore = readTx.objectStore(IMAGE_STORE)
    await Promise.all(
      uniqueCandidates.map(async (row) => {
        if (await requestResult(readStore.get(row.id))) existingIds.add(row.id)
      }),
    )
    await transactionDone(readTx)

    const missing = uniqueCandidates.filter((row) => !existingIds.has(row.id))
    if (missing.length) {
      const writeTx = db.transaction(IMAGE_STORE, 'readwrite')
      const writeStore = writeTx.objectStore(IMAGE_STORE)
      for (const row of missing) writeStore.put(row)
      await transactionDone(writeTx)
    }
  }

  const repaired = { ...state, books, themes }
  if (metadataChanged) {
    const writeTx = db.transaction(STATE_STORE, 'readwrite')
    writeTx.objectStore(STATE_STORE).put(
      {
        books,
        openBookId: state.openBookId,
        themes: themes.filter((theme) => !theme.preset),
      },
      STATE_KEY,
    )
    await transactionDone(writeTx)
  }

  return repaired
}

async function loadLibraryOnce(): Promise<LibraryState> {
  const db = await openDatabase()
  try {
    const readTx = db.transaction(STATE_STORE, 'readonly')
    const stateStore = readTx.objectStore(STATE_STORE)
    const current = (await requestResult(stateStore.get(STATE_KEY))) as LibraryState | undefined
    const legacy = current
      ? undefined
      : ((await requestResult(stateStore.get(LEGACY_STATE_KEY))) as LibraryState | undefined)
    await transactionDone(readTx)

    if (current) {
      // Leave image refs as `typesetly-image://` in metadata. Covers and chapter
      // ornaments resolve on demand so boot does not pull every blob into memory.
      // Repair any refs whose blob rows were lost during an earlier migration.
      const repaired = await repairMissingMetadataImages(db, current)
      return normalizeState(repaired)
    }
    if (legacy) {
      await migrateLegacyLibrary(db, legacy)
      const verifyTx = db.transaction(STATE_STORE, 'readonly')
      const migrated = (await requestResult(
        verifyTx.objectStore(STATE_STORE).get(STATE_KEY),
      )) as LibraryState | undefined
      await transactionDone(verifyTx)
      if (!migrated) throw new Error('The library upgrade did not complete. Your data is unchanged.')
      return normalizeState(migrated)
    }

    const initial = createInitialLibraryState()
    const writeTx = db.transaction(STATE_STORE, 'readwrite')
    writeTx.objectStore(STATE_STORE).put(
      { books: [], openBookId: null, themes: [] },
      STATE_KEY,
    )
    await transactionDone(writeTx)
    return initial
  } finally {
    db.close()
  }
}

/** Loads and hydrates the chapter HTML for one book. */
export async function loadChapterContents(bookId: string): Promise<Map<string, string>> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(CHAPTER_STORE, 'readonly')
    const records = (await requestResult(
      tx.objectStore(CHAPTER_STORE).index('bookId').getAll(bookId),
    )) as ChapterContentRecord[]
    await transactionDone(tx)

    const ids = new Set<string>()
    for (const record of records) for (const id of collectImageRefIds(record.content)) ids.add(id)
    const blobs = await loadImageBlobs(db, [...ids])
    for (const [id, blob] of blobs) await registerImageUrl(id, blob)

    const contents = new Map<string, string>()
    for (const record of records) {
      contents.set(record.chapterId, hydrateImageRefs(record.content, imageUrlFor))
    }
    return contents
  } finally {
    db.close()
  }
}

async function ensureQuotaHeadroom() {
  const estimate = await navigator.storage?.estimate?.()
  if (estimate?.quota && estimate.usage && estimate.usage / estimate.quota > .96) {
    throw new Error('Local storage is almost full. Download a snapshot and remove unused image-heavy books before continuing.')
  }
}

function friendlyQuotaError(error: unknown): never {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    throw new Error('This device has run out of local storage. Download a snapshot before removing images or unused books.')
  }
  throw error
}

/**
 * Writes the metadata record and only the chapters that changed, atomically.
 * Purges every row belonging to deleted books.
 */
export async function persistLibrary(payload: PersistLibraryPayload): Promise<void> {
  try {
    await ensureQuotaHeadroom()
    const db = await openDatabase()
    try {
      const imageRows: StoredImageRecord[] = []
      const metaState = {
        books: payload.state.books.map((book) => dehydrateValue(book, book.id, imageRows)),
        openBookId: payload.state.openBookId,
        themes: dehydrateValue(
          payload.state.themes.filter((theme) => !theme.preset),
          LIBRARY_IMAGE_OWNER,
          imageRows,
        ),
      }
      const chapterRecords = payload.dirtyChapters.map((chapter) => ({
        key: chapterKey(chapter.bookId, chapter.chapterId),
        bookId: chapter.bookId,
        chapterId: chapter.chapterId,
        content: dehydrateText(chapter.content, chapter.bookId, imageRows),
      } satisfies ChapterContentRecord))

      const tx = db.transaction([STATE_STORE, CHAPTER_STORE, IMAGE_STORE], 'readwrite')
      tx.objectStore(STATE_STORE).put(metaState, STATE_KEY)
      for (const record of chapterRecords) tx.objectStore(CHAPTER_STORE).put(record)
      for (const key of payload.deletedChapterKeys) tx.objectStore(CHAPTER_STORE).delete(key)
      for (const row of imageRows) tx.objectStore(IMAGE_STORE).put(row)
      await transactionDone(tx)

      for (const bookId of payload.deletedBookIds) await deleteBookRows(db, bookId)
    } finally {
      db.close()
    }
  } catch (error) {
    friendlyQuotaError(error)
  }
}

async function deleteIndexedRows(db: IDBDatabase, storeName: string, bookId: string) {
  const tx = db.transaction(storeName, 'readwrite')
  const index = tx.objectStore(storeName).index('bookId')
  const keys = (await requestResult(index.getAllKeys(bookId))) as IDBValidKey[]
  for (const key of keys) tx.objectStore(storeName).delete(key)
  await transactionDone(tx)
}

async function deleteBookRows(db: IDBDatabase, bookId: string) {
  await deleteIndexedRows(db, CHAPTER_STORE, bookId)
  await deleteIndexedRows(db, NAMED_REVISION_STORE, bookId)
  await deleteIndexedRows(db, IMAGE_STORE, bookId)
  await deleteIndexedRows(db, REVISION_STORE, bookId)
}

/** Stores one image blob and returns its session display URL. */
export async function storeNewImage(bookId: string, blob: Blob): Promise<{ id: string; url: string }> {
  const db = await openDatabase()
  try {
    const id = uuid()
    const tx = db.transaction(IMAGE_STORE, 'readwrite')
    tx.objectStore(IMAGE_STORE).put({
      id,
      bookId,
      blob,
      createdAt: new Date().toISOString(),
    } satisfies StoredImageRecord)
    await transactionDone(tx)
    return { id, url: await registerImageUrl(id, blob) }
  } finally {
    db.close()
  }
}

/** Loads a blob and returns a displayable data URL for on-screen images only. */
export async function ensureImageDisplayUrl(id: string): Promise<string | undefined> {
  const existing = imageUrlFor(id)
  if (existing) return existing
  const blob = await getImageBlob(id)
  if (!blob) return undefined
  return registerImageUrl(id, blob)
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(IMAGE_STORE, 'readonly')
    const record = (await requestResult(tx.objectStore(IMAGE_STORE).get(id))) as
      | StoredImageRecord
      | undefined
    await transactionDone(tx)
    return record?.blob ?? null
  } finally {
    db.close()
  }
}

/**
 * Copies the image rows referenced by the given texts to a new owning book,
 * returning ref replacements. Keeps duplicated books and boxsets independent
 * of their source book's image lifecycle.
 */
export async function copyImagesForTexts(
  texts: string[],
  targetBookId: string,
): Promise<Map<string, string>> {
  const ids = new Set<string>()
  for (const text of texts) {
    for (const id of collectImageRefIds(dehydrateImageUrls(text))) ids.add(id)
  }
  const replacements = new Map<string, string>()
  if (!ids.size) return replacements
  const db = await openDatabase()
  try {
    const readTx = db.transaction(IMAGE_STORE, 'readonly')
    const readStore = readTx.objectStore(IMAGE_STORE)
    const sources = await Promise.all(
      [...ids].map(async (id) => ({
        id,
        record: (await requestResult(readStore.get(id))) as StoredImageRecord | undefined,
      })),
    )
    await transactionDone(readTx)

    const writeTx = db.transaction(IMAGE_STORE, 'readwrite')
    for (const source of sources) {
      if (!source.record?.blob) continue
      const nextId = uuid()
      writeTx.objectStore(IMAGE_STORE).put({
        id: nextId,
        bookId: targetBookId,
        blob: source.record.blob,
        createdAt: new Date().toISOString(),
      } satisfies StoredImageRecord)
      replacements.set(source.id, nextId)
    }
    await transactionDone(writeTx)
    for (const [sourceId, nextId] of replacements) {
      const source = sources.find((entry) => entry.id === sourceId)
      if (source?.record?.blob) await registerImageUrl(nextId, source.record.blob)
    }
    return replacements
  } finally {
    db.close()
  }
}

/** Hydrates every image ref found anywhere in a book (contents included). */
export async function hydrateBookImages(book: BookProject): Promise<BookProject> {
  const db = await openDatabase()
  try {
    return await hydrateValueImages(db, book)
  } finally {
    db.close()
  }
}

export async function saveNamedRevision(bookId: string, revision: DocumentRevision): Promise<void> {
  try {
    await ensureQuotaHeadroom()
    const db = await openDatabase()
    try {
      const imageRows: StoredImageRecord[] = []
      const record = {
        ...revision,
        bookId,
        chapters: revision.chapters.map((chapter) => ({
          ...chapter,
          content: dehydrateText(chapter.content || '', bookId, imageRows),
        })),
      }
      const tx = db.transaction([NAMED_REVISION_STORE, IMAGE_STORE], 'readwrite')
      tx.objectStore(NAMED_REVISION_STORE).put(record)
      for (const row of imageRows) tx.objectStore(IMAGE_STORE).put(row)
      await transactionDone(tx)
    } finally {
      db.close()
    }
  } catch (error) {
    friendlyQuotaError(error)
  }
}

export async function loadNamedRevision(id: string): Promise<DocumentRevision | null> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(NAMED_REVISION_STORE, 'readonly')
    const record = (await requestResult(tx.objectStore(NAMED_REVISION_STORE).get(id))) as
      | (DocumentRevision & { bookId: string })
      | undefined
    await transactionDone(tx)
    if (!record) return null
    return await hydrateValueImages(db, {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      chapters: record.chapters,
    })
  } finally {
    db.close()
  }
}

export async function deleteNamedRevision(id: string): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(NAMED_REVISION_STORE, 'readwrite')
    tx.objectStore(NAMED_REVISION_STORE).delete(id)
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

/** Writes an automatic recovery point for a hydrated book. */
export async function saveRevision(book: BookProject): Promise<void> {
  const db = await openDatabase()
  try {
    const imageRows: StoredImageRecord[] = []
    // Named versions already live in their own store. Do not copy their
    // listings into every automatic recovery point.
    const stored = dehydrateValue({ ...book, revisions: [] }, book.id, imageRows)
    const id = `${book.id}:${Date.now()}`
    const write = db.transaction([REVISION_STORE, IMAGE_STORE], 'readwrite')
    write.objectStore(REVISION_STORE).put({
      id,
      bookId: book.id,
      createdAt: new Date().toISOString(),
      book: stored,
    })
    for (const row of imageRows) write.objectStore(IMAGE_STORE).put(row)
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
  } finally {
    db.close()
  }
}

export async function listRevisions(
  bookId: string,
  limit = 8,
): Promise<Array<{ id: string; createdAt: string; book: BookProject }>> {
  const db = await openDatabase()
  try {
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
    return result
  } finally {
    db.close()
  }
}

/**
 * Assembles a fully self-contained snapshot straight from IndexedDB: chapter
 * HTML and named revisions are re-attached and every stored image becomes an
 * inline data URL so the file restores anywhere.
 */
export async function exportSnapshot(): Promise<SnapshotFile> {
  const db = await openDatabase()
  try {
    const tx = db.transaction([STATE_STORE, CHAPTER_STORE, NAMED_REVISION_STORE], 'readonly')
    const state = (await requestResult(
      tx.objectStore(STATE_STORE).get(STATE_KEY),
    )) as LibraryState | undefined
    const chapters = (await requestResult(
      tx.objectStore(CHAPTER_STORE).getAll(),
    )) as ChapterContentRecord[]
    const revisions = (await requestResult(
      tx.objectStore(NAMED_REVISION_STORE).getAll(),
    )) as Array<DocumentRevision & { bookId: string }>
    await transactionDone(tx)

    const contentByKey = new Map(chapters.map((record) => [record.key, record.content]))
    const revisionsByBook = new Map<string, DocumentRevision[]>()
    for (const revision of revisions) {
      const list = revisionsByBook.get(revision.bookId) || []
      list.push({
        id: revision.id,
        name: revision.name,
        createdAt: revision.createdAt,
        chapters: revision.chapters,
      })
      revisionsByBook.set(revision.bookId, list)
    }

    const books: SnapshotBook[] = (state?.books || []).map((book) => ({
      ...book,
      chapters: book.chapters.map((chapter) => ({
        ...chapter,
        content: contentByKey.get(chapterKey(book.id, chapter.id)) ?? chapter.content ?? '',
      })),
      revisions: revisionsByBook.get(book.id) || [],
    }))

    const raw = JSON.stringify({
      version: 3 as const,
      books,
      themes: (state?.themes || []).filter((theme) => !theme.preset),
      exportedAt: new Date().toISOString(),
    })
    const inlined = await inlineImagesAsDataUrls(raw, (id) => getImageBlob(id))
    return JSON.parse(inlined) as SnapshotFile
  } finally {
    db.close()
  }
}

/**
 * Splits a self-contained snapshot/imported book into stored rows and returns
 * the hydrated metadata book ready for React state. Chapter HTML stays with
 * the returned book (the caller keeps it hydrated); revisions and images are
 * persisted immediately.
 */
export async function adoptFullBook(source: SnapshotBook): Promise<BookProject> {
  try {
    await ensureQuotaHeadroom()
    const db = await openDatabase()
    try {
      const imageRows: StoredImageRecord[] = []
      const cleanBook = dehydrateValue(
        { ...source, revisions: [] },
        source.id,
        imageRows,
      ) as BookProject
      const fullRevisions = (source.revisions || []).filter((revision) => Array.isArray(revision.chapters))
      const revisionRecords = fullRevisions.map((revision) => ({
        ...dehydrateValue(revision, source.id, imageRows),
        bookId: source.id,
      }))

      const tx = db.transaction([CHAPTER_STORE, NAMED_REVISION_STORE, IMAGE_STORE], 'readwrite')
      // If a book with this id already exists locally, drop chapter rows the
      // incoming book no longer has so they cannot linger as stale content.
      const liveKeys = new Set(source.chapters.map((chapter) => chapterKey(source.id, chapter.id)))
      const chapterStore = tx.objectStore(CHAPTER_STORE)
      const existingKeys = (await requestResult(
        chapterStore.index('bookId').getAllKeys(source.id),
      )) as string[]
      for (const key of existingKeys) {
        if (!liveKeys.has(key)) chapterStore.delete(key)
      }
      for (const record of revisionRecords) tx.objectStore(NAMED_REVISION_STORE).put(record)
      for (const row of imageRows) tx.objectStore(IMAGE_STORE).put(row)
      await transactionDone(tx)

      const hydrated = await hydrateValueImages(db, cleanBook)
      return {
        ...hydrated,
        revisions: fullRevisions.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
      }
    } finally {
      db.close()
    }
  } catch (error) {
    friendlyQuotaError(error)
  }
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
  const next = { ...book, schemaVersion: 5, updatedAt: new Date().toISOString() }
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
