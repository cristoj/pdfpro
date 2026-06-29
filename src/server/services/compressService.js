import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)
const inflate = promisify(zlib.inflate)
const inflateRaw = promisify(zlib.inflateRaw)

const GS_SETTINGS = { low: '/printer', medium: '/ebook', high: '/screen' }
const JPEG_QUALITY = { low: 82, medium: 60, high: 35 }
const COLORSPACE_CHANNELS = {
  '/DeviceGray': 1, 'DeviceGray': 1,
  '/DeviceRGB': 3,  'DeviceRGB': 3,
  '/DeviceCMYK': 4, 'DeviceCMYK': 4,
}

async function compressWithGhostscript(inputPath, level) {
  const setting = GS_SETTINGS[level] ?? GS_SETTINGS.medium
  const tmpOut = path.join(os.tmpdir(), `pdfpro_compress_${Date.now()}.pdf`)
  await execFileAsync('gs', [
    '-sDEVICE=pdfwrite', `-dPDFSETTINGS=${setting}`,
    '-dNOPAUSE', '-dQUIET', '-dBATCH',
    '-dCompressFonts=true', '-dSubsetFonts=true',
    `-sOutputFile=${tmpOut}`, inputPath,
  ])
  const compressed = await fs.readFile(tmpOut)
  await fs.unlink(tmpOut).catch(() => {})
  return compressed
}

// Reversa del predictor PNG para streams FlateDecode con Predictor 10-15
function reversePngPredictor(filtered, width, channels) {
  const bytesPerRow = width * channels
  const rowStride = 1 + bytesPerRow
  const rows = Math.floor(filtered.length / rowStride)
  const output = Buffer.alloc(rows * bytesPerRow)

  for (let row = 0; row < rows; row++) {
    const type = filtered[row * rowStride]
    const inOff = row * rowStride + 1
    const outOff = row * bytesPerRow
    const prevOff = (row - 1) * bytesPerRow

    for (let i = 0; i < bytesPerRow; i++) {
      const raw = filtered[inOff + i]
      const a = i >= channels ? output[outOff + i - channels] : 0
      const b = row > 0 ? output[prevOff + i] : 0
      const c = row > 0 && i >= channels ? output[prevOff + i - channels] : 0

      let val
      switch (type) {
        case 1: val = raw + a; break
        case 2: val = raw + b; break
        case 3: val = raw + Math.floor((a + b) / 2); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          val = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: val = raw
      }
      output[outOff + i] = val & 0xFF
    }
  }
  return output
}

// Intenta inflar tanto con zlib como con raw deflate
async function tryInflate(data) {
  try { return await inflate(data) } catch { /* fallback */ }
  return inflateRaw(data)
}

async function recompressImages(doc, quality) {
  const context = doc.context

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue

    try {
      const dict = obj.dict
      const subtype = dict.get(PDFName.of('Subtype'))
      const filter = dict.get(PDFName.of('Filter'))

      if (!(subtype instanceof PDFName) || !subtype.asString().includes('Image')) continue
      if (!(filter instanceof PDFName)) continue

      const filterName = filter.asString()

      // ── DCTDecode (JPEG): recomprimir a menor calidad ─────────────────────
      if (filterName.includes('DCT')) {
        const jpegBytes = Buffer.from(obj.contents)
        const recompressed = await sharp(jpegBytes).jpeg({ quality }).toBuffer()
        if (recompressed.length < jpegBytes.length) {
          const newDict = obj.dict.clone(context)
          newDict.set(PDFName.of('Length'), PDFNumber.of(recompressed.length))
          context.assign(ref, PDFRawStream.of(newDict, new Uint8Array(recompressed)))
        }
        continue
      }

      // ── FlateDecode (PNG lossless): convertir a JPEG ──────────────────────
      if (!filterName.includes('FlateDecode')) continue

      const widthN = dict.get(PDFName.of('Width'))?.asNumber?.()
      const heightN = dict.get(PDFName.of('Height'))?.asNumber?.()
      const bpc = dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.()
      const csObj = dict.get(PDFName.of('ColorSpace'))

      if (!widthN || !heightN || bpc !== 8) continue
      if (!(csObj instanceof PDFName)) continue // Saltar ICCBased, Indexed, etc.

      const channels = COLORSPACE_CHANNELS[csObj.asString()]
      if (!channels) continue
      if (widthN * heightN < 10000) continue // ignorar iconos pequeños

      const inflated = await tryInflate(Buffer.from(obj.contents))
      const expectedRaw = widthN * heightN * channels
      const expectedPng = heightN * (1 + widthN * channels)

      let rawPixels
      if (inflated.length === expectedRaw) {
        rawPixels = inflated
      } else if (inflated.length === expectedPng) {
        rawPixels = reversePngPredictor(inflated, widthN, channels)
      } else {
        continue
      }

      const jpegBytes = await sharp(rawPixels, {
        raw: { width: widthN, height: heightN, channels },
      }).jpeg({ quality }).toBuffer()

      // Solo sustituir si JPEG es al menos un 10% más pequeño
      if (jpegBytes.length >= obj.contents.length * 0.9) continue

      const newDict = obj.dict.clone(context)
      newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
      newDict.set(PDFName.of('Length'), PDFNumber.of(jpegBytes.length))
      newDict.delete(PDFName.of('DecodeParms'))
      context.assign(ref, PDFRawStream.of(newDict, new Uint8Array(jpegBytes)))
    } catch {
      // Ignorar imágenes que no se puedan procesar
    }
  }
}

async function compressWithNodeJs(filePath, level) {
  const bytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })

  if (level === 'medium' || level === 'high') {
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject('')
    doc.setKeywords([]); doc.setProducer(''); doc.setCreator('')
  }

  if (level === 'high') {
    doc.catalog.delete(doc.catalog.context.obj('Metadata'))
    for (const page of doc.getPages()) {
      page.node.delete(page.node.context.obj('Thumb'))
    }
  }

  await recompressImages(doc, JPEG_QUALITY[level] ?? JPEG_QUALITY.medium)

  return Buffer.from(await doc.save({ useObjectStreams: true }))
}

export async function compressPdf(filePath, level = 'medium') {
  const original = await fs.readFile(filePath)
  const originalSize = original.byteLength

  let compressed

  // Intentar Ghostscript primero (más eficaz para texto y fuentes)
  try {
    const gsResult = await compressWithGhostscript(filePath, level)
    if (gsResult.byteLength < originalSize) compressed = gsResult
  } catch { /* gs no disponible o falló */ }

  // Si gs no mejoró (o no está disponible), usar Node.js+sharp
  // (mejor para imágenes FlateDecode/JPEG embebidas)
  if (!compressed) {
    try {
      const nodeResult = await compressWithNodeJs(filePath, level)
      if (nodeResult.byteLength < originalSize) compressed = nodeResult
    } catch { /* ignorar errores del fallback */ }
  }

  if (compressed) {
    await fs.writeFile(filePath, compressed)
    return { newSize: compressed.byteLength, originalSize }
  }

  return { newSize: originalSize, originalSize }
}
