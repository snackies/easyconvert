// ทดสอบการต่อวันเมื่อซื้อซ้ำ (จำลอง Stripe ไม่ต้องใช้คีย์จริง)  รัน: node tests/stack.js
process.env.TOKEN_SECRET = "test-secret-1234567890abcdef";
process.env.STRIPE_SECRET_KEY = "rk_test_fake";
delete process.env.PASS_DAYS;
const R = require("path").join(__dirname, "..");
console.error = () => {};
const tok = require(R + "/lib/token");
const { chain } = require(R + "/lib/stack");
const claim = require(R + "/api/claim");

const DAY = 86400, NOW = Math.floor(Date.now() / 1000);
let db = {}; let listFail = false; let listPerm = false; let listCalls = 0;
function mk(id, o) {
  return Object.assign({ id, object: "checkout.session", payment_status: "paid", currency: "thb", amount_total: 1900, metadata: { plan: "week" },
    created: NOW, customer_details: { email: "a@example.com" }, payment_intent: { id: "pi_" + id, latest_charge: { receipt_number: "1000-" + id.replace(/\D/g, "").padStart(4, "0"), refunded: false } } }, o);
}
function put(s) { db[s.id] = s; return s; }
global.fetch = async (url) => {
  const u = new URL(String(url));
  const m = u.pathname.match(/\/checkout\/sessions\/(.+)$/);
  if (m) { // ดึงตามรหัส: ไม่ได้ขยายข้อมูลการชำระเงิน
    const s = db[decodeURIComponent(m[1])];
    if (!s) return { ok: false, status: 404, json: async () => ({ error: { message: "No such checkout.session" } }) };
    return { ok: true, status: 200, json: async () => Object.assign({}, s, { payment_intent: s.payment_intent && s.payment_intent.id }) };
  }
  listCalls++;
  if (listPerm) return { ok: false, status: 403, json: async () => ({ error: { message: "The provided key does not have the required permissions for this endpoint" } }) };
  if (listFail) return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) };
  const email = u.searchParams.get("customer_details[email]");
  const data = Object.values(db).filter((s) => s.customer_details && s.customer_details.email === email).sort((a, b) => b.created - a.created);
  return { ok: true, status: 200, json: async () => ({ data }) };
};
let ipn = 0;
function call(body) {
  return new Promise((resolve) => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    Promise.resolve(claim({ method: "POST", body, headers: { host: "x.vercel.app", "x-forwarded-for": "10.0." + (++ipn >> 8) + "." + (ipn & 255) } }, res)).catch((e) => resolve({ code: 500, body: { thrown: e.message } }));
  });
}
const out = []; let bad = 0;
const t = (name, ok, note = "") => { if (!ok) bad++; out.push((ok ? "PASS " : "FAIL ") + name + (note ? "  -> " + note : "")); };
const days = (a, b) => Math.round((a - b) / DAY * 100) / 100;

