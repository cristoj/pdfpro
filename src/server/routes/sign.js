import { Router } from 'express'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { getSession, updateSession } from '../services/sessionService.js'
import { loadPdf, extractPages, applyTextBlocks, applyShapes, applyImages, applyFormValues } from '../services/pdfService.js'
import { hasPdfMagicBytes } from '../utils/validation.js'

// FINDING-09: maximum decoded size for an imported signed PDF (15 MB)
const MAX_SIGNED_PDF_BYTES = 15 * 1024 * 1024

const router = Router()

router.get('/:sessionId/export-pdf', async (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    try {
      await fsPromises.access(session.filePath)
    } catch {
      return res.status(404).json({ success: false, error: 'PDF file not found on server' })
    }

    const doc = await loadPdf(session.filePath)
    const indices = doc.getPageIndices()

    if (session.formValues && Object.keys(session.formValues).length) {
      await applyFormValues(doc, session.formValues)
      try { doc.getForm().flatten() } catch { /* sin formulario */ }
    }

    const exportDoc = await extractPages(doc, indices)
    const indexMap = new Map(indices.map((orig, pos) => [orig, pos]))

    if (session.textBlocks?.length) {
      const blocks = session.textBlocks
        .filter(b => indexMap.has(b.pageIndex))
        .map(b => ({ ...b, pageIndex: indexMap.get(b.pageIndex) }))
      await applyTextBlocks(exportDoc, blocks)
    }

    if (session.shapes?.length) {
      const shapes = session.shapes
        .filter(s => indexMap.has(s.pageIndex))
        .map(s => ({ ...s, pageIndex: indexMap.get(s.pageIndex) }))
      await applyShapes(exportDoc, shapes)
    }

    if (session.images?.length) {
      const imgs = session.images
        .filter(img => indexMap.has(img.pageIndex))
        .map(img => ({ ...img, pageIndex: indexMap.get(img.pageIndex) }))
      await applyImages(exportDoc, imgs)
    }

    const bytes = await exportDoc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="documento.pdf"')
    res.send(Buffer.from(bytes))
  } catch (err) {
    next(err)
  }
})

router.post('/:sessionId/import-signed-pdf', async (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const { signedPdfB64 } = req.body
    if (!signedPdfB64 || typeof signedPdfB64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid signedPdfB64 field' })
    }

    let pdfBuffer
    try {
      pdfBuffer = Buffer.from(signedPdfB64, 'base64')
    } catch {
      return res.status(422).json({ success: false, error: 'Invalid Base64 data' })
    }

    // FINDING-09: enforce decoded size limit to prevent disk exhaustion
    if (pdfBuffer.length > MAX_SIGNED_PDF_BYTES) {
      return res.status(413).json({ success: false, error: 'Signed PDF exceeds maximum allowed size (15 MB)' })
    }

    // FINDING-09: verify PDF magic bytes using shared utility (more robust than ascii comparison)
    if (!hasPdfMagicBytes(pdfBuffer)) {
      return res.status(422).json({ success: false, error: 'Decoded data is not a valid PDF' })
    }

    const dir = path.dirname(session.filePath)
    const baseName = path.basename(session.filePath, '.pdf')
    const signedPath = path.join(dir, `${baseName}_firmado.pdf`)

    await fsPromises.writeFile(signedPath, pdfBuffer)
    updateSession(req.params.sessionId, { signedFilePath: signedPath })

    res.json({ success: true, message: 'PDF firmado guardado correctamente' })
  } catch (err) {
    next(err)
  }
})

export default router
