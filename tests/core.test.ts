import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { buildCalloutNode, replaceCalloutRange } from '../src/editor/callouts.ts'
import { countWords } from '../src/data.ts'
import { plainTextFromHtml, wordDiff } from '../src/editor/diff.ts'
import { Callout, LitRpgBlock } from '../src/editor/extensions.ts'
import {
  buildLitRpgBlockNode,
  cloneLitRpgDraft,
  litRpgDraftFromAttrs,
  litRpgDraftFromStored,
  litRpgElementKey,
  litRpgPreset,
  moveLitRpgColumn,
  moveLitRpgRow,
  normalizeLitRpgDraft,
  resizeLitRpgColumn,
  colorWithOpacity,
  replaceLitRpgBlockRange,
} from '../src/editor/litrpg.ts'
import {
  litRpgColumnWidthFractions,
  litRpgFreeformBands,
  litRpgFreeformFields,
  litRpgIsTranslucent,
  litRpgManuscriptLines,
  litRpgOpaqueWordFill,
  litRpgTitleDisplay,
  litRpgUsesBoxedFields,
  litRpgWordColor,
} from '../src/export/litrpgExport.ts'
import {
  EXTERNAL_PROOFREADING_CHARACTER_LIMIT,
  collectFindMatches,
  createFindHighlightPlugin,
  DEFAULT_FIND_SCOPE,
  FIND_RESULTS_PAGE_SIZE,
  externalProofreadingEnabled,
  externalProofreadingEnabledForPage,
  findHighlightKey,
  findInChapterHtml,
  findResultsPageSlice,
  findTextOccurrences,
  plainTextCharacterCount,
  snippetAroundMatch,
} from '../src/editor/find.ts'
import {
  defaultChapterOptions,
  defaultEditorPrefs,
  defaultGoals,
  defaultStoryBible,
} from '../src/types.ts'

test('word diff identifies inserted and deleted manuscript text', () => {
  const diff = wordDiff('<p>The old ending.</p>', '<p>The stronger ending.</p>')
  assert.equal(diff.find((part) => part.type === 'deleted')?.text, 'old')
  assert.equal(diff.find((part) => part.type === 'inserted')?.text, 'stronger')
})

test('HTML is reduced to readable text for comparisons', () => {
  assert.equal(plainTextFromHtml('<p>A &amp; B</p><p>Next</p>'), 'A & B Next')
})

test('word counting preserves words split by inline formatting marks', () => {
  assert.equal(
    countWords('<p>One cro<strong>ss-page</strong> word.</p><p>Next line.</p>'),
    5,
  )
})

test('new project defaults include migration-safe advanced settings', () => {
  assert.equal(defaultChapterOptions().includeIn, 'all')
  assert.equal(defaultEditorPrefs().spellcheck, true)
  // Browser grammar extensions are allowed on the active chapter by default.
  assert.equal(defaultEditorPrefs().externalProofreading, 'auto')
  assert.equal(defaultEditorPrefs().recoveryIntervalMinutes, 5)
  assert.deepEqual(defaultGoals().habitWritingDays, [1, 2, 3, 4, 5])
  assert.deepEqual(defaultGoals().wordLog, {})
  assert.deepEqual(defaultStoryBible(), { characters: [], world: [], relationships: [] })
})

test('find supports case-insensitive navigation counts without overlapping matches', () => {
  assert.deepEqual(findTextOccurrences('One one ONE', 'one'), [
    { index: 0, length: 3 },
    { index: 4, length: 3 },
    { index: 8, length: 3 },
  ])
  assert.equal(findTextOccurrences('banana', 'ana').length, 1)
  assert.equal(findInChapterHtml('<p>First</p><p>second first</p>', 'FIRST').length, 2)
})

test('find defaults to the current document scope', () => {
  assert.equal(DEFAULT_FIND_SCOPE, 'chapter')
})

test('find results list paginates without needing a scrollbar', () => {
  assert.equal(FIND_RESULTS_PAGE_SIZE, 8)
  assert.deepEqual(findResultsPageSlice(168, 0), {
    page: 0,
    pageCount: 21,
    start: 0,
    end: 8,
  })
  assert.deepEqual(findResultsPageSlice(168, 20), {
    page: 20,
    pageCount: 21,
    start: 160,
    end: 168,
  })
  assert.deepEqual(findResultsPageSlice(168, 99), {
    page: 20,
    pageCount: 21,
    start: 160,
    end: 168,
  })
  assert.deepEqual(findResultsPageSlice(0, 0), {
    page: 0,
    pageCount: 1,
    start: 0,
    end: 0,
  })
})

test('find match snippets include chapter context and local occurrence indexes', () => {
  const matches = collectFindMatches(
    [
      { id: 'a', title: 'Prologue', content: '<p>The quick fox jumps.</p>' },
      { id: 'b', title: 'Chapter 1', content: '<p>Another fox appears near the fox den.</p>' },
    ],
    'fox',
  )
  assert.equal(matches.length, 3)
  assert.equal(matches[0].chapterTitle, 'Prologue')
  assert.equal(matches[0].occurrenceInChapter, 0)
  assert.equal(matches[0].globalIndex, 0)
  assert.match(matches[0].snippet, /fox/i)
  assert.equal(
    matches[0].snippet.slice(matches[0].highlightStart, matches[0].highlightStart + matches[0].highlightLength).toLowerCase(),
    'fox',
  )
  assert.equal(matches[1].chapterId, 'b')
  assert.equal(matches[1].occurrenceInChapter, 0)
  assert.equal(matches[2].occurrenceInChapter, 1)
  assert.deepEqual(snippetAroundMatch('abcdefghij', 3, 2, 2), {
    snippet: '…bcdefg…',
    highlightStart: 3,
    highlightLength: 2,
  })
})

