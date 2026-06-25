import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import app from '../index.js'
import { _clearAll } from '../services/sessionService.js'

let tmpDir
let pdfBuf

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfpro-tools-routes-'))
  process.env.UPLOAD_DIR = tmpDir

  const doc = await PDFDocument.create()
  doc.addPage([600, 800])
  pdfBuf = Buffer.from(await doc.save())
})

afterAll(async () => {
  delete process.env.UPLOAD_DIR
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  _clearAll()
})

const req = supertest(app)

async function upload() {
  const res = await req
    .post('/api/pdf/upload')
    .attach('files', pdfBuf, { filename: 'test.pdf', contentType: 'application/pdf' })
  return res.body.sessionId
}

describe('POST /api/pdf/compress', () => {
  test('comprime el PDF y devuelve el tamaño en bytes', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/compress').send({ sessionId: sid })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.sizeBytes).toBeGreaterThan(0)
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.post('/api/pdf/compress').send({ sessionId: 'bad' })
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/pdf/search', () => {
  test('devuelve array vacío de resultados (stub client-side)', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/search').send({ sessionId: sid, query: 'hola' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.results).toEqual([])
  })

  test('devuelve array vacío si query está vacía', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/search').send({ sessionId: sid, query: '' })
    expect(res.status).toBe(200)
    expect(res.body.results).toEqual([])
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.post('/api/pdf/search').send({ sessionId: 'bad', query: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('Endpoints stub (501)', () => {
  test('POST /api/pdf/text/add devuelve 501', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/text/add').send({ sessionId: sid })
    expect(res.status).toBe(501)
  })

  test('PUT /api/pdf/text/:id devuelve 501', async () => {
    const res = await req.put('/api/pdf/text/1').send({})
    expect(res.status).toBe(501)
  })

  test('DELETE /api/pdf/text/:id devuelve 501', async () => {
    const res = await req.delete('/api/pdf/text/1')
    expect(res.status).toBe(501)
  })

  test('POST /api/pdf/form/fill devuelve 501', async () => {
    const res = await req.post('/api/pdf/form/fill').send({})
    expect(res.status).toBe(501)
  })
})
