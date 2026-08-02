import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { addInternalPdfLink } from '../src/export/pdfLinks.ts'

test('PDF contents links survive serialization with a valid page destination', async () => {
  const documentValue = await PDFDocument.create()
  const contentsPage = documentValue.addPage([432, 648])
  const chapterPage = documentValue.addPage([432, 648])

  addInternalPdfLink(documentValue, contentsPage, chapterPage, [48, 500, 384, 520])

  const reopened = await PDFDocument.load(await documentValue.save())
  const [reopenedContents, reopenedChapter] = reopened.getPages()
  const annotations = reopenedContents.node.lookup(PDFName.of('Annots'), PDFArray)
  assert.equal(annotations.size(), 1)

  const annotation = reopened.context.lookup(annotations.get(0), PDFDict)
  assert.equal(annotation.get(PDFName.of('Subtype'))?.toString(), '/Link')
  const destination = annotation.lookup(PDFName.of('Dest'), PDFArray)
  assert.equal(destination.get(0).toString(), reopenedChapter.ref.toString())
  assert.equal(destination.get(1).toString(), '/Fit')
})
