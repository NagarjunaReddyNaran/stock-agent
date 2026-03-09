# 📈 Algo Trade AI — Stock Trading Agent

An AI-powered stock market trading agent with **live prices**, built with React + Vite. Analyzes stocks and gives BUY / SELL / HOLD signals with entry price, stop loss, and target price — all grounded in real-time market data.

## ✨ Features

- 🔴 **Live stock prices** via Finnhub API (real-time)
- 🤖 **AI analysis** powered by Claude (Anthropic)
- 📊 **Full trading signal** — BUY / SELL / HOLD with confidence level
- 💰 **Price targets** — entry, stop loss, target based on live price
- 📉 **Risk/Reward ratio** calculated automatically
- 🧠 **5 signal breakdown** — news, analyst sentiment, financials, technical, institutional
- 🔑 **Persistent API key** — saved in browser localStorage, never re-enter
- 📋 **Session history** — click past analyses to revisit

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) (LTS version)
- Free [Finnhub API key](https://finnhub.io/register)

### Install & Run Locally

```bash
git clone https://github.com/YOUR_USERNAME/stock-agent.git
cd stock-agent
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

## 🔑 API Keys Required

| Key | Where to get | Cost |
|-----|-------------|------|
| Finnhub API | [finnhub.io/register](https://finnhub.io/register) | Free (60 calls/min) |

> The Anthropic API key is handled automatically when deployed via Claude.ai artifacts or when you add it as an environment variable.

## 🌐 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this repo to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Click Deploy — done ✅

Every `git push` auto-deploys via Vercel.

## 📁 Project Structure

```
stock-agent/
├── src/
│   ├── App.jsx        # Main trading agent UI + logic
│   └── main.jsx       # React entry point
├── index.html         # HTML shell
├── vite.config.js     # Vite configuration
├── package.json       # Dependencies
└── .gitignore         # Git ignore rules
```

## ⚠️ Disclaimer

This tool is for **educational and informational purposes only**. It is NOT financial advice. All trading decisions carry risk. Past performance does not guarantee future results. Always verify signals with your own research before trading.

## 🛠 Tech Stack

- [React 18](https://react.dev)
- [Vite 5](https://vitejs.dev)
- [Finnhub API](https://finnhub.io) — live stock prices
- [Anthropic Claude API](https://anthropic.com) — AI analysis
