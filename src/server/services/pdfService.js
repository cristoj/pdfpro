import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'

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

export function buildPageList(doc) {
  return Array.from({ length: doc.getPageCount() }, (_, i) => ({
    id: i,
    index: i,
    title: `Page ${i + 1}`,
    interactive: false,
  }))
}
