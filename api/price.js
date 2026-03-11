function round2(n) {
  if (n == null || isNaN(Number(n))) return null
  return parseFloat(Number(n).toFixed(2))
}

function toYahoo(symbol) {
  const s = symbol.toUpperCase().trim()
  if (s.startsWith('NSE:')) return s.slice(4) + '.NS'
  if (s.startsWith('BSE:')) return s.slice(4) + '.BO'
  return s
}

function inferCurrency(sym, metaCurrency) {
  if (metaCurrency) return metaCurrency
  if (sym.endsWith('.NS') || sym.endsWith('.BO')) return 'INR'
  if (sym.endsWith('.TO') || sym.endsWith('.TSX')) return 'CAD'
  return 'USD'
}

function parseSession(state) {
  if (!state) return 'CLOSED'
  const s = state.toUpperCase()
  if (s === 'REGULAR')                  return 'REGULAR'
  if (s === 'PRE'  || s === 'PREPRE')   return 'PRE_MARKET'
  if (s === 'POST' || s === 'POSTPOST') return 'POST_MARKET'
  return 'CLOSED'
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com',
}

// Strategy 1: Yahoo v8 chart (primary)
async function fetchChart(sym) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return null
    return meta
  } catch { return null }
}

// Strategy 2: Yahoo v7 quote (fallback)
async function fetchV7(sym) {
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,marketState,longName,shortName,fullExchangeName,currency`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const q = data?.quoteResponse?.result?.[0]
    if (!q?.regularMarketPrice) return null
    return q
  } catch { return null }
}

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'Missing symbol.' })

  const yahooSym = toYahoo(symbol)

  try {
    const [chart, v7] = await Promise.all([fetchChart(yahooSym), fetchV7(yahooSym)])

    // Use chart (primary)
    if (chart) {
      const rmp = chart.regularMarketPrice
      const rpc = chart.chartPreviousClose || chart.previousClose || rmp
      return res.status(200).json({
        price:     round2(rmp),
        open:      round2(chart.regularMarketOpen    || rmp),
        high:      round2(chart.regularMarketDayHigh || rmp),
        low:       round2(chart.regularMarketDayLow  || rmp),
        prevClose: round2(rpc),
        change:    round2(rmp - rpc),
        changePct: round2(rpc ? (rmp - rpc) / rpc * 100 : 0),
        name:      chart.longName || chart.shortName || yahooSym,
        exchange:  chart.fullExchangeName || chart.exchangeName || '',
        currency:  inferCurrency(yahooSym, chart.currency),
        session:   parseSession(chart.marketState),
      })
    }

    // Use v7 (fallback)
    if (v7) {
      const rmp = v7.regularMarketPrice
      const rpc = v7.regularMarketPreviousClose || rmp
      return res.status(200).json({
        price:     round2(rmp),
        open:      round2(v7.regularMarketOpen    || rmp),
        high:      round2(v7.regularMarketDayHigh || rmp),
        low:       round2(v7.regularMarketDayLow  || rmp),
        prevClose: round2(rpc),
        change:    round2(v7.regularMarketChange || (rmp - rpc)),
        changePct: round2(v7.regularMarketChangePercent || 0),
        name:      v7.longName || v7.shortName || yahooSym,
        exchange:  v7.fullExchangeName || '',
        currency:  inferCurrency(yahooSym, v7.currency),
        session:   parseSession(v7.marketState),
      })
    }

    return res.status(404).json({
      error: `No data found for "${symbol}". Please check the ticker symbol.`
    })

  } catch (err) {
    return res.status(500).json({ error: 'Price fetch error: ' + err.message })
  }
}
