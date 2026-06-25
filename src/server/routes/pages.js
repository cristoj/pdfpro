import { Router } from 'express'
import { getSession, updateSession } from '../services/sessionService.js'
import { loadPdf, savePdf, buildPageList, reorderPages, deletePages } from '../services/pdfService.js'

const router = Router()

router.get('/pages/:sid', async (req, res, next) => {
  try {
    const session = getSession(req.params.sid)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    res.json({ success: true, pages: session.pages })
  } catch (err) {
    next(err)
  }
})

router.get('/preview/:sid/:page', async (req, res, next) => {
  try {
    const session = getSession(req.params.sid)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const pageNum = Number(req.params.page)
    const doc = await loadPdf(session.filePath)
    if (pageNum < 0 || pageNum >= doc.getPageCount()) {
      return res.status(404).json({ success: false, error: 'Page out of range' })
    }

    // Preview generation via PDF.js happens client-side; this endpoint
    // returns metadata for now. Full PNG rendering requires node-canvas.
    res.json({
      success: true,
      page: pageNum,
      total: doc.getPageCount(),
      note: 'Client-side rendering via PDF.js',
    })
  } catch (err) {
    next(err)
  }
})

router.post('/reorder', async (req, res, next) => {
  try {
    const { sessionId, order } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const doc = await loadPdf(session.filePath)
    const total = doc.getPageCount()
    if (!Array.isArray(order) || order.some(i => i < 0 || i >= total)) {
      return res.status(422).json({ success: false, error: 'Invalid page indices in order' })
    }

    const reordered = await reorderPages(doc, order)
    await savePdf(reordered, session.filePath)
    const pages = buildPageList(reordered)
    updateSession(sessionId, { pages })

    res.json({ success: true, pages })
  } catch (err) {
    next(err)
  }
})

router.delete('/pages', async (req, res, next) => {
  try {
    const { sessionId, pages } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const doc = await loadPdf(session.filePath)
    const total = doc.getPageCount()

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(422).json({ success: false, error: 'No pages specified' })
    }
    if (pages.length >= total) {
      return res.status(422).json({ success: false, error: 'Cannot delete all pages' })
    }

    const updated = await deletePages(doc, pages)
    await savePdf(updated, session.filePath)
    const updatedPages = buildPageList(updated)
    updateSession(sessionId, { pages: updatedPages })

    res.json({ success: true, pages: updatedPages })
  } catch (err) {
    next(err)
  }
})

export default router