test('find highlight plugin paints a match without requiring editor focus', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit],
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Alpha beta gamma beta' }],
      }],
    },
  })
  const state = EditorState.create({
    schema: editor.schema,
    doc: editor.state.doc,
    plugins: [createFindHighlightPlugin()],
  })
  const ranges: Array<{ from: number; to: number }> = []
  state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return
    for (const match of findTextOccurrences(node.text, 'beta', false)) {
      ranges.push({ from: position + match.index, to: position + match.index + match.length })
    }
  })
  assert.equal(ranges.length, 2)
  const range = ranges[1]
  const highlighted = state.apply(
    state.tr
      .setSelection(TextSelection.create(state.doc, range.from, range.to))
      .setMeta(findHighlightKey, { matches: ranges, activeIndex: 1 }),
  )
  const decorations = findHighlightKey.getState(highlighted)
  assert.ok(decorations)
  assert.equal(decorations.find().length, 2)
  const classes = decorations.find().map((decoration) => decoration.type.attrs.class)
  assert.equal(classes.filter((value) => value === 'find-match').length, 1)
  assert.equal(classes.filter((value) => value === 'find-match-highlight').length, 1)
  const cleared = highlighted.apply(highlighted.tr.setMeta(findHighlightKey, null))
  assert.equal(findHighlightKey.getState(cleared)?.find().length ?? 0, 0)
  editor.destroy()
})

test('automatic external proofreading protects oversized editor fields while preserving overrides', () => {
  assert.equal(externalProofreadingEnabled('auto', EXTERNAL_PROOFREADING_CHARACTER_LIMIT), true)
  assert.equal(externalProofreadingEnabled('auto', EXTERNAL_PROOFREADING_CHARACTER_LIMIT + 1), false)
  assert.equal(externalProofreadingEnabled('always', 1_000_000), true)
  assert.equal(externalProofreadingEnabled('off', 1), false)
})

test('external proofreading follows the page containing the cursor', () => {
  assert.equal(externalProofreadingEnabledForPage('auto', '<p>Page one</p>', 0, 1), false)
  assert.equal(externalProofreadingEnabledForPage('auto', '<p>Page two</p>', 1, 1), true)
  assert.equal(externalProofreadingEnabledForPage('off', '<p>Page two</p>', 1, 1), false)
})

test('plain text character counts ignore markup for proofreading limits', () => {
  assert.equal(plainTextCharacterCount('<p>Hello &amp; world</p>'), 'Hello & world'.length)
  assert.equal(plainTextCharacterCount('<p></p>'), 0)
})

test('draft page metrics preserve trim aspect and grow sheet stacks', async () => {
  const { draftPageCount, draftPageMetrics, draftStackHeight } = await import('../src/layout/draftPages.ts')
  const metrics = draftPageMetrics({
    trimWidthIn: 6,
    trimHeightIn: 9,
    marginInside: 0.75,
    marginOutside: 0.5,
    marginTop: 0.6,
    marginBottom: 0.6,
    justified: true,
    hyphens: true,
    keepSubheadings: true,
    keepSceneBreaks: true,
    layoutPriority: 'best-of-both',
    largePrint: false,
  })
  assert.equal(metrics.widthPx, 720)
  assert.equal(metrics.heightPx, 1080)
  assert.equal(draftPageCount(1, metrics), 1)
  assert.equal(draftPageCount(metrics.heightPx, metrics), 1)
  assert.equal(draftPageCount(metrics.heightPx + 1, metrics), 2)
  assert.equal(draftStackHeight(2, metrics), metrics.heightPx * 2 + metrics.gapPx)
})

