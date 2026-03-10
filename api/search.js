export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured.' })

  const { q } = req.query
  if (!q || q.length < 2) return res.status(200).json({ results: [] })

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${apiKey}`
    )
    const data = await response.json()

    // Filter to US stocks only, dedupe, limit to 8
    const seen = new Set()
    const results = (data.result || [])
      .filter(r => r.type === 'Common Stock' && r.symbol && !r.symbol.includes('.') && !seen.has(r.symbol) && seen.add(r.symbol))
      .slice(0, 8)
      .map(r => ({ symbol: r.symbol, name: r.description }))

    return res.status(200).json({ results })
  } catch (err) {
    return res.status(500).json({ error: 'Search error: ' + err.message })
  }
}
