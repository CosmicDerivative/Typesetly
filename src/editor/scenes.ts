const SCENE_BREAK_PATTERN = /<hr\b[^>]*>/gi

export const SCENE_BREAK_HTML = '<hr data-typesetly-node="scene-break">'

/**
 * Scenes are intentionally stored inside chapter HTML instead of as nested
 * records. This preserves editor/export fidelity while still giving the
 * sidebar stable operations over the sections between horizontal rules.
 */
export function splitScenes(html: string): string[] {
  const scenes = (html || '<p></p>').split(SCENE_BREAK_PATTERN)
  return scenes.length ? scenes : ['<p></p>']
}

export function joinScenes(scenes: string[]): string {
  return (scenes.length ? scenes : ['<p></p>'])
    .map((scene) => scene.trim() || '<p></p>')
    .join(SCENE_BREAK_HTML)
}

export function sceneCount(html: string): number {
  return splitScenes(html).length
}

export function normalizedSceneTitles(titles: string[] | undefined, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const title = titles?.[index]?.trim()
    // Generated names follow their position after reordering; custom names do
    // not change when a scene moves.
    return title && !/^Scene \d+$/i.test(title) ? title : `Scene ${index + 1}`
  })
}

export function insertScene(
  html: string,
  afterIndex: number,
  content = '<p></p>',
): { html: string; index: number } {
  const scenes = splitScenes(html)
  const index = Math.max(0, Math.min(scenes.length, afterIndex + 1))
  scenes.splice(index, 0, content)
  return { html: joinScenes(scenes), index }
}

export function duplicateSceneContent(
  html: string,
  sceneIndex: number,
): { html: string; index: number } | null {
  const scenes = splitScenes(html)
  if (sceneIndex < 0 || sceneIndex >= scenes.length) return null
  scenes.splice(sceneIndex + 1, 0, scenes[sceneIndex])
  return { html: joinScenes(scenes), index: sceneIndex + 1 }
}

export function moveSceneContent(
  html: string,
  sceneIndex: number,
  direction: -1 | 1,
): { html: string; index: number } | null {
  const scenes = splitScenes(html)
  const target = sceneIndex + direction
  if (sceneIndex < 0 || sceneIndex >= scenes.length || target < 0 || target >= scenes.length) return null
  ;[scenes[sceneIndex], scenes[target]] = [scenes[target], scenes[sceneIndex]]
  return { html: joinScenes(scenes), index: target }
}

export function removeSceneContent(
  html: string,
  sceneIndex: number,
): { html: string; removedHtml: string } | null {
  const scenes = splitScenes(html)
  if (scenes.length <= 1 || sceneIndex < 0 || sceneIndex >= scenes.length) return null
  const [removedHtml] = scenes.splice(sceneIndex, 1)
  return { html: joinScenes(scenes), removedHtml }
}
