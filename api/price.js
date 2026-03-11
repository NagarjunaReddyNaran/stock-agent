// ── Market session from Yahoo's own marketState field ─────────────────────────
function parseSession(marketState) {
  if (!marketState) return 'CLOSED'
  const s = marketState.toUpperCase()
  if (s === 'REGULAR')                    return 'REGULAR'
  if (s === 'PRE'  || s === 'PREPRE')     return 'PRE_MARKET'
  if (s === 'POST' || s === 'POSTPOST')   return 'POST_MARKET'
  return 'CLOSED'
}

function round2(n) { return n != null ? parseFloat(Number(n).toFixed(2)) : null }

// ── Fetch from Yahoo Finance v8 chart (most reliable, works on Vercel) ─────────
async function yahooChart(symbol) {
  try {
    // includePrePost=true returns pre/post market data in meta
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=1d&includePrePost=true&events=div%2Csplit`

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return null

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta || {}
    return meta
  } catch {
    return null
  }
}

// ── Convert user-typed symbols to Yahoo Finance format ────────────────────────
// User types: RELIANCE.NS, TCS.BO, SHOP.TO, AAPL
// Yahoo uses: RELIANCE.NS, TCS.BO, SHOP.TO, AAPL — same! ✓
function toYahoo(symbol) {
  // Finnhub-style prefixes → Yahoo suffix format
  if (symbol.startsWith('NSE:')) return symbol.slice(4) + '.NS'
  if (symbol.startsWith('BSE:')) return symbol.slice(4) + '.BO'
  return symbol
}

// ── Currency by exchange ──────────────────────────────────────────────────────
function inferCurrency(symbol, metaCurrency) {
  if (metaCurrency) return metaCurrency
  if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) return 'INR'
  if (symbol.endsWith('.TO')) return 'CAD'
  return 'USD'
}

// ── Main handler ──────────────────────────────────────────────────────────────
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

  const yahooSym = toYahoo(symbol.toUpperCase().trim())

  try {
    const meta = await yahooChart(yahooSym)

    if (!meta || !meta.regularMarketPrice) {
      return res.status(404).json({
        error: `No price data found for "${symbol}". Check the ticker and try again.`
      })
    }

    const rmp = meta.regularMarketPrice
    const rpc = meta.chartPreviousClose || meta.previousClose || rmp
    const chg = round2(rmp - rpc)
    const chgPct = rpc ? round2((rmp - rpc) / rpc * 100) : 0

    const session = parseSession(meta.marketState)

    // Pre-market
    const prePx  = meta.preMarketPrice  || null
    const preChg = prePx ? round2(prePx - rpc) : null
    const prePct = prePx && rpc ? round2((prePx - rpc) / rpc * 100) : null

    // Post-market (after-hours)
    const postPx  = meta.postMarketPrice  || null
    const postChg = postPx ? round2(postPx - rmp) : null
    const postPct = postPx && rmp ? round2((postPx - rmp) / rmp * 100) : null

    return res.status(200).json({
      price:     round2(rmp),
      open:      round2(meta.regularMarketOpen      || rmp),
      high:      round2(meta.regularMarketDayHigh   || rmp),
      low:       round2(meta.regularMarketDayLow    || rmp),
      prevClose: round2(rpc),
      change:    chg,
      changePct: chgPct,
      name:      meta.longName || meta.shortName || yahooSym,
      exchange:  meta.fullExchangeName || meta.exchangeName || '',
      currency:  inferCurrency(yahooSym, meta.currency),
      session,
      // Pre-market
      preMarketPrice:     round2(prePx),
      preMarketChange:    preChg,
      preMarketChangePct: prePct,
      // After-hours
      postMarketPrice:     round2(postPx),
      postMarketChange:    postChg,
      postMarketChangePct: postPct,
    })

  } catch (err) {
    return res.status(500).json({ error: 'Price fetch error: ' + err.message })
  }
}