test('chapter pages split on breaks, pack by budget, and rejoin for storage', async () => {
  const {
    joinChapterPages,
    splitChapterIntoPages,
    isEmptyPageHtml,
    splitTopLevelBlocks,
  } = await import('../src/layout/chapterPages.ts')

  const withBreak =
    '<p>One</p><div data-typesetly-node="page-break"></div><p>Two</p>'
  assert.deepEqual(splitChapterIntoPages(withBreak, 10_000), [
    '<p>One</p><div data-typesetly-node="page-break"></div>',
    '<p>Two</p>',
  ])
  assert.equal(joinChapterPages(['<p>One</p>', '<p>Two</p>']), '<p>One</p><p>Two</p>')
  assert.equal(
    joinChapterPages([
      '<p>The paragraph starts on page one </p>',
      '<p data-typesetly-page-continuation="true">and continues on page two.</p>',
    ]),
    '<p>The paragraph starts on page one and continues on page two.</p>',
  )
  assert.equal(
    joinChapterPages([
      '<p>The paragraph starts on page one</p>',
      '<p data-typesetly-page-continuation="true" data-typesetly-page-space="true">and continues on page two.</p>',
    ]),
    '<p>The paragraph starts on page one and continues on page two.</p>',
  )
  assert.equal(isEmptyPageHtml('<p></p>'), true)
  assert.equal(isEmptyPageHtml('<p></p><p></p>'), true)
  assert.equal(isEmptyPageHtml('<hr data-typesetly-node="scene-break">'), false)
  assert.equal(isEmptyPageHtml('<p>Hi</p><p></p>'), false)

  // Trailing blank pages must survive join so Enter-at-end lines are not erased.
  assert.equal(
    joinChapterPages(['<p>Hello</p>', '<p></p>', '<p></p>']),
    '<p>Hello</p><p></p><p></p>',
  )

  const {
    pruneEmptyDraftPages,
    lastContentPageIndex,
    countBlankParagraphs,
    draftOverflowMoveIndex,
  } = await import('../src/layout/chapterPages.ts')

  assert.equal(lastContentPageIndex(['<p>Hi</p>', '<p></p>', '<p></p>']), 0)
  assert.equal(lastContentPageIndex(['<p>A</p>', '<p>B</p>', '<p></p>']), 1)

  // Holes between content are always removed; trailing blanks can be kept.
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p>', '<p>There</p>']),
    ['<p>Hi</p>', '<p>There</p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages([
      '<p>One</p>',
      '<p></p>',
      '<p><br class="ProseMirror-trailingBreak"></p>',
      '<p>Two</p>',
      '<p></p>',
    ]),
    ['<p>One</p>', '<p>Two</p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p>'], { preserveLastEmptyPage: true }),
    ['<p>Hi</p>', '<p></p>'],
  )
  // Preserve keeps every trailing blank end page, not only the final sheet.
  assert.deepEqual(
    pruneEmptyDraftPages(
      ['<p>Hi</p>', '<p></p>', '<p></p><p></p>'],
      { preserveLastEmptyPage: true },
    ),
    ['<p>Hi</p>', '<p></p>', '<p></p><p></p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p>'], { preserveLastEmptyPage: false }),
    ['<p>Hi</p>'],
  )
  // Drop blank last pages outright — never fold empties onto the previous sheet
  // (that created mid-page multi-line gaps after Enter-at-end).
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p><p></p>'], { preserveLastEmptyPage: false }),
    ['<p>Hi</p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages(['<p>Hi</p>', '<p></p><p></p><p></p>'], { preserveLastEmptyPage: false }),
    ['<p>Hi</p>'],
  )
  assert.deepEqual(
    pruneEmptyDraftPages(
      ['<p>Hi</p>', '<p></p>', '<p></p>'],
      { preserveLastEmptyPage: false },
    ),
    ['<p>Hi</p>'],
  )
  assert.equal(countBlankParagraphs('<p></p><p></p>'), 2)
  assert.equal(isEmptyPageHtml('<p><br class="ProseMirror-trailingBreak"></p>'), true)

  // Enter caret in trailing blank → move from the caret blank, not the prior real block.
  assert.equal(draftOverflowMoveIndex([false, false, true], 2), 2)
  assert.equal(draftOverflowMoveIndex([false, true, true], 1), 1)
  // Sparse page padded with many blanks: only the caret’s blank overflows —
  // not the whole padding run (that parked the caret halfway down the next page).
  assert.equal(draftOverflowMoveIndex([false, true, true, true], 3), 3)
  // Caret still in real content → skip trailing empties (LitRPG-safe path).
  assert.equal(draftOverflowMoveIndex([false, false, true], 1), 1)
  assert.equal(draftOverflowMoveIndex([false, true], 0), 0)
  // Tall LitRPG alone on a sheet: move index is the atom (not trailing empties).
  assert.equal(draftOverflowMoveIndex([false], 0), 0)
  assert.equal(draftOverflowMoveIndex([false, true], null), 0)

  // TipTap scene breaks are bare <hr> tags — must not be dropped while paging.
  const withScene = '<p>A</p><hr data-typesetly-node="scene-break"><p>B</p>'
  assert.deepEqual(
    splitTopLevelBlocks(withScene),
    ['<p>A</p>', '<hr data-typesetly-node="scene-break">', '<p>B</p>'],
  )
  const scenePages = splitChapterIntoPages(withScene, 10_000)
  assert.equal(joinChapterPages(scenePages).includes('data-typesetly-node="scene-break"'), true)
  assert.equal(joinChapterPages(scenePages).includes('<p>A</p>'), true)
  assert.equal(joinChapterPages(scenePages).includes('<p>B</p>'), true)

  const manualBreak = '<p>Before forced break.</p><div data-typesetly-node="page-break"></div><p>After forced break.</p>'
  const manualBreakPages = splitChapterIntoPages(manualBreak, 10_000)
  assert.equal(manualBreakPages.length, 2)
  assert.match(manualBreakPages[0]!, /data-typesetly-node="page-break"/)
  assert.equal(joinChapterPages(manualBreakPages), manualBreak)

  const {
    draftBlockPackCost,
    draftOverflowMoveIndexKeepingSceneBreak,
    draftOverflowMoveIndexPreferTrailingAfterLitRpg,
    draftContentExceedsPageClip,
    draftChromeOccupiedHeight,
    draftSafeClipBottom,
    estimateCharsPerPage,
    isSceneBreakBlock,
    isLitRpgBlock,
  } = await import('../src/layout/chapterPages.ts')

  assert.equal(isSceneBreakBlock('<hr data-typesetly-node="scene-break">'), true)
  assert.ok(draftBlockPackCost('<hr data-typesetly-node="scene-break">', 500) >= 72)
  // Late-page scene shifts start a new sheet instead of packing into the clip zone.
  const sceneShiftHtml = `${'<p>Wordy scene one paragraph that spends budget.</p>'.repeat(8)}<hr data-typesetly-node="scene-break"><p>Scene two opens here with more words.</p>`
  const sceneShiftPages = splitChapterIntoPages(sceneShiftHtml, 180)
  assert.ok(sceneShiftPages.length >= 2)
  const breakPageIndex = sceneShiftPages.findIndex((page) => page.includes('scene-break'))
  assert.ok(breakPageIndex >= 0)
  assert.match(sceneShiftPages[breakPageIndex]!, /scene-break/)
  // Keep-with-next: overflowing the first block after a scene break moves the HR too.
  assert.equal(
    draftOverflowMoveIndexKeepingSceneBreak([false, false, false], [false, true, false], 2),
    1,
  )
  assert.equal(
    draftOverflowMoveIndexKeepingSceneBreak([false, false, true], [false, true, false], 2),
    2,
  )
  assert.equal(draftContentExceedsPageClip(100.6, 100, 0.5), true)
  assert.equal(draftContentExceedsPageClip(100.4, 100, 0.5), false)
  assert.equal(draftSafeClipBottom(100), 92)
  assert.equal(draftSafeClipBottom(100, 12), 88)
  assert.equal(draftChromeOccupiedHeight(20, 0, 12), 32)
  assert.equal(estimateCharsPerPage({
    widthPx: 720,
    heightPx: 960,
    marginTopPx: 80,
    marginRightPx: 80,
    marginBottomPx: 80,
    marginLeftPx: 80,
    gapPx: 28,
    scale: 1,
  }, 16, 1.75), 1624)

  // A long mixed manuscript exercises every Draft formatting/insert family.
  // Paging must retain its authored HTML and structural node markers exactly.
  const allEditorToolsHtml = [
    '<h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4><h5>Heading 5</h5><h6>Heading 6</h6>',
    '<p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <code>code</code> <a href="https://example.com">link</a> H<sub>2</sub>O x<sup>2</sup>.</p>',
    '<blockquote><p>Standard quotation</p></blockquote>',
    '<ul><li>Bullet one</li><li>Bullet two</li></ul><ol><li>Number one</li><li>Number two</li></ol>',
    '<hr data-typesetly-node="scene-break">',
    '<div data-typesetly-node="page-break"></div>',
    '<p>Footnote reference <span data-typesetly-node="footnote" data-note-id="n1" data-note-text="Footnote text">1</span>.</p>',
    '<img data-typesetly-node="manuscript-image" src="data:image/png;base64,AA==" alt="Test image">',
    '<blockquote data-typesetly-node="callout" data-variant="callout"><p>Callout content</p></blockquote>',
    '<blockquote data-typesetly-node="callout" data-variant="message" data-direction="incoming"><p>Message content</p></blockquote>',
    '<div data-typesetly-node="verse">Verse line one\nVerse line two</div>',
    '<div data-typesetly-node="hangingIndent">Hanging indent content</div>',
    '<blockquote data-typesetly-node="attributedQuote" data-attribution="Author">Attributed quotation</blockquote>',
    '<div data-typesetly-node="litrpg-block" data-layout-mode="table"><table><tbody><tr><td>Strength</td><td>10</td></tr></tbody></table></div>',
    ...Array.from({ length: 80 }, (_, index) => `<p>Long-form page boundary paragraph ${index + 1} keeps every editor tool surrounded by enough prose to exercise multi-page packing and reload.</p>`),
  ].join('')
  const allEditorToolPages = splitChapterIntoPages(allEditorToolsHtml, 500)
  assert.ok(allEditorToolPages.length >= 10)
  const allEditorToolsRejoined = joinChapterPages(allEditorToolPages)
  assert.equal(allEditorToolsRejoined, allEditorToolsHtml)
  for (const marker of ['scene-break', 'page-break', 'footnote', 'manuscript-image', 'callout', 'verse', 'hangingIndent', 'attributedQuote', 'litrpg-block']) {
    assert.match(allEditorToolsRejoined, new RegExp(`data-typesetly-node="${marker}"`))
  }

  // Structured blocks contain nested div/table markup. They must remain one
  // atomic top-level block when a chapter is reopened and split into pages.
  const nestedLitRpg = '<p>Before</p><div data-typesetly-node="litrpg-block"><div class="litrpg-block-heading"><strong>Status</strong></div><table><tbody><tr><td>Strength</td><td>10</td></tr></tbody></table><div class="litrpg-block-footer">Points: 0</div></div><p>After</p>'
  assert.deepEqual(splitTopLevelBlocks(nestedLitRpg), [
    '<p>Before</p>',
    '<div data-typesetly-node="litrpg-block"><div class="litrpg-block-heading"><strong>Status</strong></div><table><tbody><tr><td>Strength</td><td>10</td></tr></tbody></table><div class="litrpg-block-footer">Points: 0</div></div>',
    '<p>After</p>',
  ])
  assert.equal(isLitRpgBlock(splitTopLevelBlocks(nestedLitRpg)[1]!), true)
  // LitRPG visual cost dominates tiny inner text (restart must not under-pack).
  assert.ok(
    draftBlockPackCost(splitTopLevelBlocks(nestedLitRpg)[1]!, 500)
      > plainLengthForTest(splitTopLevelBlocks(nestedLitRpg)[1]!),
  )
  const nestedPages = splitChapterIntoPages(nestedLitRpg, 20)
  assert.equal(joinChapterPages(nestedPages), nestedLitRpg)

  // Freeform LitRPG markup with nested absolute items must also stay one block
  // across split/join so reload cannot invent a second visual instance.
  const freeformLitRpg = '<p>Lead</p><div data-typesetly-node="litrpg-block" data-layout-mode="freeform" data-canvas-height="400"><div class="litrpg-freeform-canvas" style="height:400px"><div class="litrpg-freeform-item is-title" style="left:4%;top:14px;width:58%;height:34px">Status</div></div></div><p>Tail</p>'
  const freeformBlocks = splitTopLevelBlocks(freeformLitRpg)
  assert.equal(freeformBlocks.length, 3)
  assert.equal((freeformBlocks[1]!.match(/data-typesetly-node="litrpg-block"/g) || []).length, 1)
  assert.ok(draftBlockPackCost(freeformBlocks[1]!, 500) >= Math.floor(500 * 0.5))
  const freeformPages = splitChapterIntoPages(freeformLitRpg, 30)
  const rejoined = joinChapterPages(freeformPages)
  assert.equal((rejoined.match(/data-typesetly-node="litrpg-block"/g) || []).length, 1)
  assert.equal(rejoined, freeformLitRpg)
  assert.equal(isEmptyPageHtml(freeformBlocks[1]!), false)

  // Sandwiched LitRPG (prose before + after) with room: stay on one sheet —
  // do not isolate the status block onto its own empty page.
  const sandwichedLitRpg = [
    '<p>Short lead.</p>',
    '<div data-typesetly-node="litrpg-block" data-layout-mode="freeform" data-canvas-height="200"><div class="litrpg-freeform-canvas" style="height:200px">Status</div></div>',
    '<p>Short tail continues the scene.</p>',
  ].join('')
  const sandwichedPages = splitChapterIntoPages(sandwichedLitRpg, 2_000)
  assert.equal(sandwichedPages.length, 1)
  assert.match(sandwichedPages[0]!, /Short lead/)
  assert.match(sandwichedPages[0]!, /litrpg-block/)
  assert.match(sandwichedPages[0]!, /Short tail/)

  // End-of-run LitRPG after a nearly-full page late-shifts instead of clipping.
  const endLitRpg = `${'<p>Filler paragraph with enough words to spend the page budget slowly.</p>'.repeat(6)}<div data-typesetly-node="litrpg-block" data-layout-mode="freeform" data-canvas-height="360"><div class="litrpg-freeform-canvas" style="height:360px">Solo Status</div></div>`
  const endLitRpgPages = splitChapterIntoPages(endLitRpg, 220)
  assert.ok(endLitRpgPages.length >= 2)
  const litRpgPage = endLitRpgPages.find((page) => page.includes('litrpg-block'))
  assert.ok(litRpgPage)
  assert.match(litRpgPage!, /litrpg-block/)

  // Overflow: sandwiched LitRPG sheds trailing prose first, not the block alone.
  assert.equal(
    draftOverflowMoveIndexPreferTrailingAfterLitRpg(
      [false, false, false],
      [false, true, false],
      1,
    ),
    2,
  )
  // Solo / end LitRPG still moves as the overflowing atom.
  assert.equal(
    draftOverflowMoveIndexPreferTrailingAfterLitRpg([false, false], [false, true], null),
    1,
  )

  const long = Array.from({ length: 40 }, (_, index) => `<p>Block ${index} with enough words to consume budget.</p>`).join('')
  const pages = splitChapterIntoPages(long, 120)
  assert.ok(pages.length > 1)
  assert.equal(joinChapterPages(pages).includes('Block 0'), true)
  assert.equal(joinChapterPages(pages).includes('Block 39'), true)
})

