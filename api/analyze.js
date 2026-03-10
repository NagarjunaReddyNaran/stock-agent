export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
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
