const { sign, readBody } = require("../lib/token");
const { PLANS } = require("../lib/plans");

// อายุสิทธิ์ตามแพ็กเกจที่บันทึกใน metadata ของ Checkout Session (รายการเก่าที่ไม่มี metadata ถือเป็น 30 วัน)
// ตั้ง PASS_DAYS ใน Vercel ชั่วคราวเพื่อทดสอบการหมดอายุ (เช่น 0.01 ≈ 14 นาที) แล้วลบออกทุกครั้ง
function daysFor(session) {
  const override = Number(process.env.PASS_DAYS);
  if (override > 0) return override;
  const plan = session.metadata && session.metadata.plan;
  return (PLANS[plan] && PLANS[plan].days) || 30;
}
const STRIPE = "https://api.stripe.com/v1/checkout/sessions";

// จำกัดการลองเดา (best-effort: serverless อาจรีเซ็ตเมื่อ instance ใหม่)
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  if (attempts.size > 1000) attempts.clear();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > 10;
}

async function stripeGet(url, key) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + key } });
  const json = await r.json();
  if (!r.ok) {
    const msg = (json.error && json.error.message) || "stripe_error";
    const err = new Error(msg);
    err.code = /permission/i.test(msg) ? "stripe_permission" : "stripe_error";
    throw err;
  }
  return json;
}

// กรณีมีรหัส cs_... หรือ pi_...
async function findById(id, key) {
  if (id.startsWith("pi_")) {
    const list = await stripeGet(STRIPE + "?limit=1&payment_intent=" + encodeURIComponent(id), key);
    return (list.data && list.data[0]) || null;
  }
  return stripeGet(STRIPE + "/" + encodeURIComponent(id), key);
}

// กรณีผู้ใช้กรอกอีเมล + เลขที่ใบเสร็จ (ต้องตรงกันทั้งคู่)
async function findByEmailAndReceipt(email, receipt, key) {
  const want = receipt.replace(/\D/g, "");
  const variants = [...new Set([email, email.toLowerCase()])];
  for (const e of variants) {
    const q = new URLSearchParams();
    q.append("limit", "30");
    q.append("customer_details[email]", e);
    q.append("expand[]", "data.payment_intent.latest_charge");
    const list = await stripeGet(STRIPE + "?" + q.toString(), key);
    const hit = (list.data || [])
      .filter((s) => s.payment_status === "paid")
      .filter((s) => {
        const ch = s.payment_intent && s.payment_intent.latest_charge;
        return ch && ch.receipt_number && ch.receipt_number.replace(/\D/g, "") === want;
      })
      .sort((a, b) => b.created - a.created)[0];
    if (hit) return hit;
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is missing");
    return res.status(500).json({ error: "stripe_not_configured" });
  }

  const body = readBody(req);

  try {
    let s = null;

    if (typeof body.session_id === "string") {
      const id = body.session_id.trim();
      if (!/^(cs|pi)_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: "bad_session" });
      s = await findById(id, key);
    } else if (typeof body.email === "string" && typeof body.receipt === "string") {
      const email = body.email.trim();
      const digits = body.receipt.replace(/\D/g, "");
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || digits.length < 8) {
        return res.status(400).json({ error: "bad_input" });
      }
      const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
      if (tooMany(ip)) return res.status(429).json({ error: "too_many_attempts" });
      s = await findByEmailAndReceipt(email, body.receipt, key);
      if (!s) return res.status(404).json({ error: "not_found" });
    } else {
      return res.status(400).json({ error: "bad_request" });
    }

    if (!s || s.payment_status !== "paid") {
      return res.status(402).json({ error: "not_paid" });
    }
    const exp = Math.floor(s.created + daysFor(s) * 86400);
    if (exp * 1000 < Date.now()) return res.status(410).json({ error: "expired" });

    const plan = (s.metadata && s.metadata.plan) || "month";
    const token = sign({ sid: s.id, exp, plan });
    return res.status(200).json({ token, exp, plan });
  } catch (e) {
    console.error("claim failed:", e.message);
    if (/TOKEN_SECRET/.test(e.message)) return res.status(502).json({ error: "token_secret_missing" });
    return res.status(502).json({ error: e.code || "verify_failed" });
  }
};
