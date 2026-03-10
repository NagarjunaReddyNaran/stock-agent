import React, { useState, useEffect, useRef, useCallback } from 'react'

const SYSTEM_PROMPT = `You are an AI Stock Market Trading Agent responsible for analyzing financial markets and making buy, sell, or hold decisions for stocks.

Your decisions must be based on data-driven analysis, market news, financial metrics, analyst sentiment, and macroeconomic conditions. Your objective is to maximize long-term portfolio returns while minimizing risk.

DATA SOURCES TO MONITOR:
- Breaking financial news (Bloomberg, Reuters, CNBC, WSJ, Financial Times)
- Analyst upgrades/downgrades, target price revisions, institutional buying/selling
- Financial metrics: P/E, Forward P/E, PEG, Price to Book, EV/EBITDA, Revenue/Earnings growth, FCF, Debt/Equity, ROE, ROIC
- Technical indicators: 50/200-day MA, RSI, MACD, Volume, Support/Resistance, Breakouts
- Market sentiment: news, social media, options flow, institutional activity
- Macro factors: interest rates, CPI, GDP, unemployment, Fed policy, bond yields

RISK MANAGEMENT:
- Never allocate more than 5-10% to a single stock
- Always use stop loss (5-8%) and take profit targets
- Avoid extreme volatility unless strong catalysts exist
- Never decide on a single signal - confirm with at least 3 independent signals

TRADE RULES:
- BUY when: positive catalyst + analyst upgrade + strong fundamentals + technical uptrend + institutional buying
- SELL when: negative news + downgrade + deteriorating fundamentals + trend reversal + stop-loss hit

PORTFOLIO BALANCE across: technology, healthcare, energy, financials, consumer goods, industrials

IMPORTANT: You will be given the LIVE current price. Base ALL price targets on it exactly.
- Entry price = current price (for BUY)
- Stop loss = 5-8% below entry for BUY
- Target price = realistic upside: 10-25% medium-term, 5-15% short-term

OUTPUT - return ONLY a raw JSON object. No markdown, no backticks, no text before or after:
{
  "ticker": "SYMBOL",
  "companyName": "Full Company Name",
  "decision": "BUY",
  "confidence": "High",
  "riskLevel": "Low",
  "entryPrice": 150.00,
  "stopLoss": 139.50,
  "targetPrice": 172.50,
  "reasoning": "Detailed paragraph explaining the decision",
  "signals": {
    "newsCatalyst": "Description",
    "analystSentiment": "Description",
    "financialMetrics": "Description",
    "technicalIndicators": "Description",
    "institutionalActivity": "Description"
  },
  "sectorAllocation": "Technology",
  "keyRisks": ["risk1", "risk2", "risk3"],
  "timeHorizon": "Medium-term (months)"
}`

const POPULAR = ['AAPL','NVDA','MSFT','GOOGL','AMZN','TSLA','META','JPM','JNJ','XOM','V','UNH','NFLX','AMD','WMT']

const DC = {
  BUY:  { bg:'rgba(0,255,144,0.08)', border:'#00ff90', text:'#00ff90', glow:'0 0 28px rgba(0,255,144,0.27)' },
  SELL: { bg:'rgba(255,0,56,0.08)',  border:'#ff4060', text:'#ff4060', glow:'0 0 28px rgba(255,0,56,0.27)' },
  HOLD: { bg:'rgba(255,215,0,0.08)', border:'#ffd700', text:'#ffd700', glow:'0 0 28px rgba(255,215,0,0.27)' },
}
const RC = { Low:'#00ff90', Medium:'#ffd700', High:'#ff4060' }

function fmt(n) {
  if (n == null || isNaN(Number(n))) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
}
function pctDiff(a, b) {
  if (!b || !a || isNaN(a) || isNaN(b)) return null
  return (((a - b) / b) * 100).toFixed(2)
}

