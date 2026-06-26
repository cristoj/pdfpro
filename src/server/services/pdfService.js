import { PDFDocument, StandardFonts, rgb, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib'
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

export async function applyShapes(doc, shapes) {
  if (!shapes?.length) return doc
  const pages = doc.getPages()

  for (const shape of shapes) {
    const page = pages[shape.pageIndex]
    if (!page) continue

    const fillColor = hexToRgb(shape.fillColor ?? '#ffffff')
    const borderColor = hexToRgb(shape.strokeColor ?? '#000000')
    const borderWidth = shape.strokeWidth ?? 2
    const opacity = shape.fillTransparent ? 0 : 1

    if (shape.type === 'rect') {
      page.drawRectangle({
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        color: fillColor,
        opacity,
        borderColor,
        borderWidth,
      })
    } else if (shape.type === 'circle') {
      page.drawEllipse({
        x: shape.x + shape.width / 2,
        y: shape.y + shape.height / 2,
        xScale: shape.width / 2,
        yScale: shape.height / 2,
        color: fillColor,
        opacity,
        borderColor,
        borderWidth,
      })
    }
  }

  return doc
}

export async function applyFormValues(doc, formValues) {
  if (!formValues || !Object.keys(formValues).length) return doc

  let form
  try {
    form = doc.getForm()
  } catch {
    return doc
  }

  for (const [name, value] of Object.entries(formValues)) {
    try {
      const field = form.getField(name)
      if (field instanceof PDFTextField) {
        field.setText(String(value))
      } else if (field instanceof PDFCheckBox) {
        if (value === 'Yes' || value === true || value === 'true') field.check()
        else field.uncheck()
      } else if (field instanceof PDFDropdown) {
        field.select(String(value))
      } else if (field instanceof PDFRadioGroup) {
        field.select(String(value))
      }
    } catch {
      // Campo no encontrado o de solo lectura — ignorar
    }
  }

  return doc
}

export async function applyImages(doc, images) {
  if (!images?.length) return doc
  const pages = doc.getPages()

  for (const img of images) {
    const page = pages[img.pageIndex]
    if (!page) continue

    try {
      const base64 = img.imageData.includes(',')
        ? img.imageData.split(',')[1]
        : img.imageData
      const bytes = Buffer.from(base64, 'base64')

      let embedded
      if (img.mimeType === 'image/jpeg' || img.mimeType === 'image/jpg') {
        embedded = await doc.embedJpg(bytes)
      } else {
        embedded = await doc.embedPng(bytes)
      }

      page.drawImage(embedded, {
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
      })
    } catch {
      // Imagen inválida — ignorar
    }
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
