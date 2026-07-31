import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBook } from '../src/data.ts'
import {
  contentHash,
  htmlToPlainText,
  htmlToRtf,
  importScrivenerSources,
  parseScrivenerBinder,
  rtfToHtml,
  scrivenerTitleFromPath,
  syncScrivenerSources,
} from '../src/integrations/scrivener.ts'

test('Scrivener RTF conversion preserves paragraphs and common inline formatting', () => {
  const html = rtfToHtml(String.raw`{\rtf1\ansi First \b bold\b0 line.\par Second \i italic\i0 \u8212? line.}`)
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /<em>italic<\/em>/)
  assert.match(html, /<\/p><p>/)
  assert.match(html, /— line/)
  assert.match(rtfToHtml(String.raw`{\rtf1\ansi\uc0 A \u8212 B}`), /A —B/)
  assert.match(
    rtfToHtml(String.raw`{\rtf1\ansi\uc1 father\u8217\'92s and wasn\u8217\'92t ready}`),
    /father’s and wasn’t ready/,
  )

  const exported = htmlToRtf('<p>Hello <strong>writer</strong>.</p><p>Next scene.</p>')
  assert.match(exported, /^\{\\rtf1/)
  assert.match(exported, /Hello \\b writer\\b0/)
  assert.equal(htmlToPlainText('<p>One</p><hr data-typesetly-node="scene-break"><p>Two</p>'), 'One\n\n***\n\nTwo')
})

test('Scrivener Binder parser retains its nested Draft structure', () => {
  const binder = parseScrivenerBinder(`
    <ScrivenerProject>
      <Binder>
        <BinderItem UUID="DRAFT" Type="DraftFolder">
          <Title>Manuscript</Title>
          <Children>
            <BinderItem UUID="CHAPTER" Type="Folder">
              <Title>Chapter One</Title>
              <Children>
                <BinderItem UUID="SCENE" Type="Text"><Title>Opening</Title></BinderItem>
              </Children>
            </BinderItem>
          </Children>
        </BinderItem>
      </Binder>
    </ScrivenerProject>
  `)
  assert.equal(binder[0].title, 'Manuscript')
  assert.equal(binder[0].children[0].title, 'Chapter One')
  assert.equal(binder[0].children[0].children[0].uuid, 'SCENE')
})

test('native Scrivener import turns chapter folders and Binder documents into scenes', () => {
  const scrivx = `
    <ScrivenerProject>
      <Binder>
        <BinderItem UUID="DRAFT" Type="DraftFolder">
          <Title>Manuscript</Title>
          <Children>
            <BinderItem UUID="CHAPTER" Type="Folder">
              <Title>Chapter One</Title>
              <Children>
                <BinderItem UUID="SCENE1" Type="Text"><Title>Opening</Title></BinderItem>
                <BinderItem UUID="SCENE2" Type="Text"><Title>Aftermath</Title></BinderItem>
              </Children>
            </BinderItem>
          </Children>
        </BinderItem>
      </Binder>
    </ScrivenerProject>
  `
  const report = importScrivenerSources([
    { relativePath: 'Novel.scriv/Novel.scrivx', text: scrivx },
    { relativePath: 'Novel.scriv/Files/Data/SCENE1/content.rtf', text: String.raw`{\rtf1\ansi The opening scene.}` },
    { relativePath: 'Novel.scriv/Files/Data/SCENE2/content.rtf', text: String.raw`{\rtf1\ansi The aftermath.}` },
  ])
  const chapter = report.book.chapters.find((item) => item.type === 'chapter')!
  assert.equal(report.book.details.title, 'Novel')
  assert.equal(chapter.title, 'Chapter One')
  assert.deepEqual(chapter.sceneTitles, ['Opening', 'Aftermath'])
  assert.match(chapter.content, /data-typesetly-node="scene-break"/)
  assert.equal(report.summary?.chapters, 1)
})

