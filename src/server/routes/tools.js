import { Router } from 'express'
import { getSession } from '../services/sessionService.js'
import { compressPdf } from '../services/compressService.js'

const router = Router()

router.post('/compress', async (req, res, next) => {
  try {
    const { sessionId } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const newSize = await compressPdf(session.filePath)
    res.json({ success: true, sizeBytes: newSize })
  } catch (err) {
    next(err)
  }
})

router.post('/search', async (req, res, next) => {
  try {
    const { sessionId, query } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (!query?.trim()) return res.json({ success: true, results: [] })

    // Full-text search is performed client-side via PDF.js text layer.
    // This endpoint is a stub for future server-side indexing.
    res.json({ success: true, results: [] })
  } catch (err) {
    next(err)
  }
})

router.post('/text/add', async (req, res, next) => {
  try {
    const { sessionId } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    res.status(501).json({ success: false, error: 'Not implemented yet' })
  } catch (err) {
    next(err)
  }
})

router.put('/text/:id', async (req, res, next) => {
  try {
    res.status(501).json({ success: false, error: 'Not implemented yet' })
  } catch (err) {
    next(err)
  }
})

router.delete('/text/:id', async (req, res, next) => {
  try {
    res.status(501).json({ success: false, error: 'Not implemented yet' })
  } catch (err) {
    next(err)
  }
})

router.post('/form/fill', async (req, res, next) => {
  try {
    res.status(501).json({ success: false, error: 'Not implemented yet' })
  } catch (err) {
    next(err)
  }
})

export default router
