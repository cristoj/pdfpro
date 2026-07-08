import { Router } from 'express'

const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

const router = Router()

router.post('/chat/completions', async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw Object.assign(new Error('AI agent is not configured on this server'), { status: 503 })
    }

    const geminiResponse = await fetch(`${GEMINI_OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    })

    const data = await geminiResponse.json()
    res.status(geminiResponse.status).json(data)
  } catch (err) {
    next(err)
  }
})

export default router
