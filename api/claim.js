const { sign, readBody } = require("../lib/token");
 
const PASS_DAYS = 30;
 
// หลังจ่ายเงินสำเร็จ Stripe จะ redirect กลับมาพร้อม session_id
// ฟังก์ชันนี้ถามยืนยันกับ Stripe โดยตรง แล้วออก token ที่เซ็นด้วย secret ฝั่งเซิร์ฟเวอร์
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
 
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "stripe_not_configured" });
 
  const { session_id } = readBody(req);
  if (typeof session_id !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(session_id)) {
    return res.status(400).json({ error: "bad_session" });
  }
 
  try {
    const r = await fetch(
      "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(session_id),
      { headers: { Authorization: "Bearer " + key } }
    );
    const s = await r.json();
    if (!r.ok || s.payment_status !== "paid") {
      console.error("claim: not paid", r.status, s.payment_status, s.error && s.error.message);
      return res.status(402).json({ error: "not_paid" });
    }
    const exp = s.created + PASS_DAYS * 86400;
    if (exp * 1000 < Date.now()) return res.status(410).json({ error: "expired" });
 
    const token = sign({ sid: s.id, exp });
    return res.status(200).json({ token, exp });
  } catch (e) {
    console.error("claim failed:", e.message);
    const code = /TOKEN_SECRET/.test(e.message) ? "token_secret_missing" : "verify_failed";
    return res.status(502).json({ error: code });
  }
};
