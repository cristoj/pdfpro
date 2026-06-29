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

describe('POST /api/pdf/text/add', () => {
  test('añade un bloque de texto y lo devuelve con id', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/text/add').send({
      sessionId: sid, pageIndex: 0, x: 10, y: 20, text: 'Hola', fontSize: 14, fontFamily: 'Helvetica',
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.block.id).toBeTruthy()
    expect(res.body.block.text).toBe('Hola')
  })

  test('devuelve 404 si la sesión no existe', async () => {
    const res = await req.post('/api/pdf/text/add').send({ sessionId: 'bad', text: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/pdf/text/:id', () => {
  test('actualiza el texto de un bloque existente', async () => {
    const sid = await upload()
    const addRes = await req.post('/api/pdf/text/add').send({
      sessionId: sid, pageIndex: 0, x: 0, y: 0, text: 'original',
    })
    const id = addRes.body.block.id
    const res = await req.put(`/api/pdf/text/${id}`).send({ sessionId: sid, text: 'actualizado' })
    expect(res.status).toBe(200)
    expect(res.body.block.text).toBe('actualizado')
  })

  test('devuelve 404 si el bloque no existe', async () => {
    const sid = await upload()
    const res = await req.put('/api/pdf/text/no-existe').send({ sessionId: sid })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/pdf/text/:id', () => {
  test('elimina un bloque de texto existente', async () => {
    const sid = await upload()
    const addRes = await req.post('/api/pdf/text/add').send({
      sessionId: sid, pageIndex: 0, x: 0, y: 0, text: 'borrar',
    })
    const id = addRes.body.block.id
    const res = await req.delete(`/api/pdf/text/${id}`).send({ sessionId: sid })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('POST /api/pdf/form/fill', () => {
  test('guarda valores de formulario en sesión', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/form/fill').send({
      sessionId: sid, formValues: { nombre: 'Juan', edad: '30' },
    })
    expect(res.status).toBe(200)
    expect(res.body.formValues.nombre).toBe('Juan')
  })

  test('devuelve 400 si faltan parámetros', async () => {
    const res = await req.post('/api/pdf/form/fill').send({})
    expect(res.status).toBe(400)
  })
})

// FINDING-08: image cap per session
describe('POST /api/pdf/images/add — límite de imágenes (FINDING-08)', () => {
  test('acepta hasta 50 imágenes por sesión', async () => {
    const sid = await upload()
    // Add 49 images (well below the cap)
    for (let i = 0; i < 49; i++) {
      const res = await req.post('/api/pdf/images/add').send({
        sessionId: sid, pageIndex: 0, x: 0, y: 0, width: 10, height: 10,
        imageData: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png',
      })
      expect(res.status).toBe(200)
    }
  })

  test('rechaza la imagen 51 con 422', async () => {
    const sid = await upload()
    const payload = {
      sessionId: sid, pageIndex: 0, x: 0, y: 0, width: 10, height: 10,
      imageData: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png',
    }
    // Fill to the cap
    for (let i = 0; i < 50; i++) {
      await req.post('/api/pdf/images/add').send(payload)
    }
    // The 51st should be rejected
    const res = await req.post('/api/pdf/images/add').send(payload)
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/Maximum/)
  })
})

// FINDING-10: hex color sanitization
describe('POST /api/pdf/text/add — sanitización de colores (FINDING-10)', () => {
  test('acepta un color hex válido', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/text/add').send({
      sessionId: sid, pageIndex: 0, x: 0, y: 0, text: 'ok', color: '#1a2b3c',
    })
    expect(res.status).toBe(200)
    expect(res.body.block.color).toBe('#1a2b3c')
  })

  test('convierte un color inválido al fallback #000000', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/text/add').send({
      sessionId: sid, pageIndex: 0, x: 0, y: 0, text: 'bad color',
      color: '<script>alert(1)</script>',
    })
    expect(res.status).toBe(200)
    expect(res.body.block.color).toBe('#000000')
  })

  test('convierte un color sin formato hex al fallback #000000', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/text/add').send({
      sessionId: sid, pageIndex: 0, x: 0, y: 0, text: 'bad', color: 'ZZZ',
    })
    expect(res.status).toBe(200)
    expect(res.body.block.color).toBe('#000000')
  })
})

describe('POST /api/pdf/shapes/add — sanitización de colores (FINDING-10)', () => {
  test('acepta colores válidos en forma', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/shapes/add').send({
      sessionId: sid, type: 'rect', pageIndex: 0, x: 0, y: 0, width: 50, height: 50,
      fillColor: '#ff0000', strokeColor: '#0000ff',
    })
    expect(res.status).toBe(200)
    expect(res.body.shape.fillColor).toBe('#ff0000')
    expect(res.body.shape.strokeColor).toBe('#0000ff')
  })

  test('convierte fillColor inválido al fallback #ffffff', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/shapes/add').send({
      sessionId: sid, type: 'rect', pageIndex: 0, x: 0, y: 0, width: 50, height: 50,
      fillColor: 'INVALID', strokeColor: '#000000',
    })
    expect(res.status).toBe(200)
    expect(res.body.shape.fillColor).toBe('#ffffff')
  })
})

describe('POST /api/pdf/compress con nivel', () => {
  test('acepta nivel low', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/compress').send({ sessionId: sid, level: 'low' })
    expect(res.status).toBe(200)
    expect(res.body.sizeBytes).toBeGreaterThan(0)
  })

  test('acepta nivel high', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/compress').send({ sessionId: sid, level: 'high' })
    expect(res.status).toBe(200)
    expect(res.body.sizeBytes).toBeGreaterThan(0)
  })

  test('nivel inválido usa medium sin error', async () => {
    const sid = await upload()
    const res = await req.post('/api/pdf/compress').send({ sessionId: sid, level: 'super' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
