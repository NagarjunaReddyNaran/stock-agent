// Detect market session based on US Eastern Time
function getMarketSession() {
  const now = new Date()
  // Convert to ET (UTC-5 or UTC-4 during daylight saving)
  const etOffset = isDST(now) ? -4 : -5
  const et = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000)
  const day = et.getDay() // 0=Sun, 6=Sat
  const h = et.getHours()
  const m = et.getMinutes()
  const mins = h * 60 + m

  if (day === 0 || day === 6) return 'CLOSED'           // Weekend
  if (mins >= 240 && mins < 570)  return 'PRE_MARKET'   // 4:00 AM – 9:30 AM ET
  if (mins >= 570 && mins < 960)  return 'REGULAR'      // 9:30 AM – 4:00 PM ET
  if (mins >= 960 && mins < 1200) return 'POST_MARKET'  // 4:00 PM – 8:00 PM ET
  return 'CLOSED'
}

function isDST(date) {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset()
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset()
  return date.getTimezoneOffset() < Math.max(jan, jul)
}

// Fetch extended hours price from Yahoo Finance (server-side, no CORS issue)
async function fetchYahooExtended(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=true`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    if (!meta) return null

    return {
      preMarketPrice:  meta.preMarketPrice  ? parseFloat(meta.preMarketPrice.toFixed(2))  : null,
      postMarketPrice: meta.postMarketPrice ? parseFloat(meta.postMarketPrice.toFixed(2)) : null,
      preMarketChange: meta.preMarketPrice && meta.regularMarketPreviousClose
        ? parseFloat((meta.preMarketPrice - meta.regularMarketPreviousClose).toFixed(2)) : null,
      postMarketChange: meta.postMarketPrice && meta.regularMarketPrice
        ? parseFloat((meta.postMarketPrice - meta.regularMarketPrice).toFixed(2)) : null,
      preMarketChangePct: meta.preMarketPrice && meta.regularMarketPreviousClose
        ? parseFloat(((meta.preMarketPrice - meta.regularMarketPreviousClose) / meta.regularMarketPreviousClose * 100).toFixed(2)) : null,
      postMarketChangePct: meta.postMarketPrice && meta.regularMarketPrice
        ? parseFloat(((meta.postMarketPrice - meta.regularMarketPrice) / meta.regularMarketPrice * 100).toFixed(2)) : null,
    }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured in Vercel.' })

  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'Missing symbol query param.' })

  try {
    // Fetch Finnhub quote + profile + Yahoo extended hours in parallel
    const [qRes, pRes, extended] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
      fetchYahooExtended(symbol),
    ])

    const q = await qRes.json()
    const p = pRes.ok ? await pRes.json() : {}

    if (!q || !q.c || q.c === 0) {
      return res.status(404).json({ error: `No data found for "${symbol}"` })
    }

    const session = getMarketSession()

    return res.status(200).json({
      // Regular market data
      price:     parseFloat(q.c.toFixed(2)),
      open:      parseFloat(q.o.toFixed(2)),
      high:      parseFloat(q.h.toFixed(2)),
      low:       parseFloat(q.l.toFixed(2)),
      prevClose: parseFloat(q.pc.toFixed(2)),
      change:    parseFloat((q.c - q.pc).toFixed(2)),
      changePct: parseFloat(((q.c - q.pc) / q.pc * 100).toFixed(2)),
      name:      p.name || symbol,
      exchange:  p.exchange || '',
      // Market session
      session,   // 'REGULAR' | 'PRE_MARKET' | 'POST_MARKET' | 'CLOSED'
      // Extended hours (from Yahoo, may be null)
      preMarketPrice:       extended?.preMarketPrice       ?? null,
      preMarketChange:      extended?.preMarketChange      ?? null,
      preMarketChangePct:   extended?.preMarketChangePct   ?? null,
      postMarketPrice:      extended?.postMarketPrice      ?? null,
      postMarketChange:     extended?.postMarketChange     ?? null,
      postMarketChangePct:  extended?.postMarketChangePct  ?? null,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Price fetch error: ' + err.message })
  }
}