test('Scrivener import keeps direct chapters inside Parts and Arcs as chapters', () => {
  const scrivx = `
    <ScrivenerProject>
      <Binder>
        <BinderItem UUID="DRAFT" Type="DraftFolder">
          <Title>Manuscript</Title>
          <Children>
            <BinderItem UUID="ARC" Type="Folder">
              <Title>Arc One</Title>
              <Children>
                <BinderItem UUID="ONE" Type="Text"><Title>First Chapter</Title></BinderItem>
                <BinderItem UUID="TWO" Type="Text"><Title>Second Chapter</Title></BinderItem>
              </Children>
            </BinderItem>
          </Children>
        </BinderItem>
      </Binder>
    </ScrivenerProject>
  `
  const report = importScrivenerSources([
    { relativePath: 'Novel.scriv/Novel.scrivx', text: scrivx },
    { relativePath: 'Novel.scriv/Files/Data/ONE/content.rtf', text: String.raw`{\rtf1\ansi First.}` },
    { relativePath: 'Novel.scriv/Files/Data/TWO/content.rtf', text: String.raw`{\rtf1\ansi Second.}` },
  ])

  const part = report.book.chapters.find((item) => item.type === 'part')!
  const chapters = report.book.chapters.filter((item) => item.partId === part.id)
  assert.equal(part.title, 'Arc One')
  assert.deepEqual(chapters.map((item) => item.title), ['First Chapter', 'Second Chapter'])
  assert.deepEqual(chapters.map((item) => item.sceneTitles), [[], []])
  assert.equal(report.summary?.chapters, 2)
})

test('Scrivener import preserves Book and nested Arc hierarchy without turning chapters into scenes', () => {
  const scrivx = `
    <ScrivenerProject>
      <Binder>
        <BinderItem UUID="DRAFT" Type="DraftFolder">
          <Title>Manuscript</Title>
          <Children>
            <BinderItem UUID="BOOK" Type="Folder">
              <Title>Book 1</Title>
              <Children>
                <BinderItem UUID="ARC" Type="Folder">
                  <Title>Integration Arc</Title>
                  <Children>
                    <BinderItem UUID="PROLOGUE" Type="Text"><Title>Prologue</Title></BinderItem>
                    <BinderItem UUID="TUTORIAL" Type="Text"><Title>System Tutorial</Title></BinderItem>
                    <BinderItem UUID="GOBLINS" Type="Text"><Title>Goblins Galore</Title></BinderItem>
                  </Children>
                </BinderItem>
                <BinderItem UUID="UNTITLED" Type="Text"><Title>Untitled</Title></BinderItem>
              </Children>
            </BinderItem>
          </Children>
        </BinderItem>
      </Binder>
    </ScrivenerProject>
  `
  const report = importScrivenerSources([
    { relativePath: 'Novel.scriv/Novel.scrivx', text: scrivx },
    ...['PROLOGUE', 'TUTORIAL', 'GOBLINS', 'UNTITLED'].map((id) => ({
      relativePath: `Novel.scriv/Files/Data/${id}/content.rtf`,
      text: String.raw`{\rtf1\ansi Chapter text.}`,
    })),
  ])

  const part = report.book.chapters.find((item) => item.type === 'part')!
  const arc = (report.book.manuscriptFolders || [])
    .find((folder) => folder.name === 'Integration Arc')!
  const arcChapters = report.book.chapters.filter((chapter) => chapter.folderId === arc.id)
  assert.equal(part.title, 'Book 1')
  assert.equal(arc.partId, part.id)
  assert.deepEqual(
    arcChapters.map((chapter) => chapter.title),
    ['Prologue', 'System Tutorial', 'Goblins Galore'],
  )
  assert.deepEqual(arcChapters.map((chapter) => chapter.sceneTitles), [[], [], []])
  assert.equal(report.book.chapters.find((chapter) => chapter.title === 'Untitled')?.partId, part.id)
  assert.equal(report.summary?.chapters, 4)
})

