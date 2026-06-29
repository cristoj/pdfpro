import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorHandler } from './middleware/errorHandler.js'
import pdfRoutes from './routes/pdf.js'
import pagesRoutes from './routes/pages.js'
import toolsRoutes from './routes/tools.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT ?? 3000

const app = express()

app.use(express.json({ limit: '4mb' }))

app.use('/api/pdf', pdfRoutes)
app.use('/api/pdf', pagesRoutes)
app.use('/api/pdf', toolsRoutes)

app.use(errorHandler)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`PDFPro server running on http://localhost:${PORT}`)
  })
}

export default app
