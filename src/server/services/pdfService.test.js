import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  loadPdf,
  savePdf,
  buildPageList,
  reorderPages,
  deletePages,
  mergePdfs,
  extractPages,
} from './pdfService.js'

async function makePdfBytes(pageCount = 1) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([600, 800])
  return doc.save()
}

let tmpDir
let path1 // 2 páginas
let path2 // 1 página

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfpro-svc-'))
  path1 = path.join(tmpDir, 'a.pdf')
  path2 = path.join(tmpDir, 'b.pdf')
  await fs.writeFile(path1, await makePdfBytes(2))
  await fs.writeFile(path2, await makePdfBytes(1))
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('pdfService', () => {
  test('loadPdf carga un PDF y devuelve el documento', async () => {
    const doc = await loadPdf(path1)
    expect(doc.getPageCount()).toBe(2)
  })

  test('loadPdf lanza error si el archivo no existe', async () => {
    await expect(loadPdf('/no/existe.pdf')).rejects.toThrow()
  })

  test('savePdf escribe el PDF en disco y se puede releer', async () => {
    const doc = await loadPdf(path1)
    const out = path.join(tmpDir, 'saved.pdf')
    await savePdf(doc, out)
    const reloaded = await loadPdf(out)
    expect(reloaded.getPageCount()).toBe(2)
  })

  test('buildPageList genera un elemento por página con estructura correcta', async () => {
    const doc = await loadPdf(path1)
    const pages = buildPageList(doc)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatchObject({ id: 0, index: 0, title: 'Page 1', interactive: false })
    expect(pages[1]).toMatchObject({ id: 1, index: 1, title: 'Page 2', interactive: false })
  })

  test('reorderPages invierte el orden de páginas', async () => {
    const doc = await loadPdf(path1)
    const reordered = await reorderPages(doc, [1, 0])
    expect(reordered.getPageCount()).toBe(2)
  })

  test('reorderPages con un solo índice devuelve documento de una página', async () => {
    const doc = await loadPdf(path1)
    const reordered = await reorderPages(doc, [0])
    expect(reordered.getPageCount()).toBe(1)
  })

  test('deletePages elimina una página por índice', async () => {
    const bytes = await makePdfBytes(2)
    const doc = await PDFDocument.load(bytes)
    const updated = await deletePages(doc, [1])
    expect(updated.getPageCount()).toBe(1)
  })

  test('deletePages elimina múltiples páginas en cualquier orden', async () => {
    const bytes = await makePdfBytes(3)
    const doc = await PDFDocument.load(bytes)
    const updated = await deletePages(doc, [2, 0])
    expect(updated.getPageCount()).toBe(1)
  })

  test('mergePdfs combina dos archivos PDF', async () => {
    const merged = await mergePdfs(path1, path2)
    expect(merged.getPageCount()).toBe(3) // 2 + 1
  })

  test('extractPages extrae páginas concretas', async () => {
    const bytes = await makePdfBytes(3)
    const doc = await PDFDocument.load(bytes)
    const extracted = await extractPages(doc, [0, 2])
    expect(extracted.getPageCount()).toBe(2)
  })

  test('extractPages con un índice devuelve documento de una página', async () => {
    const bytes = await makePdfBytes(3)
    const doc = await PDFDocument.load(bytes)
    const extracted = await extractPages(doc, [1])
    expect(extracted.getPageCount()).toBe(1)
  })
})
