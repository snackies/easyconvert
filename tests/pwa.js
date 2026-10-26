// ทดสอบตัวนับการเข้าชม + การติดตั้งเป็นแอป (PWA): node tests/pwa.js
const { chromium } = require("playwright");
const start = require("./server");
const fs = require("fs"), path = require("path");
const sharp = require("sharp");
const PORT = 4178, BASE = "http://localhost:" + PORT + "/";
const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const results = []; let failed = 0;
function ok(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  -> " + extra : "")); if (!cond) failed++; }
const fx = (n) => path.resolve(__dirname, "fx", n);
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

const STUB = "window.__stubLoaded = true; window.__fireBeacon = function () { return fetch('/_vercel/insights/view', { method: 'POST', body: 'page' }).catch(function () {}); }; window.__fireBeacon();";

(async () => {
  const { tools } = require("../scripts/seo-data.js");
  const pages = ["index.html", "guide.html", "guide-en.html", "privacy.html", "terms.html"].concat(tools.map((t) => t.slug));

  /* ---------- ไฟล์ ---------- */
  const mf = JSON.parse(read("manifest.webmanifest"));
  ok("manifest: ชื่อ/ชื่อสั้น/ภาษา/โหมดแสดงผลครบ", mf.name && mf.short_name && mf.short_name.length <= 12 && mf.lang === "th" && mf.display === "standalone");
  ok("manifest: start_url อยู่ใน scope", mf.scope === "/" && mf.start_url.startsWith("/") && mf.id === "/");
  ok("manifest: theme_color ตรงกับ <meta theme-color> ของหน้าแรก", read("index.html").includes('<meta name="theme-color" content="' + mf.theme_color + '">'));
  let iconOk = true; const iconMsg = [];
  for (const ic of mf.icons) {
    const f = path.join(PUB, ic.src);
    if (!fs.existsSync(f)) { iconOk = false; iconMsg.push("ไม่มี " + ic.src); continue; }
    const m = await sharp(f).metadata();
    if (ic.sizes !== m.width + "x" + m.height || m.format !== "png" || ic.type !== "image/png") { iconOk = false; iconMsg.push(ic.src + " " + m.width + "x" + m.height); }
  }
  ok("manifest: ไอคอนทุกไฟล์มีจริงและขนาดตรงที่ประกาศ", iconOk, iconMsg.join(", "));
  ok("manifest: มีไอคอน 192, 512 และ maskable", ["192x192:any", "512x512:any", "512x512:maskable"].every((k) => mf.icons.some((i) => i.sizes + ":" + i.purpose === k)));
  const ap = await sharp(path.join(PUB, "apple-touch-icon.png")).metadata();
  ok("apple-touch-icon เป็น 180x180 และไม่มีช่องโปร่งใส (iOS จะเติมดำ)", ap.width === 180 && ap.height === 180 && !ap.hasAlpha);
  ok("manifest: ทางลัด 3 รายการชี้ไปหน้าที่มีจริง", mf.shortcuts.length === 3 && mf.shortcuts.every((s) => fs.existsSync(path.join(PUB, s.url.replace(/^\//, ""))) && s.name && s.short_name));

  const missingHead = [];
  for (const p of pages) {
    const h = read(p);
    if (!h.includes('<link rel="manifest" href="manifest.webmanifest">')) missingHead.push(p + ":manifest");
    if (!h.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png">')) missingHead.push(p + ":apple-icon");
    if (!h.includes('<script src="analytics.js" defer></script>')) missingHead.push(p + ":analytics");
  }
  ok("ทุกหน้า (15) มี manifest, apple-touch-icon และ analytics.js", missingHead.length === 0, missingHead.join(", "));
  ok("หน้าแรกและหน้าเครื่องมือมีชื่อแอปบน iOS", ["index.html"].concat(tools.map((t) => t.slug)).every((p) => read(p).includes('<meta name="apple-mobile-web-app-title" content="EasyConvert">')));

  const sw = read("sw.js");
  const core = (sw.match(/const CORE = \[([^]*?)\];/) || [, ""])[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  ok("sw.js แคชไฟล์ PWA ครบและทุกไฟล์มีจริง", ["analytics.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"].every((f) => core.includes(f)) && core.every((f) => f === "./" || fs.existsSync(path.join(PUB, f))));
  ok("sw.js ไม่แตะ /_vercel/ และเวอร์ชันแคช ec-v22 ขึ้นไป", sw.includes('url.pathname.startsWith("/_vercel/")') && Number((sw.match(/ec-v(\d+)/) || [])[1]) >= 22);
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const csp = vj.headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
  ok("CSP ไม่ถูกผ่อน: script/connect เฉพาะโดเมนเรา และไม่มีโดเมนภายนอก", /script-src 'self' 'wasm-unsafe-eval'/.test(csp) && /connect-src 'self'/.test(csp) && /manifest-src 'self'/.test(csp) && !/https?:\/\//.test(csp) && !/unsafe-inline/.test(csp));

  const pv = read("privacy.html");
  ok("privacy: ไม่เหลือข้อความเก่าที่อ้างว่า 'ไม่มีสคริปต์ติดตาม' แบบเด็ดขาด", !pv.includes("<strong>ไม่มีสคริปต์ติดตามหรือโฆษณา</strong>"));
  ok("privacy: มีหัวข้อการนับสถิติ, ปุ่มปิด, ลิงก์เอกสาร Vercel, Do Not Track", pv.includes("<h2>การนับสถิติการเข้าชม</h2>") && pv.includes('id="stats-toggle"') && pv.includes("vercel.com/docs/analytics/privacy-policy") && pv.includes("Do Not Track"));
  ok("privacy: บอกว่าตัวนับในใบรับรองไม่รวมคำขอนับหน้าเว็บ", pv.includes("ตัวนับนี้ไม่รวมคำขอนับการเข้าชมหน้าเว็บ"));
  ok("คู่มือ 2 ภาษามีวิธีติดตั้งเป็นแอป", read("guide.html").includes('id="g-install"') && read("guide-en.html").includes('id="g-install"'));
  const seo = require("../scripts/build-seo.js");
  const log = console.log; console.log = () => {}; const code = seo.run(["--check"]); console.log = log;
  ok("หน้า SEO ทั้ง 10 หน้ายังตรงกับตัวสร้าง (ได้ head ใหม่ครบ)", code === 0);

  /* ---------- เบราว์เซอร์ ---------- */
  const srv = await start(PORT);
  const browser = await chromium.launch();

  async function fresh(opts, init) {
    const ctx = await browser.newContext(Object.assign({ acceptDownloads: true, viewport: { width: 1100, height: 900 } }, opts || {}));
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.__errors = []; page.__reqs = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") page.__errors.push(m.text()); });
    page.on("pageerror", (e) => page.__errors.push("PAGEERROR " + e.message));
    page.on("request", (r) => page.__reqs.push(r.method() + " " + r.url()));
    await ctx.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => (window.__csp = window.__csp || []).push(e.violatedDirective + " " + e.blockedURI)); });
    return { ctx, page };
  }
  const insights = (page) => page.__reqs.filter((u) => u.includes("/_vercel/"));

  /* 1) บน localhost ไม่นับ */
  {
    const { ctx, page } = await fresh();
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForTimeout(2600);
    ok("localhost: ไม่โหลดตัวนับและไม่มีคำขอไป /_vercel/", !(await page.$("#ec-insights")) && insights(page).length === 0);
    ok("localhost: ไม่มีข้อผิดพลาดในคอนโซล", page.__errors.length === 0, page.__errors.join(" | "));
    /* ติดตั้งได้ไหม (ตรวจโดย Chromium เอง) */
    const cdp = await ctx.newCDPSession(page);
    const inst = await cdp.send("Page.getInstallabilityErrors");
    ok("Chromium ตรวจแล้ว: ติดตั้งเป็นแอปได้ (ไม่มีข้อผิดพลาด)", inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
    const am = await cdp.send("Page.getAppManifest");
    ok("Chromium อ่าน manifest ได้โดยไม่มีคำเตือน", am.errors.length === 0 && /manifest\.webmanifest$/.test(am.url), JSON.stringify(am.errors));
    // service worker + แคชออฟไลน์
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => { const k = await caches.keys(); if (!k.length) return false; const c = await caches.open(k[k.length - 1]); return (await c.keys()).length > 20; }, null, { timeout: 15000 });
    const cached = await page.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[k.length - 1]); return (await c.keys()).map((r) => new URL(r.url).pathname); });
    ok("แคชของ service worker มีไฟล์ PWA และหน้าเครื่องมือ", ["/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png", "/analytics.js", "/merge-pdf.html"].every((p) => cached.includes(p)), cached.length + " ไฟล์");
    await ctx.setOffline(true);
    await page.goto(BASE + "merge-pdf.html", { waitUntil: "load" });
    ok("ออฟไลน์: เปิดหน้ารวม PDF ได้จากแคช", (await page.textContent("h1")).includes("รวม PDF"));
    await ctx.close();
  }

  /* 2) นับเมื่อเป็นเว็บจริง (จำลองด้วยสคริปต์ปลอม) */
  const FORCE = () => { window.__EC_TEST__ = { analytics: true }; };
  async function withStub(page) { await page.route("**/_vercel/insights/script.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: STUB })); await page.route("**/_vercel/insights/view", (r) => r.fulfill({ status: 200, body: "ok" })); }
  {
    const { ctx, page } = await fresh({}, FORCE);
    await withStub(page);
    await page.goto(BASE + "merge-pdf.html", { waitUntil: "load" });
    await page.waitForSelector("#ec-insights", { state: "attached", timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(500);
    ok("เว็บจริง: โหลดตัวนับจาก /_vercel/insights/script.js (โดเมนเราเอง)", (await page.$("#ec-insights")) && (await page.evaluate(() => window.__stubLoaded === true)) && (await page.getAttribute("#ec-insights", "src")) === "/_vercel/insights/script.js");
    ok("เว็บจริง: ส่งคำขอนับหน้า 1 ครั้งขึ้นไปและไม่ผิด CSP/คอนโซล", insights(page).some((u) => u.endsWith("/_vercel/insights/view")) && !((await page.evaluate(() => window.__csp)) || []).length && page.__errors.length === 0, page.__errors.join(" | "));
    ok("เว็บจริง: ไม่มีคำขอไปโดเมนอื่น", page.__reqs.filter((u) => !/^(GET|POST) (http:\/\/localhost:|data:|blob:)/.test(u)).length === 0);

    /* ใบรับรองไม่นับคำขอนับหน้า แต่ยังนับคำขออื่น */
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForFunction(() => window.PDFLib && window.__stubLoaded === true, null, { timeout: 8000 });
    await page.setInputFiles("#file-input", [fx("idcard.jpg")]);
    await page.evaluate(() => { window.__iv = setInterval(window.__fireBeacon, 4); });
    const before = insights(page).length;
    const dl = page.waitForEvent("download", { timeout: 60000 });
    await page.click("#process-btn");
    await dl;
    await page.waitForSelector("#receipt:not([hidden])");
    await page.evaluate(() => clearInterval(window.__iv));
    ok("ใบรับรอง: ระหว่างประมวลผลมีคำขอนับหน้าถูกส่ง แต่ตัวเลขยังเป็น 0", insights(page).length > before && (await page.textContent("#rc-net")) === "0", "ส่ง " + (insights(page).length - before) + " ครั้ง, ใบรับรอง=" + (await page.textContent("#rc-net")));
    await page.evaluate(() => localStorage.removeItem("ec_trial"));
    await page.setInputFiles("#file-input", [fx("idcard.jpg")]);
    await page.evaluate(() => { window.__iv = setInterval(() => fetch("/other-endpoint", { method: "POST", body: "x" }).catch(() => {}), 4); });
    const dl2 = page.waitForEvent("download", { timeout: 60000 });
    await page.click("#process-btn");
    await dl2;
    await page.waitForFunction(() => document.querySelector("#receipt:not([hidden])") && document.querySelector("#rc-net").textContent !== "0", null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => clearInterval(window.__iv));
    ok("ใบรับรอง (ตัวควบคุม): คำขอแบบอื่นระหว่างประมวลผลยังถูกนับและเตือน", (await page.textContent("#rc-net")) !== "0" && (await page.getAttribute("#receipt", "class")).includes("warn"), await page.textContent("#rc-net"));
    await ctx.close();
  }

  /* 3) ไม่นับเมื่อ DNT / GPC / ผู้ใช้ปิดเอง */
  const variants = [
    ["Do Not Track", () => { window.__EC_TEST__ = { analytics: true }; Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }); }],
    ["Global Privacy Control", () => { window.__EC_TEST__ = { analytics: true }; Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true }); }],
    ["ผู้ใช้กดปิดเอง (ec_nostats)", () => { window.__EC_TEST__ = { analytics: true }; localStorage.setItem("ec_nostats", "1"); }],
  ];
  for (const [label, init] of variants) {
    const { ctx, page } = await fresh({}, init);
    await withStub(page);
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForTimeout(2600);
    ok(label + ": ไม่โหลดตัวนับและไม่ส่งคำขอใด ๆ", !(await page.$("#ec-insights")) && insights(page).length === 0);
    await ctx.close();
  }

  /* 4) ปุ่มปิด/เปิดในหน้า privacy */
  {
    const { ctx, page } = await fresh({}, FORCE);
    await withStub(page);
    await page.goto(BASE + "privacy.html", { waitUntil: "load" });
    ok("privacy: สถานะเริ่มต้น 'เปิด' (บนเว็บจริง)", (await page.textContent("#stats-state")) === "ตอนนี้: เปิด" && (await page.textContent("#stats-toggle")).includes("ปิดการนับสถิติ"));
    await page.click("#stats-toggle");
    ok("privacy: กดแล้วบันทึกการปิดไว้และเปลี่ยนข้อความ", (await page.evaluate(() => localStorage.getItem("ec_nostats"))) === "1" && (await page.textContent("#stats-state")).includes("ปิด (ตามที่คุณเลือก)") && (await page.textContent("#stats-toggle")).includes("เปิดการนับสถิติอีกครั้ง"));
    await page.goto(BASE + "merge-pdf.html", { waitUntil: "load" });
    await page.waitForTimeout(2600);
    ok("privacy: หลังกดปิด หน้าอื่นไม่โหลดตัวนับ", !(await page.$("#ec-insights")));
    await page.goto(BASE + "privacy.html", { waitUntil: "load" });
    ok("privacy: สถานะที่ปิดไว้ยังอยู่หลังเปิดหน้าใหม่", (await page.textContent("#stats-state")).includes("ปิด (ตามที่คุณเลือก)"));
    await page.click("#stats-toggle");
    ok("privacy: กดอีกครั้งเปิดกลับ", (await page.evaluate(() => localStorage.getItem("ec_nostats"))) === null && (await page.textContent("#stats-state")) === "ตอนนี้: เปิด");
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    await page.goto(BASE + "privacy.html", { waitUntil: "load" });
    ok("privacy บน localhost: บอกว่าปิดเพราะเปิดจากเครื่องตัวเอง", (await page.textContent("#stats-state")).includes("เปิดเว็บจากเครื่องตัวเอง"));
    await ctx.close();
  }

  /* 5) คำแนะนำเมื่อเปิดจากแอปที่ติดตั้งบน iPad */
  const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  async function iosHint(standalone) {
    const { ctx, page } = await fresh({ userAgent: IPAD, viewport: { width: 820, height: 1100 }, hasTouch: true }, standalone ? () => Object.defineProperty(navigator, "standalone", { get: () => true }) : null);
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForFunction(() => window.PDFLib && document.querySelector(".tool-tile.active"));
    await page.setInputFiles("#file-input", [fx("idcard.jpg")]);
    await page.click("#process-btn");
    await page.waitForSelector("#save-box:not([hidden])", { timeout: 60000 });
    const text = await page.textContent("#save-hint");
    await ctx.close();
    return text;
  }
  const hintApp = await iosHint(true), hintWeb = await iosHint(false);
  const tr = new Function(read("translations.js") + "\nreturn translations;")();
  ok("iPad ในแอปที่ติดตั้ง: คำแนะนำบันทึกไฟล์มีข้อความให้เปิดด้วย Safari", hintApp.includes(tr.th.save_hint_app) && hintApp.includes(tr.th.save_hint_ios), hintApp);
  ok("iPad ใน Safari ปกติ: ไม่มีข้อความนั้น", !hintWeb.includes(tr.th.save_hint_app) && hintWeb.includes(tr.th.save_hint_ios), hintWeb);
  ok("ข้อความคำแนะนำมีครบทั้งไทยและอังกฤษ", !!tr.th.save_hint_app && !!tr.en.save_hint_app);

  await browser.close(); srv.close();
  console.log(results.join("\n"));
  console.log("\n" + results.filter((r) => r.startsWith("PASS")).length + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
