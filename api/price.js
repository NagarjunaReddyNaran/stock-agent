export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured in Vercel.' })

  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'Missing symbol query param.' })

  try {
    const [qRes, pRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
    ])

    const q = await qRes.json()
    const p = pRes.ok ? await pRes.json() : {}

    if (!q || !q.c || q.c === 0) return res.status(404).json({ error: `No data found for "${symbol}"` })

    return res.status(200).json({
      price:     parseFloat(q.c.toFixed(2)),
      open:      parseFloat(q.o.toFixed(2)),
      high:      parseFloat(q.h.toFixed(2)),
      low:       parseFloat(q.l.toFixed(2)),
      prevClose: parseFloat(q.pc.toFixed(2)),
      change:    parseFloat((q.c - q.pc).toFixed(2)),
      changePct: parseFloat(((q.c - q.pc) / q.pc * 100).toFixed(2)),
      name:      p.name || symbol,
      exchange:  p.exchange || '',
    })
  } catch (err) {
    return res.status(500).json({ error: 'Price fetch error: ' + err.message })
  }
}
