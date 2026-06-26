import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getSession, updateSession } from '../services/sessionService.js'
import { compressPdf } from '../services/compressService.js'

const router = Router()

router.post('/compress', async (req, res, next) => {
  try {
    const { sessionId, level = 'medium' } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const validLevels = ['low', 'medium', 'high']
    const safeLevel = validLevels.includes(level) ? level : 'medium'
    const newSize = await compressPdf(session.filePath, safeLevel)
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
    const { sessionId, pageIndex, x, y, text, fontSize, fontFamily, bold, italic, color } = req.body
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
      color: color || '#000000',
    }

    updateSession(sessionId, { textBlocks: [...(session.textBlocks ?? []), block] })
    res.json({ success: true, block })
  } catch (err) {
    next(err)
  }
})

router.put('/text/:id', async (req, res, next) => {
  try {
    const { sessionId, text, fontSize, fontFamily, bold, italic, color, x, y } = req.body
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
    if (color !== undefined) patch.color = color
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

// ── Shape blocks ──────────────────────────────────────────────

router.get('/shapes/:sessionId', async (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    res.json({ success: true, shapes: session.shapes ?? [] })
  } catch (err) {
    next(err)
  }
})

router.post('/shapes/add', async (req, res, next) => {
  try {
    const { sessionId, type, pageIndex, x, y, width, height, fillColor, fillTransparent, strokeColor, strokeWidth } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const shape = {
      id: uuidv4(),
      type: type === 'circle' ? 'circle' : 'rect',
      pageIndex: Number(pageIndex) || 0,
      x: Number(x) || 0,
      y: Number(y) || 0,
      width: Number(width) || 100,
      height: Number(height) || 100,
      fillColor: fillColor || '#ffffff',
      fillTransparent: Boolean(fillTransparent),
      strokeColor: strokeColor || '#000000',
      strokeWidth: Number(strokeWidth) || 2,
    }

    updateSession(sessionId, { shapes: [...(session.shapes ?? []), shape] })
    res.json({ success: true, shape })
  } catch (err) {
    next(err)
  }
})

router.put('/shapes/:id', async (req, res, next) => {
  try {
    const { sessionId, x, y, width, height, fillColor, fillTransparent, strokeColor, strokeWidth } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const shapes = session.shapes ?? []
    const idx = shapes.findIndex(s => s.id === req.params.id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Shape not found' })

    const patch = {}
    if (x !== undefined) patch.x = Number(x)
    if (y !== undefined) patch.y = Number(y)
    if (width !== undefined) patch.width = Number(width)
    if (height !== undefined) patch.height = Number(height)
    if (fillColor !== undefined) patch.fillColor = fillColor
    if (fillTransparent !== undefined) patch.fillTransparent = Boolean(fillTransparent)
    if (strokeColor !== undefined) patch.strokeColor = strokeColor
    if (strokeWidth !== undefined) patch.strokeWidth = Number(strokeWidth)

    const updated = [...shapes]
    updated[idx] = { ...shapes[idx], ...patch }
    updateSession(sessionId, { shapes: updated })
    res.json({ success: true, shape: updated[idx] })
  } catch (err) {
    next(err)
  }
})

router.delete('/shapes/:id', async (req, res, next) => {
  try {
    const { sessionId } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    updateSession(sessionId, {
      shapes: (session.shapes ?? []).filter(s => s.id !== req.params.id),
    })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ── Image blocks ──────────────────────────────────────────────

router.get('/images/:sessionId', async (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    res.json({ success: true, images: session.images ?? [] })
  } catch (err) {
    next(err)
  }
})

router.post('/images/add', async (req, res, next) => {
  try {
    const { sessionId, pageIndex, x, y, width, height, imageData, mimeType } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (!imageData) return res.status(400).json({ success: false, error: 'imageData required' })

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    const safeMime = validTypes.includes(mimeType) ? mimeType : 'image/png'

    const image = {
      id: uuidv4(),
      pageIndex: Number(pageIndex) || 0,
      x: Number(x) || 0,
      y: Number(y) || 0,
      width: Number(width) || 150,
      height: Number(height) || 100,
      imageData,
      mimeType: safeMime,
    }

    updateSession(sessionId, { images: [...(session.images ?? []), image] })
    res.json({ success: true, image })
  } catch (err) {
    next(err)
  }
})

router.put('/images/:id', async (req, res, next) => {
  try {
    const { sessionId, x, y, width, height } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const images = session.images ?? []
    const idx = images.findIndex(img => img.id === req.params.id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Image not found' })

    const patch = {}
    if (x !== undefined) patch.x = Number(x)
    if (y !== undefined) patch.y = Number(y)
    if (width !== undefined) patch.width = Number(width)
    if (height !== undefined) patch.height = Number(height)

    const updated = [...images]
    updated[idx] = { ...images[idx], ...patch }
    updateSession(sessionId, { images: updated })
    res.json({ success: true, image: updated[idx] })
  } catch (err) {
    next(err)
  }
})

router.delete('/images/:id', async (req, res, next) => {
  try {
    const { sessionId } = req.body
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    updateSession(sessionId, {
      images: (session.images ?? []).filter(img => img.id !== req.params.id),
    })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

router.get('/form/fields/:sessionId', async (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    res.json({ success: true, formValues: session.formValues ?? {} })
  } catch (err) {
    next(err)
  }
})

router.post('/form/fill', async (req, res, next) => {
  try {
    const { sessionId, formValues } = req.body
    if (!sessionId || typeof formValues !== 'object' || formValues === null) {
      return res.status(400).json({ success: false, error: 'sessionId and formValues required' })
    }
    const session = getSession(sessionId)
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const merged = { ...(session.formValues ?? {}), ...formValues }
    updateSession(sessionId, { formValues: merged })
    res.json({ success: true, formValues: merged })
  } catch (err) {
    next(err)
  }
})

export default router
