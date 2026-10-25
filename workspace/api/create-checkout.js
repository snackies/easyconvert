const { readBody } = require("../lib/token");
const { PLANS } = require("../lib/plans");

// สร้าง Stripe Checkout Session (ใช้ REST ตรง ๆ ไม่ต้องติดตั้ง SDK)
// วิธีชำระเงิน (PromptPay / บัตร) ตั้งที่ Stripe Dashboard > Settings > Payment methods
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is missing");
    return res.status(500).json({ error: "stripe_not_configured" });
  }

  const { plan = "month" } = readBody(req);
  const cfg = PLANS[plan];
  if (!cfg) return res.status(400).json({ error: "bad_plan" });

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;

  const p = new URLSearchParams();
  p.append("mode", "payment");
  p.append("success_url", origin + "/?session_id={CHECKOUT_SESSION_ID}");
  p.append("cancel_url", origin + "/?canceled=1");
  p.append("metadata[plan]", plan);
  p.append("line_items[0][quantity]", "1");
  p.append("line_items[0][price_data][currency]", "thb");
  p.append("line_items[0][price_data][unit_amount]", String(cfg.amount));
  p.append("line_items[0][price_data][product_data][name]", "EasyConvert Pro (" + cfg.label + ")");

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: p,
    });
    const data = await r.json();
    if (!r.ok || !data.url) {
      console.error("Stripe error:", r.status, data && data.error && data.error.message);
      return res.status(502).json({ error: "stripe_error" });
    }
    return res.status(200).json({ url: data.url, id: data.id });
  } catch (e) {
    console.error("Stripe unreachable:", e.message);
    return res.status(502).json({ error: "stripe_unreachable" });
  }
};
