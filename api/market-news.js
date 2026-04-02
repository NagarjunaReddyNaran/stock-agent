// Global market news feed with impact classification + sentiment analysis
// Uses Finnhub general news endpoint

const IMPACT_HIGH = ['fed','federal reserve','rate hike','rate cut','recession','inflation cpi','war','invasion','tariff','sanctions','gdp','bankruptcy','default','acquisition','merger','ipo','crash','rally','earnings miss','earnings beat']
const IMPACT_MEDIUM = ['upgrade','downgrade','earnings','revenue','guidance','employment','retail sales','manufacturing','pmi','trade','housing','consumer']

function classifyImpact(text) {
  const t = (text || '').toLowerCase()
  if (IMPACT_HIGH.some(k => t.includes(k))) return 'High'
  if (IMPACT_MEDIUM.some(k => t.includes(k))) return 'Medium'
  return 'Low'
}

const SECTOR_MAP = {
  Technology:  ['tech','ai','software','semiconductor','chip','cloud','cyber','apple','microsoft','google','nvidia','meta','openai','algorithm','robot'],
  Healthcare:  ['health','pharma','drug','fda','biotech','clinical','vaccine','hospital','pfizer','johnson','eli lilly','cancer','therapy'],
  Finance:     ['bank','fed','rate','bond','treasury','lending','credit','jpmorgan','goldman','finance','capital','wall street','interest rate'],
  Energy:      ['oil','gas','crude','energy','opec','barrel','exxon','chevron','renewable','solar','wind','pipeline','carbon'],
  Consumer:    ['retail','consumer','spending','walmart','target','amazon','restaurant','food','beverage','inflation','price'],
  Industrial:  ['manufacturing','aerospace','defense','boeing','lockheed','caterpillar','industrial','supply chain'],
}

function tagSectors(text) {
  const t = (text || '').toLowerCase()
  const tags = []
  for (const [sector, keywords] of Object.entries(SECTOR_MAP)) {
    if (keywords.some(k => t.includes(k))) tags.push(sector)
  }
  return tags.length > 0 ? tags.slice(0, 2) : ['General Market']
}

const BULLISH = ['rise','gain','surge','rally','beat','upgrade','strong','growth','profit','record high','exceed','outperform','bullish']
const BEARISH  = ['fall','drop','decline','miss','downgrade','weak','loss','risk','recession','concern','warning','bearish','slump','selloff']

let cache = null
let cacheTime = 0
const CACHE_TTL = 15 * 60 * 1000 // 15 min

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured.' })

  const now = Date.now()
  if (cache && (now - cacheTime) < CACHE_TTL) {
    return res.status(200).json({ ...cache, cached: true })
  }

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/news?category=general&minId=0&token=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const data = await r.json()
    if (!Array.isArray(data)) throw new Error('Invalid response')

    const articles = data.slice(0, 40).map(a => ({
      id:       a.id,
      headline: a.headline,
      summary:  a.summary,
      source:   a.source,
      url:      a.url,
      datetime: a.datetime,
      impact:   classifyImpact(`${a.headline} ${a.summary}`),
      sectors:  tagSectors(`${a.headline} ${a.summary}`),
    }))

    // Sort: High impact first, then recency
    articles.sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 }
      if (order[a.impact] !== order[b.impact]) return order[a.impact] - order[b.impact]
      return b.datetime - a.datetime
    })

    // Compute sentiment from top 15 articles
    let bull = 0, bear = 0
    for (const a of articles.slice(0, 15)) {
      const t = `${a.headline} ${a.summary}`.toLowerCase()
      bull += BULLISH.filter(w => t.includes(w)).length
      bear += BEARISH.filter(w => t.includes(w)).length
    }
    const sentiment = bull > bear + 2 ? 'Bullish' : bear > bull + 2 ? 'Bearish' : 'Neutral'
    const sentimentScore = Math.round(Math.min(100, Math.max(0, 50 + (bull - bear) * 5)))

    const result = { articles: articles.slice(0, 20), sentiment, sentimentScore, generatedAt: now }
    cache = result
    cacheTime = now
    return res.status(200).json(result)
  } catch (err) {
    if (cache) return res.status(200).json({ ...cache, cached: true, stale: true })
    return res.status(500).json({ error: 'Market news error: ' + err.message })
  }
}
