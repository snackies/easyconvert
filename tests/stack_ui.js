// ทดสอบฝั่งหน้าเว็บของการซื้อซ้ำ/ต่อวัน (จำลอง API ด้วย route)  รัน: node tests/stack_ui.js
const { chromium } = require("playwright");
const start = require("./server");
const PORT = 4177, BASE = "http://localhost:" + PORT + "/";
const results = []; let failed = 0;
function ok(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  -> " + extra : "")); if (!cond) failed++; }
const NOW = Math.floor(Date.now() / 1000), DAY = 86400;
const mkTok = (exp, tag) => Buffer.from(JSON.stringify({ sid: tag, exp, plan: "month" })).toString("base64url") + ".sig" + tag;

(async () => {
  const srv = await start(PORT);
  const browser = await chromium.launch();

  // have: วันหมดอายุของสิทธิ์เดิม (0 = ไม่มีสิทธิ์) · url: เปิดหน้าด้วย ?session_id= หรือไม่ · pendingAgeMin: อายุ pending ที่ค้างไว้
  async function scenario({ have = 0, url = "", claim, pendingAgeMin = null, restore = false }) {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
    const page = await ctx.newPage();
    const dialogs = [], claims = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.addInitScript(([have, tok, pend, ageMin]) => {
      try {
        localStorage.setItem("ec_lang", "th");
        if (have) localStorage.setItem("ec_token", tok);
        if (pend) { localStorage.setItem("ec_pending_session", pend); localStorage.setItem("ec_pending_at", String(Date.now() - ageMin * 60000)); }
      } catch (e) {}
    }, [have, have ? mkTok(have, "old") : "", pendingAgeMin === null ? "" : "cs_live_pending_session", pendingAgeMin || 0]);
    await page.route("**/api/verify", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(have ? { premium: true, exp: have, plan: "month" } : { premium: false }) }));
    await page.route("**/api/claim", (r) => { claims.push(JSON.parse(r.request().postData())); const c = claim; return r.fulfill({ status: c.status || 200, contentType: "application/json", body: JSON.stringify(c.body || {}) }); });
    await page.goto(BASE + url, { waitUntil: "load" });
    await page.waitForFunction(() => typeof translations !== "undefined" && document.querySelector("#plans-main .plan"));
    if (restore) {
      await page.click("#user-badge").catch(() => {});
      await page.evaluate(() => { document.getElementById("gate-modal").style.display = "none"; });
      await page.evaluate(() => { document.getElementById("restore-modal").style.display = "flex"; });
      await page.fill("#restore-email", "a@example.com");
      await page.fill("#restore-receipt", "1000-0002");
      await page.click("#restore-submit-btn");
    }
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({ token: localStorage.getItem("ec_token"), pending: localStorage.getItem("ec_pending_session"), status: document.getElementById("file-status").textContent }));
    await ctx.close();
    return { dialogs, claims, ...st };
  }

  const newTok = mkTok(NOW + 40 * DAY, "new");
  let r = await scenario({ have: NOW + 10 * DAY, url: "?session_id=cs_live_paid_again_1", claim: { body: { token: newTok, exp: NOW + 40 * DAY, plan: "month", extended: true, fresh: true } } });
  ok("พรีเมียมอยู่แล้ว + กลับจากหน้าจ่ายเงิน → ไปขอวัน (เดิมข้ามไปเฉย ๆ)", r.claims.length === 1 && r.claims[0].session_id === "cs_live_paid_again_1", JSON.stringify(r.claims));
  ok("ได้โทเค็นใหม่ที่ยาวขึ้น และเก็บแทนของเดิม", r.token === newTok);
  ok("แจ้งว่า “ต่อเวลาพรีเมียมให้แล้ว”", r.dialogs.length === 1 && /ต่อเวลาพรีเมียม/.test(r.dialogs[0]), r.dialogs.join("|"));
  ok("ล้างรหัสรอตรวจสิทธิ์หลังได้วัน", !r.pending);

  r = await scenario({ have: NOW + 10 * DAY, url: "?session_id=cs_live_paid_again_2", claim: { body: { token: mkTok(NOW + 5 * DAY, "short"), exp: NOW + 5 * DAY, plan: "week", extended: false, fresh: true } } });
  ok("เพิ่งจ่าย แต่ได้สิทธิ์สั้นกว่าเดิม (คนละอีเมล) → ไม่ลดสิทธิ์ และบอกให้ติดต่อ", r.token === mkTok(NOW + 10 * DAY, "old") && /ไม่พบรายการเดิม/.test(r.dialogs.join("")), r.dialogs.join("|"));

  r = await scenario({ have: NOW + 10 * DAY, restore: true, claim: { body: { token: mkTok(NOW + 10 * DAY, "same"), exp: NOW + 10 * DAY, plan: "month", extended: false, fresh: false } } });
  ok("กู้คืนรายการที่สิทธิ์เดิมครอบคลุมอยู่แล้ว → บอกว่าครอบคลุมแล้ว ไม่เปลี่ยนโทเค็น", r.token === mkTok(NOW + 10 * DAY, "old") && /ครอบคลุม/.test(r.dialogs.join("")), r.dialogs.join("|"));

  r = await scenario({ url: "?session_id=cs_live_first_buy_1", claim: { body: { token: newTok, exp: NOW + 7 * DAY, plan: "week", extended: false, fresh: true } } });
  ok("ผู้ซื้อครั้งแรก: ปลดล็อกปกติ (ไม่ขึ้นข้อความต่อเวลา)", r.token === newTok && /ปลดล็อกพรีเมียมเรียบร้อย/.test(r.dialogs.join("")) && !/ต่อเวลา/.test(r.dialogs.join("")), r.dialogs.join("|"));

  r = await scenario({ have: NOW + 10 * DAY, pendingAgeMin: 2, claim: { status: 402, body: { error: "not_paid" } } });
  ok("พรีเมียม + มีรายการค้าง (ยังไม่จ่าย): เงียบ ไม่มีข้อความเด้ง ไม่ขึ้น “กำลังตรวจสอบ”", r.claims.length >= 1 && r.dialogs.length === 0 && !/กำลังตรวจสอบ/.test(r.status), r.dialogs.join("|") + " / " + r.status);
  ok("…และเก็บรายการค้างไว้ลองใหม่", !!r.pending);
  r = await scenario({ have: NOW + 10 * DAY, pendingAgeMin: 31, claim: { status: 402, body: { error: "not_paid" } } });
  ok("รายการค้างเกิน 30 นาทีและยังไม่จ่าย → ล้างทิ้ง", !r.pending && r.dialogs.length === 0);
  r = await scenario({ have: NOW + 10 * DAY, pendingAgeMin: 3, claim: { body: { token: newTok, exp: NOW + 40 * DAY, extended: true, fresh: true } } });
  ok("พรีเมียม + จ่ายไปแล้วในแอปอื่นแล้วกลับมา (ไม่มี ?session_id) → ต่อวันให้", r.token === newTok && /ต่อเวลาพรีเมียม/.test(r.dialogs.join("")), r.dialogs.join("|"));

  console.log(results.join("\n"));
  console.log(failed ? "\nFAILED: " + failed : "\nผ่านทั้งหมด " + results.length + " ข้อ");
  await browser.close(); srv.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
