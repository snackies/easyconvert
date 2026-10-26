// ทดสอบคู่มือ 2 ภาษา + การ์ดแพ็กเกจ: node tests/guide.js
const { chromium } = require("playwright");
const start = require("./server");
const PORT = 4175, BASE = "http://localhost:" + PORT + "/";
const results = []; let failed = 0;
function ok(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  -> " + extra : "")); if (!cond) failed++; }
const IDS = ["img2pdf", "pdf2img", "merge", "split", "compress", "shrink", "watermark", "sign", "pdf2word", "pdf2excel"];

(async () => {
  const srv = await start(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => (window.__csp = window.__csp || []).push(e.violatedDirective + " " + e.blockedURI)); });

  /* ---------- คู่มือทั้งสองภาษา ---------- */
  async function checkGuide(file, tag, lang) {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.evaluate(() => { try { localStorage.removeItem("ec_lang"); } catch (e) {} }).catch(() => {});
    const res = await page.goto(BASE + file, { waitUntil: "load" });
    ok(tag + ": โหลดได้ (200)", res.status() === 200);
    ok(tag + ": lang ของหน้าถูกต้อง", (await page.getAttribute("html", "lang")) === lang);
    await page.evaluate(() => document.querySelectorAll("img[loading=lazy]").forEach((i) => (i.loading = "eager")));
    await page.waitForTimeout(600);
    const imgs = await page.evaluate(() => [...document.images].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0, alt: i.alt })));
    ok(tag + ": มีรูปประกอบ 3 รูปและโหลดครบ", imgs.length === 3 && imgs.every((i) => i.ok), JSON.stringify(imgs.filter((i) => !i.ok)));
    ok(tag + ": ทุกรูปมี alt", imgs.every((i) => i.alt && i.alt.length > 10));
    const badLinks = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].filter((a) => a.getAttribute("href").length > 1 && !document.getElementById(a.getAttribute("href").slice(1))).map((a) => a.getAttribute("href")));
    ok(tag + ": ลิงก์ # ทุกอันมีปลายทาง", badLinks.length === 0, badLinks.join(","));
    const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById("tool-" + id)), IDS);
    ok(tag + ": มีหัวข้อวิธีใช้ครบ 10 เครื่องมือ", missing.length === 0, missing.join(","));
    const pickMissing = await page.evaluate((ids) => ids.filter((id) => !document.querySelector('.g-pick a[href="#tool-' + id + '"]')), IDS);
    ok(tag + ": ตัวช่วยเลือกชี้ถึงครบ 10 เครื่องมือ", pickMissing.length === 0, pickMissing.join(","));
    const dupIds = await page.evaluate(() => { const c = {}; document.querySelectorAll("[id]").forEach((e) => (c[e.id] = (c[e.id] || 0) + 1)); return Object.keys(c).filter((k) => c[k] > 1); });
    ok(tag + ": ไม่มี id ซ้ำ", dupIds.length === 0, dupIds.join(","));
    const hrefs = [...new Set(await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => !/^(#|mailto:)/.test(h)).map((h) => h.split("#")[0] || "")))];
    const dead = [];
    for (const h of hrefs) { const r = await page.request.get(BASE + h.replace(/^\//, "")); if (r.status() !== 200) dead.push(h + " " + r.status()); }
    ok(tag + ": ลิงก์ภายในเปิดได้ทั้งหมด", dead.length === 0, dead.join(", "));
    await page.setViewportSize({ width: 360, height: 800 });
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(tag + ": ไม่เลื่อนซ้าย-ขวาบนจอ 360px", ovf <= 0, "เกิน " + ovf + "px");
    await page.goto(BASE + file + "#tool-sign", { waitUntil: "load" });
    ok(tag + ": ลิงก์ตรง #tool-sign ถูกไฮไลต์", await page.evaluate(() => !!document.querySelector(".g-tool:target") && document.querySelector(".g-tool:target").id === "tool-sign"));
    await page.evaluate(() => localStorage.setItem("ec-theme", "dark"));
    await page.reload({ waitUntil: "load" });
    ok(tag + ": โหมดมืดใช้ได้", (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(14, 19, 27)");
    await page.evaluate(() => localStorage.removeItem("ec-theme"));
  }
  await checkGuide("guide.html", "คู่มือไทย", "th");
  await checkGuide("guide-en.html", "คู่มืออังกฤษ", "en");

  /* ---------- ปุ่มสลับภาษา ---------- */
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(BASE + "guide.html#premium", { waitUntil: "load" });
  ok("ปุ่มสลับ (ไทย→EN) พก #หัวข้อไป", (await page.getAttribute("#lang-switch", "href")) === "guide-en.html#premium");
  await page.click("#lang-switch");
  await page.waitForURL("**/guide-en.html#premium");
  ok("กดสลับแล้วไปหน้าอังกฤษ และจำภาษา en", (await page.evaluate(() => localStorage.getItem("ec_lang"))) === "en");
  await page.goto(BASE + "guide.html#tool-sign", { waitUntil: "load" });
  await page.waitForURL("**/guide-en.html#tool-sign");
  ok("ภาษาที่จำไว้เป็น en: เปิดหน้าไทยแล้วถูกพาไปหน้าอังกฤษ (คง #หัวข้อ)", true);
  await page.click("#lang-switch");
  await page.waitForURL("**/guide.html#tool-sign");
  await page.waitForTimeout(400);
  ok("กดสลับกลับเป็นไทยแล้วไม่ถูกเด้งกลับ และจำภาษา th", page.url().endsWith("/guide.html#tool-sign") && (await page.evaluate(() => localStorage.getItem("ec_lang"))) === "th");
  await page.evaluate(() => localStorage.removeItem("ec_lang"));
  ok("หน้าคู่มือทั้งสองไม่มี error/CSP", errors.length === 0 && !(await page.evaluate(() => window.__csp || [])).length, errors.join(" | "));
  const ext = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:"));
  ok("คู่มือไม่เรียกโดเมนอื่น", ext.length === 0, ext.join(", "));

  /* ---------- หน้าแรก: ลิงก์คู่มือตามภาษา + การ์ดแพ็กเกจ ---------- */
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => typeof translations !== "undefined" && document.querySelector("#plans-main .plan"));
  const thHtml = await (await page.request.get(BASE + "guide.html")).text();
  const enHtml = await (await page.request.get(BASE + "guide-en.html")).text();
  const helpBad = [];
  for (const id of IDS) {
    await page.click('.tool-tile[data-tool="' + id + '"]');
    const href = await page.getAttribute("#tool-help", "href");
    if (href !== "guide.html#tool-" + id || !thHtml.includes('id="tool-' + id + '"')) helpBad.push(id + ":" + href);
  }
  ok("ภาษาไทย: ลิงก์ “วิธีใช้เครื่องมือนี้” ชี้ถูกทุกเครื่องมือ", helpBad.length === 0, helpBad.join(", "));
  ok("ภาษาไทย: ลิงก์คู่มือที่ hero และ footer ชี้ guide.html", (await page.getAttribute(".hero a[data-guide]", "href")) === "guide.html" && (await page.getAttribute(".foot a[data-guide]", "href")) === "guide.html");

  const plans = await page.evaluate(() => [...document.querySelectorAll("#plans-main .plan")].map((p) => ({
    plan: p.dataset.plan, save: p.querySelector(".psave").textContent, desc: p.querySelector(".pdesc").textContent, items: [...p.querySelectorAll(".pli")].map((x) => x.textContent) })));
  ok("มีการ์ด 3 แพ็กเกจ แต่ละใบมีคำอธิบาย + รายการสิทธิ์ 4 ข้อ", plans.length === 3 && plans.every((p) => p.desc.length > 15 && p.items.length === 4 && p.save.length > 5));
  const byPlan = Object.fromEntries(plans.map((p) => [p.plan, p]));
  ok("ข้อความจำนวนวันตรงแพ็กเกจ (7/30/365)", byPlan.week.items[0].includes("7 วัน") && byPlan.month.items[0].includes("30 วัน") && byPlan.year.items[0].includes("365 วัน"));
  ok("ข้อความประหยัดคำนวณจากราคาจริง (40% / ~33 บาท 32%)", byPlan.month.save.includes("40%") && byPlan.year.save.includes("33") && byPlan.year.save.includes("32%"), byPlan.month.save + " | " + byPlan.year.save);
  ok("ไฟล์ใหญ่ระบุ 15 MB", byPlan.week.items[2].includes("15 MB"));

  await page.selectOption("#lang-toggle", "en");
  const en = await page.evaluate(() => ({
    d: document.querySelector('#plans-main .plan[data-plan="month"] .pdesc').textContent, h: document.getElementById("tool-help").textContent,
    hh: document.getElementById("tool-help").getAttribute("href"), hero: document.querySelector(".hero a[data-guide]").getAttribute("href"),
    foot: document.querySelector(".foot a[data-guide]").getAttribute("href"), f: document.querySelector(".pricing-foot").textContent,
    fl: document.querySelector(".pricing-foot a").getAttribute("href") }));
  ok("ภาษาอังกฤษ: คำอธิบายแพ็กเกจเป็นอังกฤษ", /^Best for/.test(en.d) && /How to use/.test(en.h) && /Stripe/.test(en.f) && !/Thai/.test(en.h), JSON.stringify(en));
  ok("ภาษาอังกฤษ: ทุกลิงก์คู่มือชี้ guide-en.html", /^guide-en\.html#tool-/.test(en.hh) && en.hero === "guide-en.html" && en.foot === "guide-en.html" && en.fl === "guide-en.html#premium", JSON.stringify(en));
  const helpBadEn = [];
  for (const id of IDS) {
    await page.click('.tool-tile[data-tool="' + id + '"]');
    const href = await page.getAttribute("#tool-help", "href");
    if (href !== "guide-en.html#tool-" + id || !enHtml.includes('id="tool-' + id + '"')) helpBadEn.push(id + ":" + href);
  }
  ok("ภาษาอังกฤษ: ลิงก์วิธีใช้ชี้ถูกทุกเครื่องมือ", helpBadEn.length === 0, helpBadEn.join(", "));
  await page.selectOption("#lang-toggle", "th");
  ok("สลับกลับไทยแล้วลิงก์กลับเป็น guide.html", (await page.getAttribute(".hero a[data-guide]", "href")) === "guide.html");

  await page.click("#user-badge");
  await page.waitForSelector("#gate-modal", { state: "visible" });
  const modal = await page.evaluate(() => ({ list: getComputedStyle(document.querySelector("#plans-modal .plist")).display, desc: getComputedStyle(document.querySelector("#plans-modal .pdesc")).display }));
  ok("หน้าต่างเลือกแพ็กเกจ: แสดงคำอธิบายสั้น ซ่อนรายการยาว", modal.list === "none" && modal.desc !== "none", JSON.stringify(modal));
  await page.click("#close-modal-btn");
  await page.setViewportSize({ width: 360, height: 800 });
  const ovf2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("หน้าแรกไม่เลื่อนซ้าย-ขวาบนจอ 360px", ovf2 <= 0, "เกิน " + ovf2 + "px");
  ok("หน้าแรกไม่มี error/CSP", errors.length === 0 && !(await page.evaluate(() => window.__csp || [])).length, errors.join(" | "));

  console.log(results.join("\n"));
  console.log(failed ? "\nFAILED: " + failed : "\nผ่านทั้งหมด " + results.length + " ข้อ");
  await browser.close(); srv.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
