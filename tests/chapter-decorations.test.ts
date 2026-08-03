import assert from 'node:assert/strict'
import test from 'node:test'
import { chapterDecorations, chapterOverlayInsets, normalizeChapterDecoration } from '../src/themes/chapterDecorations.ts'
import { PRESET_THEMES } from '../src/themes/presets.ts'

test('chapter decoration layers normalize safely and retain every supported anchor', () => {
  const placements = ['above-heading', 'header-overlay', 'below-heading', 'before-opening', 'chapter-footer'] as const
  const heading = {
    ...PRESET_THEMES[0]!.chapterHeading,
    decorations: placements.map((placement, index) => normalizeChapterDecoration({
      id: `layer-${index}`,
      name: placement,
      imageDataUrl: `data:image/png;base64,${index}`,
      placement,
      width: index === 0 ? 500 : 25,
      offsetX: -500,
      offsetY: 500,
      opacity: 0,
      rotation: 400,
    }, index)),
  }
  const layers = chapterDecorations(heading)
  assert.deepEqual(layers.map((layer) => layer.placement), placements)
  assert.equal(layers[0]!.width, 100)
  assert.equal(layers[0]!.offsetX, -50)
  assert.equal(layers[0]!.offsetY, 240)
  assert.equal(layers[0]!.opacity, 5)
  assert.equal(layers[0]!.rotation, 180)
})

test('chapter decoration layers remain dormant when chapter imagery is disabled', () => {
  const heading = {
    ...PRESET_THEMES[0]!.chapterHeading,
    imageEnabled: false,
    decorations: [normalizeChapterDecoration({ imageDataUrl: 'data:image/png;base64,AA==' })],
  }
  assert.deepEqual(chapterDecorations(heading), [])
})

test('side overlay artwork reserves heading room while centered art stays behind the heading', () => {
  const layers = [
    normalizeChapterDecoration({ imageDataUrl: 'left', placement: 'header-overlay', align: 'left', width: 42 }),
    normalizeChapterDecoration({ imageDataUrl: 'smaller-left', placement: 'header-overlay', align: 'left', width: 20 }),
    normalizeChapterDecoration({ imageDataUrl: 'center', placement: 'header-overlay', align: 'center', width: 80 }),
    normalizeChapterDecoration({ imageDataUrl: 'right', placement: 'header-overlay', align: 'right', width: 24 }),
  ]
  assert.deepEqual(chapterOverlayInsets(layers), { left: 42, right: 24 })
})

test('heading room remains usable when artwork is oversized on both sides', () => {
  const layers = [
    normalizeChapterDecoration({ imageDataUrl: 'left', placement: 'header-overlay', align: 'left', width: 100 }),
    normalizeChapterDecoration({ imageDataUrl: 'right', placement: 'header-overlay', align: 'right', width: 100 }),
  ]
  assert.deepEqual(chapterOverlayInsets(layers), { left: 38, right: 38 })
})

test('custom chapter decoration layers survive a saved-theme JSON round trip', () => {
  const theme = {
    ...PRESET_THEMES[0]!,
    id: 'theme-layered-test',
    name: 'Layered test',
    preset: false,
    chapterHeading: {
      ...PRESET_THEMES[0]!.chapterHeading,
      decorations: [
        normalizeChapterDecoration({
          id: 'frame',
          name: 'Heading frame',
          imageDataUrl: 'typesetly-image://book/theme/frame',
          placement: 'header-overlay',
          align: 'right',
          offsetX: 7,
          offsetY: -16,
        }),
        normalizeChapterDecoration({
          id: 'footer',
          name: 'Chapter footer',
          imageDataUrl: 'typesetly-image://book/theme/footer',
          placement: 'chapter-footer',
          align: 'center',
          width: 62,
        }),
      ],
    },
  }

  const restored = JSON.parse(JSON.stringify(theme)) as typeof theme
  assert.deepEqual(
    chapterDecorations(restored.chapterHeading).map(({ id, name, placement, imageDataUrl }) => ({
      id,
      name,
      placement,
      imageDataUrl,
    })),
    [
      {
        id: 'frame',
        name: 'Heading frame',
        placement: 'header-overlay',
        imageDataUrl: 'typesetly-image://book/theme/frame',
      },
      {
        id: 'footer',
        name: 'Chapter footer',
        placement: 'chapter-footer',
        imageDataUrl: 'typesetly-image://book/theme/footer',
      },
    ],
  )
})
