import React, { useState, useEffect } from 'react'

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

OUTPUT - return ONLY a raw JSON object. Absolutely no markdown, no backticks, no text before or after the JSON:
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

const TICKERS = ['AAPL','NVDA','MSFT','GOOGL','AMZN','TSLA','META','JPM','JNJ','XOM','V','UNH','NFLX','AMD','WMT']
const LS_KEY = 'algo_trade_finnhub_key'

const DC = {
  BUY:  { bg:'rgba(0,255,144,0.08)', border:'#00ff90', text:'#00ff90', glow:'0 0 28px rgba(0,255,144,0.27)' },
  SELL: { bg:'rgba(255,0,56,0.08)',  border:'#ff4060', text:'#ff4060', glow:'0 0 28px rgba(255,0,56,0.27)' },
  HOLD: { bg:'rgba(255,215,0,0.08)', border:'#ffd700', text:'#ffd700', glow:'0 0 28px rgba(255,215,0,0.27)' },
}
const RC = { Low:'#00ff90', Medium:'#ffd700', High:'#ff4060' }

function fmt(n) {
  if (n == null || n === undefined || isNaN(Number(n))) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pctDiff(a, b) {
  if (!b || !a || isNaN(a) || isNaN(b)) return null
  return (((a - b) / b) * 100).toFixed(2)
}

function loadKey() {
  try { return localStorage.getItem(LS_KEY) || '' } catch { return '' }
}
function persistKey(k) {
  try { if (k) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY) } catch {}
}

async function fetchFinnhub(symbol, apiKey) {
  const qRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`)
  if (!qRes.ok) throw new Error(`HTTP ${qRes.status}`)
  const q = await qRes.json()
  if (!q || !q.c || q.c === 0) throw new Error('No data')
  let name = symbol
  try {
    const pRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`)
    if (pRes.ok) { const p = await pRes.json(); if (p && p.name) name = p.name }
  } catch (_) {}
  return {
    price:     parseFloat(q.c.toFixed(2)),
    open:      parseFloat(q.o.toFixed(2)),
    high:      parseFloat(q.h.toFixed(2)),
    low:       parseFloat(q.l.toFixed(2)),
    prevClose: parseFloat(q.pc.toFixed(2)),
    change:    parseFloat((q.c - q.pc).toFixed(2)),
    changePct: parseFloat(((q.c - q.pc) / q.pc * 100).toFixed(2)),
    name,
  }
}

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
    const t = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 800)
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

