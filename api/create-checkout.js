// สร้าง Stripe Checkout Session (ไม่ต้องติดตั้ง SDK ใช้ REST ตรง ๆ)
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
 
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is missing");
    return res.status(500).json({ error: "stripe_not_configured" });
  }
 
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
 
  const p = new URLSearchParams();
  p.append("mode", "payment");
  // วิธีชำระเงินที่แสดง (PromptPay / บัตร) ตั้งค่าที่ Stripe Dashboard > Settings > Payment methods
  p.append("success_url", origin + "/?session_id={CHECKOUT_SESSION_ID}");
  p.append("cancel_url", origin + "/");
  p.append("line_items[0][quantity]", "1");
  p.append("line_items[0][price_data][currency]", "thb");
  p.append("line_items[0][price_data][unit_amount]", "2900"); // 29 บาท (หน่วยสตางค์)
  p.append("line_items[0][price_data][product_data][name]", "EasyConvert Pro (30 days)");
 
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
      // บันทึกสาเหตุจาก Stripe ลง Vercel Logs (ไม่มีการพิมพ์คีย์)
      console.error("Stripe error:", r.status, data && data.error && data.error.message);
      return res.status(502).json({ error: "stripe_error" });
    }
    return res.status(200).json({ url: data.url });
  } catch (e) {
    console.error("Stripe unreachable:", e.message);
    return res.status(502).json({ error: "stripe_unreachable" });
  }
};