function plainLengthForTest(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .length
}

test('message bubbles build as a stable callout node with normalized content', () => {
  const node = buildCalloutNode({
    variant: 'message',
    background: 'not-a-color',
    border: '#123456',
    sender: '  Jordan  ',
    direction: 'incoming',
    theme: 'ios',
  }, 'First line\nSecond line')

  assert.equal(node.type, 'callout')
  assert.equal(node.attrs.variant, 'message')
  assert.equal(node.attrs.sender, 'Jordan')
  assert.equal(node.attrs.background, '#f2f6fa')
  assert.deepEqual(node.content, [
    { type: 'paragraph', content: [{ type: 'text', text: 'First line' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
  ])
})

test('message dialog transaction inserts a distinct editable block inside a paragraph', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, Callout],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }],
    },
  })
  const node = buildCalloutNode({
    variant: 'message',
    background: '#f2f6fa',
    border: '#9aa7b2',
    sender: 'Jordan',
    direction: 'outgoing',
    theme: 'android',
  }, 'Hello')

  assert.equal(replaceCalloutRange(editor, { from: 4, to: 4 }, node), true)
  assert.equal(editor.getJSON().content?.[0]?.content?.[0]?.text, 'Bef')
  const inserted = editor.getJSON().content?.[1]
  assert.equal(inserted?.type, 'callout')
  assert.equal(inserted?.attrs?.variant, 'message')
  assert.equal(inserted?.content?.[0]?.content?.[0]?.text, 'Hello')
  assert.equal(editor.getJSON().content?.[2]?.content?.[0]?.text, 'ore')
  editor.destroy()
})

