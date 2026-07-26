import { v4 as uuid } from 'uuid'
import type { BookProject, Chapter, PageType } from './types.ts'
import { defaultChapterOptions, defaultEditorPrefs, defaultGoals, defaultStoryBible } from './types.ts'

const littleDogHtml = `<p>When Pip first came home, he was barely bigger than a teacup—all ears and curiosity. The Boston Terrier has a way of filling a room without taking up much space at all. He learned the soft places first: the corner of the couch, the patch of sun by the kitchen window, the exact spot on the rug where afternoon light pooled like warm honey.</p>
<hr>
<p>Neighbors would stop on their walks just to watch him trot past on his short, determined legs. He did not know he was small. He believed, with absolute certainty, that every sidewalk belonged to him, and that every stranger was a friend he had simply not met yet.</p>
<p>In the evenings, after dinner, he would settle against my ankle and sigh—the deep, contented sigh of a dog who has decided that this, right here, is the whole world. Little dog. Big heart. That was Pip from the beginning.</p>`

const sitDownHtml = `<p>Training a Boston Terrier is less about commands and more about negotiation. Pip understood "sit" on the first afternoon—he simply preferred to interpret it as a suggestion rather than a rule.</p>
<p>We practiced in the living room with treats hidden in my pocket. He would tilt his head, weigh the request, then lower himself with the dignity of a gentleman taking a seat at the opera. Sit down. Stay. Good boy. The words became a rhythm between us.</p>
<p>Eventually he learned that sitting was not surrender. It was the pause before adventure—the breath before the leash clicked, before the door opened, before the world rushed in again.</p>`

const goodBoyHtml = `<p>There are dogs you train, and then there are dogs who train you. Pip belonged firmly in the second category. He taught me patience on rainy mornings, joy on ordinary Tuesdays, and the particular peace that comes from a warm weight pressed against your side while you read.</p>
<p>Good boy, Pip. I said it so often it became punctuation. After walks. After baths he endured with tragic eyes. After he stole a sock and returned it as if it were a gift of great importance.</p>
<p>If you are lucky, you will know a dog like this—one who makes the house feel finished the moment he walks through the door. This book is for him, and for every little dog who remade a life simply by arriving.</p>`

export function makePage(
  type: PageType,
  title: string,
  content = '<p></p>',
  extras: Partial<Chapter> = {},
): Chapter {
  return {
    id: uuid(),
    title,
    subtitle: '',
    type,
    content,
    options: defaultChapterOptions(),
    ...extras,
  }
}

export function createEmptyBook(title = 'Untitled Book'): BookProject {
  const now = new Date().toISOString()
  const chapters = [
    makePage('title-page', 'Title Page'),
    makePage(
      'copyright',
      'Copyright',
      '<p>Copyright © 2026. All rights reserved. No part of this publication may be reproduced without written permission.</p>',
    ),
    makePage('contents', 'Contents'),
    makePage('chapter', 'Chapter 1', '<p></p>'),
  ]
  return {
    id: uuid(),
    details: {
      title,
      author: '',
      subtitle: '',
      publisher: '',
      year: String(new Date().getFullYear()),
      isbn: '',
      language: 'en',
    },
    chapters,
    activeId: chapters[3].id,
    themeId: 'theme-classic',
    customThemes: [],
    goals: defaultGoals(),
    editorPrefs: defaultEditorPrefs(),
    storyBible: defaultStoryBible(),
    stickyNotes: [],
    manuscriptFolders: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createSampleBook(): BookProject {
  const now = new Date().toISOString()
  const chapters = [
    makePage('title-page', 'Title Page'),
    makePage(
      'copyright',
      'Copyright',
      '<p>Copyright © 2024. All rights reserved. No part of this publication may be reproduced without written permission.</p>',
    ),
    makePage('dedication', 'Dedication', '<p>For Pip, who remade a home.</p>'),
    makePage('contents', 'Contents'),
    makePage('chapter', 'Little Dog', littleDogHtml),
    makePage('chapter', 'Sit Down', sitDownHtml),
    makePage('chapter', 'Good Boy, Pip', goodBoyHtml),
    makePage(
      'about-author',
      'About the Author',
      '<p>Jordan writes about the small dogs who take up the most room in our lives.</p>',
    ),
  ]
  return {
    id: uuid(),
    details: {
      title: 'The Little Dog',
      author: 'Jordan',
      subtitle: 'A Love Story in Three Chapters',
      publisher: '',
      year: '2024',
      isbn: '',
      language: 'en',
    },
    chapters,
    activeId: chapters[4].id,
    themeId: 'theme-boston',
    customThemes: [],
    goals: { ...defaultGoals(), bookWordTarget: 3000, dailyHabitWords: 300 },
    editorPrefs: defaultEditorPrefs(),
    storyBible: defaultStoryBible(),
    stickyNotes: [],
    manuscriptFolders: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createChapter(title = 'Untitled Chapter'): Chapter {
  return makePage('chapter', title)
}

export function createPart(title = 'Part'): Chapter {
  return makePage('part', title, '<p></p>')
}

export function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return 0
  return text.split(' ').filter(Boolean).length
}

export function countBookWords(project: BookProject): number {
  return project.chapters
    .filter((c) => c.type === 'chapter')
    // Closed books keep only metadata in memory; their chapter HTML stays in
    // IndexedDB, so fall back to the word count captured at last save.
    .reduce((sum, c) => sum + (c.content ? countWords(c.content) : c.wordCount ?? 0), 0)
}

export function todayKey(): string {
  return localDateKey(new Date())
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const FRONT_MATTER_TYPES: PageType[] = [
  'title-page',
  'copyright',
  'dedication',
  'epigraph',
  'contents',
  'also-by',
  'foreword',
  'preface',
  'prologue',
]

export const BACK_MATTER_TYPES: PageType[] = [
  'epilogue',
  'afterword',
  'acknowledgements',
  'about-author',
  'also-by-back',
  'notes',
  'bibliography',
]

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  'title-page': 'Title Page',
  copyright: 'Copyright',
  dedication: 'Dedication',
  epigraph: 'Epigraph',
  contents: 'Contents',
  'also-by': 'Also By',
  foreword: 'Foreword',
  preface: 'Preface',
  prologue: 'Prologue',
  chapter: 'Chapter',
  part: 'Part',
  epilogue: 'Epilogue',
  afterword: 'Afterword',
  acknowledgements: 'Acknowledgements',
  'about-author': 'About the Author',
  'also-by-back': 'Also By',
  notes: 'Notes',
  bibliography: 'Bibliography',
  'full-page-image': 'Full Page Image',
  'custom-page': 'Custom Page',
}
