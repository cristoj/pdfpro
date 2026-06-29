import 'dotenv/config'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorHandler } from './middleware/errorHandler.js'
import pdfRoutes from './routes/pdf.js'
import pagesRoutes from './routes/pages.js'
import toolsRoutes from './routes/tools.js'
import signRoutes from './routes/sign.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT ?? 3000
const UPLOADS_DIR = path.join(__dirname, '../../uploads')
const CLEANUP_MAX_AGE_MS = Number(process.env.UPLOAD_MAX_AGE_MS ?? 86_400_000)

async function cleanUploadsDir() {
  const files = await fs.readdir(UPLOADS_DIR).catch(() => [])
  const now = Date.now()
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(UPLOADS_DIR, file)
      const stat = await fs.stat(filePath).catch(() => null)
      if (stat && now - stat.mtimeMs > CLEANUP_MAX_AGE_MS) {
        await fs.unlink(filePath).catch(() => {})
      }
    })
  )
}

const app = express()

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' ws://127.0.0.1:* wss://127.0.0.1:* afirma://*",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'",
    ].join('; ')
  )
  next()
})

// Sign routes usan JSON con límite ampliado (PDFs en Base64 pueden superar 4 MB)
app.use('/api/session', express.json({ limit: '50mb' }), signRoutes)

app.use(express.json({ limit: '4mb' }))

app.use('/api/pdf', pdfRoutes)
app.use('/api/pdf', pagesRoutes)
app.use('/api/pdf', toolsRoutes)

app.use(errorHandler)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cleanUploadsDir()
  app.listen(PORT, () => {
    console.log(`PDFPro server running on http://localhost:${PORT}`)
  })
}

export default app