test('message dialog transaction replaces an existing callout without nesting it', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, Callout],
    content: {
      type: 'doc',
      content: [
        buildCalloutNode({
          variant: 'callout',
          background: '#f2f6fa',
          border: '#9aa7b2',
          sender: '',
          direction: 'outgoing',
          theme: 'ios',
        }, 'Old text'),
      ],
    },
  })
  const replacement = buildCalloutNode({
    variant: 'message',
    background: '#f2f6fa',
    border: '#9aa7b2',
    sender: 'Jordan',
    direction: 'incoming',
    theme: 'android',
  }, 'Replacement')
  const existingSize = editor.state.doc.firstChild?.nodeSize || 0

  assert.equal(replaceCalloutRange(editor, { from: 0, to: existingSize }, replacement), true)
  assert.equal(editor.getJSON().content?.length, 1)
  assert.equal(editor.getJSON().content?.[0]?.attrs?.variant, 'message')
  assert.equal(editor.getJSON().content?.[0]?.content?.[0]?.content?.[0]?.text, 'Replacement')
  editor.destroy()
})

test('LitRPG presets provide structured tables for each supported block type', () => {
  const statScreen = litRpgPreset('stat-screen')
  const systemMessage = litRpgPreset('system-message')
  const skillSelection = litRpgPreset('skill-selection')
  const itemInfo = litRpgPreset('item-info')

  assert.deepEqual(statScreen.columns, ['Attribute', 'Value'])
  assert.equal(systemMessage.columns.length, 1)
  assert.deepEqual(skillSelection.columns, ['Skill', 'Rank', 'Effect'])
  assert.equal(itemInfo.rows.some((row) => row.cells.includes('Damage')), true)
  assert.equal(itemInfo.subtitle, 'Rare - One-Handed Sword')
  assert.equal(itemInfo.footer, '"It remembers every battle."')
})

