export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)
    return res
      .status(500)
      .json({ error: "RESEND_API_KEY not configured in Vercel." });

  const {
    to,
    ticker,
    decision,
    confidence,
    entryPrice,
    stopLoss,
    targetPrice,
    reasoning,
    livePrice,
  } = req.body;
  if (!to || !ticker || !decision)
    return res.status(400).json({ error: "Missing required fields." });

  const clr =
    decision === "BUY"
      ? "#10b981"
      : decision === "SELL"
        ? "#f43f5e"
        : "#f59e0b";
  const upside =
    livePrice && targetPrice
      ? (((targetPrice - livePrice) / livePrice) * 100).toFixed(2)
      : null;
  const downside =
    livePrice && stopLoss
      ? (((stopLoss - livePrice) / livePrice) * 100).toFixed(2)
      : null;

  const html = `<!DOCTYPE html><html><body style="background:#0a0e1a;font-family:'Courier New',monospace;color:#e2e8f0;padding:0;margin:0;">
  <div style="max-width:580px;margin:0 auto;padding:32px 20px;">
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #1e293b;">
      <div style="font-size:10px;letter-spacing:4px;color:#6366f1;margin-bottom:4px;">ALGO · TRADE · AI</div>
      <div style="font-size:11px;color:#475569;letter-spacing:2px;">TRADING SIGNAL ALERT</div>
    </div>
    <div style="background:${clr}15;border:1px solid ${clr}50;border-radius:12px;padding:24px;margin-bottom:20px;">
      <div style="font-size:10px;color:${clr};letter-spacing:3px;margin-bottom:8px;">SIGNAL DETECTED</div>
      <div style="font-size:40px;font-weight:900;color:${clr};line-height:1;">${decision}</div>
      <div style="font-size:22px;color:#e2e8f0;font-weight:700;margin-top:4px;">${ticker}</div>
      <div style="font-size:11px;color:${clr};margin-top:8px;">Confidence: ${confidence}</div>
    </div>
    <div style="display:grid;gap:10px;margin-bottom:20px;">
      <div style="display:flex;gap:10px;">
        <div style="flex:1;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px;">
          <div style="font-size:9px;color:#475569;letter-spacing:2px;margin-bottom:6px;">LIVE PRICE</div>
          <div style="font-size:20px;font-weight:700;color:#e2e8f0;">$${livePrice || "—"}</div>
        </div>
        <div style="flex:1;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px;">
          <div style="font-size:9px;color:#475569;letter-spacing:2px;margin-bottom:6px;">ENTRY</div>
          <div style="font-size:20px;font-weight:700;color:#10b981;">$${entryPrice || "—"}</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px;">
          <div style="font-size:9px;color:#475569;letter-spacing:2px;margin-bottom:6px;">STOP LOSS</div>
          <div style="font-size:20px;font-weight:700;color:#f43f5e;">$${stopLoss || "—"}${downside ? ` <span style="font-size:11px;">(${downside}%)</span>` : ""}</div>
        </div>
        <div style="flex:1;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px;">
          <div style="font-size:9px;color:#475569;letter-spacing:2px;margin-bottom:6px;">TARGET</div>
          <div style="font-size:20px;font-weight:700;color:#10b981;">$${targetPrice || "—"}${upside ? ` <span style="font-size:11px;">(+${upside}%)</span>` : ""}</div>
        </div>
      </div>
    </div>
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:9px;color:#475569;letter-spacing:2px;margin-bottom:8px;">REASONING</div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.7;">${reasoning || ""}</div>
    </div>
    <div style="font-size:9px;color:#1e293b;line-height:1.8;border-top:1px solid #1e293b;padding-top:16px;">
      FOR EDUCATIONAL PURPOSES ONLY · NOT FINANCIAL ADVICE · ALL TRADING CARRIES RISK
    </div>
  </div>
</body></html>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [to],
        subject: `${decision === "BUY" ? "🟢" : decision === "SELL" ? "🔴" : "🟡"} ${decision} Signal: ${ticker} — Algo Trade AI`,
        html,
      }),
    });
    const data = await r.json();
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: data?.message || "Resend error" });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Email error: " + err.message });
  }
}
