import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'node:fs/promises'

function hexToRgb(hex = '#000000') {
  const h = hex.replace('#', '')
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  )
}

export async function loadPdf(filePath) {
  const bytes = await fs.readFile(filePath)
  return PDFDocument.load(bytes)
}

export async function savePdf(doc, filePath) {
  const bytes = await doc.save()
  await fs.writeFile(filePath, bytes)
}

export function getPageCount(doc) {
  return doc.getPageCount()
}

export async function reorderPages(doc, newOrder) {
  const srcDoc = await PDFDocument.load(await doc.save())
  const newDoc = await PDFDocument.create()
  const copiedPages = await newDoc.copyPages(srcDoc, newOrder)
  for (const page of copiedPages) {
    newDoc.addPage(page)
  }
  return newDoc
}

export async function deletePages(doc, pageIndices) {
  const sortedDesc = [...pageIndices].sort((a, b) => b - a)
  for (const idx of sortedDesc) {
    doc.removePage(idx)
  }
  return doc
}

export async function mergePdfs(basePath, addPath) {
  const [baseBytes, addBytes] = await Promise.all([
    fs.readFile(basePath),
    fs.readFile(addPath),
  ])
  const base = await PDFDocument.load(baseBytes)
  const add = await PDFDocument.load(addBytes)
  const copied = await base.copyPages(add, add.getPageIndices())
  for (const page of copied) {
    base.addPage(page)
  }
  return base
}

export async function extractPages(doc, pageIndices) {
  const newDoc = await PDFDocument.create()
  const copied = await newDoc.copyPages(doc, pageIndices)
  for (const page of copied) {
    newDoc.addPage(page)
  }
  return newDoc
}

const FONT_MAP = {
  Helvetica: {
    normal: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  Courier: {
    normal: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
}

export async function applyTextBlocks(doc, textBlocks) {
  if (!textBlocks?.length) return doc
  const cache = new Map()

  async function font(family, bold, italic) {
    const map = FONT_MAP[family] ?? FONT_MAP.Helvetica
    const key = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'normal'
    const name = map[key]
    if (!cache.has(name)) cache.set(name, await doc.embedFont(name))
    return cache.get(name)
  }

  const pages = doc.getPages()
  for (const block of textBlocks) {
    const page = pages[block.pageIndex]
    if (!page || !block.text?.trim()) continue
    page.drawText(block.text, {
      x: block.x,
      y: block.y,
      size: block.fontSize ?? 14,
      font: await font(block.fontFamily ?? 'Helvetica', block.bold, block.italic),
      color: hexToRgb(block.color),
    })
  }
  return doc
}

export function buildPageList(doc) {
  return Array.from({ length: doc.getPageCount() }, (_, i) => ({
    id: i,
    index: i,
    title: `Page ${i + 1}`,
    interactive: false,
  }))
}
