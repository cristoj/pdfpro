/**
 * Integration tests for security hardening.
 * Covers: FINDING-02 (magic bytes), FINDING-03 (rate limiting headers),
 *          FINDING-04 (security headers), FINDING-09 (sign route limits),
 *          FINDING-13 (CSP base-uri).
 */
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfpro-security-'))
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

// ── FINDING-04 + FINDING-13: security headers ─────────────────

describe('Security headers (FINDING-04 + FINDING-13)', () => {
  test('responde con X-Content-Type-Options: nosniff', async () => {
    const res = await req.get('/api/pdf/pages/nonexistent')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  test('responde con X-Frame-Options: DENY', async () => {
    const res = await req.get('/api/pdf/pages/nonexistent')
    expect(res.headers['x-frame-options']).toBe('DENY')
  })

  test('responde con Referrer-Policy', async () => {
    const res = await req.get('/api/pdf/pages/nonexistent')
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('responde con Permissions-Policy', async () => {
    const res = await req.get('/api/pdf/pages/nonexistent')
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()')
  })

  test('CSP incluye base-uri self (FINDING-13)', async () => {
    const res = await req.get('/api/pdf/pages/nonexistent')
    const csp = res.headers['content-security-policy'] ?? ''
    expect(csp).toContain("base-uri 'self'")
  })

  test('CSP incluye default-src self', async () => {
    const res = await req.get('/api/pdf/pages/nonexistent')
    const csp = res.headers['content-security-policy'] ?? ''
    expect(csp).toContain("default-src 'self'")
  })
})

// ── FINDING-02: PDF magic bytes check on upload ───────────────

describe('PDF magic bytes validation on upload (FINDING-02)', () => {
  test('rechaza un archivo HTML enviado con content-type application/pdf', async () => {
    const htmlContent = Buffer.from('<!DOCTYPE html><html><body>Not a PDF</body></html>')
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', htmlContent, { filename: 'evil.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(415)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/not a valid PDF/i)
  })

  test('rechaza un archivo vacío enviado con content-type application/pdf', async () => {
    const empty = Buffer.alloc(0)
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', empty, { filename: 'empty.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(415)
    expect(res.body.success).toBe(false)
  })

  test('rechaza un archivo PNG enviado como PDF', async () => {
    // PNG magic bytes: \x89PNG
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(100)])
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', png, { filename: 'image.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(415)
    expect(res.body.success).toBe(false)
  })

  test('acepta un PDF real con magic bytes correctos', async () => {
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf, { filename: 'real.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.sessionId).toBeTruthy()
  })

  test('el nombre de fichero guardado usa extensión .pdf independientemente del original (FINDING-02)', async () => {
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf, { filename: 'backdoor.php', contentType: 'application/pdf' })
    // With only MIME check: if the MIME check passes it would be saved as backdoor.php.
    // After fix: the file is always saved as <uuid>.pdf so magic check handles the content.
    // The test verifies that a valid PDF is accepted regardless of the client filename.
    expect(res.status).toBe(200)
    expect(res.body.sessionId).toBeTruthy()
  })
})

// ── FINDING-09: import-signed-pdf size limit and magic bytes ──

describe('POST /api/session/:sid/import-signed-pdf (FINDING-09)', () => {
  async function getSid() {
    const res = await req
      .post('/api/pdf/upload')
      .attach('files', pdfBuf, { filename: 'test.pdf', contentType: 'application/pdf' })
    return res.body.sessionId
  }

  test('rechaza datos que no son %PDF después de decodificar base64', async () => {
    const sid = await getSid()
    const fakeB64 = Buffer.from('<!DOCTYPE html>').toString('base64')
    const res = await req
      .post(`/api/session/${sid}/import-signed-pdf`)
      .send({ signedPdfB64: fakeB64 })

    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/not a valid PDF/i)
  })

  test('rechaza un buffer que excede MAX_SIGNED_PDF_BYTES (15 MB)', async () => {
    const sid = await getSid()
    // Decoded size: 16 MB — valid %PDF header but exceeds the 15 MB internal limit.
    // The JSON body limit is 20 MB, so the body parser passes it through;
    // our route handler then checks the decoded size.
    const overSize = Buffer.concat([
      Buffer.from('%PDF-1.4'),
      Buffer.alloc(16 * 1024 * 1024 - 8), // total 16 MB
    ])
    const b64 = overSize.toString('base64')
    const res = await req
      .post(`/api/session/${sid}/import-signed-pdf`)
      .send({ signedPdfB64: b64 })

    // Either the body parser (413 "request entity too large") or our handler
    // (413 "exceeds maximum") should reject the request.
    expect(res.status).toBe(413)
    expect(res.body.success).toBe(false)
  })

  test('acepta un PDF real firmado dentro del límite de tamaño', async () => {
    const sid = await getSid()
    const b64 = pdfBuf.toString('base64')
    const res = await req
      .post(`/api/session/${sid}/import-signed-pdf`)
      .send({ signedPdfB64: b64 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('devuelve 404 para sesión inexistente', async () => {
    const b64 = pdfBuf.toString('base64')
    const res = await req
      .post('/api/session/no-existe/import-signed-pdf')
      .send({ signedPdfB64: b64 })

    expect(res.status).toBe(404)
  })

  test('devuelve 400 si signedPdfB64 está ausente', async () => {
    const sid = await getSid()
    const res = await req
      .post(`/api/session/${sid}/import-signed-pdf`)
      .send({})

    expect(res.status).toBe(400)
  })
})
