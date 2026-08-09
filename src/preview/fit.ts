const PUBLISH_STAGE_PADDING = 48

/** Fits a page to the publish desk while preserving its device/trim ratio. */
export function publishPreviewWidth(
  stageWidth: number,
  stageHeight: number,
  pageRatio: number,
) {
  if (![stageWidth, stageHeight, pageRatio].every(Number.isFinite)) return 0
  if (pageRatio <= 0) return 0
  const availableWidth = Math.max(1, stageWidth - PUBLISH_STAGE_PADDING)
  const availableHeight = Math.max(1, stageHeight - PUBLISH_STAGE_PADDING)
  return Math.max(1, Math.floor(Math.min(availableWidth, availableHeight * pageRatio)))
}