export default function App() {
  const [apiKey,      setApiKey]      = useState(loadKey)
  const [keySaved,    setKeySaved]    = useState(() => !!loadKey())
  const [keyInput,    setKeyInput]    = useState('')
  const [ticker,      setTicker]      = useState('')
  const [custom,      setCustom]      = useState('')
  const [context,     setContext]     = useState('')
  const [liveData,    setLiveData]    = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError,   setLiveError]   = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState(null)
  const [rawResponse, setRawResponse] = useState(null)
  const [history,     setHistory]     = useState([])
  const [time,        setTime]        = useState(new Date())

  const sym = (custom || ticker).toUpperCase().trim()

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!sym || !keySaved || !apiKey) { setLiveData(null); return }
    let cancelled = false
    setLiveLoading(true); setLiveError(null); setLiveData(null)
    fetchFinnhub(sym, apiKey)
      .then(d => { if (!cancelled) { setLiveData(d); setLiveLoading(false) } })
      .catch(e => {
        if (!cancelled) {
          setLiveError(
            e.message.includes('401') || e.message.includes('403') ? 'Invalid API key.' :
            e.message === 'No data' ? `No data for "${sym}". Check the ticker.` :
            `Price fetch failed: ${e.message}`
          )
          setLiveLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [sym, apiKey, keySaved])

  function saveKey(k) {
    const v = k.trim()
    setApiKey(v); setKeySaved(!!v); persistKey(v)
    setLiveData(null); setLiveError(null)
  }

  async function analyze() {
    if (!sym) return
    setLoading(true); setError(null); setResult(null); setRawResponse(null)

    let live = liveData
    if (!live && keySaved && apiKey) {
      try { live = await fetchFinnhub(sym, apiKey); setLiveData(live) } catch (_) {}
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
      const txt = (data.text || '').trim()
      setRawResponse(txt)

      // strip any accidental markdown fences then extract JSON
      const stripped = txt.replace(/```json/gi, '').replace(/```/g, '').trim()
      const match = stripped.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON found in response')
      const parsed = JSON.parse(match[0])

      const rec = { ...parsed, livePrice: live?.price ?? null, ts: new Date().toISOString() }
      setResult(rec)
      setHistory(h => [rec, ...h.slice(0, 9)])
    } catch (e) {
      setError('Analysis failed: ' + e.message + (rawResponse ? ` | Raw: ${rawResponse.slice(0, 100)}` : ''))
    }
    setLoading(false)
  }

  const dc       = result ? (DC[result.decision] || DC.HOLD) : null
  const upside   = result?.livePrice && result?.targetPrice ? pctDiff(result.targetPrice, result.livePrice) : null
  const downside = result?.livePrice && result?.stopLoss    ? pctDiff(result.stopLoss,    result.livePrice) : null
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
        .chip:hover { border-color:rgba(0,255,144,0.5)!important; color:#00ff90!important; cursor:pointer; }
        .abtn:hover:not(:disabled) { background:#00ff90!important; color:#020802!important; cursor:pointer; }
        .abtn:disabled { opacity:.3; cursor:not-allowed; }
        .hbadge:hover { background:rgba(0,255,144,0.08)!important; cursor:pointer; }
      `}</style>

      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none',
        backgroundImage:'linear-gradient(rgba(0,255,144,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,144,.018) 1px,transparent 1px)',
        backgroundSize:'44px 44px' }} />

      {/* HEADER */}
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

        {/* API KEY */}
        <div style={{ background:'#060e06', border:'1px solid #0a2a1a', borderRadius:8, padding:'16px 20px', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: keySaved ? 0 : 12 }}>
            <Dot color={keySaved ? '#00ff90' : '#ffd700'} pulse={!keySaved} />
            <span style={{ fontSize:10, color: keySaved ? '#00ff90' : '#ffd700', letterSpacing:'2px' }}>
              {keySaved ? 'FINNHUB API · CONNECTED · KEY SAVED IN BROWSER' : 'FINNHUB API KEY REQUIRED FOR LIVE PRICES'}
            </span>
            {keySaved && (
              <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10, fontSize:10, color:'#2a4a2a' }}>
                {'•'.repeat(12)}{apiKey.slice(-4)}
                <button onClick={() => { saveKey(''); setKeyInput('') }}
                  style={{ background:'transparent', border:'1px solid #1e2a1e', color:'#2a4a2a', padding:'2px 10px', borderRadius:3, fontSize:9, cursor:'pointer' }}>
                  CHANGE
                </button>
              </span>
            )}
          </div>
          {!keySaved && (
            <>
              <div style={{ fontSize:11, color:'#3a5a3a', lineHeight:1.7, marginBottom:10 }}>
                Get a <strong style={{ color:'#00ff90' }}>free</strong> key at{' '}
                <a href="https://finnhub.io/register" target="_blank" rel="noreferrer"
                  style={{ color:'#00ff90', textDecoration:'none', borderBottom:'1px solid rgba(0,255,144,.3)' }}>
                  finnhub.io/register
                </a>
                {' '}— Sign up → copy key → paste below.{' '}
                <strong style={{ color:'#00ff90' }}>Saved permanently</strong> so you never enter it again.
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input value={keyInput} onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveKey(keyInput)}
                  placeholder="Paste Finnhub API key here..."
                  style={{ flex:1, background:'#020802', border:'1px solid #1e3a1e', borderRadius:4, padding:'9px 14px', color:'#00ff90', fontSize:12, letterSpacing:'1px' }} />
                <button onClick={() => saveKey(keyInput)}
                  style={{ background:'transparent', border:'1px solid #00ff90', color:'#00ff90', padding:'9px 20px', borderRadius:4, fontSize:11, fontWeight:700, letterSpacing:'1px', cursor:'pointer' }}>
                  SAVE PERMANENTLY
                </button>
              </div>
              <div style={{ fontSize:10, color:'#1e3a1e', marginTop:8 }}>Free · 60 calls/min · No credit card · Stored in localStorage</div>
            </>
          )}
        </div>

        {/* TICKER INPUT */}
        <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:'16px 20px', marginBottom:14 }}>
          <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ STOCK ANALYSIS TERMINAL</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
            {TICKERS.map(t => (
              <button key={t} className="chip"
                onClick={() => { setTicker(t); setCustom(''); setResult(null); setError(null) }}
                style={{
                  background: ticker === t && !custom ? 'rgba(0,255,144,.07)' : 'transparent',
                  border: `1px solid ${ticker === t && !custom ? '#00ff90' : '#1a2a1a'}`,
                  color: ticker === t && !custom ? '#00ff90' : '#3a5a3a',
                  padding:'3px 10px', borderRadius:3, fontSize:11,
                  fontWeight: ticker === t && !custom ? 700 : 400, letterSpacing:'1px',
                  transition:'all .15s',
                }}>{t}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:7 }}>
              <input value={custom}
                onChange={e => { setCustom(e.target.value.toUpperCase()); setTicker(''); setResult(null); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && analyze()}
                placeholder="OR TYPE ANY TICKER — PLTR, TSM, HOOD, COIN..."
                style={{ background:'#020802', border:'1px solid #1a2a1a', borderRadius:4, padding:'9px 13px', color:'#00ff90', fontSize:12, letterSpacing:'2px', width:'100%', transition:'border-color .15s' }} />
              <input value={context} onChange={e => setContext(e.target.value)}
                placeholder="Optional context — e.g. earnings beat, Fed held rates, sector rotation into tech..."
                style={{ background:'#020802', border:'1px solid #0a1a0a', borderRadius:4, padding:'8px 13px', color:'#4a6a4a', fontSize:11, width:'100%' }} />
            </div>
            <button className="abtn" onClick={analyze} disabled={loading || !sym}
              style={{ background:'transparent', border:'1px solid #00ff90', color:'#00ff90', padding:'9px 24px', borderRadius:4, fontSize:12, fontWeight:700, letterSpacing:'2px', transition:'all .2s' }}>
              {loading ? '···' : 'ANALYZE ▸'}
            </button>
          </div>
        </div>

        {/* LIVE PRICE BAR */}
        {sym && (
          <div style={{ marginBottom:14 }}>
            {liveLoading && (
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:'12px 20px', display:'flex', gap:10, alignItems:'center' }}>
                <Dot color="#ffd700" pulse /><span style={{ fontSize:10, color:'#ffd700', letterSpacing:'2px' }}>FETCHING LIVE PRICE · {sym}...</span>
              </div>
            )}
            {liveError && !liveLoading && (
              <div style={{ background:'rgba(255,0,56,.05)', border:'1px solid rgba(255,0,56,.2)', borderRadius:8, padding:'10px 18px', fontSize:10, color:'#ff4060' }}>⚠ {liveError}</div>
            )}
            {liveData && !liveLoading && (() => {
              const up = liveData.change >= 0
              return (
                <div style={{ background:'#060e06', border:`1px solid ${up ? 'rgba(0,255,144,.15)' : 'rgba(255,64,96,.15)'}`, borderRadius:8, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <Dot pulse />
                    <div>
                      <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:3 }}>LIVE PRICE · {liveData.name}</div>
                      <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
                        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:26, fontWeight:900, color:'#e0ffe0' }}>{fmt(liveData.price)}</span>
                        <span style={{ fontSize:13, fontWeight:700, color: up ? '#00ff90' : '#ff4060' }}>
                          {up ? '▲' : '▼'} {up ? '+' : ''}{liveData.change} ({up ? '+' : ''}{liveData.changePct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                    {[['OPEN',fmt(liveData.open)],['HIGH',fmt(liveData.high),'rgba(0,255,144,.55)'],['LOW',fmt(liveData.low),'rgba(255,64,96,.55)'],['PREV CLOSE',fmt(liveData.prevClose)]].map(([l,v,c]) => (
                      <div key={l}>
                        <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'1px', marginBottom:2 }}>{l}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:c||'#6a8a6a', fontFamily:"'Space Mono',monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            {!keySaved && (
              <div style={{ background:'rgba(255,215,0,.04)', border:'1px solid rgba(255,215,0,.12)', borderRadius:8, padding:'10px 18px', marginTop:8, fontSize:10, color:'#ffd700' }}>
                ⚠ No API key — enter your Finnhub key above for live prices. Analysis will still run with estimated prices.
              </div>
            )}
          </div>
        )}

        {/* LOADER */}
        {loading && <StepLoader ticker={sym} />}

        {/* ERROR */}
        {error && !loading && (
          <div style={{ background:'rgba(255,0,56,.05)', border:'1px solid rgba(255,0,56,.2)', borderRadius:8, padding:'12px 18px', marginBottom:14, color:'#ff4060', fontSize:11 }}>
            ⚠ {error}
          </div>
        )}

        {/* ════════ RESULT ════════ */}
        {result && !loading && dc && (
          <div style={{ animation:'fadeIn .4s ease' }}>

            {result.livePrice && (
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:10, color:'rgba(0,255,144,.35)', marginBottom:10 }}>
                <Dot /> ANALYSIS BASED ON LIVE PRICE {fmt(result.livePrice)} · {new Date(result.ts).toLocaleTimeString()}
              </div>
            )}

            {/* DECISION BANNER */}
            <div style={{ background:dc.bg, border:`1px solid ${dc.border}`, borderRadius:8, padding:'18px 24px', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:dc.glow, flexWrap:'wrap', gap:14 }}>
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
                <div style={{ fontSize:19, fontWeight:700, color:dc.text, fontFamily:"'Orbitron',monospace" }}>{(result.confidence||'').toUpperCase()}</div>
                <div style={{ display:'flex', gap:4, justifyContent:'flex-end', marginTop:5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:26, height:4, borderRadius:2, background: i < (result.confidence==='High'?3:result.confidence==='Medium'?2:1) ? dc.text : '#0a1a0a' }} />)}
                </div>
                <div style={{ fontSize:9, color:'#2a4a2a', marginTop:5 }}>{result.timeHorizon}</div>
              </div>
            </div>

            {/* PRICE BOXES */}
            <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
              <PBox label="LIVE PRICE"   value={fmt(result.livePrice)}   color="#e0ffe0" sub="real-time" />
              <PBox label="ENTRY PRICE"  value={fmt(result.entryPrice)}  color="#aaffcc"
                sub={result.livePrice && result.entryPrice ? `${Number(pctDiff(result.entryPrice,result.livePrice))>0?'+':''}${pctDiff(result.entryPrice,result.livePrice)}% from live` : null} />
              <PBox label="STOP LOSS"    value={fmt(result.stopLoss)}    color="#ff4060" sub={downside ? `${downside}% downside` : null} />
              <PBox label="TARGET PRICE" value={fmt(result.targetPrice)} color="#00ff90" sub={upside ? `+${upside}% upside` : null} />
              <div style={{ background:'#060e06', border:'1px solid #1e2a1e', borderRadius:6, padding:'11px 14px', flex:1, minWidth:110 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:5 }}>RISK LEVEL</div>
                <div style={{ fontSize:18, fontWeight:700, color:RC[result.riskLevel]||'#ffd700', fontFamily:"'Space Mono',monospace" }}>{(result.riskLevel||'').toUpperCase()}</div>
                <div style={{ fontSize:9, color:'#1e3a1e', marginTop:3 }}>MAX 5-10% allocation</div>
              </div>
            </div>

            {/* R/R */}
            {upside && downside && rr && (
              <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
                {[
                  ['UPSIDE POTENTIAL',`+${upside}%`,'#00ff90','rgba(0,255,144,.04)','rgba(0,255,144,.14)'],
                  ['MAX DOWNSIDE',`${downside}%`,'#ff4060','rgba(255,0,56,.04)','rgba(255,0,56,.14)'],
                  ['RISK / REWARD',`${rr}x`,'#ffd700','rgba(255,215,0,.04)','rgba(255,215,0,.14)'],
                ].map(([l,v,c,bg,bd]) => (
                  <div key={l} style={{ background:bg, border:`1px solid ${bd}`, borderRadius:6, padding:'10px 18px', flex:1, minWidth:130 }}>
                    <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:c, fontFamily:"'Orbitron',monospace" }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* REASONING + SIGNALS */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12, marginBottom:12 }}>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ ANALYSIS REASONING</div>
                <p style={{ fontSize:12, color:'#6a8a6a', lineHeight:1.85 }}>{result.reasoning}</p>
              </div>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ KEY SIGNALS</div>
                {result.signals && Object.entries({
                  'News Catalyst': result.signals.newsCatalyst,
                  'Analyst Sentiment': result.signals.analystSentiment,
                  'Financial Metrics': result.signals.financialMetrics,
                  'Technical Indicators': result.signals.technicalIndicators,
                  'Institutional Activity': result.signals.institutionalActivity,
                }).map(([k,v]) => v ? (
                  <div key={k} style={{ marginBottom:11 }}>
                    <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'2px', marginBottom:3 }}>{k.toUpperCase()}</div>
                    <div style={{ fontSize:11, color:'#6a8a6a', lineHeight:1.6 }}>{String(v)}</div>
                  </div>
                ) : null)}
              </div>
            </div>

            {/* RISKS + STEPS */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginBottom:16 }}>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ KEY RISKS</div>
                {Array.isArray(result.keyRisks) && result.keyRisks.map((r,i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:9 }}>
                    <span style={{ color:'#ff4060', fontSize:9, marginTop:2, flexShrink:0 }}>▸</span>
                    <span style={{ fontSize:11, color:'#6a4a4a', lineHeight:1.5 }}>{r}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'#060e06', border:'1px solid #0a1a0a', borderRadius:8, padding:18 }}>
                <div style={{ fontSize:9, color:'#2a4a2a', letterSpacing:'3px', marginBottom:12 }}>▸ TRADING STEPS</div>
                {[
                  `1. Verify ${fmt(result.livePrice || result.entryPrice)} in your broker`,
                  `2. Set stop loss: ${fmt(result.stopLoss)}`,
                  `3. Enter near: ${fmt(result.entryPrice)}`,
                  `4. Target: ${fmt(result.targetPrice)}`,
                  '5. Monitor news daily',
                ].map((s,i) => (
                  <div key={i} style={{ fontSize:11, color:'#3a5a3a', marginBottom:8, lineHeight:1.5 }}>{s}</div>
                ))}
                <div style={{ fontSize:9, color:'#1e3a1e', marginTop:10, letterSpacing:'1px' }}>SECTOR: {result.sectorAllocation}</div>
              </div>
            </div>

          </div>
        )}

        {/* HISTORY */}
        {history.length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:9, color:'#1e3a1e', letterSpacing:'3px', marginBottom:10 }}>▸ SESSION HISTORY</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {history.map((h,i) => {
                const c = DC[h.decision] || DC.HOLD
                return (
                  <div key={i} className="hbadge" onClick={() => setResult(h)}
                    style={{ background:c.bg, border:`1px solid ${c.border}20`, borderRadius:4, padding:'6px 12px', display:'flex', gap:8, alignItems:'center', transition:'background .15s' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#e0ffe0' }}>{h.ticker}</span>
                    {h.livePrice != null && <span style={{ fontSize:10, color:'#4a6a4a' }}>{fmt(h.livePrice)}</span>}
                    <span style={{ fontSize:10, color:c.text, fontWeight:700 }}>{h.decision}</span>
                    <span style={{ fontSize:9, color:'#2a4a2a' }}>{new Date(h.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!result && !loading && !error && !sym && (
          <div style={{ textAlign:'center', padding:56, border:'1px dashed #0a1a0a', borderRadius:8 }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:34, color:'#0a1a0a', marginBottom:10 }}>◈</div>
            <div style={{ fontSize:10, color:'#1e3a1e', letterSpacing:'3px' }}>
              {keySaved ? 'SELECT A TICKER · CLICK ANALYZE ▸' : 'ENTER FINNHUB API KEY · SELECT TICKER · ANALYZE'}
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
