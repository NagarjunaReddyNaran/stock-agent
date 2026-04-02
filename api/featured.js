// Featured stocks & ETFs with AI-generated signals — refreshes every 30 min

// Normalize sector/category strings so frontend exact-match filtering is reliable
const SECTOR_ALIASES = {
  'tech':'Technology','information technology':'Technology','it':'Technology','software':'Technology','semiconductors':'Technology',
  'health care':'Healthcare','health':'Healthcare','medical':'Healthcare','biotech':'Healthcare','pharma':'Healthcare','pharmaceutical':'Healthcare',
  'financial':'Finance','financials':'Finance','banking':'Finance','financial services':'Finance','banks':'Finance',
  'oil':'Energy','oil & gas':'Energy','oil and gas':'Energy','utilities':'Energy','natural resources':'Energy',
  'consumer discretionary':'Consumer','consumer staples':'Consumer','retail':'Consumer','consumer cyclical':'Consumer',
  'industrials':'Industrial','manufacturing':'Industrial','defense':'Industrial','aerospace':'Industrial','aerospace & defense':'Industrial',
  'real estate':'Real Estate','reit':'Real Estate',
  'materials':'Materials','basic materials':'Materials',
  'communication':'Communication','communication services':'Communication','telecom':'Communication','telecommunications':'Communication',
}
const ETF_CAT_ALIASES = {
  'indices':'Index','broad market':'Index','broad':'Index','market':'Index',
  'sector etf':'Sector','sectors':'Sector',
  'commodity':'Commodities','gold':'Commodities','oil etf':'Commodities',
  'thematic etf':'Thematic','emerging':'Thematic','innovation':'Thematic','growth':'Thematic',
}

function normalizeSector(raw) {
  if (!raw) return 'Other'
  const key = raw.toLowerCase().trim()
  return SECTOR_ALIASES[key] || raw.trim()
}
function normalizeEtfCat(raw) {
  if (!raw) return 'Other'
  const key = raw.toLowerCase().trim()
  return ETF_CAT_ALIASES[key] || raw.trim()
}

const SYSTEM = `You are a senior equity strategist. Generate a comprehensive curated watchlist of featured stocks across all major sectors and popular ETF categories for today.

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
      "reason": "Specific 1-2 line reason tied to today's market conditions"
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

STRICT STOCK RULES — you MUST return exactly these counts per sector (28 total):
- Technology: exactly 5 stocks (e.g. AAPL, NVDA, MSFT, META, GOOGL)
- Healthcare: exactly 4 stocks (e.g. UNH, LLY, JNJ, ABBV)
- Finance: exactly 4 stocks (e.g. JPM, GS, V, BAC)
- Energy: exactly 4 stocks (e.g. XOM, CVX, COP, SLB)
- Consumer: exactly 4 stocks (e.g. AMZN, WMT, MCD, COST)
- Industrial: exactly 4 stocks (e.g. CAT, HON, BA, LMT)
- Communication: exactly 3 stocks (e.g. NFLX, DIS, T)

STRICT ETF RULES — you MUST return exactly these counts per category (12 total):
- Index: exactly 4 ETFs (SPY, QQQ, IWM, VTI)
- Sector: exactly 4 ETFs (XLK, XLF, XLV, XLE)
- Commodities: exactly 2 ETFs (GLD, USO or SLV)
- Thematic: exactly 2 ETFs (ARKK or SOXX or any high-conviction thematic)

FIELD RULES:
- sector must be EXACTLY one of: Technology, Healthcare, Finance, Energy, Consumer, Industrial, Communication
- category must be EXACTLY one of: Index, Sector, Commodities, Thematic
- signal must be EXACTLY one of: BUY, HOLD, SELL
- confidence: integer 55-95
- reason: 1-2 sentences, actionable, specific to today's macro/sector environment
- price/change: realistic approximate current market values`

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
        max_tokens: 5000,
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

    // Normalize sector/category so frontend exact-match always works
    featured.stocks = featured.stocks.map(s => ({ ...s, sector: normalizeSector(s.sector) }))
    featured.etfs   = featured.etfs.map(e => ({ ...e, category: normalizeEtfCat(e.category) }))

    // Deduplicate by ticker
    const seenS = new Set(); featured.stocks = featured.stocks.filter(s => { if(seenS.has(s.ticker)) return false; seenS.add(s.ticker); return true })
    const seenE = new Set(); featured.etfs   = featured.etfs.filter(e => { if(seenE.has(e.ticker)) return false; seenE.add(e.ticker); return true })

    cache     = featured
    cacheTime = now
    return res.status(200).json({ ...featured, cached: false, cachedAt: now })
  } catch (err) {
    if (cache) return res.status(200).json({ ...cache, cached: true, cachedAt: cacheTime, stale: true })
    return res.status(500).json({ error: 'Featured error: ' + err.message })
  }
}
