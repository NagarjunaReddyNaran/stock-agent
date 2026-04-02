export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured.' })

  const { name, email, message } = req.body
  if (!name || !email || !message) return res.status(400).json({ error: 'Missing required fields.' })

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email address.' })

  const safe = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const safeName    = safe(name).slice(0, 100)
  const safeEmail   = safe(email).slice(0, 200)
  const safeMessage = safe(message).slice(0, 3000)

  const html = `<!DOCTYPE html><html><body style="background:#f0f4f8;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 28px;">
        <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.7);margin-bottom:6px;">ALGOTRADEAI</div>
        <div style="font-size:20px;font-weight:800;color:#ffffff;">New Contact Message</div>
      </div>
      <div style="padding:28px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;width:90px;">
              <span style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;">Name</span>
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:14px;font-weight:600;color:#0f172a;">${safeName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;">Email</span>
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
              <a href="mailto:${safeEmail}" style="font-size:14px;font-weight:600;color:#4f46e5;text-decoration:none;">${safeEmail}</a>
            </td>
          </tr>
        </table>
        <div style="margin-bottom:8px;">
          <span style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;">Message</span>
        </div>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px;font-size:14px;color:#374151;line-height:1.75;white-space:pre-wrap;">${safeMessage}</div>
        <div style="margin-top:20px;">
          <a href="mailto:${safeEmail}?subject=Re: Your AlgoTradeAI enquiry" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:11px 22px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">Reply to ${safeName}</a>
        </div>
      </div>
      <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
        Sent via AlgoTradeAI contact form · algotradeai.live
      </div>
    </div>
  </div>
</body></html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'AlgoTradeAI Contact <alerts@algotradeai.live>',
        to:   ['narantechinc@gmail.com'],
        reply_to: email,
        subject: `New Contact: ${safeName} — AlgoTradeAI`,
        html,
      }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data?.message || 'Failed to send email.' })
    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: 'Email error: ' + err.message })
  }
}
