import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)

// Ghostscript PDFSETTINGS por nivel (entornos con gs instalado)
const GS_SETTINGS = {
  low: '/printer',    // 300 dpi — compresión suave
  medium: '/ebook',   // 150 dpi — compresión moderada
  high: '/screen',    // 72 dpi — máxima compresión
}

// Calidad JPEG para el fallback Node.js puro
const JPEG_QUALITY = {
  low: 82,
  medium: 60,
  high: 35,
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

// Recomprime imágenes JPEG embebidas usando sharp
async function recompressJpegImages(doc, quality) {
  const context = doc.context

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue

    try {
      const subtype = obj.dict.get(PDFName.of('Subtype'))
      const filter = obj.dict.get(PDFName.of('Filter'))

      const isImage =
        subtype instanceof PDFName && subtype.asString().includes('Image')
      const isJpeg =
        filter instanceof PDFName && filter.asString().includes('DCT')

      if (!isImage || !isJpeg) continue

      const jpegBytes = Buffer.from(obj.contents)
      const recompressed = await sharp(jpegBytes).jpeg({ quality }).toBuffer()

      if (recompressed.length >= jpegBytes.length) continue

      const newDict = obj.dict.clone(context)
      newDict.set(PDFName.of('Length'), PDFNumber.of(recompressed.length))
      const newStream = PDFRawStream.of(newDict, new Uint8Array(recompressed))
      context.assign(ref, newStream)
    } catch {
      // Ignorar imágenes que sharp no puede procesar
    }
  }
}

async function compressWithNodeJs(filePath, level) {
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

  if (level === 'medium' || level === 'high') {
    const quality = JPEG_QUALITY[level] ?? JPEG_QUALITY.medium
    await recompressJpegImages(doc, quality)
  }

  return Buffer.from(await doc.save({ useObjectStreams: true }))
}

export async function compressPdf(filePath, level = 'medium') {
  const original = await fs.readFile(filePath)
  const originalSize = original.byteLength

  let compressed
  try {
    compressed = await compressWithGhostscript(filePath, level)
  } catch {
    // gs no disponible (ej. Vercel) — usar Node.js puro
    compressed = await compressWithNodeJs(filePath, level)
  }

  if (compressed.byteLength < originalSize) {
    await fs.writeFile(filePath, compressed)
    return { newSize: compressed.byteLength, originalSize }
  }

  return { newSize: originalSize, originalSize }
}
