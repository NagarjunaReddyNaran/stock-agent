// ── Server-side cache: 30 minutes ─────────────────────────────────────────────
let cache = null
let cacheTime = 0
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

const SYSTEM = `You are a professional stock market analyst with access to real-time market data, news, and financial metrics.

Your task is to identify the Top 10 Trending Stocks of the day based on these factors:
1. Major business deals, partnerships, government contracts
2. Analyst upgrades/downgrades, price target changes, institutional recommendations
3. Valuation metrics: P/E, Forward P/E, PEG ratio vs industry averages
4. Macroeconomic impact: geopolitical events, tariffs, interest rate changes, inflation
5. Market activity: unusual trading volume, price breakouts, momentum indicators
6. Institutional activity: insider buying/selling, hedge fund accumulation, ETF inflows
7. Options market signals: unusual options activity, call/put ratio changes

Focus on stocks with the highest combined momentum across multiple factors today.
Include a mix of sectors — do NOT list only tech stocks.

Respond with ONLY a raw JSON array of exactly 10 objects. No markdown, no explanation:
[
  {
    "rank": 1,
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "sector": "Technology",
    "price": 185.50,
    "change": 2.3,
    "catalyst": "One sentence describing the main catalyst driving movement today",
    "reason": "Two to three sentence explanation covering the key factors",
    "factors": ["Analyst Upgrade", "Unusual Volume", "Institutional Buying"],
    "confidence": 92,
    "signal": "BUY"
  }
]

Rules:
- signal must be "BUY", "WATCH", or "AVOID"
- confidence is 0-100 integer
- factors array should have 2-4 items from: Analyst Upgrade, Analyst Downgrade, Earnings Beat, Earnings Miss, Unusual Volume, Insider Buying, Insider Selling, Institutional Buying, M&A Activity, Government Contract, Macro Tailwind, Macro Headwind, Technical Breakout, Technical Breakdown, Options Activity, Price Target Raise, Price Target Cut
- Return exactly 10 stocks, ranked 1-10 by overall trend strength`

async function callGroq(apiKey) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: `Today is ${today}. Identify the Top 10 trending stocks right now based on all the factors. Return ONLY the JSON array.` },
      ],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Groq error ${res.status}`)
  return data?.choices?.[0]?.message?.content || ''
}

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured.' })

  // Serve from cache if fresh
  const now = Date.now()
  if (cache && (now - cacheTime) < CACHE_TTL) {
    return res.status(200).json({ stocks: cache, cached: true, cachedAt: cacheTime })
  }

  try {
    const txt  = await callGroq(apiKey)
    const clean = txt.replace(/```json/gi,'').replace(/```/g,'').trim()
    const match = clean.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')

    const stocks = JSON.parse(match[0])
    if (!Array.isArray(stocks) || stocks.length === 0) throw new Error('Empty stocks array')

    cache     = stocks
    cacheTime = now

    return res.status(200).json({ stocks, cached: false, cachedAt: now })
  } catch (err) {
    // If cache exists but stale, return it rather than error
    if (cache) return res.status(200).json({ stocks: cache, cached: true, cachedAt: cacheTime, stale: true })
    return res.status(500).json({ error: 'Failed to fetch trending stocks: ' + err.message })
  }
}
