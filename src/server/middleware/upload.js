import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'

const MAX_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 100)

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR ?? 'uploads')
  },
  filename: (req, file, cb) => {
    // Always use .pdf — never trust the client-supplied filename extension
    // (FINDING-02: path.extname on attacker-controlled originalname is unsafe)
    cb(null, `${uuidv4()}.pdf`)
  },
})

function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf') {
    cb(null, true)
  } else {
    const err = new Error('Only PDF files are allowed')
    err.status = 415
    cb(err, false)
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
})
