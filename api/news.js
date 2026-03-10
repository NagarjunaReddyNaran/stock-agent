export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured.' })

  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'Missing symbol.' })

  const to   = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0]

  try {
    const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${apiKey}`)
    const data = await r.json()
    const articles = (Array.isArray(data) ? data : []).slice(0, 10).map(a => ({
      id: a.id, headline: a.headline, summary: a.summary,
      source: a.source, url: a.url, datetime: a.datetime,
    }))
    return res.status(200).json({ articles })
  } catch (err) {
    return res.status(500).json({ error: 'News error: ' + err.message })
  }
}
