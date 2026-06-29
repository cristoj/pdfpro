import 'dotenv/config'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
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

// ── Security headers (FINDING-04) ─────────────────────────────
app.use((req, res, next) => {
  // FINDING-13: added base-uri 'self' to prevent <base> tag injection
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      // afirma:// is intentional for AutoFirma desktop app integration
      "connect-src 'self' ws://127.0.0.1:* wss://127.0.0.1:* afirma://*",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  )
  // Prevent MIME-sniffing of responses
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Prevent embedding in iframes (clickjacking)
  res.setHeader('X-Frame-Options', 'DENY')
  // Limit referrer information leaked to third parties
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Restrict powerful browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

// ── Rate limiting (FINDING-03) ─────────────────────────────────
// Skip rate limiting in test environment to avoid interference with test suites
const skipInTest = () => process.env.NODE_ENV === 'test'

// General limit: covers all /api/* endpoints
const standardLimit = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 120,           // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, error: 'Too many requests, please try again later.' },
})

// Heavy operations limit: upload, compress, import-signed-pdf
const heavyLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, error: 'Too many requests, please try again later.' },
})

app.use('/api', standardLimit)
app.use('/api/pdf/upload', heavyLimit)
app.use('/api/pdf/compress', heavyLimit)
app.use('/api/session', heavyLimit)

// ── Body parsers ───────────────────────────────────────────────
// FINDING-09: reduced from 50mb to 20mb for sign routes (PDFs in Base64)
app.use('/api/session', express.json({ limit: '20mb' }), signRoutes)

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