test('LitRPG data-attrs restore a structured draft for export helpers', () => {
  const draft = litRpgDraftFromAttrs({
    title: 'Status',
    subtitle: 'Level 12',
    columns: '["Attribute","Value"]',
    columnWidths: '[40,60]',
    rows: '[{"cells":["Strength","10"]},{"cells":[""," "]}]',
    footer: 'Unspent: 2',
    appearance: 'panel',
    showHeaders: 'true',
    stripedRows: 'true',
    widthPercent: '74',
    alignment: 'center',
    accent: '#5eead4',
    background: '#102a2d',
  })

  assert.equal(draft.title, 'Status')
  assert.equal(draft.subtitle, 'Level 12')
  assert.deepEqual(draft.columns, ['Attribute', 'Value'])
  assert.deepEqual(draft.rows[0].cells, ['Strength', '10'])
  assert.equal(draft.footer, 'Unspent: 2')
  assert.equal(litRpgTitleDisplay(draft), 'STATUS')
  assert.equal(litRpgTitleDisplay({ title: 'Quiet', appearance: 'minimal' }), 'Quiet')
  assert.deepEqual(litRpgColumnWidthFractions({ columns: draft.columns, columnWidths: [40, 60] }), [0.4, 0.6])
  assert.deepEqual(litRpgColumnWidthFractions({ columns: ['A', 'B'], columnWidths: [] }), [0.5, 0.5])
  assert.equal(litRpgWordColor('#2dd4bf'), '2DD4BF')
  assert.equal(litRpgWordColor('not-a-color'), '111111')
})

test('LitRPG freeform export helpers keep boxed fields and translucent fills', () => {
  const draft = normalizeLitRpgDraft({
    ...litRpgPreset('stat-screen'),
    layoutMode: 'freeform',
    backgroundOpacity: 55,
    stripedRows: true,
  })
  assert.equal(litRpgUsesBoxedFields(draft), true)
  assert.equal(litRpgUsesBoxedFields({ layoutMode: 'table' }), false)
  assert.equal(litRpgIsTranslucent(draft), true)
  assert.equal(litRpgIsTranslucent({ backgroundOpacity: 100 }), false)

  const fields = litRpgFreeformFields(draft)
  assert.equal(fields.some((field) => field.kind === 'title' && field.text === 'CHARACTER STATUS'), true)
  assert.equal(fields.some((field) => field.kind === 'cell' && field.text === 'Strength'), true)
  assert.equal(fields.every((field) => field.layout.width > 0 && field.layout.height > 0), true)

  assert.equal(litRpgOpaqueWordFill('#102a2d', 100), '102A2D')
  assert.notEqual(litRpgOpaqueWordFill('#102a2d', 55), '102A2D')
  assert.equal(litRpgOpaqueWordFill('#102a2d', 0), 'FFFFFF')
})

