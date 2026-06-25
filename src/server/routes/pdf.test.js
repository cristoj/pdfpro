import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import app from '../index.js'
import { _clearAll } from '../services/sessionService.js'

let tmpDir
let pdfBuf1 // 2 páginas
let pdfBuf2 // 1 página

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfpro-pdf-routes-'))
  process.env.UPLOAD_DIR = tmpDir

  const doc1 = await PDFDocument.create()
  doc1.addPage([600, 800])
  doc1.addPage([600, 800])
  pdfBuf1 = Buffer.from(await doc1.save())

  const doc2 = await PDFDocument.create()
  doc2.addPage([600, 800])
  pdfBuf2 = Buffer.from(await doc2.save())
})

afterAll(async () => {
  delete process.env.UPLOAD_DIR
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  _clearAll()
})

const req = supertest(app)

describe('POST /api/pdf/upload', () => {
  test('sube un PDF y devuelve sessionId y lista de páginas', async () => {
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.sessionId).toBeDefined()
    expect(res.body.pages).toHaveLength(2)
  })

  test('devuelve 400 si no se adjunta ningún archivo', async () => {
    const res = await req.post('/api/pdf/upload')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  test('rechaza archivos que no son PDF con 415', async () => {
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', Buffer.from('texto plano'), { filename: 'doc.txt', contentType: 'text/plain' })
    expect(res.status).toBe(415)
    expect(res.body.success).toBe(false)
  })

  test('sube múltiples PDFs y los fusiona en uno', async () => {
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })
      .attach('files', pdfBuf2, { filename: 'b.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(200)
    expect(res.body.pages).toHaveLength(3) // 2 + 1
  })
})

describe('POST /api/pdf/add', () => {
  test('añade un PDF a una sesión existente', async () => {
    const upload = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })
    const { sessionId } = upload.body

    const res = await req
      .post('/api/pdf/add')
      .field('sessionId', sessionId)
      .attach('files', pdfBuf2, { filename: 'b.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.pages).toHaveLength(3) // 2 + 1
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req
      .post('/api/pdf/add')
      .field('sessionId', 'sesion-inexistente')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  test('devuelve 400 si no se adjunta ningún archivo', async () => {
    const upload = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })

    const res = await req
      .post('/api/pdf/add')
      .send({ sessionId: upload.body.sessionId })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/pdf/export', () => {
  test('exporta el PDF completo como binario', async () => {
    const upload = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })
    const { sessionId } = upload.body

    const res = await req.post('/api/pdf/export').send({ sessionId })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.body).toBeTruthy()
  })

  test('exporta un rango de páginas', async () => {
    const upload = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })
    const { sessionId } = upload.body

    const res = await req.post('/api/pdf/export').send({ sessionId, range: '1' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.post('/api/pdf/export').send({ sessionId: 'bad-id' })
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  test('devuelve 422 si el rango está fuera de límites', async () => {
    const upload = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf1, { filename: 'a.pdf', contentType: 'application/pdf' })
    const { sessionId } = upload.body

    const res = await req.post('/api/pdf/export').send({ sessionId, range: '99' })

    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })
})