// ── API calls (server-side proxied) ──────────────────────────────────────────
async function fetchPrice(symbol) {
  const res = await fetch(`/api/price?symbol=${encodeURIComponent(symbol)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Price fetch failed`)
  return data
}

async function searchTickers(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
  const data = await res.json()
  if (!res.ok) return []
  return data.results || []
}

// ── Small components ──────────────────────────────────────────────────────────
function Dot({ color = '#00ff90', pulse = false }) {
  return (
    <span style={{
      display:'inline-block', width:7, height:7, borderRadius:'50%',
      background:color, boxShadow:`0 0 8px ${color}`, flexShrink:0,
      animation: pulse ? 'blink 1.8s infinite' : 'none',
    }} />
  )
}

function PBox({ label, value, color, sub }) {
  return (
    <div style={{ background:'#060e06', border:'1px solid #1e2a1e', borderRadius:6, padding:'11px 14px', flex:1, minWidth:110 }}>
      <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, color:color||'#e0ffe0', fontFamily:"'Space Mono',monospace" }}>{value||'—'}</div>
      {sub && <div style={{ fontSize:9, color:'#2a4a2a', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function StepLoader({ ticker }) {
  const steps = ['FETCHING LIVE PRICE','SCANNING SIGNALS','EVALUATING FUNDAMENTALS','COMPUTING RISK','GENERATING RECOMMENDATION']
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 850)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ background:'#060e06', border:'1px solid #0a2a0a', borderRadius:8, padding:32, textAlign:'center', marginBottom:16 }}>
      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:'#00ff90', letterSpacing:'3px', marginBottom:20 }}>
        ANALYZING {ticker}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10, maxWidth:300, margin:'0 auto', textAlign:'left' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:6, height:6, borderRadius:'50%', flexShrink:0,
              background: i < step ? '#00ff90' : i === step ? '#ffd700' : '#1e2a1e',
              boxShadow: i === step ? '0 0 8px #ffd700' : 'none',
            }} />
            <span style={{ fontSize:10, letterSpacing:'1px', color: i < step ? '#2a4a2a' : i === step ? '#ffd700' : '#1e2a1e' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Autocomplete search box ───────────────────────────────────────────────────
function SearchBox({ onSelect, disabled }) {
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching,   setSearching]   = useState(false)
  const [focused,     setFocused]     = useState(false)
  const [highlight,   setHighlight]   = useState(-1)
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)
  const dropRef     = useRef(null)

  // debounced search after 3 chars
  useEffect(() => {
    if (query.length < 3) { setSuggestions([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const results = await searchTickers(query)
      setSuggestions(results)
      setSearching(false)
      setHighlight(-1)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  // close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setSuggestions([])
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pick(item) {
    setQuery(item.symbol)
    setSuggestions([])
    setFocused(false)
    onSelect(item.symbol)
    inputRef.current?.blur()
  }

  function onKeyDown(e) {
    if (!suggestions.length) {
      if (e.key === 'Enter' && query.trim()) onSelect(query.trim().toUpperCase())
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (highlight >= 0) pick(suggestions[highlight]); else onSelect(query.trim().toUpperCase()) }
    if (e.key === 'Escape')    { setSuggestions([]); setFocused(false) }
  }

  const showDrop = focused && (suggestions.length > 0 || (searching && query.length >= 3))

  return (
    <div style={{ position:'relative', flex:1 }}>
      <div style={{ position:'relative' }}>
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="SEARCH TICKER OR COMPANY NAME — e.g. TSLA, Apple, Nvidia..."
          style={{
            width:'100%', background:'#020802', border:'1px solid #1a2a1a', borderRadius:4,
            padding:'10px 40px 10px 13px', color:'#00ff90', fontSize:12, letterSpacing:'1px',
            fontFamily:"'Space Mono',monospace", transition:'border-color .15s',
          }}
        />
        {/* Search icon / spinner */}
        <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'#2a4a2a' }}>
          {searching ? '⟳' : '⌕'}
        </div>
      </div>

      {/* Dropdown */}
      {showDrop && (
        <div ref={dropRef} style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:100,
          background:'#060e06', border:'1px solid #1e2a1e', borderRadius:6,
          overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {searching && (
            <div style={{ padding:'10px 14px', fontSize:10, color:'#2a4a2a', letterSpacing:'2px' }}>SEARCHING...</div>
          )}
          {!searching && suggestions.map((s, i) => (
            <div key={s.symbol}
              onMouseDown={() => pick(s)}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:12,
                background: i === highlight ? 'rgba(0,255,144,0.07)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid #0a1a0a' : 'none',
                transition:'background .1s',
              }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#00ff90', fontFamily:"'Space Mono',monospace", minWidth:60 }}>{s.symbol}</span>
              <span style={{ fontSize:11, color:'#4a6a4a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
            </div>
          ))}
          {!searching && query.length >= 3 && suggestions.length === 0 && (
            <div style={{ padding:'10px 14px', fontSize:10, color:'#2a4a2a', letterSpacing:'1px' }}>No results for "{query}"</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [sym,         setSym]         = useState('')
  const [context,     setContext]     = useState('')
  const [liveData,    setLiveData]    = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError,   setLiveError]   = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState(null)
  const [history,     setHistory]     = useState([])
  const [time,        setTime]        = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // fetch live price whenever sym changes
  useEffect(() => {
    if (!sym) { setLiveData(null); setLiveError(null); return }
    let cancelled = false
    setLiveLoading(true); setLiveError(null); setLiveData(null)
    fetchPrice(sym)
      .then(d  => { if (!cancelled) { setLiveData(d);  setLiveLoading(false) } })
      .catch(e  => { if (!cancelled) { setLiveError(e.message); setLiveLoading(false) } })
    return () => { cancelled = true }
  }, [sym])

  function selectSym(s) {
    const v = s.toUpperCase().trim()
    setSym(v); setResult(null); setError(null)
  }

  async function analyze() {
    if (!sym) return
    setLoading(true); setError(null); setResult(null)

    // refresh price right before analysis
    let live = liveData
    if (!live) {
      try { live = await fetchPrice(sym); setLiveData(live) } catch (_) {}
    }

    const priceBlock = live
      ? `LIVE MARKET DATA:
- Current Price: $${live.price}
- Change: ${live.change >= 0 ? '+' : ''}${live.change} (${live.changePct}%)
- Range: $${live.low} - $${live.high}
- Open: $${live.open} | Prev Close: $${live.prevClose}
- Company: ${live.name}
USE $${live.price} as the EXACT basis for all price calculations.`
      : `Live price unavailable. Use your best knowledge of ${sym} current price range.`

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          userMessage: `${priceBlock}\n\nAnalyze ${sym} stock. ${context ? 'Context: ' + context : ''}\nReturn ONLY the JSON object, nothing else.`,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `API error ${res.status}`)
      }

      const data = await res.json()
      const txt  = (data.text || '').trim()
      const stripped = txt.replace(/```json/gi, '').replace(/```/g, '').trim()
      const match = stripped.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in response. Raw: ' + txt.slice(0, 120))
      const parsed = JSON.parse(match[0])
      const rec = { ...parsed, livePrice: live?.price ?? null, ts: new Date().toISOString() }
      setResult(rec)
      setHistory(h => [rec, ...h.slice(0, 9)])
    } catch (e) {
      setError('Analysis failed: ' + e.message)
    }
    setLoading(false)
  }

  const dc       = result ? (DC[result.decision] || DC.HOLD) : null
  const upside   = result?.livePrice && result?.targetPrice ? pctDiff(result.targetPrice, result.livePrice) : null
  const downside = result?.livePrice && result?.stopLoss    ? pctDiff(result.stopLoss, result.livePrice)    : null
  const rr       = upside && downside && parseFloat(downside) !== 0
    ? (Math.abs(parseFloat(upside)) / Math.abs(parseFloat(downside))).toFixed(2) : null

  return (
    <div style={{ background:'#020802', minHeight:'100vh', fontFamily:"'Space Mono',monospace", color:'#e0ffe0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Orbitron:wght@400;700;900&display=swap');
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:#020802; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#020802} ::-webkit-scrollbar-thumb{background:#1e3a1e;border-radius:2px}
        input,button { font-family:'Space Mono',monospace; }
        input::placeholder { color:#1a2a1a; }
        input:focus { outline:none; border-color:#00ff90 !important; }
        .chip { transition:all .15s; cursor:pointer; }
        .chip:hover { border-color:rgba(0,255,144,0.5)!important; color:#00ff90!important; }
        .abtn { transition:all .2s; }
        .abtn:hover:not(:disabled) { background:#00ff90!important; color:#020802!important; cursor:pointer; }
        .abtn:disabled { opacity:.3; cursor:not-allowed; }
        .hbadge { transition:background .15s; cursor:pointer; }
        .hbadge:hover { background:rgba(0,255,144,0.08)!important; }
      `}</style>

      {/* BG grid */}
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none',
        backgroundImage:'linear-gradient(rgba(0,255,144,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,144,.018) 1px,transparent 1px)',
        backgroundSize:'44px 44px' }} />

      {/* ── HEADER ── */}
      <div style={{ borderBottom:'1px solid #0a1a0a', padding:'13px 28px', display:'flex', alignItems:'center',
        justifyContent:'space-between', position:'sticky', top:0, zIndex:20,
        background:'rgba(2,8,2,0.96)', backdropFilter:'blur(6px)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Dot pulse />
          <span style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:900, letterSpacing:'4px', color:'#00ff90' }}>ALGO·TRADE·AI</span>
          <span style={{ fontSize:9, color:'#00ff90', border:'1px solid rgba(0,255,144,.2)', padding:'2px 8px', borderRadius:3, background:'rgba(0,255,144,.05)', letterSpacing:'1px' }}>LIVE DATA</span>
        </div>
        <div style={{ fontSize:10, color:'#1e3a1e', fontFamily:"'Orbitron',monospace", letterSpacing:'2px' }}>
          {time.toLocaleTimeString('en-US', { hour12:false })} EST
        </div>
      </div>

      <div style={{ position:'relative', zIndex:10, padding:'20px 24px', maxWidth:1160, margin:'0 auto' }}>

        {/* ── TERMINAL ── */}
        <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:'18px 20px', marginBottom:14 }}>
          <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ STOCK ANALYSIS TERMINAL</div>

          {/* Popular chips */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
            {POPULAR.map(t => (
              <button key={t} className="chip"
                onClick={() => selectSym(t)}
                style={{
                  background: sym === t ? 'rgba(0,255,144,.07)' : 'transparent',
                  border: `1px solid ${sym === t ? '#00ff90' : '#1a2a1a'}`,
                  color: sym === t ? '#00ff90' : '#3a5a3a',
                  padding:'3px 10px', borderRadius:3, fontSize:11,
                  fontWeight: sym === t ? 700 : 400, letterSpacing:'1px',
                }}>{t}</button>
            ))}
          </div>

          {/* Search + Analyze */}
          <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
              <SearchBox onSelect={selectSym} disabled={loading} />
              <input value={context} onChange={e => setContext(e.target.value)}
                placeholder="Optional context — e.g. earnings beat, Fed held rates, tariff news..."
                style={{ background:'#020802', border:'1px solid #0a1a0a', borderRadius:4,
                  padding:'8px 13px', color:'#4a6a4a', fontSize:11, width:'100%' }} />
            </div>
            <button className="abtn" onClick={analyze} disabled={loading || !sym}
              style={{ background:'transparent', border:'1px solid #00ff90', color:'#00ff90',
                padding:'10px 24px', borderRadius:4, fontSize:12, fontWeight:700, letterSpacing:'2px' }}>
              {loading ? '···' : 'ANALYZE ▸'}
            </button>
          </div>

          {/* Selected symbol badge */}
          {sym && (
            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px' }}>SELECTED:</span>
              <span style={{ fontSize:12, fontWeight:700, color:'#00ff90', fontFamily:"'Orbitron',monospace" }}>{sym}</span>
              {liveData && <span style={{ fontSize:10, color:'#4a6a4a' }}>· {liveData.name}</span>}
              <button onClick={() => { setSym(''); setLiveData(null); setResult(null); setError(null) }}
                style={{ marginLeft:'auto', background:'transparent', border:'1px solid #1a2a1a', color:'#2a4a2a',
                  padding:'2px 8px', borderRadius:3, fontSize:9, cursor:'pointer' }}>CLEAR ✕</button>
            </div>
          )}
        </div>

        {/* ── LIVE PRICE BAR ── */}
        {sym && (
          <div style={{ marginBottom:14 }}>
            {liveLoading && (
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:'12px 20px', display:'flex', gap:10, alignItems:'center' }}>
                <Dot color="#ffd700" pulse />
                <span style={{ fontSize:10, color:'#ffd700', letterSpacing:'2px' }}>FETCHING LIVE PRICE · {sym}...</span>
              </div>
            )}
            {liveError && !liveLoading && (
              <div style={{ background:'rgba(255,0,56,.05)', border:'1px solid rgba(255,0,56,.2)', borderRadius:8, padding:'10px 18px', fontSize:10, color:'#ff4060' }}>
                ⚠ {liveError}
              </div>
            )}
            {liveData && !liveLoading && (() => {
              const up = liveData.change >= 0
              return (
                <div style={{ background:'#060e06', border:`1px solid ${up ? 'rgba(0,255,144,.15)' : 'rgba(255,64,96,.15)'}`,
                  borderRadius:8, padding:'14px 20px', display:'flex', alignItems:'center',
                  justifyContent:'space-between', flexWrap:'wrap', gap:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <Dot pulse />
                    <div>
                      <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:3 }}>
                        LIVE PRICE · {liveData.name}{liveData.exchange ? ` · ${liveData.exchange}` : ''}
                      </div>
                      <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
                        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:26, fontWeight:900, color:'#e0ffe0' }}>
                          {fmt(liveData.price)}
                        </span>
                        <span style={{ fontSize:13, fontWeight:700, color: up ? '#00ff90' : '#ff4060' }}>
                          {up ? '▲' : '▼'} {up?'+':''}{liveData.change} ({up?'+':''}{liveData.changePct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                    {[['OPEN',fmt(liveData.open)],['HIGH',fmt(liveData.high),'rgba(0,255,144,.55)'],
                      ['LOW',fmt(liveData.low),'rgba(255,64,96,.55)'],['PREV CLOSE',fmt(liveData.prevClose)]].map(([l,v,c])=>(
                      <div key={l}>
                        <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'1px', marginBottom:2 }}>{l}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:c||'#6a8a6a', fontFamily:"'Space Mono',monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── LOADER ── */}
        {loading && <StepLoader ticker={sym} />}

        {/* ── ERROR ── */}
        {error && !loading && (
          <div style={{ background:'rgba(255,0,56,.05)', border:'1px solid rgba(255,0,56,.2)', borderRadius:8, padding:'12px 18px', marginBottom:14, color:'#ff4060', fontSize:11 }}>
            ⚠ {error}
          </div>
        )}

        {/* ══════════════════════════════════
            RESULT
        ══════════════════════════════════ */}
        {result && !loading && dc && (
          <div style={{ animation:'fadeIn .4s ease' }}>

            {result.livePrice && (
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:10, color:'rgba(0,255,144,.35)', marginBottom:10 }}>
                <Dot /> ANALYSIS BASED ON LIVE PRICE {fmt(result.livePrice)} · {new Date(result.ts).toLocaleTimeString()}
              </div>
            )}

            {/* Decision banner */}
            <div style={{ background:dc.bg, border:`1px solid ${dc.border}`, borderRadius:8, padding:'18px 24px', marginBottom:12,
              display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:dc.glow, flexWrap:'wrap', gap:14 }}>
              <div>
                <div style={{ fontSize:9, color:dc.text, letterSpacing:'3px', marginBottom:4, opacity:.6 }}>TRADING SIGNAL</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
                  <span style={{ fontFamily:"'Orbitron',monospace", fontSize:34, fontWeight:900, color:dc.text }}>{result.decision}</span>
                  <span style={{ fontSize:20, color:'#e0ffe0', fontWeight:700 }}>{result.ticker}</span>
                  <span style={{ fontSize:12, color:'#4a6a4a' }}>{result.companyName}</span>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:4 }}>CONFIDENCE</div>
                <div style={{ fontSize:19, fontWeight:700, color:dc.text, fontFamily:"'Orbitron',monospace" }}>
                  {(result.confidence||'').toUpperCase()}
                </div>
                <div style={{ display:'flex', gap:4, justifyContent:'flex-end', marginTop:5 }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:26, height:4, borderRadius:2,
                      background: i<(result.confidence==='High'?3:result.confidence==='Medium'?2:1) ? dc.text : '#0a1a0a' }} />
                  ))}
                </div>
                <div style={{ fontSize:9, color:'#2a4a2a', marginTop:5 }}>{result.timeHorizon}</div>
              </div>
            </div>

            {/* Price boxes */}
            <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
              <PBox label="LIVE PRICE"   value={fmt(result.livePrice)}   color="#e0ffe0" sub="real-time" />
              <PBox label="ENTRY PRICE"  value={fmt(result.entryPrice)}  color="#aaffcc"
                sub={result.livePrice&&result.entryPrice ? `${Number(pctDiff(result.entryPrice,result.livePrice))>0?'+':''}${pctDiff(result.entryPrice,result.livePrice)}% from live` : null} />
              <PBox label="STOP LOSS"    value={fmt(result.stopLoss)}    color="#ff4060" sub={downside?`${downside}% downside`:null} />
              <PBox label="TARGET PRICE" value={fmt(result.targetPrice)} color="#00ff90" sub={upside?`+${upside}% upside`:null} />
              <div style={{ background:'#060e06', border:'1px solid #1e2a1e', borderRadius:6, padding:'11px 14px', flex:1, minWidth:110 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:5 }}>RISK LEVEL</div>
                <div style={{ fontSize:18, fontWeight:700, color:RC[result.riskLevel]||'#ffd700', fontFamily:"'Space Mono',monospace" }}>
                  {(result.riskLevel||'').toUpperCase()}
                </div>
                <div style={{ fontSize:9, color:'#1e3a1e', marginTop:3 }}>MAX 5-10% allocation</div>
              </div>
            </div>

            {/* R/R row */}
            {upside && downside && rr && (
              <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
                {[
                  ['UPSIDE POTENTIAL',`+${upside}%`,'#00ff90','rgba(0,255,144,.04)','rgba(0,255,144,.14)'],
                  ['MAX DOWNSIDE',`${downside}%`,'#ff4060','rgba(255,0,56,.04)','rgba(255,0,56,.14)'],
                  ['RISK / REWARD',`${rr}x`,'#ffd700','rgba(255,215,0,.04)','rgba(255,215,0,.14)'],
                ].map(([l,v,c,bg,bd])=>(
                  <div key={l} style={{ background:bg, border:`1px solid ${bd}`, borderRadius:6, padding:'10px 18px', flex:1, minWidth:130 }}>
                    <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:c, fontFamily:"'Orbitron',monospace" }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Reasoning + Signals */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12, marginBottom:12 }}>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ ANALYSIS REASONING</div>
                <p style={{ fontSize:12, color:'#6a8a6a', lineHeight:1.85 }}>{result.reasoning}</p>
              </div>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ KEY SIGNALS</div>
                {result.signals && Object.entries({
                  'News Catalyst':result.signals.newsCatalyst,
                  'Analyst Sentiment':result.signals.analystSentiment,
                  'Financial Metrics':result.signals.financialMetrics,
                  'Technical Indicators':result.signals.technicalIndicators,
                  'Institutional Activity':result.signals.institutionalActivity,
                }).map(([k,v]) => v ? (
                  <div key={k} style={{ marginBottom:11 }}>
                    <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:3 }}>{k.toUpperCase()}</div>
                    <div style={{ fontSize:11, color:'#6a8a6a', lineHeight:1.6 }}>{String(v)}</div>
                  </div>
                ) : null)}
              </div>
            </div>

            {/* Risks + Steps */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginBottom:16 }}>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ KEY RISKS</div>
                {Array.isArray(result.keyRisks) && result.keyRisks.map((r,i)=>(
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:9 }}>
                    <span style={{ color:'#ff4060', fontSize:9, marginTop:2, flexShrink:0 }}>▸</span>
                    <span style={{ fontSize:11, color:'#6a4a4a', lineHeight:1.5 }}>{r}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ TRADING STEPS</div>
                {[
                  `1. Verify ${fmt(result.livePrice||result.entryPrice)} in your broker`,
                  `2. Set stop loss: ${fmt(result.stopLoss)}`,
                  `3. Enter near: ${fmt(result.entryPrice)}`,
                  `4. Target: ${fmt(result.targetPrice)}`,
                  '5. Monitor news daily',
                ].map((s,i)=>(
                  <div key={i} style={{ fontSize:11, color:'#3a5a3a', marginBottom:8, lineHeight:1.5 }}>{s}</div>
                ))}
                <div style={{ fontSize:9, color:'#1e3a1e', marginTop:10, letterSpacing:'1px' }}>SECTOR: {result.sectorAllocation}</div>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:9, color:'#1e3a1e', letterSpacing:'3px', marginBottom:10 }}>▸ SESSION HISTORY</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {history.map((h,i)=>{
                const c = DC[h.decision]||DC.HOLD
                return (
                  <div key={i} className="hbadge" onClick={()=>setResult(h)}
                    style={{ background:c.bg, border:`1px solid ${c.border}20`, borderRadius:4, padding:'6px 12px', display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#e0ffe0' }}>{h.ticker}</span>
                    {h.livePrice!=null && <span style={{ fontSize:10, color:'#4a6a4a' }}>{fmt(h.livePrice)}</span>}
                    <span style={{ fontSize:10, color:c.text, fontWeight:700 }}>{h.decision}</span>
                    <span style={{ fontSize:9, color:'#2a4a2a' }}>{new Date(h.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && !sym && (
          <div style={{ textAlign:'center', padding:56, border:'1px dashed #0a1a0a', borderRadius:8 }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:34, color:'#0a1a0a', marginBottom:10 }}>◈</div>
            <div style={{ fontSize:10, color:'#1e3a1e', letterSpacing:'3px' }}>
              SEARCH A STOCK OR SELECT FROM POPULAR TICKERS ABOVE
            </div>
          </div>
        )}

        <div style={{ marginTop:28, fontSize:9, color:'#0a1a0a', letterSpacing:'1px', textAlign:'center', lineHeight:1.8 }}>
          DISCLAIMER: FOR EDUCATIONAL PURPOSES ONLY · NOT FINANCIAL ADVICE · ALL TRADING CARRIES RISK
        </div>
      </div>
    </div>
  )
}
