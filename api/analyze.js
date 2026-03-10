// Simple in-memory rate limiter (resets on cold start — good enough for Vercel serverless)
const rateMap = new Map()
const RATE_LIMIT = 20      // max requests
const RATE_WINDOW = 60000  // per 60 seconds

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateMap.get(ip) || { count: 0, start: now }
  if (now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { count: 1, start: now })
    return false
  }
  if (entry.count >= RATE_LIMIT) return true
  entry.count++
  rateMap.set(ip, entry)
  return false
}

export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' })
  }
  const origin = req.headers.origin || ''
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY not set. Add it in Vercel → Settings → Environment Variables.',
    })
  }

  const { system, userMessage } = req.body
  if (!system || !userMessage) {
    return res.status(400).json({ error: 'Missing system or userMessage in request body.' })
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',   // Best free model on Groq
        temperature: 0.3,                    // Low temp = consistent JSON output
        max_tokens: 1500,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userMessage },
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data?.error?.message || `Groq API error ${response.status}`
      return res.status(response.status).json({ error: msg })
    }

    // Extract the text content and return it simply
    const text = data?.choices?.[0]?.message?.content || ''
    return res.status(200).json({ text })

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error: ' + err.message })
  }
}
