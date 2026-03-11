// ── Yahoo Finance search — returns US, Indian (.NS/.BO), Canadian (.TO) stocks ─
async function yahooSearch(q) {
  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}&lang=en-US&region=US` +
      `&quotesCount=15&enableFuzzyQuery=false&newsCount=0&enableNavLinks=false`

    const res = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data?.quotes || []
  } catch {
    return []
  }
}

function classifySymbol(sym, exchange) {
  if (!sym) return null

  const exUp = (exchange || '').toUpperCase()

  // Indian
  if (sym.endsWith('.NS') || exUp.includes('NSE') || exUp.includes('INDIA')) {
    return { market: 'IN', flag: '🇮🇳', label: 'NSE India' }
  }
  if (sym.endsWith('.BO') || exUp.includes('BSE') || exUp.includes('BOMBAY')) {
    return { market: 'IN', flag: '🇮🇳', label: 'BSE India' }
  }

  // Canadian
  if (sym.endsWith('.TO') || exUp.includes('TSX') || exUp.includes('TORONTO')) {
    return { market: 'CA', flag: '🇨🇦', label: 'TSX Canada' }
  }
  if (sym.endsWith('.V') || exUp.includes('VENTURE')) {
    return { market: 'CA', flag: '🇨🇦', label: 'TSXV Canada' }
  }

  // US — no dot suffix, no colon prefix
  if (!sym.includes('.') && !sym.includes(':')) {
    return { market: 'US', flag: '🇺🇸', label: 'NYSE/NASDAQ' }
  }

  return null // filter out everything else (LSE, ASX, etc.)
}

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  const { q } = req.query
  if (!q || q.length < 2) return res.status(200).json({ results: [] })

  try {
    const quotes = await yahooSearch(q)

    const seen    = new Set()
    const results = []

    for (const quote of quotes) {
      if (quote.quoteType !== 'EQUITY') continue

      const sym  = quote.symbol
      if (!sym || seen.has(sym)) continue

      const info = classifySymbol(sym, quote.exchange || quote.fullExchangeName)
      if (!info) continue   // skip LSE, ASX, Frankfurt, etc.

      seen.add(sym)
      results.push({
        symbol:   sym,
        name:     quote.longname || quote.shortname || sym,
        flag:     info.flag,
        market:   info.market,
        exchange: info.label,
      })

      if (results.length >= 10) break
    }

    // Sort: US first, then IN, then CA — within same market keep Yahoo's ranking
    results.sort((a, b) => {
      const order = { US: 0, IN: 1, CA: 2 }
      return (order[a.market] || 9) - (order[b.market] || 9)
    })

    return res.status(200).json({ results })
  } catch (err) {
    return res.status(500).json({ error: 'Search error: ' + err.message })
  }
}
