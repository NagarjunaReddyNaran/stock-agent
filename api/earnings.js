// Major company tickers to filter for (US + Canada) — only show well-known names
const MAJOR_US = new Set([
  'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA','NFLX','AMD',
  'JPM','GS','MS','BAC','WFC','C','USB','BRK.B',
  'JNJ','PFE','ABBV','MRK','LLY','UNH','CVS','AMGN',
  'XOM','CVX','COP','SLB','EOG',
  'V','MA','PYPL','SQ','AXP',
  'WMT','TGT','COST','HD','LOW','AMZN',
  'BA','CAT','HON','GE','MMM','LMT','RTX','NOC',
  'DIS','CMCSA','NFLX','PARA','WBD',
  'T','VZ','TMUS',
  'ORCL','CRM','SAP','IBM','ADBE','INTC','QCOM','TXN','MU','AVGO',
  'UPS','FDX','DAL','AAL','UAL','LUV',
  'PG','KO','PEP','MCD','SBUX','YUM','CMG',
  'SHOP','SPOT','UBER','LYFT','ABNB','DASH',
  'COIN','HOOD','SOFI',
  'PLTR','SNOW','ZS','CRWD','PANW','NET',
])

const MAJOR_CA = new Set([
  'SHOP.TO','RY.TO','TD.TO','BNS.TO','BMO.TO','CM.TO','MFC.TO','SLF.TO',
  'CNR.TO','CP.TO','BCE.TO','T.TO','ENB.TO','TRP.TO','SU.TO','CNQ.TO',
  'ABX.TO','WPM.TO','K.TO','AEM.TO',
  'ATD.TO','L.TO','MRU.TO','DOL.TO',
])

function getWeekRange() {
  const now   = new Date()
  const day   = now.getDay() // 0=Sun
  // Start from Monday of current week
  const mon   = new Date(now)
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  // End on Friday
  const fri   = new Date(mon)
  fri.setDate(mon.getDate() + 4)

  const fmt = d => d.toISOString().split('T')[0]
  return { from: fmt(mon), to: fmt(fri) }
}

function isMajor(symbol) {
  if (!symbol) return false
  const up = symbol.toUpperCase()
  if (MAJOR_US.has(up)) return true
  if (MAJOR_CA.has(up)) return true
  // Also include if it's a known CA or IN stock (suffix)
  if (up.endsWith('.TO') && symbol.length <= 8) return true
  return false
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
}

function getEarningsTime(hour) {
  if (!hour && hour !== 0) return 'TBD'
  if (hour < 9)  return 'Pre-Market'
  if (hour >= 16) return 'After-Hours'
  return 'During Market'
}

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured.' })

  try {
    const { from, to } = getWeekRange()

    const [usRes, caRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${apiKey}&international=true`),
    ])

    const usData = usRes.ok ? await usRes.json() : { earningsCalendar: [] }
    const caData = caRes.ok ? await caRes.json() : { earningsCalendar: [] }

    // Merge and deduplicate
    const allEarnings = [
      ...(usData.earningsCalendar || []),
      ...(caData.earningsCalendar || []),
    ]

    const seen = new Set()
    const earnings = allEarnings
      .filter(e => {
        if (!e.symbol || seen.has(e.symbol)) return false
        if (!isMajor(e.symbol)) return false
        seen.add(e.symbol)
        return true
      })
      .map(e => ({
        ticker:       e.symbol,
        name:         e.name || e.symbol,
        date:         e.date,
        dateFormatted:formatDate(e.date),
        hour:         e.hour !== undefined ? e.hour : null,
        time:         getEarningsTime(e.hour),
        epsEstimate:  e.epsEstimate || null,
        revenueEstimate: e.revenueEstimate || null,
        quarter:      e.quarter || null,
        year:         e.year || null,
      }))
      .sort((a, b) => {
        // Sort by date, then alphabetical
        if (a.date < b.date) return -1
        if (a.date > b.date) return 1
        return a.ticker.localeCompare(b.ticker)
      })

    return res.status(200).json({
      earnings,
      week: { from, to },
      count: earnings.length,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Earnings fetch error: ' + err.message })
  }
}
