import React, { useState, useEffect, useRef, useMemo } from 'react'

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
{"ticker":"SYMBOL","companyName":"Full Name","decision":"BUY","confidence":"High","riskLevel":"Low","entryPrice":150.00,"stopLoss":139.50,"targetPrice":172.50,"reasoning":"Detailed paragraph","signals":{"newsCatalyst":"...","analystSentiment":"...","financialMetrics":"...","technicalIndicators":"...","institutionalActivity":"..."},"sectorAllocation":"Technology","keyRisks":["risk1","risk2","risk3"],"timeHorizon":"Medium-term (months)","whyBuy":["Specific bullish signal 1 with data","Specific bullish signal 2 with data","Specific bullish signal 3 with data"],"whyNotBuy":["Key risk or bearish signal 1","Key risk or bearish signal 2","Key risk or bearish signal 3"],"finalInsight":{"bias":"Bullish","confidenceLevel":"High","summary":"2-3 sentence actionable conclusion combining all signals into a clear trade rationale"},"aiSummary":"One precise actionable sentence — the single most important thing to know about this trade right now"}`

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  // Backgrounds
  pageBg:   '#f0f4f8',
  cardBg:   '#ffffff',
  cardBg2:  '#f8fafc',
  // Brand
  brand:    '#4f46e5',
  brandLight:'#ede9fe',
  brandMid: '#6366f1',
  // Text
  text1:    '#0f172a',
  text2:    '#374151',
  text3:    '#6b7280',
  text4:    '#9ca3af',
  // Borders
  border:   '#e5e7eb',
  borderFocus:'#4f46e5',
  // Signals
  buy:      '#059669',
  buyBg:    '#ecfdf5',
  buyBorder:'#6ee7b7',
  sell:     '#dc2626',
  sellBg:   '#fef2f2',
  sellBorder:'#fca5a5',
  hold:     '#b45309',
  holdBg:   '#fffbeb',
  holdBorder:'#fcd34d',
  // Status
  success:  '#059669',
  error:    '#dc2626',
  warning:  '#d97706',
}

const DS = {
  BUY:  { bg:C.buyBg,  border:C.buyBorder,  text:C.buy,  badge:'#059669', shadow:'0 4px 24px rgba(5,150,105,0.12)' },
  SELL: { bg:C.sellBg, border:C.sellBorder, text:C.sell, badge:'#dc2626', shadow:'0 4px 24px rgba(220,38,38,0.12)' },
  HOLD: { bg:C.holdBg, border:C.holdBorder, text:C.hold, badge:'#b45309', shadow:'0 4px 24px rgba(180,83,9,0.12)'  },
}
const RC = { Low:C.buy, Medium:C.warning, High:C.sell }

const POPULAR_US = ['AAPL','NVDA','MSFT','GOOGL','AMZN','TSLA','META','JPM','V','NFLX']
const POPULAR_IN = ['RELIANCE.NS','TCS.NS','INFY.NS','HDFCBANK.NS','WIPRO.NS','ICICIBANK.NS']
const POPULAR_CA = ['TD.TO','RY.TO','CNR.TO','SHOP.TO','BCE.TO']
const TABS = [
  { id:'ANALYZE',   icon:'🤖', label:'Analyze'   },
  { id:'MARKETS',   icon:'🔥', label:'Markets'   },
  { id:'CHART',     icon:'📊', label:'Chart'     },
  { id:'NEWS',      icon:'📰', label:'News'      },
  { id:'WATCHLIST', icon:'⭐', label:'Watchlist' },
  { id:'ALERTS',    icon:'🔔', label:'Alerts'    },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt    = (n, currency='USD') => {
  if (n==null||isNaN(Number(n))) return '—'
  const sym = currency==='INR' ? '₹' : currency==='CAD' ? 'CA$' : '$'
  return sym + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
}
const fmtP = n => fmt(n) // price without currency context (used in generic places)
const pctOf  = (a,b) => (!b||!a||isNaN(a)||isNaN(b)) ? null : (((a-b)/b)*100).toFixed(2)
const timeAgo= ts => { const s=Math.floor((Date.now()-ts*1000)/1000); if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago' }
const lsGet  = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d }catch{ return d } }
const lsSet  = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)) }catch{} }

// ─── API ──────────────────────────────────────────────────────────────────────
const apiPrice  = async sym => { const r=await fetch(`/api/price?symbol=${encodeURIComponent(sym)}`);  const d=await r.json(); if(!r.ok) throw new Error(d.error||'Price fetch failed'); return d }
const apiNews   = async sym => { const r=await fetch(`/api/news?symbol=${encodeURIComponent(sym)}`);   const d=await r.json(); return d.articles||[] }
const apiSearch = async q   => { const r=await fetch(`/api/search?q=${encodeURIComponent(q)}`);        const d=await r.json(); return d.results||[] }
const apiAlert    = async body=> { const r=await fetch('/api/alert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); return d }
const apiTrending = async () => { const r=await fetch('/api/trending'); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); return d }
const apiEarnings    = async () => { const r=await fetch('/api/earnings'); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); return d }
const apiMarketNews  = async () => { const r=await fetch('/api/market-news'); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); return d }
const apiFeatured    = async () => { const r=await fetch('/api/featured'); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); return d }

// ─── BASE COMPONENTS ──────────────────────────────────────────────────────────
function Spinner({ size=20 }) {
  return <div style={{ width:size,height:size,border:`2px solid ${C.brandLight}`,borderTopColor:C.brand,borderRadius:'50%',animation:'spin .7s linear infinite',flexShrink:0 }} aria-label="Loading" role="status" />
}

function Card({ children, style, pad=20 }) {
  return (
    <div style={{ background:C.cardBg,borderRadius:16,border:`1px solid ${C.border}`,padding:pad,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',...style }}>
      {children}
    </div>
  )
}

function SectionTitle({ children, color }) {
  return (
    <div style={{ fontSize:11,fontWeight:700,color:color||C.brand,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:16,display:'flex',alignItems:'center',gap:8 }}>
      <div style={{ width:3,height:16,background:color||C.brand,borderRadius:2,flexShrink:0 }} />
      {children}
    </div>
  )
}

function Badge({ children, color, bg }) {
  return (
    <span style={{ display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700,color:color||C.brand,background:bg||C.brandLight }}>
      {children}
    </span>
  )
}

function InfoBox({ icon, title, body, color }) {
  return (
    <div style={{ background:color?`${color}10`:'#f8faff',border:`1px solid ${color||C.brand}30`,borderRadius:12,padding:'14px 16px',display:'flex',gap:12 }}>
      <span style={{ fontSize:22,flexShrink:0 }}>{icon}</span>
      <div>
        <div style={{ fontSize:14,fontWeight:700,color:color||C.brand,marginBottom:4 }}>{title}</div>
        <div style={{ fontSize:13,color:C.text2,lineHeight:1.6 }}>{body}</div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',flex:1,minWidth:100,boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize:11,color:C.text3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:8,display:'flex',alignItems:'center',gap:5 }}>
        {icon && <span style={{fontSize:13}}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize:20,fontWeight:700,color:color||C.text1,fontFamily:"'DM Mono',monospace",marginBottom:sub?4:0 }}>{value||'—'}</div>
      {sub && <div style={{ fontSize:12,color:C.text3 }}>{sub}</div>}
    </div>
  )
}

// ─── SEARCH BOX ───────────────────────────────────────────────────────────────
function SearchBox({ onSelect, disabled, placeholder, autoFocus }) {
  const [q,    setQ]    = useState('')
  const [sugg, setSugg] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [hi,   setHi]   = useState(-1)
  const deb = useRef(null)
  const inp = useRef(null)
  const wrap= useRef(null)

  useEffect(() => {
    if (q.length < 3) { setSugg([]); return }
    clearTimeout(deb.current)
    deb.current = setTimeout(async () => {
      setBusy(true)
      const r = await apiSearch(q)
      setSugg(r); setBusy(false); setHi(-1)
    }, 280)
    return () => clearTimeout(deb.current)
  }, [q])

  useEffect(() => {
    const h = e => { if (!wrap.current?.contains(e.target)) { setSugg([]); setOpen(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = item => { setQ(item.symbol); setSugg([]); setOpen(false); onSelect(item.symbol); inp.current?.blur() }

  const onKey = e => {
    if (!sugg.length) { if (e.key==='Enter' && q.trim()) { onSelect(q.trim().toUpperCase()); setOpen(false) }; return }
    if (e.key==='ArrowDown') { e.preventDefault(); setHi(h=>Math.min(h+1,sugg.length-1)) }
    if (e.key==='ArrowUp')   { e.preventDefault(); setHi(h=>Math.max(h-1,0)) }
    if (e.key==='Enter')     { e.preventDefault(); if(hi>=0) pick(sugg[hi]); else { onSelect(q.trim().toUpperCase()); setOpen(false) } }
    if (e.key==='Escape')    { setSugg([]); setOpen(false) }
  }

  const showDrop = open && q.length >= 3 && (sugg.length > 0 || busy)

  return (
    <div ref={wrap} style={{ position:'relative',flex:1 }}>
      <div style={{ position:'relative' }}>
        <span style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:18,color:C.text3,pointerEvents:'none' }}>🔍</span>
        <input
          ref={inp}
          value={q}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={e => { setQ(e.target.value.toUpperCase()); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder || 'Search by ticker or company name — e.g. TSLA, Apple...'}
          aria-label="Search stocks"
          aria-autocomplete="list"
          aria-expanded={showDrop}
          style={{ width:'100%',background:C.cardBg,border:`1.5px solid ${C.border}`,borderRadius:12,padding:'13px 44px 13px 44px',color:C.text1,fontSize:15,fontFamily:"'DM Mono',monospace",boxSizing:'border-box',transition:'border-color .2s, box-shadow .2s' }}
        />
        {busy && <div style={{ position:'absolute',right:14,top:'50%',transform:'translateY(-50%)' }}><Spinner size={18} /></div>}
      </div>

      {showDrop && (
        <div role="listbox" style={{ position:'absolute',top:'calc(100% + 6px)',left:0,right:0,zIndex:300,background:C.cardBg,border:`1.5px solid ${C.border}`,borderRadius:12,overflow:'hidden',boxShadow:'0 12px 40px rgba(0,0,0,0.12)' }}>
          {busy && <div style={{ padding:'12px 16px',fontSize:13,color:C.text3 }}>Searching...</div>}
          {sugg.map((s,i) => (
            <div key={s.symbol} role="option" aria-selected={i===hi}
              onMouseDown={() => pick(s)}
              onMouseEnter={() => setHi(i)}
              style={{ padding:'11px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,background:i===hi?C.brandLight:'transparent',borderBottom:i<sugg.length-1?`1px solid ${C.border}`:'none',transition:'background .1s' }}>
              <span style={{ fontSize:18,flexShrink:0 }}>{s.flag||'🇺🇸'}</span>
              <span style={{ fontSize:13,fontWeight:700,color:C.brand,fontFamily:"'DM Mono',monospace",minWidth:90,flexShrink:0 }}>{s.symbol}</span>
              <span style={{ fontSize:13,color:C.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1 }}>{s.name}</span>
              {s.exchange && s.exchange!=='US' && (
                <span style={{ fontSize:10,color:C.text3,background:C.cardBg2,border:`1px solid ${C.border}`,borderRadius:4,padding:'2px 6px',flexShrink:0,fontWeight:600 }}>{s.exchange}</span>
              )}
            </div>
          ))}
          {!busy && sugg.length===0 && q.length>=3 && (
            <div style={{ padding:'12px 16px',fontSize:13,color:C.text3 }}>No results found for "{q}"</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── STEP LOADER ──────────────────────────────────────────────────────────────
function StepLoader({ ticker }) {
  const steps = ['Fetching live market price','Scanning market signals & news','Evaluating financial fundamentals','Computing risk metrics','Generating AI recommendation']
  const [step, setStep] = useState(0)
  useEffect(() => { const t=setInterval(()=>setStep(s=>Math.min(s+1,steps.length-1)),900); return()=>clearInterval(t) },[])
  return (
    <Card style={{ textAlign:'center',padding:36 }}>
      <div style={{ fontSize:16,fontWeight:700,color:C.brand,marginBottom:24,letterSpacing:'0.5px' }}>Analyzing {ticker}...</div>
      <div style={{ display:'flex',flexDirection:'column',gap:14,maxWidth:300,margin:'0 auto',textAlign:'left' }}>
        {steps.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:14 }}>
            <div style={{ width:24,height:24,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,
              background:i<step?C.buy:i===step?C.brand:C.border,
              color:i<=step?'#fff':C.text3,
              transition:'all .3s',
            }}>{i<step?'✓':i+1}</div>
            <span style={{ fontSize:14,color:i<step?C.text3:i===step?C.text1:C.text4,fontWeight:i===step?600:400,transition:'color .3s' }}>{s}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── TRADINGVIEW CHART ────────────────────────────────────────────────────────
function TradingChart({ symbol }) {
  const wrapRef        = useRef(null)
  const [chartInterval, setChartInterval] = useState('D')

  // Calculate chart height based on viewport
  function getHeight() {
    if (typeof window === 'undefined') return 500
    if (window.innerWidth < 640) return 380
    if (window.innerWidth < 1024) return 500
    return 600
  }
  const [height, setHeight] = useState(getHeight)

  useEffect(() => {
    const onResize = () => setHeight(getHeight())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!symbol || !wrapRef.current) return

    // Fully clear previous widget
    wrapRef.current.innerHTML = ''

    // Use widget script with explicit pixel width/height so chart fills container correctly
    const container = document.createElement('div')
    container.className = 'tradingview-widget-container'
    container.style.width  = '100%'
    container.style.height = '100%'
    container.style.position = 'relative'

    const inner = document.createElement('div')
    inner.className = 'tradingview-widget-container__widget'
    inner.style.width  = '100%'
    inner.style.height = 'calc(100% - 32px)'
    inner.style.position = 'absolute'
    inner.style.top = '0'
    inner.style.left = '0'

    const script = document.createElement('script')
    script.type  = 'text/javascript'
    script.src   = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true

    const cfg = {
      autosize:            false,
      width:               wrapRef.current.offsetWidth || 900,
      height:              height,
      symbol:              symbol,
      interval:            chartInterval,
      timezone:            'Etc/UTC',
      theme:               'light',
      style:               '1',
      locale:              'en',
      backgroundColor:     '#ffffff',
      gridColor:           'rgba(0,0,0,0.03)',
      hide_top_toolbar:    false,
      hide_legend:         false,
      hide_side_toolbar:   false,
      allow_symbol_change: true,
      save_image:          false,
      withdateranges:      true,
    }
    script.text = JSON.stringify(cfg)

    container.appendChild(inner)
    container.appendChild(script)
    wrapRef.current.appendChild(container)
  }, [symbol, chartInterval, height])

  const INTERVALS = [
    {label:'1m',value:'1'},{label:'5m',value:'5'},{label:'15m',value:'15'},
    {label:'1H',value:'60'},{label:'4H',value:'240'},
    {label:'1D',value:'D'},{label:'1W',value:'W'},{label:'1M',value:'M'},
  ]

  if (!symbol) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:400,color:C.text3,gap:12,padding:24 }}>
      <span style={{ fontSize:56 }}>📊</span>
      <span style={{ fontSize:16,fontWeight:600,color:C.text2 }}>Search for a stock to view its chart</span>
      <span style={{ fontSize:14,color:C.text3,textAlign:'center' }}>Live interactive charts powered by TradingView</span>
    </div>
  )

  return (
    <div>
      {/* Interval pills */}
      <div style={{ display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',alignItems:'center' }}>
        <span style={{ fontSize:12,color:C.text3,fontWeight:600,marginRight:2 }}>Timeframe:</span>
        {INTERVALS.map(i => (
          <button key={i.value} onClick={()=>setChartInterval(i.value)}
            style={{ padding:'7px 13px',borderRadius:8,border:`1.5px solid ${chartInterval===i.value?C.brand:C.border}`,background:chartInterval===i.value?C.brandLight:C.cardBg,color:chartInterval===i.value?C.brand:C.text2,fontSize:13,fontWeight:700,cursor:'pointer',transition:'all .15s',lineHeight:1 }}>
            {i.label}
          </button>
        ))}
        <span style={{ marginLeft:'auto',fontSize:11,color:C.text4,display:'flex',alignItems:'center',gap:4 }}>
          <span>📊</span> TradingView
        </span>
      </div>

      {/* The chart — explicit pixel height, no % heights on parent */}
      <div style={{ width:'100%', height:height, borderRadius:12, overflow:'hidden', border:`1.5px solid ${C.border}`, background:'#fff', position:'relative' }}>
        <div ref={wrapRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} />
      </div>

      <div style={{ marginTop:10,fontSize:12,color:C.text4,textAlign:'center' }}>
        Drag to pan · Scroll to zoom · Use toolbar above chart for drawing tools
      </div>
    </div>
  )
}

// ─── NEWS FEED ────────────────────────────────────────────────────────────────
function NewsFeed({ symbol }) {
  const [articles, setArticles] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true); setError(null)
    apiNews(symbol).then(a => { setArticles(a); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
  }, [symbol])

  if (!symbol) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:300,color:C.text3,gap:12 }}>
      <span style={{ fontSize:48 }}>📰</span>
      <span style={{ fontSize:15 }}>Search for a stock to load the latest news</span>
    </div>
  )
  if (loading) return <div style={{ display:'flex',justifyContent:'center',padding:48 }}><Spinner size={32} /></div>
  if (error)   return <div style={{ color:C.sell,fontSize:14,padding:16,background:C.sellBg,borderRadius:12 }}>⚠ {error}</div>
  if (!articles.length) return (
    <div style={{ textAlign:'center',padding:40,color:C.text3 }}>
      <div style={{ fontSize:40,marginBottom:12 }}>🔍</div>
      <div style={{ fontSize:15 }}>No recent news found for {symbol}</div>
    </div>
  )

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
      {articles.map((a,i) => (
        <a key={a.id||i} href={a.url} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
          <div style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 18px',cursor:'pointer',transition:'all .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.brand;e.currentTarget.style.boxShadow=`0 4px 16px rgba(79,70,229,0.1)`}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:8 }}>
              <div style={{ fontSize:15,fontWeight:600,color:C.text1,lineHeight:1.5,flex:1 }}>{a.headline}</div>
              <div style={{ fontSize:12,color:C.text3,whiteSpace:'nowrap',flexShrink:0,marginTop:2 }}>{timeAgo(a.datetime)}</div>
            </div>
            {a.summary && (
              <div style={{ fontSize:13,color:C.text2,lineHeight:1.6,marginBottom:8,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{a.summary}</div>
            )}
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <span style={{ fontSize:12,fontWeight:600,color:C.brand }}>{a.source}</span>
              <span style={{ fontSize:12,color:C.text3 }}>↗ Read more</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}

// ─── WATCHLIST ────────────────────────────────────────────────────────────────
function WatchlistTab({ onAnalyze }) {
  const [list,    setList]    = useState(() => lsGet('watchlist',[]))
  const [prices,  setPrices]  = useState({})
  const [loading, setLoading] = useState({})

  useEffect(() => { list.forEach(sym => refreshPrice(sym)) }, [])

  async function refreshPrice(sym) {
    setLoading(l=>({...l,[sym]:true}))
    try { const d=await apiPrice(sym); setPrices(p=>({...p,[sym]:d})) } catch(_) {}
    setLoading(l=>({...l,[sym]:false}))
  }

  function add(sym) {
    sym = sym.toUpperCase().trim()
    if (!sym || list.includes(sym)) return
    const next=[...list,sym]; setList(next); lsSet('watchlist',next); refreshPrice(sym)
  }

  function remove(sym) {
    const next=list.filter(s=>s!==sym); setList(next); lsSet('watchlist',next)
    setPrices(p=>{ const n={...p}; delete n[sym]; return n })
  }

  return (
    <div>
      <InfoBox icon="⭐" title="Your personal watchlist" color={C.brand}
        body="Add any stocks you want to track. Prices update every time you open the page. Click Analyze to get an instant AI signal for any stock." />

      <div style={{ display:'flex',gap:10,margin:'16px 0',flexWrap:'wrap' }}>
        <SearchBox onSelect={add} placeholder="Add a stock to watchlist..." />
        <button onClick={()=>list.forEach(refreshPrice)}
          aria-label="Refresh all prices"
          style={{ background:C.brandLight,border:`1px solid ${C.brand}30`,color:C.brand,padding:'0 18px',borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:600,whiteSpace:'nowrap',minHeight:48 }}>
          ↻ Refresh
        </button>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign:'center',padding:'48px 20px',background:C.cardBg2,borderRadius:16,border:`2px dashed ${C.border}` }}>
          <div style={{ fontSize:48,marginBottom:12 }}>⭐</div>
          <div style={{ fontSize:16,fontWeight:600,color:C.text1,marginBottom:8 }}>Your watchlist is empty</div>
          <div style={{ fontSize:14,color:C.text3 }}>Search for any stock above to add it here</div>
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {list.map(sym => {
            const d = prices[sym]
            const up = d ? d.change >= 0 : true
            return (
              <div key={sym} style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ flex:1,minWidth:120 }}>
                  <div style={{ fontSize:18,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{sym}</div>
                  {d && <div style={{ fontSize:13,color:C.text3,marginTop:2 }}>{d.name}</div>}
                </div>
                {loading[sym] ? <Spinner /> : d ? (
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:20,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{fmt(d.price)}</div>
                    <div style={{ fontSize:13,fontWeight:600,color:up?C.buy:C.sell,marginTop:2 }}>
                      {up?'▲':'▼'} {up?'+':''}{d.change} ({up?'+':''}{d.changePct}%)
                    </div>
                  </div>
                ) : <div style={{ fontSize:13,color:C.text3 }}>Price unavailable</div>}
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  <button onClick={()=>refreshPrice(sym)} aria-label={`Refresh ${sym}`}
                    style={{ background:C.cardBg2,border:`1px solid ${C.border}`,color:C.text2,padding:'8px 14px',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:600 }}>↻</button>
                  <button onClick={()=>onAnalyze(sym)}
                    style={{ background:C.brandLight,border:`1px solid ${C.brand}30`,color:C.brand,padding:'8px 16px',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:700 }}>Analyze</button>
                  <button onClick={()=>remove(sym)} aria-label={`Remove ${sym}`}
                    style={{ background:C.sellBg,border:`1px solid ${C.sellBorder}`,color:C.sell,padding:'8px 12px',borderRadius:10,cursor:'pointer',fontSize:13 }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ALERTS TAB ───────────────────────────────────────────────────────────────
function AlertsTab({ lastResult }) {
  const [email,   setEmail]   = useState(() => lsGet('alert_email',''))
  const [sending, setSending] = useState(false)
  const [status,  setStatus]  = useState(null)
  const [history, setHistory] = useState(() => lsGet('alert_history',[]))
  const [setupDone, setSetupDone] = useState(() => !!lsGet('alert_email',''))

  function saveEmail(e) { const v=e.trim(); setEmail(v); lsSet('alert_email',v); if(v) setSetupDone(true) }

  async function sendAlert(result) {
    if (!email) { setStatus({ ok:false, msg:'Please enter your email address first.' }); return }
    setSending(true); setStatus(null)
    try {
      await apiAlert({ to:email, ticker:result.ticker, decision:result.decision, confidence:result.confidence, entryPrice:result.entryPrice, stopLoss:result.stopLoss, targetPrice:result.targetPrice, reasoning:result.reasoning, livePrice:result.livePrice })
      const entry = { ticker:result.ticker, decision:result.decision, ts:new Date().toISOString() }
      const next  = [entry,...history.slice(0,9)]
      setHistory(next); lsSet('alert_history',next)
      setStatus({ ok:true, msg:`✅ Alert sent to ${email}` })
    } catch(e) {
      setStatus({ ok:false, msg:'❌ Failed to send: '+e.message })
    }
    setSending(false)
  }

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>

      {/* ── HOW IT WORKS ── */}
      <Card>
        <SectionTitle>How Email Alerts Work</SectionTitle>
        <div style={{ fontSize:15,color:C.text2,lineHeight:1.7,marginBottom:20 }}>
          After you run an AI analysis on any stock, you can instantly send yourself a full trading signal report by email — including the BUY/SELL/HOLD decision, entry price, stop loss, and target price.
        </div>

        {/* Step by step */}
        <div style={{ display:'flex',flexDirection:'column',gap:12,marginBottom:20 }}>
          {[
            { step:1, icon:'🔍', title:'Analyze a stock', body:'Go to the Analyze tab, search for any stock (e.g. AAPL), and click Analyze to get the AI signal.' },
            { step:2, icon:'📧', title:'Enter your email', body:'Type your email address in the box below. It saves automatically — you only need to do this once.' },
            { step:3, icon:'📨', title:'Send the alert', body:'Click the "Send Alert" button. You\'ll get a beautifully formatted email with the full trading report in seconds.' },
            { step:4, icon:'📩', title:'Check your inbox', body:'The email arrives instantly with all trade details — price, stop loss, target, reasoning, and key signals.' },
          ].map(s => (
            <div key={s.step} style={{ display:'flex',gap:14,alignItems:'flex-start',padding:'14px 16px',background:C.cardBg2,borderRadius:12,border:`1px solid ${C.border}` }}>
              <div style={{ width:32,height:32,borderRadius:'50%',background:C.brandLight,border:`2px solid ${C.brand}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:C.brand,flexShrink:0 }}>{s.step}</div>
              <div>
                <div style={{ fontSize:15,fontWeight:700,color:C.text1,marginBottom:4 }}>{s.icon} {s.title}</div>
                <div style={{ fontSize:14,color:C.text2,lineHeight:1.6 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Free tier note */}
        <div style={{ background:C.buyBg,border:`1px solid ${C.buyBorder}`,borderRadius:12,padding:'14px 16px',display:'flex',gap:12,alignItems:'flex-start' }}>
          <span style={{ fontSize:20,flexShrink:0 }}>💡</span>
          <div style={{ fontSize:13,color:C.text2,lineHeight:1.7 }}>
            <strong style={{color:C.buy}}>Free plan tip:</strong> Resend free tier only sends to your own Resend account email.
            Enter that same email below and alerts will work instantly.
            Want to send to any email? Verify a domain at{' '}
            <a href="https://resend.com/domains" target="_blank" rel="noreferrer" style={{color:C.brand,fontWeight:600}}>resend.com/domains</a>
            {' '}(takes 5 minutes, any domain works).
          </div>
        </div>
      </Card>

      {/* ── EMAIL SETUP ── */}
      <Card>
        <SectionTitle>Your Email Address</SectionTitle>
        <div style={{ fontSize:14,color:C.text2,marginBottom:14 }}>
          Enter the email where you want to receive trading alerts. Saved in your browser automatically.
        </div>
        <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            onBlur={e=>saveEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Alert email address"
            style={{ flex:1,minWidth:200,background:C.cardBg,border:`1.5px solid ${C.border}`,borderRadius:12,padding:'13px 16px',color:C.text1,fontSize:15,fontFamily:"'DM Sans',sans-serif" }}
          />
          <button onClick={()=>saveEmail(email)}
            style={{ background:C.brand,border:'none',color:'#fff',padding:'13px 24px',borderRadius:12,cursor:'pointer',fontSize:15,fontWeight:700,whiteSpace:'nowrap' }}>
            Save Email
          </button>
        </div>
        {setupDone && email && (
          <div style={{ marginTop:12,display:'flex',alignItems:'center',gap:8,fontSize:14,color:C.buy }}>
            <span>✅</span> Email saved — <strong>{email}</strong>
          </div>
        )}
      </Card>

      {/* ── SEND ALERT ── */}
      <Card style={{ border:`1px solid ${lastResult?C.brand+'30':C.border}` }}>
        <SectionTitle>Send Alert Now</SectionTitle>
        {lastResult ? (
          <>
            <div style={{ background:DS[lastResult.decision]?.bg||C.cardBg2,border:`1px solid ${DS[lastResult.decision]?.border||C.border}`,borderRadius:12,padding:'16px 18px',marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12 }}>
              <div>
                <div style={{ fontSize:13,color:C.text3,marginBottom:4 }}>Last analysis result</div>
                <div style={{ display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' }}>
                  <span style={{ fontSize:26,fontWeight:800,color:DS[lastResult.decision]?.text,fontFamily:"'DM Mono',monospace" }}>{lastResult.decision}</span>
                  <span style={{ fontSize:18,fontWeight:700,color:C.text1 }}>{lastResult.ticker}</span>
                  <span style={{ fontSize:14,color:C.text3 }}>{fmt(lastResult.livePrice)}</span>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13,color:C.text3 }}>Entry · Stop · Target</div>
                <div style={{ fontSize:14,fontWeight:600,color:C.text2,fontFamily:"'DM Mono',monospace",marginTop:2 }}>
                  {fmt(lastResult.entryPrice)} · {fmt(lastResult.stopLoss)} · {fmt(lastResult.targetPrice)}
                </div>
              </div>
            </div>

            <button onClick={()=>sendAlert(lastResult)} disabled={sending||!email}
              aria-label="Send trading alert email"
              style={{ width:'100%',background:sending||!email?C.border:C.brand,border:'none',color:sending||!email?C.text3:'#fff',padding:'16px',borderRadius:12,cursor:sending||!email?'not-allowed':'pointer',fontSize:16,fontWeight:700,transition:'all .2s',marginBottom:status?12:0 }}>
              {sending ? '📨 Sending...' : `📧 Send Alert to ${email||'(enter email above)'}`}
            </button>

            {status && (
              <div style={{ padding:'12px 16px',borderRadius:10,background:status.ok?C.buyBg:C.sellBg,border:`1px solid ${status.ok?C.buyBorder:C.sellBorder}`,fontSize:14,color:status.ok?C.buy:C.sell,fontWeight:600 }}>
                {status.msg}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign:'center',padding:'32px 20px',background:C.cardBg2,borderRadius:12,border:`2px dashed ${C.border}` }}>
            <div style={{ fontSize:40,marginBottom:12 }}>🤖</div>
            <div style={{ fontSize:15,fontWeight:600,color:C.text1,marginBottom:8 }}>No analysis yet</div>
            <div style={{ fontSize:14,color:C.text3,lineHeight:1.6,marginBottom:16 }}>
              Go to the <strong>Analyze</strong> tab, search for a stock, and click Analyze first.
              Then come back here to send yourself the result by email.
            </div>
            <div style={{ fontSize:13,color:C.brand,fontWeight:600 }}>Analyze tab → search stock → Analyze → come back here ✓</div>
          </div>
        )}
      </Card>

      {/* ── HISTORY ── */}
      {history.length > 0 && (
        <Card>
          <SectionTitle>Recently Sent Alerts</SectionTitle>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {history.map((h,i) => {
              const ds = DS[h.decision]||DS.HOLD
              return (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:C.cardBg2,borderRadius:10,border:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:15,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace",minWidth:56 }}>{h.ticker}</span>
                  <Badge color={ds.text} bg={DS[h.decision]?.bg}>{h.decision}</Badge>
                  <span style={{ marginLeft:'auto',fontSize:13,color:C.text3 }}>{new Date(h.ts).toLocaleString([], {dateStyle:'short',timeStyle:'short'})}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── TRENDING STOCKS COMPONENT ───────────────────────────────────────────────
const SIGNAL_STYLE = {
  BUY:   { bg:'#ecfdf5', border:'#6ee7b7', text:'#059669' },
  WATCH: { bg:'#fffbeb', border:'#fcd34d', text:'#b45309' },
  AVOID: { bg:'#fef2f2', border:'#fca5a5', text:'#dc2626' },
}

const FACTOR_COLORS = {
  'Analyst Upgrade':    '#059669',
  'Analyst Downgrade':  '#dc2626',
  'Earnings Beat':      '#059669',
  'Earnings Miss':      '#dc2626',
  'Unusual Volume':     '#4f46e5',
  'Insider Buying':     '#059669',
  'Insider Selling':    '#dc2626',
  'Institutional Buying':'#4f46e5',
  'M&A Activity':       '#7c3aed',
  'Government Contract':'#0891b2',
  'Macro Tailwind':     '#059669',
  'Macro Headwind':     '#dc2626',
  'Technical Breakout': '#4f46e5',
  'Technical Breakdown':'#dc2626',
  'Options Activity':   '#7c3aed',
  'Price Target Raise': '#059669',
  'Price Target Cut':   '#dc2626',
}

function TrendingStocks({ onAnalyze, data, loading, error, onRefresh }) {
  const [sortBy, setSortBy] = useState('rank')

  const stocks = (() => {
    if (!data?.stocks) return []
    const s = [...data.stocks]
    if (sortBy === 'confidence') s.sort((a,b) => b.confidence - a.confidence)
    else if (sortBy === 'change') s.sort((a,b) => Math.abs(b.change||0) - Math.abs(a.change||0))
    else s.sort((a,b) => a.rank - b.rank)
    return s
  })()

  if (loading) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:14 }}>
      <Spinner size={36} />
      <div style={{ fontSize:15,color:C.text2,fontWeight:600 }}>Analyzing market trends...</div>
      <div style={{ fontSize:13,color:C.text3 }}>Scanning news, analyst reports, volume & momentum signals</div>
    </div>
  )

  if (error) return (
    <div style={{ background:C.sellBg,border:`1px solid ${C.sellBorder}`,borderRadius:12,padding:'16px 20px',color:C.sell,fontSize:14 }}>
      ⚠ {error}
      <button onClick={onRefresh} style={{ marginLeft:12,background:'transparent',border:`1px solid ${C.sell}`,color:C.sell,padding:'4px 12px',borderRadius:8,cursor:'pointer',fontSize:13 }}>Retry</button>
    </div>
  )

  if (!data) return null

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10 }}>
        <div>
          {data.cached && (
            <div style={{ fontSize:12,color:C.text3,marginTop:4 }}>
              {data.stale ? '⚠ Showing cached data' : `🕐 Refreshes every 30 min`}
              {data.cachedAt && ` · Last updated ${new Date(data.cachedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}
            </div>
          )}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <span style={{ fontSize:13,color:C.text3 }}>Sort by:</span>
          {[['rank','🏆 Rank'],['confidence','💯 Confidence'],['change','📈 Movement']].map(([id,label])=>(
            <button key={id} onClick={()=>setSortBy(id)} style={{
              background:sortBy===id?C.brandLight:'transparent',
              border:`1px solid ${sortBy===id?C.brand:C.border}`,
              color:sortBy===id?C.brand:C.text2,
              padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,transition:'all .15s'
            }}>{label}</button>
          ))}
          <button onClick={onRefresh} style={{ background:C.brandLight,border:`1px solid ${C.brand}30`,color:C.brand,padding:'5px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600 }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Stock cards */}
      <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
        {stocks.map((s,i) => {
          const ss = SIGNAL_STYLE[s.signal] || SIGNAL_STYLE.WATCH
          const up = (s.change || 0) >= 0
          return (
            <div key={s.ticker} style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px 18px',boxShadow:'0 1px 4px rgba(0,0,0,0.05)',transition:'all .2s' }}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(79,70,229,0.1)';e.currentTarget.style.borderColor=C.brand+'40'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)';e.currentTarget.style.borderColor=C.border}}>
              <div style={{ display:'flex',alignItems:'flex-start',gap:14,flexWrap:'wrap' }}>

                {/* Rank badge */}
                <div style={{ width:36,height:36,borderRadius:10,background:i<3?`linear-gradient(135deg,${C.brand},#7c3aed)`:C.cardBg2,border:`1px solid ${i<3?C.brand+'40':C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:i<3?'#fff':C.text2,flexShrink:0 }}>
                  {s.rank}
                </div>

                {/* Main info */}
                <div style={{ flex:1,minWidth:200 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap' }}>
                    <span style={{ fontSize:17,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{s.ticker}</span>
                    <span style={{ fontSize:14,color:C.text2 }}>{s.name}</span>
                    <span style={{ fontSize:11,color:C.text3,background:C.cardBg2,border:`1px solid ${C.border}`,borderRadius:6,padding:'1px 8px' }}>{s.sector}</span>
                    {/* Signal badge */}
                    <span style={{ fontSize:11,fontWeight:700,color:ss.text,background:ss.bg,border:`1px solid ${ss.border}`,borderRadius:20,padding:'2px 10px' }}>{s.signal}</span>
                  </div>

                  {/* Catalyst */}
                  <div style={{ fontSize:13,fontWeight:600,color:C.text1,marginBottom:6,lineHeight:1.4 }}>⚡ {s.catalyst}</div>

                  {/* Reason */}
                  <div style={{ fontSize:13,color:C.text2,lineHeight:1.6,marginBottom:10 }}>{s.reason}</div>

                  {/* Factor tags */}
                  <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                    {(s.factors||[]).map(f => (
                      <span key={f} style={{ fontSize:11,fontWeight:600,color:FACTOR_COLORS[f]||C.brand,background:(FACTOR_COLORS[f]||C.brand)+'15',border:`1px solid ${(FACTOR_COLORS[f]||C.brand)}30`,borderRadius:6,padding:'2px 8px' }}>{f}</span>
                    ))}
                  </div>
                </div>

                {/* Right side: confidence + action */}
                <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8,flexShrink:0 }}>
                  {/* Confidence ring */}
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:10,color:C.text3,letterSpacing:'1px',marginBottom:2 }}>CONFIDENCE</div>
                    <div style={{ fontSize:22,fontWeight:800,color:s.confidence>=80?C.buy:s.confidence>=60?C.warning:C.sell,fontFamily:"'DM Mono',monospace" }}>
                      {s.confidence}%
                    </div>
                    {/* Bar */}
                    <div style={{ width:56,height:4,background:C.border,borderRadius:2,marginTop:4,overflow:'hidden' }}>
                      <div style={{ width:`${s.confidence}%`,height:'100%',background:s.confidence>=80?C.buy:s.confidence>=60?C.warning:C.sell,borderRadius:2,transition:'width .6s' }} />
                    </div>
                  </div>
                  <button onClick={()=>onAnalyze(s.ticker)} style={{ background:C.brand,border:'none',color:'#fff',padding:'8px 16px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:700,transition:'all .2s',whiteSpace:'nowrap' }}>
                    Analyze ▸
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── EARNINGS CALENDAR COMPONENT ─────────────────────────────────────────────
const TIME_STYLE = {
  'Pre-Market':     { bg:'#fef9c3', border:'#fde047', text:'#854d0e', icon:'🌅' },
  'After-Hours':    { bg:'#e0e7ff', border:'#a5b4fc', text:'#3730a3', icon:'🌙' },
  'During Market':  { bg:'#dcfce7', border:'#86efac', text:'#166534', icon:'☀️' },
  'TBD':            { bg:'#f1f5f9', border:'#cbd5e1', text:'#64748b', icon:'❓' },
}

function EarningsCalendar({ onAnalyze, data, loading, error, onRefresh }) {
  const [filter, setFilter] = useState('ALL')

  const earnings = (() => {
    if (!data?.earnings) return []
    let e = [...data.earnings]
    if (filter === 'PRE')    e = e.filter(x => x.time === 'Pre-Market')
    if (filter === 'POST')   e = e.filter(x => x.time === 'After-Hours')
    if (filter === 'DURING') e = e.filter(x => x.time === 'During Market')
    return e
  })()

  const grouped = (() => {
    const g = {}
    earnings.forEach(e => {
      const k = e.dateFormatted || 'TBD'
      if (!g[k]) g[k] = []
      g[k].push(e)
    })
    return g
  })()

  if (loading) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:14 }}>
      <Spinner size={36} />
      <div style={{ fontSize:15,color:C.text2,fontWeight:600 }}>Loading earnings calendar...</div>
    </div>
  )

  if (error) return (
    <div style={{ background:C.sellBg,border:`1px solid ${C.sellBorder}`,borderRadius:12,padding:'16px 20px',color:C.sell,fontSize:14 }}>
      ⚠ {error}
      <button onClick={onRefresh} style={{ marginLeft:12,background:'transparent',border:`1px solid ${C.sell}`,color:C.sell,padding:'4px 12px',borderRadius:8,cursor:'pointer',fontSize:13 }}>Retry</button>
    </div>
  )

  if (!data) return null

  return (
    <div>
      {/* Controls */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10 }}>
        <div style={{ fontSize:13,color:C.text3 }}>
          {data.week && `Week of ${data.week.from} · `}{earnings.length} major companies reporting
        </div>
        <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
          {[['ALL','All'],['PRE','🌅 Pre-Mkt'],['POST','🌙 After-Hrs'],['DURING','☀️ During']].map(([id,label])=>(
            <button key={id} onClick={()=>setFilter(id)} style={{
              background:filter===id?C.brandLight:'transparent',
              border:`1px solid ${filter===id?C.brand:C.border}`,
              color:filter===id?C.brand:C.text2,
              padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,transition:'all .15s'
            }}>{label}</button>
          ))}
          <button onClick={onRefresh} style={{ background:C.brandLight,border:`1px solid ${C.brand}30`,color:C.brand,padding:'5px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600 }}>
            ↻
          </button>
        </div>
      </div>

      {earnings.length === 0 ? (
        <div style={{ textAlign:'center',padding:'40px 20px',color:C.text3 }}>
          <div style={{ fontSize:40,marginBottom:12 }}>📅</div>
          <div style={{ fontSize:15 }}>No major earnings scheduled this week</div>
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:20 }}>
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              {/* Day header */}
              <div style={{ fontSize:12,fontWeight:700,color:C.brand,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10,display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ width:3,height:16,background:C.brand,borderRadius:2 }} />
                {day}
                <span style={{ fontWeight:400,color:C.text3,letterSpacing:0 }}>· {items.length} {items.length===1?'company':'companies'}</span>
              </div>

              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {items.map((e,i) => {
                  const ts = TIME_STYLE[e.time] || TIME_STYLE.TBD
                  return (
                    <div key={e.ticker+i} style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:12,padding:'13px 16px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',transition:'all .2s' }}
                      onMouseEnter={ev=>{ev.currentTarget.style.borderColor=C.brand+'40';ev.currentTarget.style.boxShadow='0 4px 12px rgba(79,70,229,0.08)'}}
                      onMouseLeave={ev=>{ev.currentTarget.style.borderColor=C.border;ev.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}}>

                      {/* Company */}
                      <div style={{ flex:1,minWidth:160 }}>
                        <div style={{ fontSize:15,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace",marginBottom:2 }}>{e.ticker}</div>
                        <div style={{ fontSize:13,color:C.text3 }}>{e.name}</div>
                      </div>

                      {/* EPS estimate */}
                      {e.epsEstimate != null && (
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:10,color:C.text3,letterSpacing:'1px',marginBottom:2 }}>EPS EST.</div>
                          <div style={{ fontSize:14,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>
                            {e.epsEstimate >= 0 ? '$' : '-$'}{Math.abs(e.epsEstimate).toFixed(2)}
                          </div>
                        </div>
                      )}

                      {/* Quarter */}
                      {e.quarter && e.year && (
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:10,color:C.text3,letterSpacing:'1px',marginBottom:2 }}>PERIOD</div>
                          <div style={{ fontSize:13,fontWeight:600,color:C.text2 }}>Q{e.quarter} {e.year}</div>
                        </div>
                      )}

                      {/* Time badge */}
                      <span style={{ fontSize:12,fontWeight:700,color:ts.text,background:ts.bg,border:`1px solid ${ts.border}`,borderRadius:8,padding:'4px 10px',whiteSpace:'nowrap' }}>
                        {ts.icon} {e.time}
                      </span>

                      {/* Analyze button */}
                      <button onClick={()=>onAnalyze(e.ticker)} style={{ background:C.brandLight,border:`1px solid ${C.brand}30`,color:C.brand,padding:'7px 14px',borderRadius:9,cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap',transition:'all .15s' }}>
                        Analyze
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── POPULAR CHIPS COMPONENT ─────────────────────────────────────────────────
function PopularChips({ sym, onSelect }) {
  const [mkt, setMkt] = useState('US')
  const chips = mkt === 'IN' ? POPULAR_IN : mkt === 'CA' ? POPULAR_CA : POPULAR_US
  const stripSuffix = s => s.replace(/\.(NS|BO|TO)$/, '')
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex',gap:6,marginBottom:10 }}>
        {[['🇺🇸','US','USA'],['🇮🇳','IN','India'],['🇨🇦','CA','Canada']].map(([flag,id,label]) => (
          <button key={id} onClick={() => setMkt(id)} style={{
            background: mkt===id ? C.brand : 'transparent',
            border: `1.5px solid ${mkt===id ? C.brand : C.border}`,
            color: mkt===id ? '#fff' : C.text2,
            padding:'5px 14px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:700,
            display:'flex',alignItems:'center',gap:5,transition:'all .15s',
          }}>
            <span>{flag}</span> {label}
          </button>
        ))}
      </div>
      <div style={{ display:'flex',flexWrap:'wrap',gap:6 }} role="group" aria-label="Popular stocks">
        {chips.map(t => (
          <button key={t} className="chip"
            onClick={() => onSelect(t)}
            aria-pressed={sym === t}
            style={{ background:sym===t?C.brandLight:'#f8fafc',border:`1.5px solid ${sym===t?C.brand:C.border}`,color:sym===t?C.brand:C.text2,padding:'5px 12px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:600,transition:'all .15s' }}>
            {stripSuffix(t)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── SKELETON LOADER ──────────────────────────────────────────────────────────
function SkeletonCard({ lines=3, height=16 }) {
  return (
    <div style={{ background:C.cardBg,borderRadius:16,border:`1px solid ${C.border}`,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
      <style>{`@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}.sk{background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:800px 100%;animation:shimmer 1.4s infinite;border-radius:6px}`}</style>
      {Array.from({length:lines}).map((_,i)=>(
        <div key={i} className="sk" style={{ height,marginBottom:i<lines-1?12:0,width:i===lines-1?'60%':'100%' }} />
      ))}
    </div>
  )
}

// ─── SENTIMENT PILL ───────────────────────────────────────────────────────────
function SentimentPill({ sentiment, score }) {
  const cfg = {
    Bullish: { bg:'#ecfdf5', border:'#6ee7b7', text:'#059669', icon:'▲' },
    Bearish: { bg:'#fef2f2', border:'#fca5a5', text:'#dc2626', icon:'▼' },
    Neutral: { bg:'#f1f5f9', border:'#cbd5e1', text:'#64748b', icon:'◆' },
  }
  const s = cfg[sentiment] || cfg.Neutral
  return (
    <span style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700,color:s.text,background:s.bg,border:`1px solid ${s.border}` }}>
      {s.icon} {sentiment} Sentiment{score!=null?` · ${score}/100`:''}
    </span>
  )
}

// ─── WHY BUY / WHY NOT BUY ────────────────────────────────────────────────────
function WhyBuySection({ whyBuy, whyNotBuy, finalInsight, aiSummary }) {
  if (!whyBuy?.length && !whyNotBuy?.length) return null
  const bias = finalInsight?.bias || 'Neutral'
  const biasCfg = {
    Bullish: { color:C.buy,   bg:C.buyBg,   border:C.buyBorder,   icon:'▲' },
    Bearish: { color:C.sell,  bg:C.sellBg,  border:C.sellBorder,  icon:'▼' },
    Neutral: { color:C.hold,  bg:C.holdBg,  border:C.holdBorder,  icon:'◆' },
  }
  const bc = biasCfg[bias] || biasCfg.Neutral

  return (
    <div style={{ marginBottom:14, animation:'fadeUp .4s ease' }}>
      {/* AI Summary strip */}
      {aiSummary && (
        <div style={{ background:`linear-gradient(135deg,${C.brand}10,${C.brandMid}10)`,border:`1px solid ${C.brand}30`,borderRadius:14,padding:'14px 18px',marginBottom:12,display:'flex',gap:12,alignItems:'flex-start' }}>
          <span style={{ fontSize:20,flexShrink:0 }}>🧠</span>
          <div>
            <div style={{ fontSize:11,fontWeight:700,color:C.brand,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:4 }}>AI Insight</div>
            <div style={{ fontSize:14,color:C.text1,fontWeight:500,lineHeight:1.65 }}>{aiSummary}</div>
          </div>
        </div>
      )}

      {/* Why Buy / Why Not Buy grid */}
      <div className="grid-2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
        {/* Why Buy */}
        <div style={{ background:C.buyBg,border:`1.5px solid ${C.buyBorder}`,borderRadius:14,padding:'18px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:C.buy,marginBottom:12,display:'flex',alignItems:'center',gap:6 }}>
            <span style={{ background:C.buy,color:'#fff',borderRadius:'50%',width:20,height:20,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,flexShrink:0 }}>✓</span>
            Why Consider Buying
          </div>
          {(whyBuy||[]).map((r,i)=>(
            <div key={i} style={{ display:'flex',gap:10,marginBottom:i<(whyBuy.length-1)?10:0,alignItems:'flex-start' }}>
              <span style={{ color:C.buy,fontWeight:700,fontSize:15,flexShrink:0,lineHeight:1.4 }}>▸</span>
              <span style={{ fontSize:13,color:C.text2,lineHeight:1.6 }}>{r}</span>
            </div>
          ))}
        </div>

        {/* Why Not Buy */}
        <div style={{ background:C.sellBg,border:`1.5px solid ${C.sellBorder}`,borderRadius:14,padding:'18px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:C.sell,marginBottom:12,display:'flex',alignItems:'center',gap:6 }}>
            <span style={{ background:C.sell,color:'#fff',borderRadius:'50%',width:20,height:20,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,flexShrink:0 }}>!</span>
            Why Be Cautious
          </div>
          {(whyNotBuy||[]).map((r,i)=>(
            <div key={i} style={{ display:'flex',gap:10,marginBottom:i<(whyNotBuy.length-1)?10:0,alignItems:'flex-start' }}>
              <span style={{ color:C.sell,fontWeight:700,fontSize:15,flexShrink:0,lineHeight:1.4 }}>▸</span>
              <span style={{ fontSize:13,color:C.text2,lineHeight:1.6 }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Final Insight */}
      {finalInsight && (
        <div style={{ background:bc.bg,border:`2px solid ${bc.border}`,borderRadius:14,padding:'18px 20px',display:'flex',gap:16,alignItems:'flex-start',flexWrap:'wrap' }}>
          <div style={{ flexShrink:0,textAlign:'center',minWidth:80 }}>
            <div style={{ fontSize:11,color:C.text3,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:4 }}>Overall Bias</div>
            <div style={{ fontSize:20,fontWeight:800,color:bc.color,fontFamily:"'Syne',sans-serif" }}>{bc.icon} {bias}</div>
            <div style={{ fontSize:11,fontWeight:600,color:bc.color,marginTop:4 }}>{finalInsight.confidenceLevel} Confidence</div>
          </div>
          <div style={{ flex:1,minWidth:200 }}>
            <div style={{ fontSize:12,fontWeight:700,color:bc.color,letterSpacing:'1px',textTransform:'uppercase',marginBottom:6 }}>Final Insight</div>
            <div style={{ fontSize:14,color:C.text2,lineHeight:1.75 }}>{finalInsight.summary}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── GLOBAL NEWS SECTION ──────────────────────────────────────────────────────
const IMPACT_COLORS = {
  High:   { bg:'#fef2f2', border:'#fca5a5', text:'#dc2626' },
  Medium: { bg:'#fffbeb', border:'#fcd34d', text:'#b45309' },
  Low:    { bg:'#f8fafc', border:'#e2e8f0', text:'#64748b' },
}
const SECTOR_COLORS = {
  Technology:'#4f46e5', Healthcare:'#0891b2', Finance:'#059669',
  Energy:'#d97706', Consumer:'#7c3aed', Industrial:'#64748b', 'General Market':'#6b7280',
}

function GlobalNewsSection({ data, loading, error, onRefresh }) {
  const [filter, setFilter] = useState('All')
  const impacts = ['All','High','Medium','Low']

  const articles = (() => {
    if (!data?.articles) return []
    if (filter === 'All') return data.articles
    return data.articles.filter(a => a.impact === filter)
  })()

  if (loading) return (
    <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
      {[1,2,3].map(i=><SkeletonCard key={i} lines={3} height={14} />)}
    </div>
  )

  if (error) return (
    <div style={{ background:C.sellBg,border:`1px solid ${C.sellBorder}`,borderRadius:12,padding:'14px 18px',color:C.sell,fontSize:14 }}>
      ⚠ {error}
      <button onClick={onRefresh} style={{ marginLeft:12,background:'transparent',border:`1px solid ${C.sell}`,color:C.sell,padding:'4px 10px',borderRadius:8,cursor:'pointer',fontSize:12 }}>Retry</button>
    </div>
  )

  if (!data) return null

  return (
    <div>
      {/* Sentiment header */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10 }}>
        <div style={{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
          <SentimentPill sentiment={data.sentiment} score={data.sentimentScore} />
          {data.cached && <span style={{ fontSize:11,color:C.text4 }}>🕐 Cached · refreshes every 15 min</span>}
        </div>
        <div style={{ display:'flex',gap:6,flexWrap:'wrap',alignItems:'center' }}>
          <span style={{ fontSize:12,color:C.text3,fontWeight:600 }}>Filter:</span>
          {impacts.map(imp=>(
            <button key={imp} onClick={()=>setFilter(imp)} style={{
              background:filter===imp?C.brandLight:'transparent',
              border:`1px solid ${filter===imp?C.brand:C.border}`,
              color:filter===imp?C.brand:C.text2,
              padding:'4px 11px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,transition:'all .15s'
            }}>{imp}</button>
          ))}
          <button onClick={onRefresh} style={{ background:C.brandLight,border:`1px solid ${C.brand}30`,color:C.brand,padding:'4px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600 }}>↻</button>
        </div>
      </div>

      {articles.length === 0 ? (
        <div style={{ textAlign:'center',padding:40,color:C.text3 }}>No articles for this filter</div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {articles.map((a,i) => {
            const ic = IMPACT_COLORS[a.impact] || IMPACT_COLORS.Low
            return (
              <a key={a.id||i} href={a.url} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
                <div style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:12,padding:'15px 18px',transition:'all .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.brand;e.currentTarget.style.boxShadow=`0 4px 16px rgba(79,70,229,0.1)`}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}}>
                  <div style={{ display:'flex',alignItems:'flex-start',gap:10,marginBottom:8,flexWrap:'wrap' }}>
                    <span style={{ fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:6,color:ic.text,background:ic.bg,border:`1px solid ${ic.border}`,flexShrink:0,whiteSpace:'nowrap' }}>
                      {a.impact} Impact
                    </span>
                    {(a.sectors||[]).map(sec=>(
                      <span key={sec} style={{ fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:6,color:(SECTOR_COLORS[sec]||C.brand),background:(SECTOR_COLORS[sec]||C.brand)+'15',border:`1px solid ${(SECTOR_COLORS[sec]||C.brand)}30`,flexShrink:0 }}>{sec}</span>
                    ))}
                    <span style={{ marginLeft:'auto',fontSize:11,color:C.text4,flexShrink:0,whiteSpace:'nowrap' }}>{timeAgo(a.datetime)}</span>
                  </div>
                  <div style={{ fontSize:14,fontWeight:600,color:C.text1,lineHeight:1.55,marginBottom:6 }}>{a.headline}</div>
                  {a.summary && <div style={{ fontSize:12,color:C.text3,lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',marginBottom:6 }}>{a.summary}</div>}
                  <div style={{ fontSize:12,fontWeight:600,color:C.brand }}>{a.source} ↗</div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── FEATURED STOCKS & ETFs SECTION ──────────────────────────────────────────
const SIG_CFG = {
  BUY:  { bg:'#ecfdf5', border:'#6ee7b7', text:'#059669' },
  HOLD: { bg:'#fffbeb', border:'#fcd34d', text:'#b45309' },
  SELL: { bg:'#fef2f2', border:'#fca5a5', text:'#dc2626' },
}

function FeaturedCard({ item, onAnalyze, type='stock' }) {
  const sc  = SIG_CFG[item.signal] || SIG_CFG.HOLD
  const up  = (item.change||0) >= 0
  const cat = type==='etf' ? item.category : item.sector
  const catColor = SECTOR_COLORS[cat] || C.brand
  return (
    <div style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px 18px',display:'flex',flexDirection:'column',gap:10,boxShadow:'0 1px 3px rgba(0,0,0,0.05)',transition:'all .2s',minWidth:0 }}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(79,70,229,0.1)';e.currentTarget.style.borderColor=C.brand+'40'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)';e.currentTarget.style.borderColor=C.border}}>
      {/* Header row */}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:16,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{item.ticker}</div>
          <div style={{ fontSize:12,color:C.text3,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.name}</div>
        </div>
        <span style={{ fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:12,color:sc.text,background:sc.bg,border:`1px solid ${sc.border}`,whiteSpace:'nowrap',flexShrink:0 }}>{item.signal}</span>
      </div>
      {/* Price */}
      <div style={{ display:'flex',alignItems:'center',gap:10 }}>
        <span style={{ fontSize:17,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>${Number(item.price||0).toFixed(2)}</span>
        <span style={{ fontSize:12,fontWeight:600,color:up?C.buy:C.sell }}>{up?'▲':'▼'} {up?'+':''}{Number(item.change||0).toFixed(2)}%</span>
      </div>
      {/* Confidence bar */}
      <div>
        <div style={{ display:'flex',justifyContent:'space-between',fontSize:11,color:C.text3,marginBottom:4 }}>
          <span>Confidence</span><span style={{ fontWeight:700,color:item.confidence>=80?C.buy:item.confidence>=65?C.warning:C.sell }}>{item.confidence}%</span>
        </div>
        <div style={{ height:4,background:C.border,borderRadius:2,overflow:'hidden' }}>
          <div style={{ width:`${item.confidence}%`,height:'100%',background:item.confidence>=80?C.buy:item.confidence>=65?C.warning:C.sell,borderRadius:2,transition:'width .6s' }} />
        </div>
      </div>
      {/* Category + Reason */}
      <div>
        <span style={{ fontSize:11,fontWeight:600,color:catColor,background:catColor+'15',border:`1px solid ${catColor}30`,borderRadius:6,padding:'2px 8px' }}>{cat}</span>
      </div>
      <div style={{ fontSize:12,color:C.text2,lineHeight:1.6 }}>{item.reason}</div>
      {/* Action */}
      <button onClick={()=>onAnalyze(item.ticker)}
        style={{ background:C.brand,border:'none',color:'#fff',padding:'8px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:700,transition:'all .2s',marginTop:'auto' }}>
        Full Analysis ▸
      </button>
    </div>
  )
}

// mode: 'stocks' | 'etfs' | 'both' (default 'both')
function FeaturedSection({ data, loading, error, onAnalyze, onRefresh, mode = 'both' }) {
  const [view,   setView]   = useState(mode === 'etfs' ? 'etfs' : 'stocks')
  const [sector, setSector] = useState('All')

  // ── Derive filter lists dynamically from actual data ──────────────────────
  const stockSectors = useMemo(() => {
    if (!data?.stocks?.length) return ['All']
    const counts = {}
    data.stocks.forEach(s => { counts[s.sector] = (counts[s.sector] || 0) + 1 })
    // Sort by count desc, keep All first
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([k]) => k)
    return ['All', ...sorted]
  }, [data?.stocks])

  const etfCats = useMemo(() => {
    if (!data?.etfs?.length) return ['All']
    const counts = {}
    data.etfs.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1 })
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([k]) => k)
    return ['All', ...sorted]
  }, [data?.etfs])

  // Count helper for badges
  function countFor(list, key, val) {
    if (val === 'All') return list.length
    return list.filter(item => item[key] === val).length
  }

  // ── Filtered lists ────────────────────────────────────────────────────────
  const visibleStocks = useMemo(() => {
    if (!data?.stocks) return []
    const filtered = sector === 'All'
      ? data.stocks
      : data.stocks.filter(s => s.sector === sector)
    // Sort by confidence desc
    return [...filtered].sort((a,b) => (b.confidence||0) - (a.confidence||0))
  }, [data?.stocks, sector])

  const visibleEtfs = useMemo(() => {
    if (!data?.etfs) return []
    const filtered = sector === 'All'
      ? data.etfs
      : data.etfs.filter(e => e.category === sector)
    return [...filtered].sort((a,b) => (b.confidence||0) - (a.confidence||0))
  }, [data?.etfs, sector])

  // ── Fallback "related" stocks when filter returns < 3 ────────────────────
  const fallbackStocks = useMemo(() => {
    if (visibleStocks.length >= 3 || !data?.stocks || sector === 'All') return []
    return [...data.stocks]
      .filter(s => s.sector !== sector)
      .sort((a,b) => (b.confidence||0) - (a.confidence||0))
      .slice(0, 4)
  }, [visibleStocks, data?.stocks, sector])

  if (loading) return (
    <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12 }}>
      {[1,2,3,4,5,6].map(i=><SkeletonCard key={i} lines={5} height={12} />)}
    </div>
  )
  if (error) return (
    <div style={{ background:C.sellBg,border:`1px solid ${C.sellBorder}`,borderRadius:12,padding:'14px 18px',color:C.sell,fontSize:14 }}>
      ⚠ {error}
      <button onClick={onRefresh} style={{ marginLeft:12,background:'transparent',border:`1px solid ${C.sell}`,color:C.sell,padding:'4px 10px',borderRadius:8,cursor:'pointer',fontSize:12 }}>Retry</button>
    </div>
  )
  if (!data) return null

  const activeFilters  = view === 'stocks' ? stockSectors : etfCats
  const activeList     = view === 'stocks' ? visibleStocks : visibleEtfs
  const activeDataPool = view === 'stocks' ? (data.stocks||[]) : (data.etfs||[])
  const countKey       = view === 'stocks' ? 'sector' : 'category'

  return (
    <div>
      {/* Stocks / ETFs toggle — only shown in 'both' mode */}
      {mode === 'both' && (
        <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap' }}>
          {[['stocks',`📈 Stocks (${(data.stocks||[]).length})`],['etfs',`🧺 ETFs (${(data.etfs||[]).length})`]].map(([id,label])=>(
            <button key={id} onClick={()=>{setView(id);setSector('All')}} style={{
              background:view===id?C.brand:'transparent',
              border:`1.5px solid ${view===id?C.brand:C.border}`,
              color:view===id?'#fff':C.text2,
              padding:'7px 18px',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:700,transition:'all .15s'
            }}>{label}</button>
          ))}
          {data.cached && <span style={{ marginLeft:'auto',fontSize:11,color:C.text4 }}>🕐 ~30 min cache</span>}
        </div>
      )}
      {mode !== 'both' && data.cached && (
        <div style={{ fontSize:11,color:C.text4,marginBottom:12 }}>🕐 ~30 min cache</div>
      )}

      {/* Dynamic category filter chips with counts */}
      <div style={{ display:'flex',gap:6,marginBottom:16,flexWrap:'wrap' }}>
        {activeFilters.map(f => {
          const cnt = countFor(activeDataPool, countKey, f)
          const active = sector === f
          return (
            <button key={f} onClick={()=>setSector(f)} style={{
              background: active ? C.brand : C.cardBg,
              border: `1.5px solid ${active ? C.brand : C.border}`,
              color: active ? '#fff' : C.text2,
              padding:'5px 12px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:600,
              transition:'all .15s',display:'flex',alignItems:'center',gap:5,
            }}>
              {f}
              <span style={{
                background: active ? 'rgba(255,255,255,0.25)' : C.brandLight,
                color: active ? '#fff' : C.brand,
                borderRadius:10,padding:'1px 7px',fontSize:11,fontWeight:700,
              }}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* Cards grid */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12,transition:'all .2s' }}>
        {activeList.map(item=>(
          <FeaturedCard key={item.ticker} item={item} onAnalyze={onAnalyze} type={view==='etfs'?'etf':'stock'} />
        ))}
      </div>

      {/* Empty state with fallback related stocks */}
      {activeList.length === 0 && (
        <div style={{ textAlign:'center',padding:'24px 16px',color:C.text3 }}>
          <div style={{ fontSize:32,marginBottom:8 }}>🔍</div>
          <div style={{ fontSize:14,fontWeight:600,color:C.text2,marginBottom:4 }}>No {view === 'etfs' ? 'ETFs' : 'stocks'} tagged "{sector}"</div>
          <div style={{ fontSize:13,color:C.text3 }}>The AI may have used a different category name this session.</div>
        </div>
      )}

      {/* Fallback "Related from other sectors" when < 3 results */}
      {view === 'stocks' && visibleStocks.length > 0 && visibleStocks.length < 3 && fallbackStocks.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:12,fontWeight:700,color:C.text3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:10,display:'flex',alignItems:'center',gap:8 }}>
            <div style={{ flex:1,height:1,background:C.border }} />
            Top Picks From Other Sectors
            <div style={{ flex:1,height:1,background:C.border }} />
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12 }}>
            {fallbackStocks.map(item=>(
              <FeaturedCard key={item.ticker} item={item} onAnalyze={onAnalyze} type="stock" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MARKET PULSE BAR ────────────────────────────────────────────────────────
const INDICES = [
  { sym:'SPY',  label:'S&P 500',   flag:'🇺🇸' },
  { sym:'QQQ',  label:'NASDAQ',    flag:'💻'   },
  { sym:'DIA',  label:'Dow Jones', flag:'🏦'   },
  { sym:'IWM',  label:'Russell',   flag:'📈'   },
]

function MarketPulseBar({ sentiment, sentimentScore }) {
  const [prices,  setPrices]  = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled(INDICES.map(idx => apiPrice(idx.sym))).then(results => {
      const p = {}
      results.forEach((r,i) => { if (r.status==='fulfilled') p[INDICES[i].sym]=r.value })
      setPrices(p); setLoading(false)
    })
  }, [])

  return (
    <div style={{ background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:14,padding:'14px 18px',marginBottom:16,boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10 }}>
        {/* Index tiles */}
        <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
          {INDICES.map(idx => {
            const p   = prices[idx.sym]
            const up  = p ? p.change >= 0 : null
            return (
              <div key={idx.sym} style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:C.cardBg2,borderRadius:10,border:`1px solid ${up===true?C.buyBorder:up===false?C.sellBorder:C.border}`,minWidth:120 }}>
                <span style={{ fontSize:16 }}>{idx.flag}</span>
                <div>
                  <div style={{ fontSize:10,color:C.text3,fontWeight:700,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:2 }}>{idx.label}</div>
                  {loading ? (
                    <div style={{ width:70,height:10,background:C.border,borderRadius:3,animation:'shimmer 1.4s infinite' }} />
                  ) : p ? (
                    <div style={{ display:'flex',alignItems:'baseline',gap:5 }}>
                      <span style={{ fontSize:14,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{fmt(p.price)}</span>
                      <span style={{ fontSize:11,fontWeight:700,color:up?C.buy:C.sell }}>{up?'▲':'▼'}{up?'+':''}{p.changePct}%</span>
                    </div>
                  ) : <span style={{ fontSize:12,color:C.text4 }}>—</span>}
                </div>
              </div>
            )
          })}
        </div>
        {/* Sentiment */}
        <div style={{ display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
          {sentiment ? (
            <>
              <span style={{ fontSize:12,color:C.text3,fontWeight:600 }}>Market Mood:</span>
              <SentimentPill sentiment={sentiment} score={sentimentScore} />
            </>
          ) : (
            <div style={{ width:120,height:22,background:C.border,borderRadius:20,animation:'shimmer 1.4s infinite' }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AI TOP PICKS ─────────────────────────────────────────────────────────────
function AITopPicks({ data, loading, onAnalyze }) {
  if (loading) return (
    <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12,marginBottom:16 }}>
      {[1,2,3].map(i=><SkeletonCard key={i} lines={4} height={12} />)}
    </div>
  )
  if (!data?.stocks?.length) return null

  const picks = [...data.stocks]
    .filter(s => s.signal === 'BUY')
    .sort((a,b) => (b.confidence||0)-(a.confidence||0))
    .slice(0,3)

  if (!picks.length) return null

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:6 }}>
        <div>
          <div style={{ fontSize:12,fontWeight:700,color:C.brand,letterSpacing:'1.5px',textTransform:'uppercase' }}>🧠 AI Top Picks Today</div>
          <div style={{ fontSize:12,color:C.text3,marginTop:2 }}>Highest-confidence BUY signals from AI analysis</div>
        </div>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12 }}>
        {picks.map((s,i) => {
          const rankColors = ['#f59e0b','#9ca3af','#b45309']
          return (
            <div key={s.ticker} style={{ background:`linear-gradient(135deg,${C.buyBg},${C.cardBg})`,border:`1.5px solid ${C.buyBorder}`,borderRadius:14,padding:'16px 18px',display:'flex',gap:14,alignItems:'flex-start',boxShadow:'0 2px 8px rgba(5,150,105,0.08)',transition:'all .2s' }}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(5,150,105,0.15)';e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(5,150,105,0.08)';e.currentTarget.style.transform='none'}}>
              {/* Rank */}
              <div style={{ width:28,height:28,borderRadius:8,background:rankColors[i]+'20',border:`2px solid ${rankColors[i]}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:rankColors[i],flexShrink:0 }}>{i+1}</div>
              {/* Info */}
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap' }}>
                  <span style={{ fontSize:16,fontWeight:800,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{s.ticker}</span>
                  <span style={{ fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10,color:C.buy,background:C.buyBg,border:`1px solid ${C.buyBorder}` }}>BUY</span>
                  <span style={{ fontSize:11,color:C.text3,background:C.cardBg2,border:`1px solid ${C.border}`,borderRadius:6,padding:'1px 7px' }}>{s.sector}</span>
                </div>
                <div style={{ fontSize:12,color:C.text2,lineHeight:1.55,marginBottom:8,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{s.reason}</div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                  <span style={{ fontSize:12,fontWeight:700,color:s.confidence>=80?C.buy:C.warning }}>⚡ {s.confidence}% confidence</span>
                  <button onClick={()=>onAnalyze(s.ticker)} style={{ background:C.buy,border:'none',color:'#fff',padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:700 }}>Analyze ▸</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── ONBOARDING BANNER ────────────────────────────────────────────────────────
function OnboardingBanner({ onDismiss }) {
  return (
    <div style={{ background:`linear-gradient(135deg,${C.brand},#7c3aed)`,borderRadius:16,padding:'24px 26px',marginBottom:16,color:'#fff',position:'relative',animation:'fadeUp .4s ease' }}>
      <button onClick={onDismiss} aria-label="Dismiss"
        style={{ position:'absolute',top:12,right:14,background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,padding:'4px 10px',cursor:'pointer',fontSize:13,fontWeight:600 }}>
        ✕
      </button>
      <div style={{ fontSize:22,marginBottom:8 }}>👋 Welcome to AlgoTradeAI</div>
      <div style={{ fontSize:15,fontWeight:600,marginBottom:6,lineHeight:1.5 }}>
        AI-powered BUY / SELL / HOLD signals — free, no signup needed
      </div>
      <div style={{ fontSize:13,opacity:0.88,lineHeight:1.7,marginBottom:16 }}>
        Search any stock (US, India, Canada) → get live price, entry point, stop loss, target price, and a full risk/reward breakdown powered by AI in seconds.
      </div>
      <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
        {['🔍 Search any ticker','📈 AI BUY/SELL/HOLD','🎯 Entry · Stop · Target','📊 TradingView Charts','📰 Live News Feed','⭐ Personal Watchlist'].map(f=>(
          <span key={f} style={{ background:'rgba(255,255,255,0.18)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:600 }}>{f}</span>
        ))}
      </div>
    </div>
  )
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────
function Footer({ onDisclaimer, onContact }) {
  return (
    <footer style={{ background:C.cardBg,borderTop:`1px solid ${C.border}`,marginTop:32 }}>
      <div style={{ maxWidth:1100,margin:'0 auto',padding:'36px 24px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:32 }}>
        {/* Brand */}
        <div>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}>
            <div style={{ width:32,height:32,background:`linear-gradient(135deg,${C.brand},#7c3aed)`,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>📈</div>
            <span style={{ fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800,color:C.text1 }}>AlgoTrade<span style={{color:C.brand}}>AI</span></span>
          </div>
          <p style={{ fontSize:13,color:C.text3,lineHeight:1.7,maxWidth:220 }}>
            Free AI-powered stock analysis platform. Get BUY/SELL/HOLD signals with live prices, technical analysis, and risk management — no signup required.
          </p>
        </div>

        {/* Features */}
        <div>
          <div style={{ fontSize:12,fontWeight:700,color:C.text1,letterSpacing:'1px',textTransform:'uppercase',marginBottom:14 }}>Platform</div>
          {[
            ['🤖','AI Stock Signals'],['🔥','Trending Markets'],['📊','Live Charts'],
            ['📰','Market News'],['⭐','Watchlist'],['🔔','Email Alerts'],
          ].map(([icon,label])=>(
            <div key={label} style={{ fontSize:13,color:C.text2,marginBottom:8,display:'flex',gap:8 }}>
              <span>{icon}</span>{label}
            </div>
          ))}
        </div>

        {/* Markets */}
        <div>
          <div style={{ fontSize:12,fontWeight:700,color:C.text1,letterSpacing:'1px',textTransform:'uppercase',marginBottom:14 }}>Markets</div>
          {[['🇺🇸','US Stocks (NYSE / NASDAQ)'],['🇮🇳','Indian Stocks (NSE / BSE)'],['🇨🇦','Canadian Stocks (TSX)'],['📈','ETFs & Index Funds'],['₿','Crypto via Yahoo Finance']].map(([icon,label])=>(
            <div key={label} style={{ fontSize:13,color:C.text2,marginBottom:8,display:'flex',gap:8 }}>
              <span>{icon}</span>{label}
            </div>
          ))}
        </div>

        {/* Legal */}
        <div>
          <div style={{ fontSize:12,fontWeight:700,color:C.text1,letterSpacing:'1px',textTransform:'uppercase',marginBottom:14 }}>Legal & Contact</div>
          <button onClick={onDisclaimer} style={{ display:'block',background:'none',border:'none',fontSize:13,color:C.brand,cursor:'pointer',fontWeight:600,marginBottom:10,padding:0,textAlign:'left' }}>
            📋 Disclaimer
          </button>
          <button onClick={onContact} style={{ display:'block',background:'none',border:'none',fontSize:13,color:C.brand,cursor:'pointer',fontWeight:600,marginBottom:10,padding:0,textAlign:'left' }}>
            ✉ Contact Us
          </button>
          <div style={{ fontSize:12,color:C.text3,lineHeight:1.7,marginTop:8 }}>
            Powered by Groq AI (Llama 3.3-70B), Finnhub, Yahoo Finance & TradingView.
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop:`1px solid ${C.border}`,padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8 }}>
        <div style={{ fontSize:12,color:C.text4 }}>© 2025 AlgoTradeAI · All rights reserved</div>
        <div style={{ fontSize:12,color:C.text4,textAlign:'right' }}>
          ⚠ For educational purposes only · Not financial advice · All trading involves risk
        </div>
      </div>
    </footer>
  )
}

// ─── DISCLAIMER MODAL ─────────────────────────────────────────────────────────
function DisclaimerModal({ onClose }) {
  return (
    <div style={{ position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{ background:C.cardBg,borderRadius:18,maxWidth:560,width:'100%',maxHeight:'85vh',overflow:'auto',padding:32,boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <div style={{ fontSize:20,fontWeight:800,color:C.text1,fontFamily:"'Syne',sans-serif" }}>⚠ Disclaimer</div>
          <button onClick={onClose} style={{ background:C.cardBg2,border:`1px solid ${C.border}`,color:C.text2,borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:14,fontWeight:600 }}>Close</button>
        </div>
        {[
          { title:'Not Financial Advice', body:'AlgoTradeAI is an educational and informational tool only. Nothing on this platform constitutes financial advice, investment advice, trading advice, or any other type of advice. The AI-generated signals, price targets, and analysis are for educational purposes only.' },
          { title:'Do Your Own Research', body:'You should always conduct your own due diligence before making any investment decisions. Consult with a licensed financial advisor before trading. Past AI signal accuracy does not guarantee future results.' },
          { title:'Risk Disclosure', body:'All forms of trading and investment carry significant risk of loss. You could lose some or all of your invested capital. Never invest more than you can afford to lose. Cryptocurrency, stock, and derivatives markets are highly volatile.' },
          { title:'AI Limitations', body:'The AI analysis is generated by a large language model (Groq/Llama) which may have knowledge cutoffs, inaccuracies, or hallucinations. Always verify prices and signals through your own broker or financial data provider before acting.' },
          { title:'No Liability', body:'AlgoTradeAI and its operators assume no liability for any trading losses, financial damages, or other losses incurred as a result of using this platform. Use at your own risk.' },
        ].map(({title,body})=>(
          <div key={title} style={{ marginBottom:18 }}>
            <div style={{ fontSize:14,fontWeight:700,color:C.text1,marginBottom:6 }}>{title}</div>
            <div style={{ fontSize:13,color:C.text2,lineHeight:1.75 }}>{body}</div>
          </div>
        ))}
        <button onClick={onClose} style={{ width:'100%',background:C.brand,border:'none',color:'#fff',padding:'13px',borderRadius:12,cursor:'pointer',fontSize:15,fontWeight:700,marginTop:8 }}>
          I Understand
        </button>
      </div>
    </div>
  )
}

// ─── CONTACT MODAL ────────────────────────────────────────────────────────────
function ContactModal({ onClose }) {
  const [form,   setForm]   = useState({ name:'', email:'', message:'' })
  const [status, setStatus] = useState(null)
  const [busy,   setBusy]   = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!form.name || !form.email || !form.message) { setStatus({ ok:false, msg:'Please fill in all fields.' }); return }
    setBusy(true); setStatus(null)
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to send.')
      setStatus({ ok:true, msg:"✅ Message sent! We'll get back to you soon." })
      setForm({ name:'', email:'', message:'' })
    } catch(err) {
      setStatus({ ok:false, msg:'❌ ' + err.message })
    }
    setBusy(false)
  }

  const inp = { background:C.cardBg,border:`1.5px solid ${C.border}`,borderRadius:12,padding:'12px 14px',color:C.text1,fontSize:14,width:'100%',fontFamily:"'DM Sans',sans-serif",boxSizing:'border-box' }
  return (
    <div style={{ position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{ background:C.cardBg,borderRadius:18,maxWidth:480,width:'100%',padding:32,boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <div style={{ fontSize:20,fontWeight:800,color:C.text1,fontFamily:"'Syne',sans-serif" }}>✉ Contact Us</div>
          <button onClick={onClose} style={{ background:C.cardBg2,border:`1px solid ${C.border}`,color:C.text2,borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:14,fontWeight:600 }}>Close</button>
        </div>
        <p style={{ fontSize:13,color:C.text3,lineHeight:1.7,marginBottom:20 }}>Have a question, feedback, or business inquiry? We'd love to hear from you.</p>
        <form onSubmit={submit}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:13,fontWeight:600,color:C.text2,display:'block',marginBottom:6 }}>Name</label>
            <input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Your name" />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:13,fontWeight:600,color:C.text2,display:'block',marginBottom:6 }}>Email</label>
            <input type="email" style={inp} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="your@email.com" />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:13,fontWeight:600,color:C.text2,display:'block',marginBottom:6 }}>Message</label>
            <textarea rows={4} style={{...inp,resize:'vertical'}} value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))} placeholder="Tell us how we can help..." />
          </div>
          {status && (
            <div style={{ padding:'11px 14px',borderRadius:10,background:status.ok?C.buyBg:C.sellBg,border:`1px solid ${status.ok?C.buyBorder:C.sellBorder}`,fontSize:13,color:status.ok?C.buy:C.sell,marginBottom:12 }}>
              {status.msg}
            </div>
          )}
          <button type="submit" disabled={busy} style={{ width:'100%',background:busy?C.border:C.brand,border:'none',color:busy?C.text3:'#fff',padding:'13px',borderRadius:12,cursor:busy?'default':'pointer',fontSize:15,fontWeight:700 }}>
            {busy ? 'Opening...' : '📧 Send Message'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,         setTab]         = useState('ANALYZE')
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
  // Markets tab state — kept here to avoid hook violations in child components
  const [trendingData,    setTrendingData]    = useState(null)
  const [trendingLoading, setTrendingLoading] = useState(false)
  const [trendingError,   setTrendingError]   = useState(null)
  const [earningsData,    setEarningsData]    = useState(null)
  const [earningsLoading, setEarningsLoading] = useState(false)
  const [earningsError,   setEarningsError]   = useState(null)
  const [featuredData,    setFeaturedData]    = useState(null)
  const [featuredLoading, setFeaturedLoading] = useState(false)
  const [featuredError,   setFeaturedError]   = useState(null)
  const [mktNewsData,     setMktNewsData]     = useState(null)
  const [mktNewsLoading,  setMktNewsLoading]  = useState(false)
  const [mktNewsError,    setMktNewsError]    = useState(null)
  const [recentSearches,  setRecentSearches]  = useState(() => lsGet('recent_searches',[]))
  const [showDisclaimer,  setShowDisclaimer]  = useState(false)
  const [showContact,     setShowContact]     = useState(false)
  const [isNewUser,       setIsNewUser]       = useState(() => !lsGet('visited', false))

  useEffect(() => { const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t) },[])

  // Load data when tabs switch
  useEffect(() => {
    if (tab === 'MARKETS') {
      if (!trendingData  && !trendingLoading)  loadTrending()
      if (!earningsData  && !earningsLoading)  loadEarnings()
      if (!featuredData  && !featuredLoading)  loadFeatured()
      if (!mktNewsData   && !mktNewsLoading)   loadMarketNews()  // needed for sentiment
    }
    if (tab === 'NEWS' && !sym) {
      if (!mktNewsData && !mktNewsLoading) loadMarketNews()
    }
  }, [tab])

  async function loadTrending() {
    setTrendingLoading(true); setTrendingError(null)
    try {
      // Check sessionStorage cache (30 min)
      try {
        const cached = sessionStorage.getItem('trending_cache')
        if (cached) {
          const { data: d, ts } = JSON.parse(cached)
          if (Date.now() - ts < 30 * 60 * 1000) {
            setTrendingData(d); setTrendingLoading(false); return
          }
        }
      } catch {}
      const d = await apiTrending()
      setTrendingData(d)
      try { sessionStorage.setItem('trending_cache', JSON.stringify({ data: d, ts: Date.now() })) } catch {}
    } catch(e) { setTrendingError(e.message) }
    setTrendingLoading(false)
  }

  async function loadEarnings() {
    setEarningsLoading(true); setEarningsError(null)
    try { const d=await apiEarnings(); setEarningsData(d) } catch(e) { setEarningsError(e.message) }
    setEarningsLoading(false)
  }

  async function loadFeatured() {
    setFeaturedLoading(true); setFeaturedError(null)
    try {
      const cached = sessionStorage.getItem('featured_cache')
      if (cached) { const { data:d, ts } = JSON.parse(cached); if (Date.now()-ts < 30*60*1000) { setFeaturedData(d); setFeaturedLoading(false); return } }
      const d = await apiFeatured()
      setFeaturedData(d)
      try { sessionStorage.setItem('featured_cache', JSON.stringify({ data:d, ts:Date.now() })) } catch {}
    } catch(e) { setFeaturedError(e.message) }
    setFeaturedLoading(false)
  }

  async function loadMarketNews() {
    setMktNewsLoading(true); setMktNewsError(null)
    try {
      const cached = sessionStorage.getItem('mkt_news_cache')
      if (cached) { const { data:d, ts } = JSON.parse(cached); if (Date.now()-ts < 15*60*1000) { setMktNewsData(d); setMktNewsLoading(false); return } }
      const d = await apiMarketNews()
      setMktNewsData(d)
      try { sessionStorage.setItem('mkt_news_cache', JSON.stringify({ data:d, ts:Date.now() })) } catch {}
    } catch(e) { setMktNewsError(e.message) }
    setMktNewsLoading(false)
  }

  useEffect(() => {
    if (!sym) { setLiveData(null); setLiveError(null); return }
    let cancelled = false
    setLiveLoading(true); setLiveError(null); setLiveData(null)
    apiPrice(sym)
      .then(d  => { if(!cancelled){ setLiveData(d); setLiveLoading(false) } })
      .catch(e  => { if(!cancelled){ setLiveError(e.message); setLiveLoading(false) } })
    return () => { cancelled=true }
  }, [sym])

  function selectSym(s) {
    const v=s.toUpperCase().trim(); setSym(v); setResult(null); setError(null)
    if (tab!=='ANALYZE') setTab('ANALYZE')
    if (v) {
      const next = [v, ...recentSearches.filter(x=>x!==v)].slice(0,6)
      setRecentSearches(next); lsSet('recent_searches', next)
    }
  }

  async function analyze() {
    if (!sym) return
    setLoading(true); setError(null); setResult(null)
    let live = liveData
    if (!live) { try{ live=await apiPrice(sym); setLiveData(live) }catch(_){} }

    const priceBlock = live
      ? `LIVE MARKET DATA:\n- Regular Session Price: $${live.price}\n- Change: ${live.change>=0?'+':''}${live.change} (${live.changePct}%)\n- Range: $${live.low} - $${live.high}\n- Open: $${live.open} | Prev Close: $${live.prevClose}\n- Company: ${live.name}\n- Market Session: ${live.session}${live.postMarketPrice?`\n- After-Hours Price: $${live.postMarketPrice} (${live.postMarketChange>=0?'+':''}${live.postMarketChange}, ${live.postMarketChange>=0?'+':''}${live.postMarketChangePct}%)`:``}${live.preMarketPrice?`\n- Pre-Market Price: $${live.preMarketPrice} (${live.preMarketChange>=0?'+':''}${live.preMarketChange}, ${live.preMarketChange>=0?'+':''}${live.preMarketChangePct}% vs prev close)`:``}\nUSE the most current available price as the EXACT basis for all price calculations.`
      : `Live price unavailable. Use your best knowledge of ${sym} current price range.`

    try {
      const res = await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:SYSTEM_PROMPT,userMessage:`${priceBlock}\n\nAnalyze ${sym} stock.${context?` Context: ${context}`:''}\nReturn ONLY the JSON object.`})})
      if(!res.ok){ const b=await res.json().catch(()=>({})); throw new Error(b?.error||`Error ${res.status}`) }
      const data=await res.json()
      const txt=(data.text||'').trim()
      const m=txt.replace(/```json/gi,'').replace(/```/g,'').trim().match(/\{[\s\S]*\}/)
      if(!m) throw new Error('Could not parse AI response. Please try again.')
      const parsed=JSON.parse(m[0])
      const rec={...parsed,livePrice:live?.price??null,ts:new Date().toISOString()}
      setResult(rec); setHistory(h=>[rec,...h.slice(0,9)])
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const ds       = result ? (DS[result.decision]||DS.HOLD) : null
  const upside   = result?.livePrice && result?.targetPrice ? pctOf(result.targetPrice,result.livePrice) : null
  const downside = result?.livePrice && result?.stopLoss    ? pctOf(result.stopLoss,result.livePrice)    : null
  const rr       = upside && downside && parseFloat(downside)!==0 ? (Math.abs(parseFloat(upside))/Math.abs(parseFloat(downside))).toFixed(2) : null

  return (
    <div style={{ background:C.pageBg,minHeight:'100dvh',fontFamily:"'DM Sans',sans-serif",color:C.text1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500;700&family=Syne:wght@700;800&display=swap');
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{font-size:16px}
        body{background:${C.pageBg};-webkit-font-smoothing:antialiased}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:${C.pageBg}}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        input,button,select,textarea{font-family:'DM Sans',sans-serif}
        input::placeholder{color:${C.text4}}
        input:focus,button:focus{outline:2px solid ${C.brand};outline-offset:2px}
        a:focus{outline:2px solid ${C.brand};outline-offset:2px}
        .chip:hover{background:${C.brandLight}!important;border-color:${C.brand}50!important;color:${C.brand}!important}
        .nav-btn:hover{background:${C.brandLight}!important;color:${C.brand}!important}
        .analyze-btn:hover:not(:disabled){background:#3730a3!important;box-shadow:0 8px 24px rgba(79,70,229,0.35)!important;transform:translateY(-1px)}
        .analyze-btn:disabled{opacity:.45;cursor:not-allowed}
        .analyze-btn{transition:all .2s}
        @media(max-width:640px){
          .desktop-only{display:none!important}
          .grid-2{grid-template-columns:1fr!important}
          .stat-wrap{flex-wrap:wrap}
          .stat-wrap>*{min-width:calc(50% - 6px)!important}
          .mobile-pad{padding:14px!important}
        }
        @media(min-width:641px){
          .mobile-bottom-nav{display:none!important}
          .desktop-tabs{display:flex!important}
        }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ background:C.cardBg,borderBottom:`1px solid ${C.border}`,position:'sticky',top:0,zIndex:100,boxShadow:'0 1px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth:1100,margin:'0 auto',padding:'0 16px',display:'flex',alignItems:'center',height:64,gap:16 }}>

          {/* Logo */}
          <div style={{ display:'flex',alignItems:'center',gap:10,flexShrink:0,textDecoration:'none' }}>
            <div style={{ width:36,height:36,background:`linear-gradient(135deg,${C.brand},#7c3aed)`,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }} role="img" aria-label="AlgoTradeAI logo">📈</div>
            <span style={{ fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:C.text1,letterSpacing:'-0.5px' }}>
              AlgoTrade<span style={{color:C.brand}}>AI</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="desktop-tabs" style={{ display:'none',gap:4,flex:1,justifyContent:'center' }} role="navigation" aria-label="Main navigation">
            {TABS.map(t => (
              <button key={t.id} className="nav-btn"
                onClick={()=>setTab(t.id)}
                aria-current={tab===t.id?'page':undefined}
                style={{ background:tab===t.id?C.brandLight:'transparent',border:`1px solid ${tab===t.id?C.brand+'40':'transparent'}`,color:tab===t.id?C.brand:C.text2,padding:'8px 16px',borderRadius:10,cursor:'pointer',fontSize:14,fontWeight:600,display:'flex',alignItems:'center',gap:6,transition:'all .15s' }}>
                <span aria-hidden="true">{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <div style={{ width:8,height:8,borderRadius:'50%',background:C.buy,animation:'pulse 2s infinite' }} aria-hidden="true" />
              <span style={{ fontSize:12,color:C.buy,fontWeight:700 }}>LIVE</span>
            </div>
            <span className="desktop-only" style={{ fontSize:12,color:C.text3,fontFamily:"'DM Mono',monospace" }}>
              {time.toLocaleTimeString('en-US',{hour12:true})}
            </span>
          </div>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main style={{ maxWidth:1100,margin:'0 auto',padding:'20px 16px 80px' }} id="main-content">

        {/* ══════════ ANALYZE ══════════ */}
        {tab === 'ANALYZE' && (
          <div style={{ animation:'fadeUp .3s ease' }}>

            {/* Search panel */}
            <Card style={{ marginBottom:16 }}>
              <div style={{ fontSize:12,fontWeight:700,color:C.brand,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:14 }}>
                📡 AI Stock Analysis Terminal
              </div>

              {/* Popular chips by market */}
              <PopularChips sym={sym} onSelect={selectSym} />

              <div style={{ display:'flex',gap:10,alignItems:'flex-start',flexWrap:'wrap' }}>
                <div style={{ flex:1,minWidth:200,display:'flex',flexDirection:'column',gap:8 }}>
                  <SearchBox onSelect={selectSym} disabled={loading} />
                  <input value={context} onChange={e=>setContext(e.target.value)}
                    placeholder="Optional: add context — e.g. earnings beat, Fed held rates, tariff news..."
                    aria-label="Additional market context"
                    style={{ background:C.cardBg,border:`1.5px solid ${C.border}`,borderRadius:12,padding:'12px 14px',color:C.text2,fontSize:14,width:'100%' }} />
                </div>
                <button className="analyze-btn" onClick={analyze} disabled={loading||!sym}
                  aria-label={`Analyze ${sym||'selected stock'}`}
                  style={{ background:C.brand,border:'none',color:'#fff',padding:'13px 28px',borderRadius:12,fontSize:15,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 16px rgba(79,70,229,0.3)',whiteSpace:'nowrap',alignSelf:'flex-start',minHeight:50 }}>
                  {loading ? 'Analyzing...' : 'Analyze ▸'}
                </button>
              </div>

              {sym && (
                <div style={{ marginTop:14,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                  <div style={{ width:8,height:8,borderRadius:'50%',background:C.brand,animation:'pulse 2s infinite' }} />
                  <span style={{ fontSize:14,fontWeight:600,color:C.brand,fontFamily:"'DM Mono',monospace" }}>{sym}</span>
                  {liveData && <span style={{ fontSize:14,color:C.text3 }}>· {liveData.name}</span>}
                  <button onClick={()=>{setSym('');setLiveData(null);setResult(null);setError(null)}}
                    style={{ marginLeft:'auto',background:'transparent',border:`1px solid ${C.border}`,color:C.text3,padding:'4px 12px',borderRadius:8,cursor:'pointer',fontSize:13 }}>
                    Clear ✕
                  </button>
                </div>
              )}
            </Card>

            {/* Live price bar */}
            {sym && (
              <div style={{ marginBottom:16 }}>
                {liveLoading && (
                  <Card style={{ display:'flex',gap:12,alignItems:'center',padding:'14px 18px' }}>
                    <Spinner /><span style={{ fontSize:15,color:C.brand }}>Fetching live price for {sym}...</span>
                  </Card>
                )}
                {liveError && !liveLoading && (
                  <div style={{ background:C.sellBg,border:`1px solid ${C.sellBorder}`,borderRadius:12,padding:'12px 18px',fontSize:14,color:C.sell }} role="alert">
                    ⚠ {liveError}
                  </div>
                )}
                {liveData && !liveLoading && (
                  <Card style={{ padding:'16px 20px',border:`1px solid ${liveData.change>=0?C.buyBorder:C.sellBorder}`,background:liveData.change>=0?C.buyBg:C.sellBg }}>
                    {/* Session badge */}
                    <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap' }}>
                      {liveData.session === 'REGULAR' && (
                        <span style={{ background:'#dcfce7',color:'#166534',border:'1px solid #86efac',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,letterSpacing:'1px' }}>● MARKET OPEN</span>
                      )}
                      {liveData.session === 'PRE_MARKET' && (
                        <span style={{ background:'#fef9c3',color:'#854d0e',border:'1px solid #fde047',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,letterSpacing:'1px' }}>◐ PRE-MARKET</span>
                      )}
                      {liveData.session === 'POST_MARKET' && (
                        <span style={{ background:'#e0e7ff',color:'#3730a3',border:'1px solid #a5b4fc',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,letterSpacing:'1px' }}>◑ AFTER-HOURS</span>
                      )}
                      {liveData.session === 'CLOSED' && (
                        <span style={{ background:'#f1f5f9',color:'#64748b',border:'1px solid #cbd5e1',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,letterSpacing:'1px' }}>○ MARKET CLOSED</span>
                      )}
                      <span style={{ fontSize:12,color:C.text3 }}>{liveData.exchange} · {liveData.name}</span>

                    </div>

                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16,marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:12,color:C.text3,marginBottom:3 }}>Regular Session Close</div>
                        <div style={{ display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap' }}>
                          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:700,color:C.text1 }}>{fmt(liveData.price, liveData.currency)}</span>
                          <span style={{ fontSize:15,fontWeight:700,color:liveData.change>=0?C.buy:C.sell }}>
                            {liveData.change>=0?'▲':'▼'} {liveData.change>=0?'+':''}{liveData.change} ({liveData.change>=0?'+':''}{liveData.changePct}%)
                          </span>
                        </div>
                      </div>
                      <div style={{ display:'flex',gap:20,flexWrap:'wrap' }}>
                        {[['Open',fmt(liveData.open,liveData.currency)],['High',fmt(liveData.high,liveData.currency),C.buy],['Low',fmt(liveData.low,liveData.currency),C.sell],['Prev Close',fmt(liveData.prevClose,liveData.currency)]].map(([l,v,c])=>(
                          <div key={l}>
                            <div style={{ fontSize:11,color:C.text3,letterSpacing:'0.5px',marginBottom:2 }}>{l}</div>
                            <div style={{ fontSize:13,fontWeight:600,color:c||C.text2,fontFamily:"'DM Mono',monospace" }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>





                  </Card>
                )}
              </div>
            )}

            {loading && <StepLoader ticker={sym} />}

            {error && !loading && (
              <div style={{ background:C.sellBg,border:`1px solid ${C.sellBorder}`,borderRadius:12,padding:'14px 18px',marginBottom:16,color:C.sell,fontSize:14,fontWeight:500 }} role="alert">
                ⚠ {error}
              </div>
            )}

            {/* ══ RESULT ══ */}
            {result && !loading && ds && (
              <div style={{ animation:'fadeUp .4s ease' }} aria-live="polite">

                {result.livePrice && (
                  <div style={{ display:'flex',alignItems:'center',gap:6,fontSize:13,color:C.text3,marginBottom:12 }}>
                    <div style={{ width:6,height:6,borderRadius:'50%',background:C.buy,animation:'pulse 2s infinite' }} />
                    Analysis based on live price {fmt(result.livePrice)} · {new Date(result.ts).toLocaleTimeString()}
                  </div>
                )}

                {/* Decision banner */}
                <div style={{ background:ds.bg,border:`2px solid ${ds.border}`,borderRadius:18,padding:'22px 24px',marginBottom:14,boxShadow:ds.shadow,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16 }}>
                  <div>
                    <div style={{ fontSize:11,color:ds.text,letterSpacing:'2px',fontWeight:700,marginBottom:8,textTransform:'uppercase' }}>AI Trading Signal</div>
                    <div style={{ display:'flex',alignItems:'center',gap:14,flexWrap:'wrap' }}>
                      <span style={{ fontFamily:"'Syne',sans-serif",fontSize:44,fontWeight:800,color:ds.text,lineHeight:1 }}>{result.decision}</span>
                      <div>
                        <div style={{ fontSize:22,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{result.ticker}</div>
                        <div style={{ fontSize:14,color:C.text3,marginTop:2 }}>{result.companyName}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:12,color:C.text3,letterSpacing:'1px',marginBottom:8,textTransform:'uppercase' }}>Confidence</div>
                    <div style={{ fontSize:22,fontWeight:800,color:ds.text,fontFamily:"'Syne',sans-serif" }}>{(result.confidence||'').toUpperCase()}</div>
                    <div style={{ display:'flex',gap:5,justifyContent:'flex-end',marginTop:8 }} aria-label={`Confidence: ${result.confidence}`}>
                      {[0,1,2].map(i=><div key={i} style={{ width:28,height:6,borderRadius:3,background:i<(result.confidence==='High'?3:result.confidence==='Medium'?2:1)?ds.text:C.border,transition:'background .3s' }} />)}
                    </div>
                    <div style={{ fontSize:13,color:C.text3,marginTop:8 }}>{result.timeHorizon}</div>
                  </div>
                </div>

                {/* Price stats */}
                <div className="stat-wrap" style={{ display:'flex',gap:10,marginBottom:14,flexWrap:'wrap' }}>
                  <StatCard label="Live Price"   value={fmt(result.livePrice)}   color={C.text1} sub="Real-time" icon="🔴" />
                  <StatCard label="Entry Price"  value={fmt(result.entryPrice)}  color={C.buy}
                    sub={result.livePrice&&result.entryPrice?`${Number(pctOf(result.entryPrice,result.livePrice))>0?'+':''}${pctOf(result.entryPrice,result.livePrice)}% from live`:null} icon="🎯" />
                  <StatCard label="Stop Loss"    value={fmt(result.stopLoss)}    color={C.sell} sub={downside?`${downside}% risk`:null} icon="🛑" />
                  <StatCard label="Target Price" value={fmt(result.targetPrice)} color={C.buy}  sub={upside?`+${upside}% upside`:null} icon="🏹" />
                  <StatCard label="Risk Level"   value={(result.riskLevel||'').toUpperCase()} color={RC[result.riskLevel]||C.warning} sub="Portfolio exposure" icon="⚡" />
                </div>

                {/* R/R */}
                {upside && downside && rr && (
                  <div className="stat-wrap" style={{ display:'flex',gap:10,marginBottom:14 }}>
                    {[
                      ['Upside Potential', `+${upside}%`, C.buy,     C.buyBg,  C.buyBorder],
                      ['Max Downside',     `${downside}%`,C.sell,    C.sellBg, C.sellBorder],
                      ['Risk / Reward',    `${rr}x`,      C.warning, C.holdBg, C.holdBorder],
                    ].map(([l,v,c,bg,bd])=>(
                      <div key={l} style={{ background:bg,border:`1px solid ${bd}`,borderRadius:12,padding:'14px 16px',flex:1,minWidth:100 }}>
                        <div style={{ fontSize:11,color:C.text3,textTransform:'uppercase',letterSpacing:'1px',marginBottom:6 }}>{l}</div>
                        <div style={{ fontSize:22,fontWeight:700,color:c,fontFamily:"'DM Mono',monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reasoning + Signals */}
                <div className="grid-2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
                  <Card>
                    <SectionTitle>Analysis Reasoning</SectionTitle>
                    <p style={{ fontSize:14,color:C.text2,lineHeight:1.85 }}>{result.reasoning}</p>
                  </Card>
                  <Card>
                    <SectionTitle>Key Signals</SectionTitle>
                    {result.signals && Object.entries({
                      '📰 News':result.signals.newsCatalyst,
                      '👔 Analysts':result.signals.analystSentiment,
                      '💰 Financials':result.signals.financialMetrics,
                      '📊 Technical':result.signals.technicalIndicators,
                      '🏦 Institutional':result.signals.institutionalActivity,
                    }).map(([k,v])=>v?(
                      <div key={k} style={{ marginBottom:14 }}>
                        <div style={{ fontSize:12,color:C.text3,letterSpacing:'0.5px',fontWeight:600,marginBottom:4 }}>{k}</div>
                        <div style={{ fontSize:14,color:C.text2,lineHeight:1.6 }}>{String(v)}</div>
                      </div>
                    ):null)}
                  </Card>
                </div>

                {/* Risks + Steps */}
                <div className="grid-2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16 }}>
                  <Card>
                    <SectionTitle color={C.sell}>Key Risks</SectionTitle>
                    {Array.isArray(result.keyRisks) && result.keyRisks.map((r,i)=>(
                      <div key={i} style={{ display:'flex',gap:10,marginBottom:12,alignItems:'flex-start' }}>
                        <span style={{ color:C.sell,fontSize:18,lineHeight:1,flexShrink:0 }}>▸</span>
                        <span style={{ fontSize:14,color:C.text2,lineHeight:1.6 }}>{r}</span>
                      </div>
                    ))}
                  </Card>
                  <Card>
                    <SectionTitle color={C.buy}>How to Trade This</SectionTitle>
                    {[
                      `Verify ${fmt(result.livePrice||result.entryPrice)} in your broker`,
                      `Set stop loss immediately at ${fmt(result.stopLoss)}`,
                      `Enter position near ${fmt(result.entryPrice)}`,
                      `Take profit at ${fmt(result.targetPrice)}`,
                      'Monitor news daily for changes',
                    ].map((s,i)=>(
                      <div key={i} style={{ display:'flex',gap:10,marginBottom:11,alignItems:'flex-start' }}>
                        <div style={{ width:22,height:22,borderRadius:'50%',background:C.brandLight,color:C.brand,fontSize:12,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>{i+1}</div>
                        <span style={{ fontSize:14,color:C.text2,lineHeight:1.5,paddingTop:1 }}>{s}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`,fontSize:13,color:C.text3 }}>
                      Sector: <span style={{color:C.brand,fontWeight:600}}>{result.sectorAllocation}</span>
                    </div>
                  </Card>
                </div>

                {/* Why Buy / Why Not Buy / Final Insight */}
                <WhyBuySection
                  whyBuy={result.whyBuy}
                  whyNotBuy={result.whyNotBuy}
                  finalInsight={result.finalInsight}
                  aiSummary={result.aiSummary}
                />

                {/* Quick nav */}
                <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
                  {[['📊 View Chart','CHART'],['📰 Read News','NEWS'],['⭐ Add to Watchlist','WATCHLIST'],['🔔 Email Alert','ALERTS']].map(([label,t])=>(
                    <button key={t} onClick={()=>{ if(t==='WATCHLIST'){ const list=lsGet('watchlist',[]); if(!list.includes(sym)){ lsSet('watchlist',[...list,sym]) } } setTab(t) }}
                      style={{ background:C.cardBg,border:`1.5px solid ${C.border}`,color:C.text2,padding:'10px 18px',borderRadius:10,cursor:'pointer',fontSize:14,fontWeight:600,flex:1,minWidth:130,transition:'all .15s' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=C.brandLight;e.currentTarget.style.color=C.brand;e.currentTarget.style.borderColor=C.brand+'40'}}
                      onMouseLeave={e=>{e.currentTarget.style.background=C.cardBg;e.currentTarget.style.color=C.text2;e.currentTarget.style.borderColor=C.border}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            {history.length > 0 && !loading && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:12,color:C.text3,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',marginBottom:10 }}>Recent Analyses</div>
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  {history.map((h,i)=>{
                    const s=DS[h.decision]||DS.HOLD
                    return (
                      <button key={i} onClick={()=>setResult(h)}
                        style={{ background:s.bg,border:`1px solid ${s.border}`,borderRadius:10,padding:'8px 14px',cursor:'pointer',display:'flex',gap:8,alignItems:'center',transition:'all .15s' }}>
                        <span style={{ fontSize:14,fontWeight:700,color:C.text1,fontFamily:"'DM Mono',monospace" }}>{h.ticker}</span>
                        {h.livePrice!=null && <span style={{ fontSize:13,color:C.text3,fontFamily:"'DM Mono',monospace" }}>{fmt(h.livePrice)}</span>}
                        <Badge color={s.text} bg={s.bg}>{h.decision}</Badge>
                        <span style={{ fontSize:12,color:C.text3 }}>{new Date(h.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── SEO Hero / Empty State ── */}
            {!result && !loading && !error && !sym && (
              <div>
                {isNewUser && (
                  <OnboardingBanner onDismiss={()=>{ setIsNewUser(false); lsSet('visited',true) }} />
                )}

                {recentSearches.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12,color:C.text3,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',marginBottom:8 }}>Recent Searches</div>
                    <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                      {recentSearches.map(s=>(
                        <button key={s} onClick={()=>selectSym(s)} style={{ background:C.cardBg,border:`1.5px solid ${C.border}`,color:C.text2,padding:'5px 14px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:600,transition:'all .15s',display:'flex',alignItems:'center',gap:5 }}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.brandLight;e.currentTarget.style.borderColor=C.brand;e.currentTarget.style.color=C.brand}}
                          onMouseLeave={e=>{e.currentTarget.style.background=C.cardBg;e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text2}}>
                          🕐 {s}
                        </button>
                      ))}
                      <button onClick={()=>{ setRecentSearches([]); lsSet('recent_searches',[]) }} style={{ background:'transparent',border:`1px solid ${C.border}`,color:C.text4,padding:'5px 10px',borderRadius:20,cursor:'pointer',fontSize:11 }}>Clear</button>
                    </div>
                  </div>
                )}

                {/* H1 — visible to Google, styled as hero */}
                <Card style={{ textAlign:'center', padding:'48px 32px', marginBottom:16 }}>
                  <div style={{ fontSize:56, marginBottom:16 }}>📈</div>
                  <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:C.text1, marginBottom:10, lineHeight:1.3 }}>
                    Free AI Stock Trading Agent — BUY, SELL &amp; HOLD Signals
                  </h1>
                  <p style={{ fontSize:15, color:C.text3, lineHeight:1.8, maxWidth:500, margin:'0 auto 24px' }}>
                    Search any stock or tap a popular ticker above. Get AI-powered{' '}
                    <strong style={{color:C.buy}}>BUY</strong> /{' '}
                    <strong style={{color:C.sell}}>SELL</strong> /{' '}
                    <strong style={{color:C.hold}}>HOLD</strong>{' '}
                    signals with live prices, stop loss, and price targets in seconds. 100% free — no signup needed.
                  </p>
                  {/* Feature badges */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginBottom:24 }}>
                    {[
                      ['🇺🇸','US Stocks (NYSE/NASDAQ)'],
                      ['🇮🇳','Indian Stocks (NSE/BSE)'],
                      ['🇨🇦','Canadian Stocks (TSX)'],
                      ['💰','Live Prices (Real-Time)'],
                      ['🎯','Entry · Stop Loss · Target'],
                      ['⚡','Risk/Reward Ratio'],
                      ['📰','Latest News Per Stock'],
                      ['🔔','Free Email Alerts'],
                    ].map(([icon, label]) => (
                      <span key={label} style={{ background:C.brandLight, color:C.brand, border:`1px solid ${C.brand}30`, borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600 }}>
                        {icon} {label}
                      </span>
                    ))}
                  </div>
                </Card>

                {/* SEO About section — AI-readable, Google-indexable */}
                <Card style={{ marginBottom:16 }}>
                  <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, color:C.text1, marginBottom:12 }}>
                    What is AlgoTradeAI?
                  </h2>
                  <p style={{ fontSize:14, color:C.text2, lineHeight:1.8, marginBottom:12 }}>
                    AlgoTradeAI is a free, AI-powered stock market trading agent that analyzes any stock and instantly generates <strong>BUY, SELL, or HOLD</strong> trading signals based on live market data, technical indicators, analyst sentiment, macroeconomic factors, and institutional activity. Powered by Groq&apos;s Llama 3.3-70B AI model and real-time prices from Finnhub.
                  </p>
                  <p style={{ fontSize:14, color:C.text2, lineHeight:1.8, marginBottom:16 }}>
                    Every analysis includes a specific <strong>entry price</strong>, <strong>stop loss level</strong>, <strong>price target</strong>, confidence score, and risk/reward ratio — all grounded in the current live market price. The platform supports <strong>US stocks (NYSE, NASDAQ)</strong>, <strong>Indian stocks (NSE, BSE)</strong>, and <strong>Canadian stocks (TSX)</strong>.
                  </p>
                  <h3 style={{ fontSize:15, fontWeight:700, color:C.text1, marginBottom:10 }}>Key Features</h3>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:8 }}>
                    {[
                      '🤖 AI BUY/SELL/HOLD signals',
                      '💹 Real-time live stock prices',
                      '🎯 Exact entry, stop loss & target',
                      '⚡ Risk/reward ratio calculation',
                      '🔥 Top 10 trending stocks daily',
                      '📅 Weekly earnings calendar',
                      '⭐ Stock watchlist tracker',
                      '📊 TradingView price charts',
                      '📰 Latest financial news',
                      '🔔 Free email trading alerts',
                      '🇮🇳 Indian NSE/BSE stocks',
                      '🇨🇦 Canadian TSX stocks',
                    ].map(f => (
                      <div key={f} style={{ fontSize:13, color:C.text2, padding:'6px 10px', background:C.cardBg2, borderRadius:8, border:`1px solid ${C.border}` }}>{f}</div>
                    ))}
                  </div>
                </Card>

                {/* FAQ Section — targets featured snippets */}
                <Card>
                  <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, color:C.text1, marginBottom:16 }}>
                    Frequently Asked Questions
                  </h2>
                  {[
                    { q:'Is AlgoTradeAI free to use?', a:'Yes, AlgoTradeAI is completely free. No subscription, no credit card, no sign-up required. Open the website and start analyzing stocks instantly.' },
                    { q:'Which stock markets does AlgoTradeAI support?', a:'AlgoTradeAI supports US stocks (NYSE and NASDAQ), Indian stocks (NSE and BSE — search RELIANCE.NS, TCS.NS, INFY.NS), and Canadian stocks (TSX — search SHOP.TO, RY.TO).' },
                    { q:'How are the BUY/SELL/HOLD signals generated?', a:'The AI analyzes news catalysts, analyst upgrades/downgrades, financial metrics (P/E, revenue growth), technical indicators (RSI, MACD, moving averages), and institutional activity. It confirms with at least 3 independent signals before recommending.' },
                    { q:'How is AlgoTradeAI different from TrendSpider or Trade Ideas?', a:'AlgoTradeAI is completely free. TrendSpider costs $51-$199/month and Trade Ideas costs $127-$254/month. AlgoTradeAI also uniquely supports Indian and Canadian stocks which most competitors do not.' },
                    { q:'How do I analyze Indian NSE stocks?', a:'Search for the company name (e.g., Reliance, Infosys) or type the NSE ticker with .NS suffix (RELIANCE.NS, TCS.NS, INFY.NS). Click the 🇮🇳 India button to see popular Indian stock chips.' },
                  ].map(({ q, a }) => (
                    <details key={q} style={{ borderBottom:`1px solid ${C.border}`, padding:'12px 0' }}>
                      <summary style={{ fontSize:14, fontWeight:600, color:C.text1, cursor:'pointer', listStyle:'none', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        {q} <span style={{ color:C.brand, fontSize:18, flexShrink:0 }}>+</span>
                      </summary>
                      <p style={{ fontSize:14, color:C.text2, lineHeight:1.7, marginTop:10, marginBottom:0 }}>{a}</p>
                    </details>
                  ))}
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ══════════ MARKETS ══════════ */}
        {tab === 'MARKETS' && (
          <div style={{ animation:'fadeUp .3s ease' }}>

            {/* ── 1. MARKET PULSE BAR ── */}
            <MarketPulseBar
              sentiment={mktNewsData?.sentiment}
              sentimentScore={mktNewsData?.sentimentScore}
            />

            {/* ── 2. AI TOP PICKS ── */}
            <AITopPicks
              data={featuredData}
              loading={featuredLoading}
              onAnalyze={s=>{ setSym(s); setTab('ANALYZE') }}
            />

            {/* ── 3. STOCKS BY SECTOR ── */}
            <Card style={{ marginBottom:16 }}>
              <SectionTitle>📊 Stocks by Sector</SectionTitle>
              <div style={{ fontSize:13,color:C.text2,marginTop:-10,marginBottom:16,lineHeight:1.6 }}>
                AI-curated picks across major sectors, sorted by confidence. Use the filter tabs to browse by industry.
              </div>
              <FeaturedSection
                data={featuredData}
                loading={featuredLoading}
                error={featuredError}
                onAnalyze={s=>{ setSym(s); setTab('ANALYZE') }}
                onRefresh={loadFeatured}
                mode="stocks"
              />
            </Card>

            {/* ── 4. ETFs & FUNDS ── */}
            <Card style={{ marginBottom:16 }}>
              <SectionTitle>🧺 ETFs &amp; Funds</SectionTitle>
              <div style={{ fontSize:13,color:C.text2,marginTop:-10,marginBottom:16,lineHeight:1.6 }}>
                Popular ETFs across index, sector, commodity, and thematic categories with AI signals.
              </div>
              <FeaturedSection
                data={featuredData}
                loading={featuredLoading}
                error={featuredError}
                onAnalyze={s=>{ setSym(s); setTab('ANALYZE') }}
                onRefresh={loadFeatured}
                mode="etfs"
              />
            </Card>

            {/* ── 5. MARKET MOVERS ── */}
            <Card style={{ marginBottom:16 }}>
              <SectionTitle>🔥 Market Movers Today</SectionTitle>
              <div style={{ fontSize:13,color:C.text2,marginTop:-10,marginBottom:16,lineHeight:1.6 }}>
                AI-ranked by momentum — analyst upgrades, unusual volume, macro catalysts, and institutional activity.
                Click <strong>Analyze ▸</strong> for a full signal.
              </div>
              <TrendingStocks
                onAnalyze={s=>{ setSym(s); setTab('ANALYZE') }}
                data={trendingData}
                loading={trendingLoading}
                error={trendingError}
                onRefresh={loadTrending}
              />
            </Card>

            {/* ── 6. EARNINGS CALENDAR ── */}
            <Card>
              <SectionTitle>📅 Earnings Calendar — This Week</SectionTitle>
              <div style={{ fontSize:13,color:C.text2,marginTop:-10,marginBottom:16,lineHeight:1.6 }}>
                Major companies reporting this week. Analyze before earnings to see AI risk/reward signals.
              </div>
              <EarningsCalendar
                onAnalyze={s=>{ setSym(s); setTab('ANALYZE') }}
                data={earningsData}
                loading={earningsLoading}
                error={earningsError}
                onRefresh={loadEarnings}
              />
            </Card>

          </div>
        )}

        {/* ══════════ CHART ══════════ */}
        {tab === 'CHART' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            {/* Search */}
            <Card style={{ marginBottom:12,padding:'16px 18px' }}>
              <div style={{ display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' }}>
                <span style={{ fontSize:13,fontWeight:700,color:C.brand,whiteSpace:'nowrap' }}>📊 Price Chart</span>
                <div style={{ flex:1,minWidth:200 }}>
                  <SearchBox onSelect={s=>{setSym(s.toUpperCase())}} placeholder="Search stock to view chart..." />
                </div>
                {sym && liveData && (
                  <div style={{ display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
                    <span style={{ fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace",color:C.text1 }}>{sym}</span>
                    <span style={{ fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace",color:C.text1 }}>{fmt(liveData.price)}</span>
                    <span style={{ fontSize:13,fontWeight:600,color:liveData.change>=0?C.buy:C.sell }}>
                      {liveData.change>=0?'▲':'▼'} {liveData.change>=0?'+':''}{liveData.changePct}%
                    </span>
                  </div>
                )}
              </div>
            </Card>
            {/* Chart — no card padding so it fills full width */}
            <div style={{ background:C.cardBg,borderRadius:16,border:`1px solid ${C.border}`,padding:'16px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <TradingChart symbol={sym} />
            </div>
          </div>
        )}

        {/* ══════════ NEWS ══════════ */}
        {tab === 'NEWS' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <Card style={{ marginBottom:16 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4,flexWrap:'wrap',gap:8 }}>
                <SectionTitle>{sym ? `📰 Company News · ${sym}` : '🌐 Global Market Intelligence'}</SectionTitle>
              </div>
              {!sym && (
                <div style={{ fontSize:13,color:C.text2,marginTop:-10,marginBottom:16,lineHeight:1.6 }}>
                  Live global market news ranked by impact. Search for a specific company below to see company-specific news.
                </div>
              )}
              <div style={{ marginBottom:16 }}>
                <SearchBox onSelect={s=>{setSym(s.toUpperCase());}} placeholder="Search stock for company-specific news..." />
              </div>
              {sym ? (
                <NewsFeed symbol={sym} />
              ) : (
                <GlobalNewsSection
                  data={mktNewsData}
                  loading={mktNewsLoading}
                  error={mktNewsError}
                  onRefresh={loadMarketNews}
                />
              )}
            </Card>
          </div>
        )}

        {/* ══════════ WATCHLIST ══════════ */}
        {tab === 'WATCHLIST' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <Card>
              <SectionTitle>My Watchlist</SectionTitle>
              <WatchlistTab onAnalyze={s=>{ setSym(s); setTab('ANALYZE') }} />
            </Card>
          </div>
        )}

        {/* ══════════ ALERTS ══════════ */}
        {tab === 'ALERTS' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <AlertsTab lastResult={result} />
          </div>
        )}

      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="mobile-bottom-nav" role="navigation" aria-label="Mobile navigation" style={{
        position:'fixed',bottom:0,left:0,right:0,zIndex:100,
        background:C.cardBg,borderTop:`1px solid ${C.border}`,
        boxShadow:'0 -4px 20px rgba(0,0,0,0.08)',
        display:'flex',
        paddingBottom:'env(safe-area-inset-bottom)',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            aria-label={t.label} aria-current={tab===t.id?'page':undefined}
            style={{ flex:1,background:'transparent',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'10px 4px 8px',transition:'all .15s',position:'relative' }}>
            {tab===t.id && <div style={{ position:'absolute',top:0,left:'20%',right:'20%',height:2,background:C.brand,borderRadius:'0 0 3px 3px' }} />}
            <span style={{ fontSize:22 }} aria-hidden="true">{t.icon}</span>
            <span style={{ fontSize:10,fontWeight:600,color:tab===t.id?C.brand:C.text3,transition:'color .15s' }}>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── FOOTER (desktop only — sits above mobile nav on mobile) ── */}
      <div style={{ paddingBottom:'env(safe-area-inset-bottom)' }}>
        <Footer
          onDisclaimer={()=>setShowDisclaimer(true)}
          onContact={()=>setShowContact(true)}
        />
      </div>

      {/* ── MODALS ── */}
      {showDisclaimer && <DisclaimerModal onClose={()=>setShowDisclaimer(false)} />}
      {showContact    && <ContactModal    onClose={()=>setShowContact(false)}    />}
    </div>
  )
}
