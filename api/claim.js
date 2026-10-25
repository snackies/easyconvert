const { sign, readBody } = require("../lib/token");
const { PLANS, getPlan } = require("../lib/plans");
const { limited } = require("../lib/ratelimit");

// ตั้ง PASS_DAYS ใน Vercel ชั่วคราวเพื่อทดสอบการหมดอายุ (เช่น 0.01 ≈ 14 นาที) แล้วลบออกทุกครั้ง
function daysFor(plan) {
  const override = Number(process.env.PASS_DAYS);
  if (override > 0) return override;
  return getPlan(plan).days;
}
const STRIPE = "https://api.stripe.com/v1/checkout/sessions";
const LEGACY_MONTH_AMOUNT = 2900; // ใบเสร็จรุ่นแรกที่ไม่มี metadata.plan (ขาย 29 บาท = 30 วัน)

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

// แพ็กเกจที่ถูกต้องของใบเสร็จนี้ หรือ null ถ้าไม่ใช่ของเว็บเรา
function planOf(s) {
  if (s.currency !== "thb") return null;
  const named = s.metadata && s.metadata.plan;
  if (getPlan(named)) return named;
  if (!named && s.amount_total === LEGACY_MONTH_AMOUNT) return "month";
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
      if (!/^(cs|pi)_[A-Za-z0-9_]{8,200}$/.test(id)) return res.status(400).json({ error: "bad_session" });
      // หน้าเว็บถามซ้ำทุก 3 วินาทีระหว่างรอ PromptPay จึงให้โควตากว้างกว่าแบบกรอกอีเมล
      if (limited(req, "claim-sid", 150, 10 * 60 * 1000)) return res.status(429).json({ error: "too_many_attempts" });
      s = await findById(id, key);
    } else if (typeof body.email === "string" && typeof body.receipt === "string") {
      const email = body.email.trim();
      const digits = body.receipt.replace(/\D/g, "");
      if (
        email.length > 254 || body.receipt.length > 40 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || digits.length < 8
      ) {
        return res.status(400).json({ error: "bad_input" });
      }
      if (limited(req, "claim-email", 10, 10 * 60 * 1000)) return res.status(429).json({ error: "too_many_attempts" });
      s = await findByEmailAndReceipt(email, body.receipt, key);
      if (!s) return res.status(404).json({ error: "not_found" });
    } else {
      return res.status(400).json({ error: "bad_request" });
    }

    if (!s || s.payment_status !== "paid") {
      return res.status(402).json({ error: "not_paid" });
    }
    const plan = planOf(s);
    // 400 เพื่อให้หน้าเว็บเลิกถามซ้ำ (ไม่ใช่ใบเสร็จของแพ็กเกจเรา)
    if (!plan) return res.status(400).json({ error: "unknown_plan" });

    const exp = Math.floor(s.created + daysFor(plan) * 86400);
    if (exp * 1000 < Date.now()) return res.status(410).json({ error: "expired" });

    const token = sign({ sid: s.id, exp, plan });
    return res.status(200).json({ token, exp, plan });
  } catch (e) {
    console.error("claim failed:", e.message);
    if (/TOKEN_SECRET/.test(e.message)) return res.status(502).json({ error: "token_secret_missing" });
    return res.status(502).json({ error: e.code || "verify_failed" });
  }
};
