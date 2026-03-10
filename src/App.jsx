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

const POPULAR = ['AAPL','NVDA','MSFT','GOOGL','AMZN','TSLA','META','JPM','JNJ','XOM','V','UNH','NFLX','AMD','WMT']
const TABS = [
  { id:'ANALYZE',   icon:'🤖', label:'Analyze'   },
  { id:'CHART',     icon:'📊', label:'Chart'     },
  { id:'NEWS',      icon:'📰', label:'News'      },
  { id:'WATCHLIST', icon:'⭐', label:'Watchlist' },
  { id:'ALERTS',    icon:'🔔', label:'Alerts'    },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt    = n => (n==null||isNaN(Number(n))) ? '—' : '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const pctOf  = (a,b) => (!b||!a||isNaN(a)||isNaN(b)) ? null : (((a-b)/b)*100).toFixed(2)
const timeAgo= ts => { const s=Math.floor((Date.now()-ts*1000)/1000); if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago' }
const lsGet  = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d }catch{ return d } }
const lsSet  = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)) }catch{} }

// ─── API ──────────────────────────────────────────────────────────────────────
const apiPrice  = async sym => { const r=await fetch(`/api/price?symbol=${encodeURIComponent(sym)}`);  const d=await r.json(); if(!r.ok) throw new Error(d.error||'Price fetch failed'); return d }
const apiNews   = async sym => { const r=await fetch(`/api/news?symbol=${encodeURIComponent(sym)}`);   const d=await r.json(); return d.articles||[] }
const apiSearch = async q   => { const r=await fetch(`/api/search?q=${encodeURIComponent(q)}`);        const d=await r.json(); return d.results||[] }
const apiAlert  = async body=> { const r=await fetch('/api/alert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Failed'); return d }

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
              style={{ padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:14,background:i===hi?C.brandLight:'transparent',borderBottom:i<sugg.length-1?`1px solid ${C.border}`:'none',transition:'background .1s' }}>
              <span style={{ fontSize:14,fontWeight:700,color:C.brand,fontFamily:"'DM Mono',monospace",minWidth:60 }}>{s.symbol}</span>
              <span style={{ fontSize:14,color:C.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{s.name}</span>
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
  const ref = useRef(null)
  const [chartInterval, setChartInterval] = React.useState('D')
  const [height, setHeight] = React.useState(500)

  useEffect(() => {
    function updateHeight() {
      setHeight(window.innerWidth < 640 ? 340 : window.innerWidth < 900 ? 440 : 560)
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  useEffect(() => {
    if (!symbol || !ref.current) return
    ref.current.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.style.width = '100%'
    wrap.style.height = '100%'
    const widget = document.createElement('div')
    widget.className = 'tradingview-widget-container__widget'
    widget.style.width = '100%'
    widget.style.height = '100%'
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true, symbol, interval: chartInterval,
      timezone: 'Etc/UTC', theme: 'light', style: '1', locale: 'en',
      backgroundColor: '#ffffff', gridColor: 'rgba(0,0,0,0.03)',
      hide_top_toolbar: false, hide_legend: false,
      hide_side_toolbar: false, save_image: false, allow_symbol_change: true,
    })
    wrap.appendChild(widget)
    wrap.appendChild(script)
    ref.current.appendChild(wrap)
  }, [symbol, chartInterval])

  const INTERVALS = [
    {label:'1m',value:'1'},{label:'5m',value:'5'},{label:'15m',value:'15'},
    {label:'1H',value:'60'},{label:'4H',value:'240'},{label:'1D',value:'D'},
    {label:'1W',value:'W'},{label:'1M',value:'M'},
  ]

  if (!symbol) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:360,color:C.text3,gap:12,padding:24 }}>
      <span style={{ fontSize:56 }}>📊</span>
      <span style={{ fontSize:16,fontWeight:600,color:C.text2 }}>Search for a stock to view its chart</span>
      <span style={{ fontSize:14,color:C.text3,textAlign:'center' }}>Live price charts powered by TradingView</span>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center' }}>
        <span style={{ fontSize:12,color:C.text3,fontWeight:600,marginRight:4 }}>Interval:</span>
        {INTERVALS.map(i => (
          <button key={i.value} onClick={()=>setChartInterval(i.value)}
            style={{ padding:'6px 12px',borderRadius:8,border:`1.5px solid ${chartInterval===i.value?C.brand:C.border}`,background:chartInterval===i.value?C.brandLight:C.cardBg,color:chartInterval===i.value?C.brand:C.text2,fontSize:13,fontWeight:600,cursor:'pointer',transition:'all .15s' }}>
            {i.label}
          </button>
        ))}
        <span style={{ marginLeft:'auto',fontSize:11,color:C.text4 }}>Powered by TradingView</span>
      </div>
      <div style={{ width:'100%',height:height,borderRadius:12,overflow:'hidden',border:`1px solid ${C.border}`,background:C.cardBg }}>
        <div ref={ref} style={{ width:'100%',height:'100%' }} />
      </div>
      <div style={{ marginTop:8,fontSize:12,color:C.text3,textAlign:'center' }}>
        Pinch to zoom · Drag to pan · Tap any symbol on chart to change stock
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

  useEffect(() => { const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t) },[])

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
  }

  async function analyze() {
    if (!sym) return
    setLoading(true); setError(null); setResult(null)
    let live = liveData
    if (!live) { try{ live=await apiPrice(sym); setLiveData(live) }catch(_){} }

    const priceBlock = live
      ? `LIVE MARKET DATA:\n- Current Price: $${live.price}\n- Change: ${live.change>=0?'+':''}${live.change} (${live.changePct}%)\n- Range: $${live.low} - $${live.high}\n- Open: $${live.open} | Prev Close: $${live.prevClose}\n- Company: ${live.name}\nUSE $${live.price} as the EXACT basis for all price calculations.`
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
    <div style={{ background:C.pageBg,minHeight:'100vh',minHeight:'100dvh',fontFamily:"'DM Sans',sans-serif",color:C.text1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500;700&family=Syne:wght@700;800&display=swap');
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
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
      <main style={{ maxWidth:1100,margin:'0 auto',padding:'20px 16px 110px' }} id="main-content">

        {/* ══════════ ANALYZE ══════════ */}
        {tab === 'ANALYZE' && (
          <div style={{ animation:'fadeUp .3s ease' }}>

            {/* Search panel */}
            <Card style={{ marginBottom:16 }}>
              <div style={{ fontSize:12,fontWeight:700,color:C.brand,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:14 }}>
                📡 AI Stock Analysis Terminal
              </div>

              {/* Popular chips */}
              <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:14 }} role="group" aria-label="Popular stocks">
                {POPULAR.map(t => (
                  <button key={t} className="chip"
                    onClick={()=>selectSym(t)}
                    aria-pressed={sym===t}
                    style={{ background:sym===t?C.brandLight:'#f8fafc',border:`1.5px solid ${sym===t?C.brand:C.border}`,color:sym===t?C.brand:C.text2,padding:'6px 14px',borderRadius:20,cursor:'pointer',fontSize:13,fontWeight:600,transition:'all .15s' }}>
                    {t}
                  </button>
                ))}
              </div>

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
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:14 }}>
                        <div style={{ width:44,height:44,borderRadius:12,background:C.cardBg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0 }}>📈</div>
                        <div>
                          <div style={{ fontSize:13,color:C.text3,marginBottom:3 }}>{liveData.name} · Live Price</div>
                          <div style={{ display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap' }}>
                            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:26,fontWeight:700,color:C.text1 }}>{fmt(liveData.price)}</span>
                            <span style={{ fontSize:15,fontWeight:700,color:liveData.change>=0?C.buy:C.sell }}>
                              {liveData.change>=0?'▲':'▼'} {liveData.change>=0?'+':''}{liveData.change} ({liveData.change>=0?'+':''}{liveData.changePct}%)
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display:'flex',gap:20,flexWrap:'wrap' }}>
                        {[['Open',fmt(liveData.open)],['High',fmt(liveData.high),C.buy],['Low',fmt(liveData.low),C.sell],['Prev',fmt(liveData.prevClose)]].map(([l,v,c])=>(
                          <div key={l}>
                            <div style={{ fontSize:11,color:C.text3,letterSpacing:'0.5px',marginBottom:2 }}>{l}</div>
                            <div style={{ fontSize:14,fontWeight:600,color:c||C.text2,fontFamily:"'DM Mono',monospace" }}>{v}</div>
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

            {/* Empty state */}
            {!result && !loading && !error && !sym && (
              <Card style={{ textAlign:'center',padding:56 }}>
                <div style={{ fontSize:60,marginBottom:16 }}>📈</div>
                <div style={{ fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,color:C.text1,marginBottom:10 }}>AI Stock Trading Agent</div>
                <div style={{ fontSize:15,color:C.text3,lineHeight:1.8,maxWidth:420,margin:'0 auto' }}>
                  Search for any stock or tap a popular ticker above.<br/>
                  Get AI-powered <strong style={{color:C.buy}}>BUY</strong> / <strong style={{color:C.sell}}>SELL</strong> / <strong style={{color:C.hold}}>HOLD</strong> signals with live prices, stop loss, and target in seconds.
                </div>
              </Card>
            )}
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
              <SectionTitle>Latest News{sym?` · ${sym}`:''}</SectionTitle>
              <div style={{ marginBottom:16 }}>
                <SearchBox onSelect={s=>setSym(s.toUpperCase())} placeholder="Search stock for news..." />
              </div>
              <NewsFeed symbol={sym} />
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

      <div style={{ textAlign:'center',padding:'0 16px 130px',fontSize:11,color:C.text4,letterSpacing:'0.5px' }}>
        For educational purposes only · Not financial advice · All trading carries risk
      </div>
    </div>
  )
}
