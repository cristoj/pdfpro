import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { compressPdf } from './compressService.js'

let tmpDir
let pdfPath

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfpro-compress-'))
  pdfPath = path.join(tmpDir, 'test.pdf')
  const doc = await PDFDocument.create()
  doc.addPage([600, 800])
  await fs.writeFile(pdfPath, await doc.save())
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('compressService', () => {
  test('compressPdf devuelve { newSize, originalSize } con valores positivos', async () => {
    const result = await compressPdf(pdfPath)
    expect(result).toHaveProperty('newSize')
    expect(result).toHaveProperty('originalSize')
    expect(result.newSize).toBeGreaterThan(0)
    expect(result.originalSize).toBeGreaterThan(0)
  })

  test('newSize nunca supera originalSize', async () => {
    const { newSize, originalSize } = await compressPdf(pdfPath)
    expect(newSize).toBeLessThanOrEqual(originalSize)
  })

  test('compressPdf mantiene el archivo legible tras la compresión', async () => {
    await compressPdf(pdfPath)
    const bytes = await fs.readFile(pdfPath)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  test('nivel low devuelve newSize y originalSize positivos', async () => {
    const { newSize, originalSize } = await compressPdf(pdfPath, 'low')
    expect(newSize).toBeGreaterThan(0)
    expect(originalSize).toBeGreaterThan(0)
  })

  test('nivel medium devuelve newSize y originalSize positivos', async () => {
    const { newSize, originalSize } = await compressPdf(pdfPath, 'medium')
    expect(newSize).toBeGreaterThan(0)
    expect(originalSize).toBeGreaterThan(0)
  })

  test('nivel high devuelve newSize y originalSize positivos', async () => {
    const { newSize, originalSize } = await compressPdf(pdfPath, 'high')
    expect(newSize).toBeGreaterThan(0)
    expect(originalSize).toBeGreaterThan(0)
  })

  test('sin nivel usa medium por defecto sin lanzar error', async () => {
    const result = await compressPdf(pdfPath)
    expect(result.newSize).toBeGreaterThan(0)
  })

  test('nivel desconocido usa medium y no lanza error', async () => {
    const result = await compressPdf(pdfPath, 'ultra')
    expect(result.newSize).toBeGreaterThan(0)
  })
})
