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
  test('compressPdf devuelve el tamaño en bytes como número positivo', async () => {
    const size = await compressPdf(pdfPath)
    expect(typeof size).toBe('number')
    expect(size).toBeGreaterThan(0)
  })

  test('compressPdf mantiene el archivo legible tras la compresión', async () => {
    await compressPdf(pdfPath)
    const bytes = await fs.readFile(pdfPath)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })
})
