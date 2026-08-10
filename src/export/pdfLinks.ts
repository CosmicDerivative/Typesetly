import { PDFArray, PDFDocument, PDFName, type PDFPage } from 'pdf-lib'

export function addInternalPdfLink(
  documentValue: PDFDocument,
  sourcePage: PDFPage,
  destinationPage: PDFPage,
  rect: [number, number, number, number],
) {
  const link = documentValue.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: rect,
    Border: [0, 0, 0],
    Dest: [destinationPage.ref, 'Fit'],
  })
  const linkRef = documentValue.context.register(link)
  let annotations = sourcePage.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (!annotations) {
    annotations = documentValue.context.obj([]) as PDFArray
    sourcePage.node.set(PDFName.of('Annots'), annotations)
  }
  annotations.push(linkRef)
}
