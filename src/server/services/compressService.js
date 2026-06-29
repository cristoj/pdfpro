import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

// Ghostscript PDFSETTINGS por nivel de compresión
const GS_SETTINGS = {
  low: '/printer',    // 300 dpi — compresión suave, preserva calidad
  medium: '/ebook',   // 150 dpi — compresión moderada
  high: '/screen',    // 72 dpi — máxima compresión
}

async function compressWithGhostscript(inputPath, level) {
  const setting = GS_SETTINGS[level] ?? GS_SETTINGS.medium
  const tmpOut = path.join(os.tmpdir(), `pdfpro_compress_${Date.now()}.pdf`)

  await execFileAsync('gs', [
    '-sDEVICE=pdfwrite',
    `-dPDFSETTINGS=${setting}`,
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    `-sOutputFile=${tmpOut}`,
    inputPath,
  ])

  const compressed = await fs.readFile(tmpOut)
  await fs.unlink(tmpOut).catch(() => {})
  return compressed
}

async function compressWithPdfLib(filePath, level) {
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
    for (const page of doc.getPages()) {
      const node = page.node
      node.delete(node.context.obj('Thumb'))
    }
  }

  return Buffer.from(await doc.save({ useObjectStreams: true }))
}

export async function compressPdf(filePath, level = 'medium') {
  let compressed

  try {
    compressed = await compressWithGhostscript(filePath, level)
  } catch {
    // gs no disponible o falló — usar pdf-lib como fallback
    compressed = await compressWithPdfLib(filePath, level)
  }

  // Solo sobrescribir si la compresión redujo el tamaño
  const original = await fs.readFile(filePath)
  if (compressed.byteLength < original.byteLength) {
    await fs.writeFile(filePath, compressed)
    return compressed.byteLength
  }

  return original.byteLength
}
