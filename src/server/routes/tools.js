import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getSession, updateSession } from '../services/sessionService.js'
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
    res.json({ success: true, results: [] })
  } catch (err) {
    next(err)
  }
})

// ── Text blocks ───────────────────────────────────────────────

router.get('/text/:sessionId', async (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    res.json({ success: true, textBlocks: session.textBlocks ?? [] })
  } catch (err) {
    next(err)
  }
})

router.post('/text/add', async (req, res, next) => {
  try {
    const { sessionId, pageIndex, x, y, text, fontSize, fontFamily, bold, italic } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const block = {
      id: uuidv4(),
      pageIndex: Number(pageIndex) || 0,
      x: Number(x) || 0,
      y: Number(y) || 0,
      text: text ?? '',
      fontSize: Number(fontSize) || 14,
      fontFamily: fontFamily || 'Helvetica',
      bold: Boolean(bold),
      italic: Boolean(italic),
    }

    updateSession(sessionId, { textBlocks: [...(session.textBlocks ?? []), block] })
    res.json({ success: true, block })
  } catch (err) {
    next(err)
  }
})

router.put('/text/:id', async (req, res, next) => {
  try {
    const { sessionId, text, fontSize, fontFamily, bold, italic, x, y } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const blocks = session.textBlocks ?? []
    const idx = blocks.findIndex(b => b.id === req.params.id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Text block not found' })

    const patch = {}
    if (text !== undefined) patch.text = text
    if (fontSize !== undefined) patch.fontSize = Number(fontSize)
    if (fontFamily !== undefined) patch.fontFamily = fontFamily
    if (bold !== undefined) patch.bold = Boolean(bold)
    if (italic !== undefined) patch.italic = Boolean(italic)
    if (x !== undefined) patch.x = Number(x)
    if (y !== undefined) patch.y = Number(y)

    const updated = [...blocks]
    updated[idx] = { ...blocks[idx], ...patch }
    updateSession(sessionId, { textBlocks: updated })
    res.json({ success: true, block: updated[idx] })
  } catch (err) {
    next(err)
  }
})

router.delete('/text/:id', async (req, res, next) => {
  try {
    const { sessionId } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    updateSession(sessionId, {
      textBlocks: (session.textBlocks ?? []).filter(b => b.id !== req.params.id),
    })
    res.json({ success: true })
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
