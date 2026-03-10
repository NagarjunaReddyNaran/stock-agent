import React, { useState, useEffect, useRef } from 'react'

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an AI Stock Market Trading Agent responsible for analyzing financial markets and making buy, sell, or hold decisions for stocks.

Your decisions must be based on data-driven analysis, market news, financial metrics, analyst sentiment, and macroeconomic conditions. Your objective is to maximize long-term portfolio returns while minimizing risk.

DATA SOURCES: Bloomberg, Reuters, CNBC, WSJ; analyst upgrades/downgrades; P/E, Forward P/E, EV/EBITDA, Revenue growth, FCF, ROE, ROIC; 50/200-day MA, RSI, MACD, Volume; CPI, GDP, Fed policy, bond yields.

RISK MANAGEMENT: Max 5-10% per stock. Always use stop loss (5-8%) and take profit. Confirm with at least 3 independent signals.

BUY: positive catalyst + analyst upgrade + strong fundamentals + technical uptrend + institutional buying
SELL: negative news + downgrade + deteriorating fundamentals + trend reversal + stop-loss hit

IMPORTANT: You will be given the LIVE current price. Base ALL price targets on it exactly.
- Entry price = current price (for BUY)
- Stop loss = 5-8% below entry for BUY
- Target price = 10-25% upside medium-term, 5-15% short-term