test('Scrivener import classifies named opening and closing matter before numbering', () => {
  const scrivx = `
    <ScrivenerProject>
      <Binder>
        <BinderItem UUID="DRAFT" Type="DraftFolder">
          <Title>Manuscript</Title>
          <Children>
            <BinderItem UUID="PROLOGUE" Type="Text"><Title>Prologue</Title></BinderItem>
            <BinderItem UUID="ONE" Type="Text"><Title>The First Door</Title></BinderItem>
            <BinderItem UUID="EPILOGUE" Type="Text"><Title>Epilogue</Title></BinderItem>
          </Children>
        </BinderItem>
      </Binder>
    </ScrivenerProject>
  `
  const report = importScrivenerSources([
    { relativePath: 'Novel.scriv/Novel.scrivx', text: scrivx },
    { relativePath: 'Novel.scriv/Files/Data/PROLOGUE/content.rtf', text: String.raw`{\rtf1\ansi Before.}` },
    { relativePath: 'Novel.scriv/Files/Data/ONE/content.rtf', text: String.raw`{\rtf1\ansi Chapter.}` },
    { relativePath: 'Novel.scriv/Files/Data/EPILOGUE/content.rtf', text: String.raw`{\rtf1\ansi After.}` },
  ])

  assert.equal(report.book.chapters.find((page) => page.title === 'Prologue')?.type, 'prologue')
  assert.equal(report.book.chapters.find((page) => page.title === 'The First Door')?.type, 'chapter')
  assert.equal(report.book.chapters.find((page) => page.title === 'Epilogue')?.type, 'epilogue')
  assert.equal(report.summary?.chapters, 1)
})

test('external sync imports remote edits, exports local edits, and preserves conflicts', () => {
  const project = createEmptyBook('Sync Test')
  const chapter = project.chapters.find((item) => item.type === 'chapter')!
  chapter.content = '<p>Shared baseline</p>'
  const baseline = contentHash(chapter.content)
  project.scrivenerSync = {
    version: 1,
    folderPath: 'C:/Scrivener Sync',
    folderName: 'Scrivener Sync',
    format: 'txt',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    files: [{
      chapterId: chapter.id,
      relativePath: 'Draft/001 Chapter 1.txt',
      lastLocalHash: baseline,
      lastExternalHash: baseline,
    }],
  }

  const remote = syncScrivenerSources(
    project,
    [{ relativePath: 'Draft/001 Chapter 1.txt', text: 'Edited in Scrivener' }],
    project.scrivenerSync,
  )
  assert.equal(remote.updated, 1)
  assert.match(remote.project.chapters.find((item) => item.id === chapter.id)!.content, /Edited in Scrivener/)

  const localProject = structuredClone(project)
  localProject.chapters.find((item) => item.id === chapter.id)!.content = '<p>Edited in Typesetly</p>'
  const local = syncScrivenerSources(
    localProject,
    [{ relativePath: 'Draft/001 Chapter 1.txt', text: 'Shared baseline' }],
    localProject.scrivenerSync!,
  )
  assert.equal(local.exported, 1)
  assert.equal(local.writes[0].relativePath, 'Draft/001 Chapter 1.txt')
  assert.match(local.writes[0].text, /Edited in Typesetly/)

  const conflict = syncScrivenerSources(
    localProject,
    [{ relativePath: 'Draft/001 Chapter 1.txt', text: 'Also edited in Scrivener' }],
    localProject.scrivenerSync!,
  )
  assert.equal(conflict.conflicts, 1)
  assert.ok(conflict.project.chapters.some((item) => item.title.includes('Scrivener conflict')))
})

test('first connection replaces the untouched starter chapter instead of exporting it', () => {
  const project = createEmptyBook('New connection')
  const outcome = syncScrivenerSources(
    project,
    [{ relativePath: 'Draft/001 Opening [42].txt', text: 'Imported from Scrivener' }],
    { folderPath: 'C:/Sync', folderName: 'Sync', format: 'txt' },
  )
  const body = outcome.project.chapters.filter((chapter) => chapter.type === 'chapter')
  assert.equal(outcome.imported, 1)
  assert.equal(outcome.exported, 0)
  assert.deepEqual(body.map((chapter) => chapter.title), ['Opening'])
})

test('Scrivener external filenames normalize tracking IDs and order prefixes', () => {
  assert.equal(scrivenerTitleFromPath('Draft/012 A Difficult Chapter [748].rtf'), 'A Difficult Chapter')
  assert.equal(scrivenerTitleFromPath('Draft/Scene Without Number.md'), 'Scene Without Number')
})