test('LitRPG translucent blocks keep authored field text and spatial pairing', () => {
  const translucent = normalizeLitRpgDraft({
    ...litRpgPreset('stat-screen'),
    layoutMode: 'freeform',
    backgroundOpacity: 72,
  })
  const opaque = normalizeLitRpgDraft({
    ...litRpgPreset('stat-screen'),
    layoutMode: 'freeform',
    backgroundOpacity: 100,
  })

  assert.equal(litRpgIsTranslucent(translucent), true)
  assert.equal(litRpgIsTranslucent(opaque), false)

  const lines = litRpgManuscriptLines(translucent)
  assert.equal(lines[0]?.text, 'Character Status')
  assert.equal(lines[1]?.text, 'Level 1 Adventurer')
  assert.equal(lines.some((line) => line.text.includes('Attribute:')), false)
  assert.equal(lines.some((line) => line.text.includes(' • ')), false)
  assert.equal(lines.find((line) => line.kind === 'header')?.text, 'Attribute  Value')
  assert.equal(lines.find((line) => line.kind === 'row')?.text, 'Strength  10')
  assert.equal(lines.at(-1)?.text, 'Unspent attribute points: 0')

  const withoutHeaders = litRpgManuscriptLines(normalizeLitRpgDraft({
    ...litRpgPreset('stat-screen'),
    showColumnHeaders: false,
    backgroundOpacity: 40,
  }))
  assert.equal(withoutHeaders.some((line) => line.kind === 'header'), false)
  assert.equal(withoutHeaders.find((line) => line.kind === 'row')?.text, 'Strength  10')

  const authoredFields = litRpgFreeformFields(translucent, { preserveAuthoredCase: true })
  assert.equal(authoredFields.find((field) => field.kind === 'title')?.text, 'Character Status')
  assert.equal(authoredFields.find((field) => field.kind === 'column')?.text, 'Attribute')

  const strength = authoredFields.find((field) => field.text === 'Strength')
  const ten = authoredFields.find((field) => field.key === litRpgElementKey.cell(0, 1))
  assert.ok(strength && ten)
  assert.equal(strength.layout.y, ten.layout.y)
  assert.ok(strength.layout.x < ten.layout.x)

  const bands = litRpgFreeformBands(authoredFields)
  const strengthBand = bands.find((band) => band.some((field) => field.text === 'Strength'))
  assert.deepEqual(strengthBand?.map((field) => field.text), ['Strength', '10'])
})

test('LitRPG block normalization keeps table cells aligned and rejects unsafe colors', () => {
  const normalized = normalizeLitRpgDraft({
    ...litRpgPreset('stat-screen'),
    columns: ['Name', 'Value', 'Notes'],
    rows: [{ cells: ['Strength', '12'] }],
    accent: 'red; background: black',
  })

  assert.deepEqual(normalized.rows[0].cells, ['Strength', '12', ''])
  assert.equal(normalized.accent, '#5eead4')
  assert.equal(normalized.showCellBorders, true)
})

test('LitRPG showCellBorders defaults on and can be disabled', () => {
  assert.equal(normalizeLitRpgDraft({ title: 'Legacy block' }).showCellBorders, true)
  assert.equal(normalizeLitRpgDraft({ showCellBorders: false }).showCellBorders, false)
  assert.equal(litRpgDraftFromAttrs({ title: 'From attrs' }).showCellBorders, true)
  assert.equal(litRpgDraftFromAttrs({ title: 'Hidden', showCellBorders: 'false' }).showCellBorders, false)
})

test('LitRPG builder transaction inserts one editable structured node', () => {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, LitRpgBlock],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }],
    },
  })
  const node = buildLitRpgBlockNode({
    ...litRpgPreset('item-info'),
    title: 'Starforged Ring',
  })

  assert.equal(replaceLitRpgBlockRange(editor, { from: 0, to: 0 }, node), true)
  const inserted = editor.getJSON().content?.[0]
  assert.equal(inserted?.type, 'litrpgBlock')
  assert.equal(inserted?.attrs?.title, 'Starforged Ring')
  const restored = litRpgDraftFromAttrs(inserted?.attrs || {})
  assert.deepEqual(restored.columns, ['Property', 'Details'])
  assert.equal(restored.rows[0].cells[0], 'Damage')
  editor.destroy()
})

test('LitRPG rows and columns can be repositioned without detaching their values', () => {
  const columns = ['Skill', 'Rank', 'Effect']
  const rows = [
    { cells: ['Power Strike', 'Common', '+25% damage'] },
    { cells: ['Blink', 'Rare', 'Short teleport'] },
  ]
  const movedRows = moveLitRpgRow(rows, 1, -1)
  assert.equal(movedRows[0].cells[0], 'Blink')

  const movedColumns = moveLitRpgColumn(columns, rows, 2, -1)
  assert.deepEqual(movedColumns.columns, ['Skill', 'Effect', 'Rank'])
  assert.deepEqual(movedColumns.rows[0].cells, ['Power Strike', '+25% damage', 'Common'])
})

