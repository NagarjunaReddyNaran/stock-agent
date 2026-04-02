// Featured stocks & ETFs with AI-generated signals — refreshes every 30 min

const SYSTEM = `You are a senior equity strategist. Generate a curated watchlist of featured stocks across key sectors and popular ETFs for today.

Return ONLY raw JSON — no markdown, no backticks, no explanation:
{
  "stocks": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "sector": "Technology",
      "price": 185.00,
      "change": 1.2,
      "signal": "BUY",
      "confidence": 82,
      "reason": "Specific 1-2 line reason tied to today's market"
    }
  ],
  "etfs": [
    {
      "ticker": "SPY",
      "name": "SPDR S&P 500 ETF Trust",
      "category": "Index",
      "price": 515.00,
      "change": 0.5,
      "signal": "BUY",
      "confidence": 78,
      "reason": "Specific 1-2 line reason"
    }
  ]
}

STRICT RULES:
- stocks array: exactly 8 items — cover Technology (2), Healthcare (1), Finance (1), Energy (1), Consumer (1), Industrial (1), plus 1 high-conviction wildcard
- etfs array: exactly 6 items — always include SPY, QQQ, IWM; then GLD or SLV (commodities), XLE or XLF (sector), and one thematic/emerging ETF
- signal must be exactly "BUY", "HOLD", or "SELL"
- confidence: integer 50-95
- reason: actionable, specific — reference actual macro environment, sector rotation, or technical level. No generic statements.
- price/change: realistic current market values (approximate is fine)`

let cache = null
let cacheTime = 0
const CACHE_TTL = 30 * 60 * 1000

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured.' })

  const now = Date.now()
  if (cache && (now - cacheTime) < CACHE_TTL) {
    return res.status(200).json({ ...cache, cached: true, cachedAt: cacheTime })
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 2500,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user',   content: `Today is ${today}. Generate the featured stocks and ETFs. Return ONLY the JSON object.` },
        ],
      }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data?.error?.message || `Groq error ${r.status}`)

    const txt   = data?.choices?.[0]?.message?.content || ''
    const clean = txt.replace(/```json/gi,'').replace(/```/g,'').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')

    const featured = JSON.parse(match[0])
    if (!Array.isArray(featured.stocks) || !Array.isArray(featured.etfs)) throw new Error('Invalid structure')

    cache     = featured
    cacheTime = now
    return res.status(200).json({ ...featured, cached: false, cachedAt: now })
  } catch (err) {
    if (cache) return res.status(200).json({ ...cache, cached: true, cachedAt: cacheTime, stale: true })
    return res.status(500).json({ error: 'Featured error: ' + err.message })
  }
}
