import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import app from '../index.js'
import { _clearAll } from '../services/sessionService.js'

let tmpDir
let pdfBuf // 3 páginas

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfpro-pages-routes-'))
  process.env.UPLOAD_DIR = tmpDir

  const doc = await PDFDocument.create()
  doc.addPage([600, 800])
  doc.addPage([600, 800])
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

describe('GET /api/pdf/pages/:sid', () => {
  test('devuelve la lista de páginas de la sesión', async () => {
    const sid = await upload()
    const res = await req.get(`/api/pdf/pages/${sid}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.pages).toHaveLength(3)
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.get('/api/pdf/pages/no-existe')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/pdf/preview/:sid/:page', () => {
  test('devuelve metadatos de una página válida', async () => {
    const sid = await upload()
    const res = await req.get(`/api/pdf/preview/${sid}/0`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.page).toBe(0)
    expect(res.body.total).toBe(3)
  })

  test('devuelve 404 si el índice de página está fuera de rango', async () => {
    const sid = await upload()
    const res = await req.get(`/api/pdf/preview/${sid}/99`)
    expect(res.status).toBe(404)
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.get('/api/pdf/preview/no-existe/0')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/pdf/reorder', () => {
  test('reordena las páginas y devuelve la nueva lista', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/reorder').send({ sessionId: sid, order: [2, 0, 1] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.pages).toHaveLength(3)
  })

  test('devuelve 422 si el array order tiene índices inválidos', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/reorder').send({ sessionId: sid, order: [0, 99] })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  test('devuelve 422 si order no es un array', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/reorder').send({ sessionId: sid, order: 'invalid' })
    expect(res.status).toBe(422)
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.post('/api/pdf/reorder').send({ sessionId: 'bad', order: [0] })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/pdf/pages', () => {
  test('elimina una página y devuelve la lista actualizada', async () => {
    const sid = await upload()
    const res = await req.delete('/api/pdf/pages').send({ sessionId: sid, pages: [0] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.pages).toHaveLength(2)
  })

  test('devuelve 422 si se intentan eliminar todas las páginas', async () => {
    const sid = await upload()
    const res = await req.delete('/api/pdf/pages').send({ sessionId: sid, pages: [0, 1, 2] })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  test('devuelve 422 si pages está vacío', async () => {
    const sid = await upload()
    const res = await req.delete('/api/pdf/pages').send({ sessionId: sid, pages: [] })
    expect(res.status).toBe(422)
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.delete('/api/pdf/pages').send({ sessionId: 'bad', pages: [0] })
    expect(res.status).toBe(404)
  })
})
