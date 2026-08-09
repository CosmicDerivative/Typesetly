export function previewLineSpacing(value: number) {
  return Number.isFinite(value) ? Math.min(3, Math.max(0.8, value)) : 1.4
}

export function previewReaderFontSize(
  bodySizePt: number,
  readerScale: number,
  useBookDesign: boolean,
) {
  const bodySize = Number.isFinite(bodySizePt) ? Math.min(72, Math.max(6, bodySizePt)) : 11
  const scale = Number.isFinite(readerScale) ? Math.min(2, Math.max(0.5, readerScale)) : 1
  return useBookDesign
    ? `${bodySize * scale}pt`
    : `${16 * scale}px`
}
