import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'

// low: solo reempaqueta streams
// medium: elimina metadatos y reempaqueta
// high: elimina metadatos, miniaturas embebidas y reempaqueta
export async function compressPdf(filePath, level = 'medium') {
  const bytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })

  if (level === 'medium' || level === 'high') {
    doc.setTitle('')
    doc.setAuthor('')
    doc.setSubject('')
    doc.setKeywords([])
    doc.setProducer('')
    doc.setCreator('')
  }

  if (level === 'high') {
    const catalog = doc.catalog
    catalog.delete(catalog.context.obj('Metadata'))
    // Eliminar thumbnails de todas las páginas
    const pages = doc.getPages()
    for (const page of pages) {
      const node = page.node
      node.delete(node.context.obj('Thumb'))
    }
  }

  const compressed = await doc.save({ useObjectStreams: true })
  await fs.writeFile(filePath, compressed)
  return compressed.byteLength
}
