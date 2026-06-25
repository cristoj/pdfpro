import { Router } from 'express'
import fs from 'node:fs/promises'
import { upload } from '../middleware/upload.js'
import { createSession, getSession, updateSession } from '../services/sessionService.js'
import { loadPdf, savePdf, buildPageList, mergePdfs, extractPages } from '../services/pdfService.js'
import { parseRange } from '../../shared/pageRange.js'

const router = Router()

router.post('/upload', upload.array('files'), async (req, res, next) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ success: false, error: 'No files uploaded' })
    }

    const [first, ...rest] = req.files
    let doc = await loadPdf(first.path)

    for (const f of rest) {
      doc = await mergePdfs(first.path, f.path)
      await savePdf(doc, first.path)
      await fs.unlink(f.path).catch(() => {})
    }

    await savePdf(doc, first.path)
    const pages = buildPageList(doc)
    const sessionId = createSession(first.path, pages)

    res.json({ success: true, sessionId, pages })
  } catch (err) {
    next(err)
  }
})

router.post('/add', upload.array('files'), async (req, res, next) => {
  try {
    const { sessionId } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (!req.files?.length) return res.status(400).json({ success: false, error: 'No files uploaded' })

    let doc = await loadPdf(session.filePath)
    for (const f of req.files) {
      doc = await mergePdfs(session.filePath, f.path)
      await savePdf(doc, session.filePath)
      await fs.unlink(f.path).catch(() => {})
    }

    await savePdf(doc, session.filePath)
    const pages = buildPageList(doc)
    updateSession(sessionId, { pages })

    res.json({ success: true, pages })
  } catch (err) {
    next(err)
  }
})

router.post('/export', async (req, res, next) => {
  try {
    const { sessionId, range } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const doc = await loadPdf(session.filePath)
    const totalPages = doc.getPageCount()

    let indices
    if (range) {
      const parsed = parseRange(range)
      indices = parsed.map(n => {
        if (n < 1 || n > totalPages) throw Object.assign(new Error(`Page ${n} out of range`), { status: 422 })
        return n - 1
      })
    } else {
      indices = doc.getPageIndices()
    }

    const exportDoc = await extractPages(doc, indices)
    const bytes = await exportDoc.save()

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="export.pdf"')
    res.send(Buffer.from(bytes))
  } catch (err) {
    next(err)
  }
})

export default router
