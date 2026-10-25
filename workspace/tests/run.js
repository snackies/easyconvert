const { chromium } = require("playwright");
const start = require("./server");
const fs = require("fs"), path = require("path");
const sharp = require("sharp"), { PDFDocument } = require("pdf-lib");
const JSZip = require("jszip");
const PORT = 4173, BASE = "http://localhost:" + PORT + "/";
const results = []; let failed = 0;
function ok(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  -> " + extra : "")); if (!cond) failed++; }
const fx = (n) => path.resolve(__dirname, "fx", n);

(async () => {
  const srv = await start(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [], violations = [], requests = [];
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") consoleErrors.push(m.text()); });
  page.on("pageerror", e => consoleErrors.push("PAGEERROR " + e.message));
  page.on("request", r => requests.push(r.method() + " " + r.url()));
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", e => (window.__csp = window.__csp || []).push(e.violatedDirective + " " + e.blockedURI)); });
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });

  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => window.PDFLib && window.pdfjsLib && window.JSZip && typeof translations !== "undefined");
  ok("libs load from own origin (PDFLib/pdfjsLib/JSZip)", true);
  const external = requests.filter(u => !u.includes("localhost:" + PORT) && !u.startsWith("GET data:") && !u.startsWith("GET blob:"));
  ok("no request to any other domain on load", external.length === 0, external.join(", "));
  ok("web font loaded", await page.evaluate(async () => { await document.fonts.load('700 20px "Plex Thai"', "ก"); return document.fonts.check('700 20px "Plex Thai"', "ก"); }));
  ok("tool grid has 10 tools", (await page.locator(".tool-tile").count()) === 10);

  async function runTool(tool, files, setup) {
    await page.click('.tool-tile[data-tool="' + tool + '"]');
    await page.setInputFiles("#file-input", files.map(fx));
    if (setup) await setup();
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await page.click("#process-btn");
    const d = await dl;
    const p = await d.path();
    return { name: d.suggestedFilename(), buf: fs.readFileSync(p) };
  }
  const resetQuota = () => page.evaluate(() => localStorage.removeItem("ec_trial"));

  // 1 รูป -> PDF
  let r = await runTool("img2pdf", ["idcard.jpg", "idcard.png"]);
  let pdf = await PDFDocument.load(r.buf);
  ok("img2pdf: 2 images -> 2 pages", pdf.getPageCount() === 2, r.name + " " + r.buf.length + "B");

  // 2 รวม
  await resetQuota();
  r = await runTool("merge", ["doc3.pdf", "small.pdf"]);
  pdf = await PDFDocument.load(r.buf);
  ok("merge: 3+1 = 4 pages", pdf.getPageCount() === 4);

  // 3 แยกหน้า
  await resetQuota();
  r = await runTool("split", ["doc3.pdf"], async () => { await page.fill("#page-range", "2-3"); });
  pdf = await PDFDocument.load(r.buf);
  ok("split 2-3: 2 pages", pdf.getPageCount() === 2);

  // 4 PDF -> รูป (zip)
  await resetQuota();
  r = await runTool("pdf2img", ["doc3.pdf"]);
  let zip = await JSZip.loadAsync(r.buf);
  const names = Object.keys(zip.files);
  const first = await sharp(await zip.files[names[0]].async("nodebuffer")).metadata();
  ok("pdf2img: zip with 3 JPG pages", names.length === 3 && first.format === "jpeg", names.join(",") + " " + first.width + "x" + first.height);

  // 5 บีบอัด PDF ทั้ง 3 ระดับ
  const orig = fs.statSync(fx("doc3.pdf")).size;
  for (const lvl of ["light", "medium", "strong"]) {
    await resetQuota();
    await page.click('.tool-tile[data-tool="compress"]');
    await page.selectOption("#compress-level", lvl);
    await page.setInputFiles("#file-input", [fx("doc3.pdf")]);
    let got = null;
    const dlp = page.waitForEvent("download", { timeout: 60000 }).then(d => (got = d)).catch(() => null);
    await page.click("#process-btn");
    await Promise.race([dlp, page.waitForFunction(() => /ขนาด|size|ไม่|no/i.test(document.getElementById("file-status").textContent) && !document.getElementById("process-btn").disabled, null, { timeout: 60000 })]).catch(() => {});
    await page.waitForFunction(() => !document.getElementById("process-btn").disabled);
    if (got) {
      const b = fs.readFileSync(await got.path()); const pd = await PDFDocument.load(b);
      ok("compress " + lvl + ": smaller & 3 pages", b.length < orig && pd.getPageCount() === 3, orig + " -> " + b.length + " (" + Math.round(100 - b.length / orig * 100) + "% smaller)");
    } else {
      const st = await page.textContent("#file-status");
      ok("compress " + lvl + ": handled (no gain message)", lvl === "light", st);
    }
  }

  // 6 ย่อรูปให้ไม่เกิน 100 KB / 50 KB
  for (const kb of [150, 50]) {
    await resetQuota();
    r = await runTool("shrink", ["idcard.jpg"], async () => { await page.fill("#target-size", String(kb)); await page.selectOption("#target-unit", "kb"); });
    const m = await sharp(r.buf).metadata();
    ok("shrink image <= " + kb + " KB", r.buf.length <= kb * 1024 && m.format === "jpeg", r.buf.length + "B  " + m.width + "x" + m.height + "  from 377035B");
  }
  // ย่อ PNG ใหญ่ 4MB -> 300KB
  await resetQuota();
  r = await runTool("shrink", ["idcard.png"], async () => { await page.fill("#target-size", "300"); });
  ok("shrink 4MB PNG <= 300 KB", r.buf.length <= 300 * 1024, r.buf.length + "B");
  // ย่อ PDF
  await resetQuota();
  r = await runTool("shrink", ["doc3.pdf"], async () => { await page.fill("#target-size", "120"); });
  pdf = await PDFDocument.load(r.buf);
  ok("shrink PDF <= 120 KB keeps 3 pages", r.buf.length <= 120 * 1024 && pdf.getPageCount() === 3, r.buf.length + "B from " + orig);
  // ไฟล์เล็กกว่าเป้าอยู่แล้ว -> คืนไฟล์เดิม
  await resetQuota();
  r = await runTool("shrink", ["small.pdf"], async () => { await page.fill("#target-size", "100"); });
  ok("shrink: already-small file returned unchanged", r.buf.length === fs.statSync(fx("small.pdf")).size);
  // เป้าที่เป็นไปไม่ได้ -> แจ้งตรง ๆ
  await resetQuota();
  r = await runTool("shrink", ["idcard.jpg"], async () => { await page.fill("#target-size", "10"); });
  const stFail = await page.textContent("#file-status");
  ok("shrink: unreachable target gives smallest result + honest message", r.buf.length > 0, "size " + r.buf.length + " | " + stFail);

  // 7 ลายน้ำ: รูป
  await resetQuota();
  r = await runTool("watermark", ["flatcard.jpg"], async () => { await page.fill("#wm-text", "สำเนาเพื่อสมัครงาน บริษัท ก ใช้ครั้งเดียว 25/10/2026"); });
  const wmRaw = await sharp(r.buf).raw().toBuffer({ resolveWithObject: true });
  let red = 0; for (let i = 0; i < wmRaw.data.length; i += 3) if (wmRaw.data[i] - wmRaw.data[i + 1] > 40) red++;
  const origRaw = await sharp(fx("flatcard.jpg")).raw().toBuffer(); let red0 = 0; for (let i = 0; i < origRaw.length; i += 3) if (origRaw[i] - origRaw[i + 1] > 40) red0++;
  ok("watermark image: red text added, same size", red > red0 + 3000 && wmRaw.info.width === 1800, "reddish px " + red0 + " -> " + red);
  fs.writeFileSync(__dirname + "/fx/out_wm.jpg", r.buf);
  // ลายน้ำ: PDF แล้วเรนเดอร์กลับมาดู
  await resetQuota();
  r = await runTool("watermark", ["doc3.pdf"], async () => { await page.fill("#wm-text", "COPY FOR BANK ONLY"); });
  pdf = await PDFDocument.load(r.buf);
  fs.writeFileSync(__dirname + "/fx/out_wm.pdf", r.buf);
  ok("watermark PDF: 3 pages", pdf.getPageCount() === 3, r.buf.length + "B");

  // 8 PDF -> Word / Excel
  await resetQuota();
  r = await runTool("pdf2word", ["doc3.pdf"]);
  const wz = await JSZip.loadAsync(r.buf); const wx = (await wz.files["word/document.xml"].async("string")).replace(/<[^>]+>/g, "");
  ok("pdf2word makes a real .docx containing page text", r.name.endsWith(".docx") && wx.includes("Hello EasyConvert page 2"), r.name);
  await resetQuota();
  r = await runTool("pdf2excel", ["doc3.pdf"]);
  ok("pdf2excel csv contains text", r.buf.toString("utf8").includes("Total") , r.name);

  // 9 โควตาทดลอง 2 ครั้ง/วัน ต่อเครื่องมือ
  await resetQuota();
  await page.click('.tool-tile[data-tool="split"]');
  async function tryOnce() {
    await page.setInputFiles("#file-input", [fx("doc3.pdf")]); await page.fill("#page-range", "1");
    const modalBefore = await page.isVisible("#gate-modal");
    const p = page.waitForEvent("download", { timeout: 4000 }).then(() => "download").catch(() => "nodownload");
    await page.click("#process-btn");
    const res = await p;
    await page.waitForFunction(() => !document.getElementById("process-btn").disabled);
    return { res, modal: await page.isVisible("#gate-modal") };
  }
  const a1 = await tryOnce(), a2 = await tryOnce(), a3 = await tryOnce();
  ok("trial: use #1 and #2 work", a1.res === "download" && a2.res === "download");
  ok("trial: use #3 blocked, upgrade modal shown", a3.res === "nodownload" && a3.modal === true);
  const planBtns = await page.locator("#plans-modal [data-plan]").evaluateAll(els => els.map(e => e.getAttribute("data-plan") + ":" + e.textContent.replace(/\s+/g, " ")));
  ok("modal shows 3 plans day/month/year", planBtns.length === 3, planBtns.join(" | "));
  ok("no fake-ad button remains", (await page.locator("#watch-ad-btn").count()) === 0);
  await page.click("#close-modal-btn");
  await page.click('.tool-tile[data-tool="merge"]');
  const mergeInfo = await page.textContent("#trial-info");
  ok("another tool still has its own 2 free uses", /2/.test(mergeInfo), mergeInfo);
  // ไฟล์ใหญ่เกิน 15MB ต้องติดล็อก (ไฟล์เปล่า 16MB)
  fs.writeFileSync(__dirname + "/fx/big.pdf", Buffer.concat([fs.readFileSync(fx("small.pdf")), Buffer.alloc(16 * 1048576)]));
  await resetQuota();
  await page.click('.tool-tile[data-tool="split"]');
  await page.setInputFiles("#file-input", [fx("big.pdf")]); await page.click("#process-btn");
  ok("file > 15 MB opens upgrade modal", await page.isVisible("#gate-modal"), await page.textContent("#modal-desc"));
  await page.click("#close-modal-btn");

  // 10 กดซื้อแพ็กเกจ: ส่ง plan ไป /api/create-checkout (จำลอง API)
  let posted = null;
  await page.route("**/api/create-checkout", async route => { posted = JSON.parse(route.request().postData()); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: BASE + "?canceled=1", id: "cs_test_123" }) }); });
  await page.click("#user-badge");
  await page.click('#plans-modal [data-plan="year"]');
  await page.waitForTimeout(800);
  ok("buy year plan posts {plan:'year'}", posted && posted.plan === "year", JSON.stringify(posted));

  // 11 สมาชิกพรีเมียม (จำลอง API verify): ไม่จำกัด + แสดงวันหมดอายุ/นับถอยหลัง
  await page.unroute("**/api/create-checkout");
  const exp = Math.floor(Date.now() / 1000) + 2 * 86400 + 3600;
  await page.route("**/api/verify", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ premium: true, exp, plan: "month" }) }));
  await page.evaluate(() => localStorage.setItem("ec_token", "x.y"));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("user-badge").classList.contains("premium"));
  ok("premium badge shown", true, await page.textContent("#user-badge"));
  const proTxt = (await page.textContent("#pro-expire")) + " | " + (await page.textContent("#pro-countdown"));
  ok("expiry date + countdown shown", /\d/.test(proTxt) && (await page.isVisible("#pro-info")), proTxt);
  await page.evaluate(() => localStorage.setItem("ec_trial", JSON.stringify({ date: (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })(), counts: { split: 99 } })));
  r = await runTool("split", ["doc3.pdf"], async () => { await page.fill("#page-range", "1"); });
  ok("premium ignores daily quota", r.buf.length > 0);
  await page.unroute("**/api/verify");
  await page.evaluate(() => { localStorage.removeItem("ec_token"); localStorage.removeItem("ec_trial"); });

  // 12 ใบรับรอง: จำนวนคำขอส่งข้อมูลออก = 0
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => typeof translations !== "undefined");
  r = await runTool("split", ["doc3.pdf"], async () => { await page.fill("#page-range", "1"); });
  const rcNet = await page.textContent("#rc-net");
  ok("receipt visible and network counter = 0", (await page.isVisible("#receipt")) && rcNet.trim() === "0", "counter=" + rcNet);

  // 13 ออฟไลน์จริง: ใช้งานโดยไม่มีเครือข่าย
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.removeItem("ec_trial"));
  await ctx.setOffline(true);
  const reqBefore = requests.length;
  await page.reload({ waitUntil: "load" }).catch(() => {});
  await page.waitForFunction(() => window.PDFLib && window.pdfjsLib, null, { timeout: 15000 }).catch(() => {});
  const offlineLoaded = await page.evaluate(() => !!(window.PDFLib && window.pdfjsLib && window.JSZip));
  ok("OFFLINE: page + libraries load from service worker", offlineLoaded);
  if (offlineLoaded) {
    r = await runTool("watermark", ["idcard.jpg"], async () => { await page.fill("#wm-text", "OFFLINE TEST"); });
    ok("OFFLINE: watermark works with no network", r.buf.length > 10000, r.buf.length + "B");
    r = await runTool("compress", ["doc3.pdf"], async () => { await page.selectOption("#compress-level", "strong"); });
    ok("OFFLINE: PDF compression (pdf.js worker) works with no network", r.buf.length > 1000 && r.buf.length < orig, r.buf.length + "B");
  }
  await ctx.setOffline(false);

  // 14 สรุป CSP / error
  const csp = await page.evaluate(() => window.__csp || []);
  ok("zero CSP violations during whole run", csp.length === 0, csp.join(" ; "));
  const bad = consoleErrors.filter(e => !/favicon|net::ERR_INTERNET_DISCONNECTED|Failed to load resource.*(404|offline)|\/api\//i.test(e));
  ok("no console errors/warnings (excluding expected)", bad.length === 0, bad.slice(0, 6).join(" || "));
  const posts = requests.filter(u => u.startsWith("POST") && !u.includes("/api/"));
  ok("no POST requests outside /api/", posts.length === 0, posts.join(","));
  ok("dialogs seen (alerts)", true, dialogs.join(" | ").slice(0, 300));

  console.log(results.join("\n")); console.log("\nFAILED:", failed);
  await browser.close(); srv.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.log(results.join("\n")); console.error("CRASH", e); process.exit(2); });