OUTPUT - return ONLY raw JSON, no markdown, no backticks:
{"ticker":"SYMBOL","companyName":"Full Name","decision":"BUY","confidence":"High","riskLevel":"Low","entryPrice":150.00,"stopLoss":139.50,"targetPrice":172.50,"reasoning":"Detailed paragraph","signals":{"newsCatalyst":"...","analystSentiment":"...","financialMetrics":"...","technicalIndicators":"...","institutionalActivity":"..."},"sectorAllocation":"Technology","keyRisks":["risk1","risk2","risk3"],"timeHorizon":"Medium-term (months)"}`

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const POPULAR = ['AAPL','NVDA','MSFT','GOOGL','AMZN','TSLA','META','JPM','JNJ','XOM','V','UNH','NFLX','AMD','WMT']

const DECISION_STYLE = {
  BUY:  { bg:'rgba(16,185,129,0.1)', border:'rgba(16,185,129,0.4)', text:'#10b981', glow:'0 0 30px rgba(16,185,129,0.2)', badge:'#10b981' },
  SELL: { bg:'rgba(244,63,94,0.1)',  border:'rgba(244,63,94,0.4)',  text:'#f43f5e', glow:'0 0 30px rgba(244,63,94,0.2)',  badge:'#f43f5e' },
  HOLD: { bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.4)', text:'#f59e0b', glow:'0 0 30px rgba(245,158,11,0.2)', badge:'#f59e0b' },
}
const RISK_COLOR = { Low:'#10b981', Medium:'#f59e0b', High:'#f43f5e' }

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt  = n => (n==null||isNaN(Number(n))) ? '—' : '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const pct  = (a,b) => (!b||!a||isNaN(a)||isNaN(b)) ? null : (((a-b)/b)*100).toFixed(2)
const ago  = ts => { const s=Math.floor((Date.now()-ts*1000)/1000); if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago' }
const lsGet = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d }catch{ return d } }
const lsSet = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)) }catch{} }

// ─── API ──────────────────────────────────────────────────────────────────────
const fetchPrice  = async sym => { const r=await fetch(`/api/price?symbol=${encodeURIComponent(sym)}`); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); return d }
const fetchNews   = async sym => { const r=await fetch(`/api/news?symbol=${encodeURIComponent(sym)}`);  const d=await r.json(); return d.articles||[] }
const searchTickers = async q => { const r=await fetch(`/api/search?q=${encodeURIComponent(q)}`); const d=await r.json(); return d.results||[] }

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Spinner() {
  return <div style={{ width:18,height:18,border:'2px solid rgba(99,102,241,0.2)',borderTopColor:'#6366f1',borderRadius:'50%',animation:'spin .7s linear infinite',flexShrink:0 }} />
}

function Badge({ children, color }) {
  return (
    <span style={{ display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:700,letterSpacing:'1px',background:`${color}20`,border:`1px solid ${color}50`,color }}>
      {children}
    </span>
  )
}

function StatBox({ label, value, color, sub, icon }) {
  return (
    <div style={{ background:'rgba(15,23,42,0.8)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:12,padding:'14px 16px',flex:1,minWidth:100 }}>
      <div style={{ fontSize:9,color:'#475569',letterSpacing:'2px',marginBottom:6,display:'flex',alignItems:'center',gap:4 }}>
        {icon && <span>{icon}</span>}{label}
      </div>
      <div style={{ fontSize:17,fontWeight:700,color:color||'#e2e8f0',fontFamily:"'DM Mono',monospace" }}>{value||'—'}</div>
      {sub && <div style={{ fontSize:10,color:'#475569',marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function SectionHead({ children }) {
  return <div style={{ fontSize:10,color:'#6366f1',letterSpacing:'3px',fontWeight:700,marginBottom:14,display:'flex',alignItems:'center',gap:8 }}>
    <div style={{ width:3,height:14,background:'#6366f1',borderRadius:2 }} />{children}
  </div>
}

// Autocomplete Search
function SearchBox({ onSelect, disabled, placeholder }) {
  const [q, setQ]           = useState('')
  const [sugg, setSugg]     = useState([])
  const [busy, setBusy]     = useState(false)
  const [open, setOpen]     = useState(false)
  const [hi, setHi]         = useState(-1)
  const deb = useRef(null)
  const inp = useRef(null)
  const box = useRef(null)

  useEffect(() => {
    if (q.length < 3) { setSugg([]); return }
    clearTimeout(deb.current)
    deb.current = setTimeout(async () => {
      setBusy(true)
      const r = await searchTickers(q)
      setSugg(r); setBusy(false); setHi(-1)
    }, 300)
    return () => clearTimeout(deb.current)
  }, [q])

  useEffect(() => {
    const h = e => { if (!box.current?.contains(e.target)) { setSugg([]); setOpen(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = item => { setQ(item.symbol); setSugg([]); setOpen(false); onSelect(item.symbol); inp.current?.blur() }

  const onKey = e => {
    if (!sugg.length) { if (e.key==='Enter' && q.trim()) onSelect(q.trim().toUpperCase()); return }
    if (e.key==='ArrowDown') { e.preventDefault(); setHi(h=>Math.min(h+1,sugg.length-1)) }
    if (e.key==='ArrowUp')   { e.preventDefault(); setHi(h=>Math.max(h-1,0)) }
    if (e.key==='Enter')     { e.preventDefault(); if(hi>=0) pick(sugg[hi]); else onSelect(q.trim().toUpperCase()) }
    if (e.key==='Escape')    { setSugg([]); setOpen(false) }
  }

  return (
    <div ref={box} style={{ position:'relative', flex:1 }}>
      <div style={{ position:'relative' }}>
        <span style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'#475569' }}>🔍</span>
        <input ref={inp} value={q} disabled={disabled}
          onChange={e=>{ setQ(e.target.value.toUpperCase()); setOpen(true) }}
          onFocus={()=>setOpen(true)} onKeyDown={onKey}
          placeholder={placeholder||"Search ticker or company — TSLA, Apple..."}
          style={{ width:'100%',background:'rgba(15,23,42,0.9)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:12,padding:'12px 40px 12px 42px',color:'#e2e8f0',fontSize:13,fontFamily:"'DM Mono',monospace",transition:'all .2s',boxSizing:'border-box' }} />
        {busy && <div style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)' }}><Spinner /></div>}
      </div>
      {open && (sugg.length>0 || (busy&&q.length>=3)) && (
        <div style={{ position:'absolute',top:'calc(100% + 6px)',left:0,right:0,zIndex:300,background:'#0f172a',border:'1px solid rgba(99,102,241,0.2)',borderRadius:12,overflow:'hidden',boxShadow:'0 16px 48px rgba(0,0,0,0.6)' }}>
          {busy && <div style={{ padding:'12px 16px',fontSize:11,color:'#475569',letterSpacing:'2px' }}>SEARCHING...</div>}
          {sugg.map((s,i) => (
            <div key={s.symbol} onMouseDown={()=>pick(s)} onMouseEnter={()=>setHi(i)}
              style={{ padding:'11px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:12,background:i===hi?'rgba(99,102,241,0.1)':'transparent',borderBottom:i<sugg.length-1?'1px solid rgba(99,102,241,0.06)':'none',transition:'background .1s' }}>
              <span style={{ fontSize:12,fontWeight:700,color:'#6366f1',fontFamily:"'DM Mono',monospace",minWidth:56 }}>{s.symbol}</span>
              <span style={{ fontSize:12,color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{s.name}</span>
            </div>
          ))}
          {!busy && q.length>=3 && sugg.length===0 && (
            <div style={{ padding:'12px 16px',fontSize:11,color:'#475569' }}>No results for "{q}"</div>
          )}
        </div>
      )}
    </div>
  )
}

// Step loader
function StepLoader({ ticker }) {
  const steps = ['Fetching live price','Scanning market signals','Evaluating fundamentals','Computing risk metrics','Generating recommendation']
  const [step, setStep] = useState(0)
  useEffect(() => { const t=setInterval(()=>setStep(s=>Math.min(s+1,steps.length-1)),900); return()=>clearInterval(t) },[])
  return (
    <div style={{ background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:16,padding:32,textAlign:'center' }}>
      <div style={{ fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:700,color:'#6366f1',letterSpacing:'2px',marginBottom:24 }}>ANALYZING {ticker}</div>
      <div style={{ display:'flex',flexDirection:'column',gap:12,maxWidth:280,margin:'0 auto',textAlign:'left' }}>
        {steps.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:12 }}>
            <div style={{ width:20,height:20,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
              background:i<step?'#10b981':i===step?'#6366f1':'rgba(99,102,241,0.1)',
              border:`1px solid ${i<step?'#10b981':i===step?'#6366f1':'rgba(99,102,241,0.2)'}`,
              transition:'all .3s',fontSize:10 }}>
              {i<step?'✓':''}
            </div>
            <span style={{ fontSize:12,color:i<step?'#475569':i===step?'#e2e8f0':'#334155',transition:'color .3s' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// TradingView Chart
function TradingChart({ symbol }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!symbol || !ref.current) return
    ref.current.innerHTML = ''
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.async = true
    s.innerHTML = JSON.stringify({
      autosize: true, symbol, interval: 'D', timezone: 'Etc/UTC',
      theme: 'dark', style: '1', locale: 'en',
      backgroundColor: '#0a0e1a', gridColor: 'rgba(99,102,241,0.06)',
      hide_top_toolbar: false, hide_legend: false, save_image: false,
      calendar: false, hide_volume: false,
    })
    ref.current.appendChild(s)
  }, [symbol])
  if (!symbol) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:400,color:'#334155',gap:12 }}>
      <span style={{ fontSize:40 }}>📊</span>
      <span style={{ fontSize:13 }}>Select a stock to view its chart</span>
    </div>
  )
  return (
    <div style={{ borderRadius:16,overflow:'hidden',border:'1px solid rgba(99,102,241,0.12)' }}>
      <div className="tradingview-widget-container" ref={ref} style={{ height:420 }}>
        <div className="tradingview-widget-container__widget" style={{ height:'100%' }} />
      </div>
    </div>
  )
}

// News Feed
function NewsFeed({ symbol }) {
  const [articles, setArticles] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true); setError(null)
    fetchNews(symbol)
      .then(a => { setArticles(a); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [symbol])

  if (!symbol) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,color:'#334155',gap:12 }}>
      <span style={{ fontSize:40 }}>📰</span>
      <span style={{ fontSize:13 }}>Select a stock to load news</span>
    </div>
  )
  if (loading) return <div style={{ display:'flex',justifyContent:'center',padding:40 }}><Spinner /></div>
  if (error)   return <div style={{ color:'#f43f5e',fontSize:12,padding:16 }}>⚠ {error}</div>
  if (!articles.length) return <div style={{ color:'#475569',fontSize:13,padding:24,textAlign:'center' }}>No recent news found for {symbol}</div>

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
      {articles.map((a,i) => (
        <a key={a.id||i} href={a.url} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
          <div style={{ background:'rgba(15,23,42,0.6)',border:'1px solid rgba(99,102,241,0.1)',borderRadius:12,padding:'14px 16px',cursor:'pointer',transition:'all .2s' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(99,102,241,0.3)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(99,102,241,0.1)'}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:6 }}>
              <div style={{ fontSize:13,fontWeight:600,color:'#e2e8f0',lineHeight:1.4,flex:1 }}>{a.headline}</div>
              <div style={{ fontSize:10,color:'#475569',whiteSpace:'nowrap',flexShrink:0 }}>{ago(a.datetime)}</div>
            </div>
            {a.summary && <div style={{ fontSize:11,color:'#64748b',lineHeight:1.6,marginBottom:6,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{a.summary}</div>}
            <div style={{ fontSize:10,color:'#6366f1',letterSpacing:'1px' }}>{a.source} ↗</div>
          </div>
        </a>
      ))}
    </div>
  )
}

// Watchlist
function WatchlistTab({ onAnalyze }) {
  const [list,    setList]    = useState(() => lsGet('watchlist', []))
  const [prices,  setPrices]  = useState({})
  const [loading, setLoading] = useState({})
  const [addSym,  setAddSym]  = useState('')

  useEffect(() => {
    list.forEach(sym => refreshPrice(sym))
  }, [])

  async function refreshPrice(sym) {
    setLoading(l => ({ ...l, [sym]: true }))
    try {
      const d = await fetchPrice(sym)
      setPrices(p => ({ ...p, [sym]: d }))
    } catch (_) {}
    setLoading(l => ({ ...l, [sym]: false }))
  }

  function addToList(sym) {
    sym = sym.toUpperCase().trim()
    if (!sym || list.includes(sym)) return
    const next = [...list, sym]
    setList(next); lsSet('watchlist', next)
    refreshPrice(sym)
    setAddSym('')
  }

  function removeFromList(sym) {
    const next = list.filter(s => s !== sym)
    setList(next); lsSet('watchlist', next)
    setPrices(p => { const n={...p}; delete n[sym]; return n })
  }

  return (
    <div>
      <div style={{ display:'flex',gap:10,marginBottom:20 }}>
        <SearchBox onSelect={addToList} placeholder="Add stock to watchlist..." />
        <button onClick={()=>list.forEach(refreshPrice)} style={{ background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',color:'#6366f1',padding:'0 16px',borderRadius:12,cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap' }}>
          ↻ Refresh All
        </button>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign:'center',padding:'60px 20px',color:'#334155' }}>
          <div style={{ fontSize:48,marginBottom:12 }}>📋</div>
          <div style={{ fontSize:14,marginBottom:6 }}>Your watchlist is empty</div>
          <div style={{ fontSize:12,color:'#1e293b' }}>Search for stocks above to add them</div>
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {list.map(sym => {
            const d = prices[sym]
            const up = d ? d.change >= 0 : true
            return (
              <div key={sym} style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.1)',borderRadius:14,padding:'16px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap' }}>
                <div style={{ flex:1,minWidth:120 }}>
                  <div style={{ fontSize:16,fontWeight:700,color:'#e2e8f0',fontFamily:"'DM Mono',monospace" }}>{sym}</div>
                  {d && <div style={{ fontSize:11,color:'#475569',marginTop:2 }}>{d.name}</div>}
                </div>
                {loading[sym] ? <Spinner /> : d ? (
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:20,fontWeight:700,color:'#e2e8f0',fontFamily:"'DM Mono',monospace" }}>{fmt(d.price)}</div>
                    <div style={{ fontSize:12,fontWeight:600,color:up?'#10b981':'#f43f5e' }}>
                      {up?'▲':'▼'} {up?'+':''}{d.change} ({up?'+':''}{d.changePct}%)
                    </div>
                  </div>
                ) : <div style={{ fontSize:12,color:'#475569' }}>—</div>}
                <div style={{ display:'flex',gap:8 }}>
                  <button onClick={()=>refreshPrice(sym)} style={{ background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.15)',color:'#6366f1',padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:11 }}>↻</button>
                  <button onClick={()=>onAnalyze(sym)} style={{ background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.2)',color:'#10b981',padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:600 }}>ANALYZE</button>
                  <button onClick={()=>removeFromList(sym)} style={{ background:'rgba(244,63,94,0.08)',border:'1px solid rgba(244,63,94,0.15)',color:'#f43f5e',padding:'6px 10px',borderRadius:8,cursor:'pointer',fontSize:11 }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Alerts Tab
function AlertsTab({ lastResult }) {
  const [email,    setEmail]    = useState(() => lsGet('alert_email',''))
  const [enabled,  setEnabled]  = useState(() => lsGet('alert_enabled', false))
  const [sending,  setSending]  = useState(false)
  const [status,   setStatus]   = useState(null)
  const [history,  setHistory]  = useState(() => lsGet('alert_history', []))

  function saveEmail(e) { setEmail(e); lsSet('alert_email', e) }
  function toggleEnabled(v) { setEnabled(v); lsSet('alert_enabled', v) }

  async function sendAlert(result) {
    if (!email) { setStatus({ ok:false, msg:'Enter your email first.' }); return }
    setSending(true); setStatus(null)
    try {
      const r = await fetch('/api/alert', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ to:email, ticker:result.ticker, decision:result.decision, confidence:result.confidence, entryPrice:result.entryPrice, stopLoss:result.stopLoss, targetPrice:result.targetPrice, reasoning:result.reasoning, livePrice:result.livePrice }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      const entry = { ticker:result.ticker, decision:result.decision, ts:new Date().toISOString() }
      const next = [entry, ...history.slice(0,9)]
      setHistory(next); lsSet('alert_history', next)
      setStatus({ ok:true, msg:`Alert sent to ${email} ✓` })
    } catch (e) {
      setStatus({ ok:false, msg:'Failed: '+e.message })
    }
    setSending(false)
  }

  return (
    <div>
      {/* Setup */}
      <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:16,padding:20,marginBottom:16 }}>
        <SectionHead>EMAIL ALERT SETUP</SectionHead>
        <div style={{ fontSize:12,color:'#64748b',marginBottom:16,lineHeight:1.7 }}>
          Get instant email alerts when a BUY/SELL signal is generated. Uses <strong style={{color:'#6366f1'}}>Resend</strong> (free).
          {' '}<a href="https://resend.com" target="_blank" rel="noreferrer" style={{color:'#6366f1'}}>Get free API key →</a>
        </div>
        <div style={{ display:'flex',gap:10,marginBottom:14,flexWrap:'wrap' }}>
          <input value={email} onChange={e=>saveEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ flex:1,minWidth:200,background:'rgba(15,23,42,0.9)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:10,padding:'11px 14px',color:'#e2e8f0',fontSize:13,fontFamily:"'DM Mono',monospace" }} />
          <button onClick={()=>toggleEnabled(!enabled)} style={{
            background:enabled?'rgba(16,185,129,0.15)':'rgba(99,102,241,0.1)',
            border:`1px solid ${enabled?'rgba(16,185,129,0.3)':'rgba(99,102,241,0.2)'}`,
            color:enabled?'#10b981':'#6366f1',
            padding:'11px 18px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap',
          }}>{enabled?'🔔 Alerts ON':'🔕 Alerts OFF'}</button>
        </div>
        <div style={{ fontSize:11,color:'#334155',lineHeight:1.6 }}>
          ℹ️ Alerts also require <code style={{color:'#6366f1'}}>RESEND_API_KEY</code> in Vercel environment variables.
          {' '}Sign up free at resend.com, create an API key, add it to Vercel.
        </div>
      </div>

      {/* Send now */}
      {lastResult && (
        <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:16,padding:20,marginBottom:16 }}>
          <SectionHead>SEND ALERT NOW</SectionHead>
          <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:14,flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:13,color:'#e2e8f0',fontWeight:600 }}>{lastResult.ticker} — {lastResult.decision}</div>
              <div style={{ fontSize:11,color:'#475569' }}>Last analysis · {fmt(lastResult.livePrice)}</div>
            </div>
            <button onClick={()=>sendAlert(lastResult)} disabled={sending||!email}
              style={{ marginLeft:'auto',background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.3)',color:'#6366f1',padding:'10px 20px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:700,opacity:sending||!email?.0.5:1 }}>
              {sending?'Sending...':'📧 Send Alert'}
            </button>
          </div>
          {status && <div style={{ fontSize:12,color:status.ok?'#10b981':'#f43f5e',padding:'8px 12px',background:status.ok?'rgba(16,185,129,0.08)':'rgba(244,63,94,0.08)',borderRadius:8 }}>{status.msg}</div>}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:16,padding:20 }}>
          <SectionHead>ALERT HISTORY</SectionHead>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {history.map((h,i) => {
              const ds = DECISION_STYLE[h.decision]||DECISION_STYLE.HOLD
              return (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(15,23,42,0.5)',borderRadius:10 }}>
                  <span style={{ fontSize:12,fontWeight:700,color:'#e2e8f0',fontFamily:"'DM Mono',monospace" }}>{h.ticker}</span>
                  <Badge color={ds.badge}>{h.decision}</Badge>
                  <span style={{ marginLeft:'auto',fontSize:11,color:'#475569' }}>{new Date(h.ts).toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!lastResult && history.length===0 && (
        <div style={{ textAlign:'center',padding:'40px 20px',color:'#334155' }}>
          <div style={{ fontSize:40,marginBottom:12 }}>🔔</div>
          <div style={{ fontSize:13 }}>Run an analysis first, then send yourself an alert</div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab,   setActiveTab]   = useState('ANALYZE')
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

  useEffect(() => { const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t) }, [])

  useEffect(() => {
    if (!sym) { setLiveData(null); setLiveError(null); return }
    let cancelled = false
    setLiveLoading(true); setLiveError(null); setLiveData(null)
    fetchPrice(sym)
      .then(d  => { if(!cancelled){ setLiveData(d); setLiveLoading(false) } })
      .catch(e  => { if(!cancelled){ setLiveError(e.message); setLiveLoading(false) } })
    return () => { cancelled = true }
  }, [sym])

  function selectSym(s) {
    const v = s.toUpperCase().trim()
    setSym(v); setResult(null); setError(null)
    if (activeTab !== 'ANALYZE') setActiveTab('ANALYZE')
  }

  async function analyze() {
    if (!sym) return
    setLoading(true); setError(null); setResult(null)
    let live = liveData
    if (!live) { try{ live=await fetchPrice(sym); setLiveData(live) }catch(_){} }

    const priceBlock = live
      ? `LIVE MARKET DATA:\n- Current Price: $${live.price}\n- Change: ${live.change>=0?'+':''}${live.change} (${live.changePct}%)\n- Range: $${live.low} - $${live.high}\n- Open: $${live.open} | Prev Close: $${live.prevClose}\n- Company: ${live.name}\nUSE $${live.price} as the EXACT basis for all price calculations.`
      : `Live price unavailable. Use your best knowledge of ${sym} current price range.`

    try {
      const res = await fetch('/api/analyze', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ system:SYSTEM_PROMPT, userMessage:`${priceBlock}\n\nAnalyze ${sym} stock.${context?` Context: ${context}`:''}\nReturn ONLY the JSON object.` }),
      })
      if (!res.ok) { const b=await res.json().catch(()=>({})); throw new Error(b?.error||`Error ${res.status}`) }
      const data = await res.json()
      const txt  = (data.text||'').trim()
      const m    = txt.replace(/```json/gi,'').replace(/```/g,'').trim().match(/\{[\s\S]*\}/)
      if (!m) throw new Error('No JSON in response')
      const parsed = JSON.parse(m[0])
      const rec = { ...parsed, livePrice:live?.price??null, ts:new Date().toISOString() }
      setResult(rec)
      setHistory(h=>[rec,...h.slice(0,9)])
    } catch(e) {
      setError('Analysis failed: '+e.message)
    }
    setLoading(false)
  }

  const ds       = result ? (DECISION_STYLE[result.decision]||DECISION_STYLE.HOLD) : null
  const upside   = result?.livePrice && result?.targetPrice ? pct(result.targetPrice,result.livePrice) : null
  const downside = result?.livePrice && result?.stopLoss    ? pct(result.stopLoss,result.livePrice)    : null
  const rr       = upside && downside && parseFloat(downside)!==0 ? (Math.abs(parseFloat(upside))/Math.abs(parseFloat(downside))).toFixed(2) : null

  const TABS_CONFIG = [
    { id:'ANALYZE',   icon:'🤖', label:'Analyze' },
    { id:'CHART',     icon:'📊', label:'Chart' },
    { id:'NEWS',      icon:'📰', label:'News' },
    { id:'WATCHLIST', icon:'📋', label:'Watchlist' },
    { id:'ALERTS',    icon:'🔔', label:'Alerts' },
  ]

  return (
    <div style={{ background:'#0a0e1a', minHeight:'100vh', minHeight:'100dvh', fontFamily:"'DM Sans',sans-serif", color:'#e2e8f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes spin   { to { transform:rotate(360deg) } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes pulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0a0e1a; overscroll-behavior:none; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:#0a0e1a; }
        ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:2px; }
        input, button, select { font-family:'DM Sans',sans-serif; }
        input::placeholder { color:#334155; }
        input:focus { outline:none; border-color:rgba(99,102,241,0.5) !important; box-shadow:0 0 0 3px rgba(99,102,241,0.08); }
        .tab-btn:hover { background:rgba(99,102,241,0.08) !important; }
        .chip:hover { border-color:rgba(99,102,241,0.4) !important; color:#6366f1 !important; }
        .analyze-btn:hover:not(:disabled) { background:linear-gradient(135deg,#4f46e5,#6366f1) !important; transform:translateY(-1px); box-shadow:0 8px 24px rgba(99,102,241,0.3); }
        .analyze-btn:disabled { opacity:.4; cursor:not-allowed; }
        .analyze-btn { transition:all .2s; }
        @media (max-width:640px) {
          .desktop-only { display:none !important; }
          .grid-2 { grid-template-columns:1fr !important; }
          .stat-row { flex-wrap:wrap; }
          .stat-row > * { min-width:calc(50% - 5px) !important; }
        }
        @media (min-width:641px) {
          .mobile-bottom-nav { display:none !important; }
          .desktop-tabs { display:flex !important; }
        }
      `}</style>

      {/* Ambient glow */}
      <div style={{ position:'fixed',top:-200,left:'50%',transform:'translateX(-50%)',width:600,height:400,background:'radial-gradient(ellipse,rgba(99,102,241,0.08) 0%,transparent 70%)',pointerEvents:'none',zIndex:0 }} />

      {/* ── HEADER ── */}
      <header style={{ borderBottom:'1px solid rgba(99,102,241,0.1)',padding:'0 20px',position:'sticky',top:0,zIndex:100,background:'rgba(10,14,26,0.95)',backdropFilter:'blur(12px)' }}>
        <div style={{ maxWidth:1100,margin:'0 auto',display:'flex',alignItems:'center',height:60,gap:16 }}>
          {/* Logo */}
          <div style={{ display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
            <div style={{ width:32,height:32,background:'linear-gradient(135deg,#4f46e5,#6366f1)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16 }}>📈</div>
            <span style={{ fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:800,color:'#e2e8f0',letterSpacing:'-0.5px' }}>AlgoTrade<span style={{color:'#6366f1'}}>AI</span></span>
          </div>

          {/* Desktop tabs */}
          <nav className="desktop-tabs" style={{ display:'none',gap:4,flex:1,justifyContent:'center' }}>
            {TABS_CONFIG.map(t => (
              <button key={t.id} className="tab-btn" onClick={()=>setActiveTab(t.id)} style={{
                background:activeTab===t.id?'rgba(99,102,241,0.12)':'transparent',
                border:`1px solid ${activeTab===t.id?'rgba(99,102,241,0.25)':'transparent'}`,
                color:activeTab===t.id?'#6366f1':'#64748b',
                padding:'7px 14px',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:600,
                display:'flex',alignItems:'center',gap:6,transition:'all .15s',
              }}><span>{t.icon}</span>{t.label}</button>
            ))}
          </nav>

          {/* Clock */}
          <div style={{ marginLeft:'auto',fontSize:11,color:'#334155',fontFamily:"'DM Mono',monospace",flexShrink:0 }}>
            {time.toLocaleTimeString('en-US',{hour12:false})}
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:6,flexShrink:0 }}>
            <div style={{ width:6,height:6,borderRadius:'50%',background:'#10b981',animation:'blink 2s infinite' }} />
            <span style={{ fontSize:10,color:'#10b981',letterSpacing:'1px',fontWeight:600 }}>LIVE</span>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ maxWidth:1100,margin:'0 auto',padding:'20px 16px 100px',position:'relative',zIndex:1 }}>

        {/* ════ ANALYZE TAB ════ */}
        {activeTab === 'ANALYZE' && (
          <div style={{ animation:'fadeUp .3s ease' }}>

            {/* Search + Popular */}
            <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:18,padding:'18px 18px',marginBottom:16,backdropFilter:'blur(8px)' }}>
              <div style={{ fontSize:10,color:'#6366f1',letterSpacing:'3px',fontWeight:700,marginBottom:14 }}>STOCK ANALYSIS TERMINAL</div>

              <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:14 }}>
                {POPULAR.map(t => (
                  <button key={t} className="chip" onClick={()=>selectSym(t)} style={{
                    background:sym===t?'rgba(99,102,241,0.12)':'transparent',
                    border:`1px solid ${sym===t?'rgba(99,102,241,0.3)':'rgba(99,102,241,0.08)'}`,
                    color:sym===t?'#6366f1':'#475569',
                    padding:'4px 12px',borderRadius:20,cursor:'pointer',fontSize:11,fontWeight:600,
                    letterSpacing:'0.5px',transition:'all .15s',
                  }}>{t}</button>
                ))}
              </div>

              <div style={{ display:'flex',gap:10,alignItems:'flex-start',flexWrap:'wrap' }}>
                <div style={{ flex:1,minWidth:200,display:'flex',flexDirection:'column',gap:8 }}>
                  <SearchBox onSelect={selectSym} disabled={loading} />
                  <input value={context} onChange={e=>setContext(e.target.value)}
                    placeholder="Optional context — earnings beat, Fed held rates, tariff news..."
                    style={{ background:'rgba(15,23,42,0.9)',border:'1px solid rgba(99,102,241,0.1)',borderRadius:12,padding:'11px 14px',color:'#64748b',fontSize:12,width:'100%' }} />
                </div>
                <button className="analyze-btn" onClick={analyze} disabled={loading||!sym} style={{
                  background:'linear-gradient(135deg,#4f46e5,#7c3aed)',border:'none',color:'#fff',
                  padding:'12px 24px',borderRadius:12,fontSize:13,fontWeight:700,letterSpacing:'0.5px',cursor:'pointer',
                  boxShadow:'0 4px 16px rgba(99,102,241,0.25)',alignSelf:'flex-start',
                }}>{loading?'Analyzing...':'Analyze ▸'}</button>
              </div>

              {sym && (
                <div style={{ marginTop:12,display:'flex',alignItems:'center',gap:8 }}>
                  <div style={{ width:6,height:6,borderRadius:'50%',background:'#6366f1',animation:'blink 2s infinite' }} />
                  <span style={{ fontSize:11,color:'#6366f1',fontFamily:"'DM Mono',monospace",fontWeight:600 }}>{sym}</span>
                  {liveData && <span style={{ fontSize:11,color:'#475569' }}>· {liveData.name}</span>}
                  <button onClick={()=>{setSym('');setLiveData(null);setResult(null);setError(null)}}
                    style={{ marginLeft:'auto',background:'transparent',border:'1px solid rgba(99,102,241,0.1)',color:'#475569',padding:'3px 10px',borderRadius:8,cursor:'pointer',fontSize:11 }}>Clear ✕</button>
                </div>
              )}
            </div>

            {/* Live price bar */}
            {sym && (
              <div style={{ marginBottom:16 }}>
                {liveLoading && (
                  <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:14,padding:'14px 18px',display:'flex',gap:12,alignItems:'center' }}>
                    <Spinner /><span style={{ fontSize:12,color:'#6366f1' }}>Fetching live price for {sym}...</span>
                  </div>
                )}
                {liveError && !liveLoading && (
                  <div style={{ background:'rgba(244,63,94,0.05)',border:'1px solid rgba(244,63,94,0.2)',borderRadius:14,padding:'12px 18px',fontSize:12,color:'#f43f5e' }}>⚠ {liveError}</div>
                )}
                {liveData && !liveLoading && (
                  <div style={{ background:'rgba(15,23,42,0.8)',border:`1px solid ${liveData.change>=0?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.2)'}`,borderRadius:14,padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:14,backdropFilter:'blur(8px)' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:14 }}>
                      <div style={{ width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(99,102,241,0.05))',border:'1px solid rgba(99,102,241,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>📈</div>
                      <div>
                        <div style={{ fontSize:10,color:'#475569',letterSpacing:'1px',marginBottom:3 }}>{liveData.name}</div>
                        <div style={{ display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap' }}>
                          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:24,fontWeight:700,color:'#e2e8f0' }}>{fmt(liveData.price)}</span>
                          <span style={{ fontSize:13,fontWeight:600,color:liveData.change>=0?'#10b981':'#f43f5e' }}>
                            {liveData.change>=0?'▲':'▼'} {liveData.change>=0?'+':''}{liveData.change} ({liveData.change>=0?'+':''}{liveData.changePct}%)
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex',gap:16,flexWrap:'wrap' }}>
                      {[['OPEN',fmt(liveData.open)],['HIGH',fmt(liveData.high),'#10b981'],['LOW',fmt(liveData.low),'#f43f5e'],['PREV',fmt(liveData.prevClose)]].map(([l,v,c])=>(
                        <div key={l}>
                          <div style={{ fontSize:9,color:'#334155',letterSpacing:'1px',marginBottom:2 }}>{l}</div>
                          <div style={{ fontSize:12,fontWeight:600,color:c||'#64748b',fontFamily:"'DM Mono',monospace" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Loader */}
            {loading && <StepLoader ticker={sym} />}

            {/* Error */}
            {error && !loading && (
              <div style={{ background:'rgba(244,63,94,0.05)',border:'1px solid rgba(244,63,94,0.2)',borderRadius:14,padding:'14px 18px',marginBottom:16,color:'#f43f5e',fontSize:12 }}>⚠ {error}</div>
            )}

            {/* ── RESULT ── */}
            {result && !loading && ds && (
              <div style={{ animation:'fadeUp .4s ease' }}>
                {result.livePrice && (
                  <div style={{ display:'flex',alignItems:'center',gap:6,fontSize:11,color:'rgba(99,102,241,0.5)',marginBottom:12 }}>
                    <div style={{ width:5,height:5,borderRadius:'50%',background:'#6366f1' }} />
                    Analysis based on live price {fmt(result.livePrice)} · {new Date(result.ts).toLocaleTimeString()}
                  </div>
                )}

                {/* Decision banner */}
                <div style={{ background:ds.bg,border:`1px solid ${ds.border}`,borderRadius:18,padding:'22px 24px',marginBottom:14,boxShadow:ds.glow,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:14 }}>
                  <div>
                    <div style={{ fontSize:10,color:ds.text,letterSpacing:'3px',marginBottom:6,opacity:.7 }}>AI TRADING SIGNAL</div>
                    <div style={{ display:'flex',alignItems:'center',gap:14,flexWrap:'wrap' }}>
                      <span style={{ fontFamily:"'Syne',sans-serif",fontSize:42,fontWeight:800,color:ds.text,lineHeight:1 }}>{result.decision}</span>
                      <div>
                        <div style={{ fontSize:20,color:'#e2e8f0',fontWeight:700,fontFamily:"'DM Mono',monospace" }}>{result.ticker}</div>
                        <div style={{ fontSize:12,color:'#64748b',marginTop:2 }}>{result.companyName}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:9,color:'#475569',letterSpacing:'2px',marginBottom:6 }}>CONFIDENCE</div>
                    <div style={{ fontSize:20,fontWeight:700,color:ds.text,fontFamily:"'Syne',sans-serif" }}>{(result.confidence||'').toUpperCase()}</div>
                    <div style={{ display:'flex',gap:4,justifyContent:'flex-end',marginTop:8 }}>
                      {[0,1,2].map(i=><div key={i} style={{ width:28,height:5,borderRadius:3,background:i<(result.confidence==='High'?3:result.confidence==='Medium'?2:1)?ds.text:'rgba(255,255,255,0.06)',transition:'background .3s' }} />)}
                    </div>
                    <div style={{ fontSize:10,color:'#475569',marginTop:6 }}>{result.timeHorizon}</div>
                  </div>
                </div>

                {/* Price stat boxes */}
                <div className="stat-row" style={{ display:'flex',gap:10,marginBottom:14,flexWrap:'wrap' }}>
                  <StatBox label="LIVE PRICE"   value={fmt(result.livePrice)}   color="#e2e8f0" sub="real-time" icon="🔴" />
                  <StatBox label="ENTRY"         value={fmt(result.entryPrice)}  color="#10b981"
                    sub={result.livePrice&&result.entryPrice?`${Number(pct(result.entryPrice,result.livePrice))>0?'+':''}${pct(result.entryPrice,result.livePrice)}% from live`:null} icon="🎯" />
                  <StatBox label="STOP LOSS"     value={fmt(result.stopLoss)}    color="#f43f5e" sub={downside?`${downside}% risk`:null} icon="🛑" />
                  <StatBox label="TARGET"        value={fmt(result.targetPrice)} color="#10b981" sub={upside?`+${upside}% upside`:null} icon="🏹" />
                  <StatBox label="RISK"          value={(result.riskLevel||'').toUpperCase()} color={RISK_COLOR[result.riskLevel]||'#f59e0b'} sub="portfolio exposure" icon="⚡" />
                </div>

                {/* R/R row */}
                {upside && downside && rr && (
                  <div className="stat-row" style={{ display:'flex',gap:10,marginBottom:14 }}>
                    {[
                      ['UPSIDE POTENTIAL',`+${upside}%`,'#10b981','rgba(16,185,129,0.05)','rgba(16,185,129,0.15)'],
                      ['MAX DOWNSIDE',`${downside}%`,'#f43f5e','rgba(244,63,94,0.05)','rgba(244,63,94,0.15)'],
                      ['RISK / REWARD',`${rr}x`,'#f59e0b','rgba(245,158,11,0.05)','rgba(245,158,11,0.15)'],
                    ].map(([l,v,c,bg,bd])=>(
                      <div key={l} style={{ background:bg,border:`1px solid ${bd}`,borderRadius:12,padding:'12px 16px',flex:1,minWidth:100 }}>
                        <div style={{ fontSize:9,color:'#475569',letterSpacing:'2px',marginBottom:5 }}>{l}</div>
                        <div style={{ fontSize:20,fontWeight:700,color:c,fontFamily:"'DM Mono',monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reasoning + Signals */}
                <div className="grid-2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
                  <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.1)',borderRadius:16,padding:20 }}>
                    <SectionHead>ANALYSIS REASONING</SectionHead>
                    <p style={{ fontSize:13,color:'#64748b',lineHeight:1.8 }}>{result.reasoning}</p>
                  </div>
                  <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.1)',borderRadius:16,padding:20 }}>
                    <SectionHead>KEY SIGNALS</SectionHead>
                    {result.signals && Object.entries({
                      '📰 News':result.signals.newsCatalyst,
                      '👔 Analysts':result.signals.analystSentiment,
                      '💰 Financials':result.signals.financialMetrics,
                      '📊 Technical':result.signals.technicalIndicators,
                      '🏦 Institutional':result.signals.institutionalActivity,
                    }).map(([k,v])=>v?(
                      <div key={k} style={{ marginBottom:12 }}>
                        <div style={{ fontSize:10,color:'#475569',letterSpacing:'1px',marginBottom:3 }}>{k}</div>
                        <div style={{ fontSize:12,color:'#64748b',lineHeight:1.5 }}>{String(v)}</div>
                      </div>
                    ):null)}
                  </div>
                </div>

                {/* Risks + Steps */}
                <div className="grid-2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
                  <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.1)',borderRadius:16,padding:20 }}>
                    <SectionHead>KEY RISKS</SectionHead>
                    {Array.isArray(result.keyRisks) && result.keyRisks.map((r,i)=>(
                      <div key={i} style={{ display:'flex',gap:10,marginBottom:10,alignItems:'flex-start' }}>
                        <span style={{ color:'#f43f5e',fontSize:16,lineHeight:1,flexShrink:0 }}>▸</span>
                        <span style={{ fontSize:12,color:'#64748b',lineHeight:1.5 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.1)',borderRadius:16,padding:20 }}>
                    <SectionHead>TRADING STEPS</SectionHead>
                    {[
                      `1. Verify ${fmt(result.livePrice||result.entryPrice)} in your broker`,
                      `2. Set stop loss: ${fmt(result.stopLoss)}`,
                      `3. Enter near: ${fmt(result.entryPrice)}`,
                      `4. Target: ${fmt(result.targetPrice)}`,
                      '5. Monitor news daily',
                    ].map((s,i)=>(
                      <div key={i} style={{ fontSize:12,color:'#64748b',marginBottom:9,lineHeight:1.5,display:'flex',gap:8,alignItems:'flex-start' }}>
                        <span style={{ color:'#6366f1',flexShrink:0 }}>{i+1}.</span>
                        <span>{s.replace(/^\d+\. /,'')}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:12,paddingTop:12,borderTop:'1px solid rgba(99,102,241,0.08)',fontSize:11,color:'#334155' }}>
                      Sector: <span style={{color:'#6366f1'}}>{result.sectorAllocation}</span>
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
                  <button onClick={()=>setActiveTab('CHART')} style={{ background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',color:'#6366f1',padding:'10px 18px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,flex:1,minWidth:120 }}>📊 View Chart</button>
                  <button onClick={()=>setActiveTab('NEWS')}  style={{ background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',color:'#6366f1',padding:'10px 18px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,flex:1,minWidth:120 }}>📰 Read News</button>
                  <button onClick={()=>setActiveTab('ALERTS')} style={{ background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.2)',color:'#10b981',padding:'10px 18px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,flex:1,minWidth:120 }}>🔔 Send Alert</button>
                </div>
              </div>
            )}

            {/* History */}
            {history.length > 0 && !loading && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:10,color:'#334155',letterSpacing:'2px',marginBottom:10 }}>RECENT ANALYSES</div>
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  {history.map((h,i)=>{
                    const s = DECISION_STYLE[h.decision]||DECISION_STYLE.HOLD
                    return (
                      <button key={i} onClick={()=>setResult(h)} style={{
                        background:s.bg,border:`1px solid ${s.border}`,borderRadius:10,padding:'7px 14px',
                        cursor:'pointer',display:'flex',gap:8,alignItems:'center',transition:'all .15s',
                      }}>
                        <span style={{ fontSize:12,fontWeight:700,color:'#e2e8f0',fontFamily:"'DM Mono',monospace" }}>{h.ticker}</span>
                        {h.livePrice!=null && <span style={{ fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace" }}>{fmt(h.livePrice)}</span>}
                        <Badge color={s.badge}>{h.decision}</Badge>
                        <span style={{ fontSize:10,color:'#334155' }}>{new Date(h.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!result && !loading && !error && !sym && (
              <div style={{ textAlign:'center',padding:'60px 20px',border:'1px dashed rgba(99,102,241,0.1)',borderRadius:18 }}>
                <div style={{ fontSize:56,marginBottom:16 }}>📈</div>
                <div style={{ fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,color:'#e2e8f0',marginBottom:8 }}>AI Stock Trading Agent</div>
                <div style={{ fontSize:13,color:'#475569',lineHeight:1.7 }}>
                  Search for any stock or select from popular tickers above.<br/>
                  Get AI-powered BUY / SELL / HOLD signals with live prices.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ CHART TAB ════ */}
        {activeTab === 'CHART' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:18,padding:18,marginBottom:16 }}>
              <SectionHead>PRICE CHART</SectionHead>
              <div style={{ display:'flex',gap:10,marginBottom:16 }}>
                <SearchBox onSelect={s=>{setSym(s.toUpperCase());setActiveTab('CHART')}} placeholder="Search stock for chart..." />
              </div>
              <TradingChart symbol={sym} />
            </div>
          </div>
        )}

        {/* ════ NEWS TAB ════ */}
        {activeTab === 'NEWS' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:18,padding:18 }}>
              <SectionHead>LATEST NEWS{sym?` · ${sym}`:''}</SectionHead>
              <div style={{ marginBottom:16 }}>
                <SearchBox onSelect={s=>{setSym(s.toUpperCase())}} placeholder="Search stock for news..." />
              </div>
              <NewsFeed symbol={sym} />
            </div>
          </div>
        )}

        {/* ════ WATCHLIST TAB ════ */}
        {activeTab === 'WATCHLIST' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <div style={{ background:'rgba(15,23,42,0.7)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:18,padding:18 }}>
              <SectionHead>MY WATCHLIST</SectionHead>
              <WatchlistTab onAnalyze={s=>{ setSym(s); setActiveTab('ANALYZE') }} />
            </div>
          </div>
        )}

        {/* ════ ALERTS TAB ════ */}
        {activeTab === 'ALERTS' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <AlertsTab lastResult={result} />
          </div>
        )}

      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="mobile-bottom-nav" style={{
        position:'fixed',bottom:0,left:0,right:0,zIndex:100,
        background:'rgba(10,14,26,0.97)',borderTop:'1px solid rgba(99,102,241,0.12)',
        backdropFilter:'blur(16px)',padding:'8px 0 max(8px,env(safe-area-inset-bottom))',
        display:'flex',
      }}>
        {TABS_CONFIG.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            flex:1,background:'transparent',border:'none',cursor:'pointer',
            display:'flex',flexDirection:'column',alignItems:'center',gap:3,
            padding:'6px 4px',transition:'all .15s',
          }}>
            <span style={{ fontSize:20 }}>{t.icon}</span>
            <span style={{ fontSize:9,letterSpacing:'0.5px',fontWeight:600,color:activeTab===t.id?'#6366f1':'#334155',transition:'color .15s' }}>
              {t.label.toUpperCase()}
            </span>
            {activeTab===t.id && <div style={{ width:4,height:4,borderRadius:'50%',background:'#6366f1' }} />}
          </button>
        ))}
      </nav>

      {/* Disclaimer */}
      <div style={{ textAlign:'center',padding:'0 20px 120px',fontSize:10,color:'rgba(99,102,241,0.15)',letterSpacing:'1px' }}>
        FOR EDUCATIONAL PURPOSES ONLY · NOT FINANCIAL ADVICE · ALL TRADING CARRIES RISK
      </div>
    </div>
  )
}
