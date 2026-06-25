import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'

export async function compressPdf(filePath) {
  const bytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const compressed = await doc.save({ useObjectStreams: true })
  await fs.writeFile(filePath, compressed)
  return compressed.byteLength
}