(async () => {
  /* ---- chain() ---- */
  let c = chain([{ id: "a", created: 100 * DAY, days: 7 }]);
  t("chain: รายการเดียว = ซื้อ + จำนวนวัน", c.exp === 107 * DAY);
  c = chain([{ id: "a", created: 100 * DAY, days: 30 }, { id: "b", created: 110 * DAY, days: 30 }]);
  t("chain: ซื้อซ้ำกลางทาง ต่อท้าย (30+30 = 60 วัน)", c.exp === 160 * DAY && c.starts.b === 130 * DAY);
  c = chain([{ id: "a", created: 100 * DAY, days: 7 }, { id: "b", created: 120 * DAY, days: 7 }]);
  t("chain: ซื้อหลังหมดแล้ว เริ่มนับจากวันซื้อ (ไม่มีช่องว่างสะสม)", c.exp === 127 * DAY && c.starts.b === 120 * DAY);
  c = chain([{ id: "a", created: 100 * DAY, days: 7 }, { id: "a", created: 100 * DAY, days: 7 }]);
  t("chain: รายการเดียวกันซ้ำนับครั้งเดียว", c.exp === 107 * DAY);
  const set = [{ id: "a", created: 100 * DAY, days: 365 }, { id: "b", created: 105 * DAY, days: 7 }, { id: "c", created: 106 * DAY, days: 30 }];
  t("chain: ลำดับที่ส่งเข้ามาไม่มีผล", chain(set).exp === chain([set[2], set[0], set[1]]).exp && chain(set).exp === (100 + 365 + 7 + 30) * DAY);
  t("chain: ไม่มีรายการ", chain([]).exp === 0);
  let okProp = true;
  for (let i = 0; i < 500; i++) { // สุ่ม: ไม่เกินผลรวมวัน และไม่น้อยกว่าที่ควรได้
    const n = 1 + Math.floor(Math.random() * 6), items = [];
    for (let k = 0; k < n; k++) items.push({ id: "s" + k, created: Math.floor(Math.random() * 400) * DAY, days: [7, 30, 365][Math.floor(Math.random() * 3)] });
    const e = chain(items).exp, last = Math.max(...items.map((x) => x.created)), total = items.reduce((s, x) => s + x.days, 0) * DAY;
    const lower = Math.max(...items.map((x) => x.created + x.days * DAY));
    if (e > last + total || e < lower || e !== chain(items.slice().reverse()).exp) okProp = false;
  }
  t("chain: สุ่ม 500 ชุด ไม่เกินผลรวมวัน ไม่ต่ำกว่าที่ควร และไม่ขึ้นกับลำดับ", okProp);

  /* ---- API ---- */
  db = {};
  put(mk("cs_live_stack_m1", { created: NOW - 20 * DAY, metadata: { plan: "month" }, amount_total: 4900 }));
  let r = await call({ session_id: "cs_live_stack_m1" });
  t("รายการเดียว: ได้ 30 วันนับจากวันซื้อ (เหลือ 10 วัน) ไม่ใช่ต่อวัน", r.code === 200 && days(r.body.exp, NOW) === 10 && r.body.extended === false, JSON.stringify(r.body).slice(0, 120));
  t("รายการเดียว: ไม่ถือว่าเพิ่งซื้อ (เกิน 1 ชั่วโมง)", r.body.fresh === false);

  put(mk("cs_live_stack_m2", { created: NOW - 60, metadata: { plan: "month" }, amount_total: 4900 }));
  r = await call({ session_id: "cs_live_stack_m2" });
  t("ซื้อรายเดือนซ้ำตอนเหลือ 10 วัน → รวม 40 วัน (ไม่เสียวัน)", r.code === 200 && days(r.body.exp, NOW) === 40 && r.body.extended === true && r.body.fresh === true, "เหลือ " + days(r.body.exp, NOW) + " วัน");
  const expStack = r.body.exp;
  r = await call({ session_id: "cs_live_stack_m2" });
  t("กดกู้คืนรายการเดิมซ้ำ → ผลเท่าเดิม ไม่งอก", r.code === 200 && r.body.exp === expStack);
  r = await call({ session_id: "cs_live_stack_m1" });
  t("กู้คืนรายการเก่า (ใบแรก) หลังซื้อใบสอง → สิทธิ์รวมเท่าเดิม (ไม่ลดลง)", r.code === 200 && r.body.exp === expStack && r.body.extended === false);
  let last = expStack, grew = false;
  for (let i = 0; i < 20; i++) { r = await call({ session_id: "cs_live_stack_m2" }); if (r.body.exp !== last) grew = true; last = r.body.exp; }
  t("กดกู้คืนวนซ้ำ 20 ครั้ง ไม่ได้วันเพิ่ม", !grew);
  const payload = tok.verify(r.body.token);
  t("โทเค็นลงลายเซ็นถูกต้อง และ exp ตรงกับที่ตอบ", !!payload && payload.exp === expStack && payload.sid === "cs_live_stack_m2");

  // กู้คืนด้วยอีเมล + เลขที่ใบเสร็จ (เครื่องใหม่) ของใบที่สอง
  const rc = db["cs_live_stack_m2"].payment_intent.latest_charge.receipt_number;
  r = await call({ email: "a@example.com", receipt: rc });
  t("กู้คืนด้วยอีเมล+เลขใบเสร็จใบที่สอง บนเครื่องใหม่ → ได้สิทธิ์รวม", r.code === 200 && r.body.exp === expStack, "ตอบ " + r.code);
  r = await call({ email: "A@Example.com", receipt: rc });
  t("อีเมลตัวพิมพ์ใหญ่ผสม ใช้ได้ (ลองทั้งแบบเดิมและตัวเล็ก)", r.code === 200);

  // ใบแรกหมดไปแล้ว ใบที่สองยังอยู่: กู้คืนบนเครื่องใหม่ได้ครบ (ใบสองเริ่มนับต่อจากใบแรกหมด)
  db = {};
  put(mk("cs_live_stack_y1", { created: NOW - 360 * DAY, metadata: { plan: "year" }, amount_total: 39900 }));
  put(mk("cs_live_stack_w2", { created: NOW - 2 * DAY, metadata: { plan: "week" } }));
  r = await call({ session_id: "cs_live_stack_w2" });
  t("รายปี (เหลือ 5 วัน) + ซื้อรายสัปดาห์เมื่อ 2 วันก่อน → เหลือ 12 วัน", r.code === 200 && days(r.body.exp, NOW) === 12, "เหลือ " + days(r.body.exp, NOW));
  // ใบแรกหมดอายุตามลำพัง แต่ไปต่อท้ายจนยังไม่หมด: restore ใบที่หมดแล้วต้องไม่ถูกปฏิเสธ
  db = {};
  put(mk("cs_live_stack_w1", { created: NOW - 9 * DAY })); // หมดเมื่อ 2 วันก่อน
  r = await call({ session_id: "cs_live_stack_w1" });
  t("ใบเดียวที่หมดอายุแล้ว → 410 expired (พฤติกรรมเดิม)", r.code === 410 && r.body.error === "expired");
  put(mk("cs_live_stack_w1b", { created: NOW - 8 * DAY }));
  put(mk("cs_live_stack_w1c", { created: NOW - 7.5 * DAY }));
  r = await call({ session_id: "cs_live_stack_w1b" });
  t("ใบที่หมดตามลำพังแล้ว แต่ยังมีใบที่ต่อท้ายอยู่ → กู้คืนได้ตามสิทธิ์รวม", r.code === 200 && r.body.exp > NOW, "ตอบ " + r.code + " " + (r.body.error || ""));

  // คนละอีเมลไม่ต่อกัน
  db = {};
  put(mk("cs_live_stack_e1", { created: NOW - 3 * DAY, customer_details: { email: "a@example.com" } }));
  put(mk("cs_live_stack_e2", { created: NOW - 60, customer_details: { email: "b@example.com" } }));
  r = await call({ session_id: "cs_live_stack_e2" });
  t("คนละอีเมลไม่ถูกนับรวมกัน (ได้ 7 วันจากวันซื้อ)", r.code === 200 && days(r.body.exp, NOW) === 7 && r.body.extended === false, "เหลือ " + days(r.body.exp, NOW));

  // คืนเงิน
  db = {};
  put(mk("cs_live_stack_r1", { created: NOW - 2 * DAY, metadata: { plan: "month" } }));
  db.cs_live_stack_r1.payment_intent.latest_charge.refunded = true;
  put(mk("cs_live_stack_r2", { created: NOW - 60 }));
  r = await call({ session_id: "cs_live_stack_r2" });
  t("ใบที่คืนเงินแล้วไม่ถูกนับต่อวัน (ใบสองได้ 7 วัน)", r.code === 200 && days(r.body.exp, NOW) === 7, "เหลือ " + days(r.body.exp, NOW));
  r = await call({ session_id: "cs_live_stack_r1" });
  t("กู้คืนใบที่คืนเงินแล้ว → 410 refunded", r.code === 410 && r.body.error === "refunded");

  // สินค้าอื่น / สกุลเงินอื่น / ยังไม่จ่าย ในอีเมลเดียวกัน
  db = {};
  put(mk("cs_live_stack_o1", { created: NOW - 1 * DAY, metadata: {}, amount_total: 99900 }));
  put(mk("cs_live_stack_o2", { created: NOW - 1 * DAY, currency: "usd" }));
  put(mk("cs_live_stack_o3", { created: NOW - 1 * DAY, payment_status: "unpaid" }));
  put(mk("cs_live_stack_ok", { created: NOW - 60 }));
  r = await call({ session_id: "cs_live_stack_ok" });
  t("รายการอื่นของอีเมลเดียวกัน (สินค้าอื่น/สกุลเงินอื่น/ยังไม่จ่าย) ไม่ถูกนับ", r.code === 200 && days(r.body.exp, NOW) === 7, "เหลือ " + days(r.body.exp, NOW));
  r = await call({ session_id: "cs_live_stack_o3" });
  t("session ที่ยังไม่จ่าย → 402 เหมือนเดิม", r.code === 402);

  // ใบเสร็จรุ่นแรก 29 บาท (ไม่มี metadata) ยังนับเป็น 30 วัน
  db = {};
  put(mk("cs_live_stack_old", { created: NOW - 10 * DAY, metadata: {}, amount_total: 2900 }));
  put(mk("cs_live_stack_new", { created: NOW - 60, metadata: { plan: "week" } }));
  r = await call({ session_id: "cs_live_stack_new" });
  t("ใบเสร็จรุ่นแรก ฿29 (30 วัน) นับต่อได้: เหลือ 20 + 7 = 27 วัน", r.code === 200 && days(r.body.exp, NOW) === 27, "เหลือ " + days(r.body.exp, NOW));

  // ไม่มีอีเมลในรายการ (ข้อมูลเก่า) → ไม่เรียกค้นหา ใช้พฤติกรรมเดิม
  db = {}; listCalls = 0;
  put(mk("cs_live_stack_noemail", { created: NOW - 60, customer_details: null }));
  r = await call({ session_id: "cs_live_stack_noemail" });
  t("ไม่มีอีเมลในรายการ: ทำงานแบบเดิม ไม่เรียกค้นหาเพิ่ม", r.code === 200 && days(r.body.exp, NOW) === 7 && listCalls === 0);

  // Stripe ค้นหาล้มเหลว: ต้องแจ้งผิดพลาด ไม่ใช่ให้สิทธิ์ต่ำกว่าจริงเงียบ ๆ
  db = {}; listFail = true;
  put(mk("cs_live_stack_f1", { created: NOW - 60 }));
  r = await call({ session_id: "cs_live_stack_f1" });
  t("ค้นหารายการของอีเมลล้มเหลว → 502 (ไม่ออกโทเค็น)", r.code === 502 && !r.body.token, "ตอบ " + r.code);
  listFail = false;

  // คีย์ Stripe ไม่มีสิทธิ์ค้นหารายการ: ผู้ซื้อยังได้สิทธิ์ตามใบของตัวเอง (ไม่ล็อกทั้งระบบ)
  db = {}; listPerm = true;
  put(mk("cs_live_stack_perm1", { created: NOW - 60 }));
  r = await call({ session_id: "cs_live_stack_perm1" });
  t("คีย์ไม่มีสิทธิ์ค้นหารายการ → ยังปลดล็อกตามใบนั้น (7 วัน) ไม่ล้มทั้งระบบ", r.code === 200 && days(r.body.exp, NOW) === 7, "ตอบ " + r.code);
  listPerm = false;

  // PASS_DAYS (ใช้ทดสอบการหมดอายุ) ยังใช้ได้
  process.env.PASS_DAYS = "0.5";
  db = {}; put(mk("cs_live_stack_p1", { created: NOW - 60 }));
  r = await call({ session_id: "cs_live_stack_p1" });
  t("PASS_DAYS=0.5 ใช้ได้ (ทดสอบหมดอายุ)", r.code === 200 && days(r.body.exp, NOW) === 0.5, "เหลือ " + days(r.body.exp, NOW));
  delete process.env.PASS_DAYS;

  console.log(out.join("\n"));
  console.log(bad ? "\nFAILED: " + bad : "\nผ่านทั้งหมด " + out.length + " ข้อ");
  process.exit(bad ? 1 : 0);
})();