test('LitRPG geometry, translucency, and column sizing stay valid', () => {
  const itemPreset = litRpgPreset('item-info')
  const normalized = normalizeLitRpgDraft({
    ...itemPreset,
    widthPercent: 12,
    borderRadius: 100,
    borderWidth: -2,
    backgroundOpacity: 64,
    cellPadding: 30,
  })
  assert.equal(normalized.widthPercent, 30)
  assert.equal(normalized.borderRadius, 40)
  assert.equal(normalized.borderWidth, 0)
  assert.equal(normalized.backgroundOpacity, 64)
  assert.equal(normalized.cellPadding, 24)
  assert.equal(colorWithOpacity('#102a2d', 64), 'rgba(16, 42, 45, 0.64)')
  assert.equal(normalized.layoutMode, 'freeform')
  assert.ok(Object.keys(normalized.elementLayouts).length >= 8)
  assert.ok(normalized.canvasHeight >= normalized.elementLayouts.footer.y + normalized.elementLayouts.footer.height)

  const resized = resizeLitRpgColumn([34, 20, 46], 1, 40)
  assert.equal(Math.round(resized.reduce((sum, width) => sum + width, 0)), 100)
  assert.equal(Math.round(resized[1]), 40)
  assert.equal(resized.every((width) => width >= 10), true)
})

test('LitRPG block survives an HTML save and chapter reload round trip', () => {
  const original = new Editor({
    element: null,
    extensions: [StarterKit, LitRpgBlock],
    content: {
      type: 'doc',
      content: [buildLitRpgBlockNode({
        ...litRpgPreset('system-message'),
        title: 'Quest Updated',
        alignment: 'right',
        widthPercent: 61,
        backgroundOpacity: 57,
        borderRadius: 19,
        columnWidths: [100],
        layoutMode: 'freeform',
        canvasHeight: 640,
        elementLayouts: {
          ...litRpgPreset('system-message').elementLayouts,
          title: { x: 43, y: 171, width: 37, height: 52 },
        },
      })],
    },
  })
  const render = LitRpgBlock.config.renderHTML
  const attributes = LitRpgBlock.config.addAttributes
  assert.ok(render)
  assert.ok(attributes)
  const spec = render.call(LitRpgBlock, {
    node: original.state.doc.child(0),
    HTMLAttributes: {},
  } as never) as unknown[]
  const savedAttributes = spec[1] as Record<string, string>
  const element = {
    getAttribute: (name: string) => savedAttributes[name] ?? null,
  } as Element
  const restoredAttrs = Object.fromEntries(
    Object.entries(attributes.call(LitRpgBlock)).map(([name, config]) => [
      name,
      config.parseHTML ? config.parseHTML(element) : config.default,
    ]),
  )
  const draft = litRpgDraftFromAttrs(restoredAttrs)
  assert.equal(draft.title, 'Quest Updated')
  assert.equal(draft.alignment, 'right')
  assert.equal(draft.widthPercent, 61)
  assert.equal(draft.backgroundOpacity, 57)
  assert.equal(draft.borderRadius, 19)
  assert.deepEqual(draft.columnWidths, [100])
  assert.equal(draft.layoutMode, 'freeform')
  assert.equal(draft.canvasHeight, 640)
  assert.deepEqual(draft.elementLayouts.title, { x: 43, y: 171, width: 37, height: 52 })
  original.destroy()
})

test('LitRPG character screen tips deep-clone so past inserts stay frozen', () => {
  const tip = litRpgPreset('stat-screen')
  tip.rows = [{ cells: ['Strength', '10'] }, { cells: ['Agility', '10'] }]
  const chapterOne = cloneLitRpgDraft(tip)
  const chapterOneNode = buildLitRpgBlockNode({
    ...chapterOne,
    sourceScreenId: 'screen-kharem',
    revision: '1',
  })

  // Continuity tip advances for later chapters only.
  tip.rows[0].cells[1] = '18'
  tip.title = 'Character Status - Mid-arc'
  const chapterFive = cloneLitRpgDraft(tip)
  const chapterFiveNode = buildLitRpgBlockNode({
    ...chapterFive,
    sourceScreenId: 'screen-kharem',
    revision: '2',
  })

  const chapterOneDraft = litRpgDraftFromAttrs(chapterOneNode.attrs)
  const chapterFiveDraft = litRpgDraftFromAttrs(chapterFiveNode.attrs)
  assert.equal(chapterOneDraft.rows[0].cells[1], '10')
  assert.equal(chapterOneDraft.title, 'Character Status')
  assert.equal(chapterFiveDraft.rows[0].cells[1], '18')
  assert.equal(chapterFiveDraft.title, 'Character Status - Mid-arc')
  assert.equal(chapterOneNode.attrs.sourceScreenId, 'screen-kharem')
  assert.equal(chapterFiveNode.attrs.revision, '2')
  assert.notEqual(chapterOneNode.attrs.rows, chapterFiveNode.attrs.rows)
})

test('LitRPG user templates round-trip through stored draft helpers', () => {
  const draft = litRpgPreset('item-info')
  draft.title = 'Moonblade'
  draft.footer = 'Bound to Kharem'
  const stored = cloneLitRpgDraft(draft) as unknown as Record<string, unknown>
  stored.title = 'Moonblade'
  const restored = litRpgDraftFromStored(stored)
  assert.equal(restored.title, 'Moonblade')
  assert.equal(restored.footer, 'Bound to Kharem')
  assert.equal(restored.kind, 'item-info')
  restored.title = 'Changed'
  assert.equal(draft.title, 'Moonblade')
})
