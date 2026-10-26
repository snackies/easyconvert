// ทดสอบหน้า SEO ต่อเครื่องมือ + sitemap/robots + การเลือกเครื่องมือตามหน้า: node tests/seo.js
const { chromium } = require("playwright");
const start = require("./server");
const fs = require("fs"), path = require("path");
const { PDFDocument } = require("pdf-lib");
const PORT = 4176, BASE = "http://localhost:" + PORT + "/";
const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const results = []; let failed = 0;
function ok(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  -> " + extra : "")); if (!cond) failed++; }
const fx = (n) => path.resolve(__dirname, "fx", n);
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");

(async () => {
  const seo = require("../scripts/build-seo.js");
  const { tools } = require("../scripts/seo-data.js");
  const site = seo.siteUrl();
  const tr = new Function(read("translations.js") + "\nreturn translations;")();

  /* ---------- ไฟล์ที่สร้าง ต้องตรงกับตัวสร้าง ---------- */
  const origLog = console.log; let logged = [];
  console.log = (...a) => logged.push(a.join(" "));
  const code = seo.run(["--check"]);
  console.log = origLog;
  ok("ไฟล์ SEO ทั้งหมดตรงกับตัวสร้าง (ไม่ตกรุ่น)", code === 0, logged.join(" | "));
  ok("ใช้โดเมนที่ตั้งไว้ (" + site + ")", /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(site));

  /* ---------- ตรวจแต่ละหน้า (อ่านไฟล์ตรง ๆ) ---------- */
  const titles = new Set(), descs = new Set();
  const sw = read("sw.js");
  for (const t of tools) {
    const h = read(t.slug), tag = t.id + ": ";
    const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    const desc = (h.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "";
    ok(tag + "title ไม่ว่างและไม่ยาวเกิน 90 ตัวอักษร", title.length > 10 && title.length <= 90, title.length + " " + title);
    ok(tag + "description ยาว 60-230 ตัวอักษร", desc.length >= 60 && desc.length <= 230, desc.length + "");
    titles.add(title); descs.add(desc);
    ok(tag + "canonical ชี้หน้าตัวเอง", h.includes('<link rel="canonical" href="' + site + "/" + t.slug + '">'));
    ok(tag + "og:image มีจริง", h.includes('content="' + site + '/og.png"') && fs.existsSync(path.join(PUB, "og.png")));
    ok(tag + "มี h1 เดียว", (h.match(/<h1[ >]/g) || []).length === 1);
    ok(tag + 'body มี data-tool="' + t.id + '"', h.includes('<body data-tool="' + t.id + '">'));
    ok(tag + "อยู่ในรายการแคชของ sw.js", sw.includes('"' + t.slug + '"'));
    const m = h.match(/<script type="application\/ld\+json">([^]*?)<\/script>/);
    let g = null; try { g = JSON.parse(m[1])["@graph"]; } catch (e) {}
    const types = g ? g.map((x) => x["@type"]).sort().join(",") : "";
    ok(tag + "JSON-LD อ่านได้ (WebApplication, BreadcrumbList, FAQPage)", types === "BreadcrumbList,FAQPage,WebApplication", types);
    if (g) {
      const faq = g.find((x) => x["@type"] === "FAQPage");
      const thSection = (h.match(/<section class="seo" data-seo-lang="th"[^]*?<\/section>/) || [""])[0];
      const visible = (thSection.match(/<details>/g) || []).length;
      ok(tag + "คำถามใน JSON-LD ตรงกับที่แสดงบนหน้า", faq.mainEntity.length === visible && visible === 3, faq.mainEntity.length + " vs " + visible);
      const textsOk = faq.mainEntity.every((q) => thSection.includes(q.name.replace(/&/g, "&amp;")) && thSection.includes(q.acceptedAnswer.text.replace(/&/g, "&amp;")));
      ok(tag + "ข้อความ FAQ ใน JSON-LD ตรงกับหน้าทุกตัวอักษร", textsOk);
    }
    ok(tag + "มีเนื้อหา 2 ภาษา", h.includes('data-seo-lang="th"') && h.includes('data-seo-lang="en"'));
    ok(tag + "คีย์แปล h1/sub มีทั้งไทยและอังกฤษ", ["th", "en"].every((l) => tr[l]["seo_" + t.id + "_h1"] && tr[l]["seo_" + t.id + "_sub"]));
    ok(tag + "ไม่มีสคริปต์หรือสไตล์แบบ inline ใหม่ (ยกเว้น JSON-LD)", !/<script(?![^>]*(src=|type="application\/ld\+json"))[^>]*>/.test(h) && !/<style[ >]/.test(h) && !/ style="/.test(h));
  }
  ok("title ของทั้ง 10 หน้าไม่ซ้ำกัน", titles.size === tools.length);
  ok("description ของทั้ง 10 หน้าไม่ซ้ำกัน", descs.size === tools.length);

  /* ---------- sitemap / robots / sw ---------- */
  const sm = read("sitemap.xml");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  ok("sitemap มี 15 หน้า (หน้าแรก + 10 เครื่องมือ + 4 หน้าข้อมูล)", locs.length === 15, locs.length + "");
  const missing = locs.filter((u) => { const rel = u.replace(site, "").replace(/^\//, "") || "index.html"; return !fs.existsSync(path.join(PUB, rel)); });
  ok("ทุก URL ใน sitemap มีไฟล์จริง", missing.length === 0, missing.join(", "));
  ok("sitemap ไม่มี URL ซ้ำ", new Set(locs).size === locs.length);
  const rb = read("robots.txt");
  ok("robots.txt: อนุญาตทั้งเว็บ ห้าม /api/ และชี้ sitemap", /Allow: \//.test(rb) && /Disallow: \/api\//.test(rb) && rb.includes("Sitemap: " + site + "/sitemap.xml"));
  const core = (sw.match(/const CORE = \[([^]*?)\];/) || [, ""])[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  const swMissing = core.filter((f) => f !== "./" && !fs.existsSync(path.join(PUB, f)));
  ok("ทุกไฟล์ในรายการแคช sw.js มีจริง (ไม่งั้นติดตั้ง sw ไม่ผ่าน)", swMissing.length === 0, swMissing.join(", "));
  ok("เวอร์ชันแคชของ sw.js เป็น ec-v21 ขึ้นไป", Number((sw.match(/ec-v(\d+)/) || [])[1]) >= 21);

  /* ---------- ในเบราว์เซอร์ ---------- */
  const srv = await start(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("request", (r) => requests.push(r.url()));
  page.on("dialog", (d) => d.dismiss());
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => (window.__csp = window.__csp || []).push(e.violatedDirective + " " + e.blockedURI)); });

  for (const t of tools) {
    const tag = t.id + " (เบราว์เซอร์): ";
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} }).catch(() => {});
    const res = await page.goto(BASE + t.slug, { waitUntil: "load" });
    await page.waitForFunction(() => window.PDFLib && window.pdfjsLib && typeof translations !== "undefined");
    ok(tag + "โหลดได้ (200)", res.status() === 200);
    ok(tag + "เลือกเครื่องมือถูกตัวตั้งแต่เปิดหน้า", (await page.getAttribute(".tool-tile.active", "data-tool")) === t.id);
    ok(tag + "ชื่อเครื่องมือในการ์ดตรง", (await page.textContent("#tool-title")) === tr.th["tab_" + t.id]);
    ok(tag + "h1 เป็นของเครื่องมือนี้", (await page.textContent("h1")) === t.th.h1);
    const accept = await page.getAttribute("#file-input", "accept");
    ok(tag + "ชนิดไฟล์ที่รับเหมาะกับเครื่องมือ", !!accept && (t.id === "img2pdf" ? /image/.test(accept) && !/pdf/.test(accept) : /pdf/.test(accept)), accept);
    const links = await page.evaluate(() => [...document.querySelectorAll("a[data-tool-link]")].map((a) => a.getAttribute("data-tool-link") + "=" + a.getAttribute("href")));
    ok(tag + "ลิงก์ไปครบ 10 เครื่องมือ", links.length === 10 && tools.every((x) => links.includes(x.id + "=" + x.slug)));
    ok(tag + "ไม่มีข้อผิดพลาดในคอนโซล / ไม่ฝ่าฝืน CSP", errors.length === 0 && !((await page.evaluate(() => window.__csp)) || []).length, errors.concat((await page.evaluate(() => window.__csp)) || []).join(" | "));
    errors.length = 0;
  }
  const ext = requests.filter((u) => !u.startsWith("http://localhost:" + PORT) && !u.startsWith("data:") && !u.startsWith("blob:"));
  ok("ทุกหน้าไม่ขอข้อมูลจากโดเมนอื่น", ext.length === 0, ext.join(", "));

  /* ---------- ภาษา ---------- */
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "merge-pdf.html", { waitUntil: "load" });
  await page.waitForFunction(() => typeof translations !== "undefined" && document.querySelector(".tool-tile.active"));
  ok("ภาษาไทย: เห็นเนื้อหาไทย ซ่อนเนื้อหาอังกฤษ", (await page.locator('.seo[data-seo-lang="th"]').isVisible()) && !(await page.locator('.seo[data-seo-lang="en"]').isVisible()));
  await page.selectOption("#lang-toggle", "en");
  ok("EN: h1 เปลี่ยนเป็นอังกฤษ", (await page.textContent("h1")) === tools.find((x) => x.id === "merge").en.h1);
  ok("EN: เห็นเนื้อหาอังกฤษ ซ่อนเนื้อหาไทย", !(await page.locator('.seo[data-seo-lang="th"]').isVisible()) && (await page.locator('.seo[data-seo-lang="en"]').isVisible()));
  ok("EN: ชื่อลิงก์เครื่องมือทั้งหมดเป็นอังกฤษ", (await page.textContent('a[data-tool-link="split"]')).includes("Extract pages"));
  ok("EN: หัวข้อ 'เครื่องมือทั้งหมด' เป็น All tools", (await page.textContent("#seo-tools-title")) === "All tools");
  await page.evaluate(() => localStorage.clear());

  /* ---------- หน้าแรกและพารามิเตอร์ ?tool= ---------- */
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => typeof translations !== "undefined" && document.querySelector(".tool-tile.active"));
  ok("หน้าแรก: เริ่มที่รูปเป็น PDF เหมือนเดิม", (await page.getAttribute(".tool-tile.active", "data-tool")) === "img2pdf" && !(await page.getAttribute("body", "data-tool")));
  ok("หน้าแรก: ไม่มีเนื้อหา SEO ของเครื่องมือใดเครื่องมือหนึ่ง", (await page.locator(".seo").count()) === 0);
  ok("หน้าแรก: มี canonical เป็นหน้าแรก", (await page.getAttribute('link[rel="canonical"]', "href")) === site + "/");
  await page.click('.tool-tile[data-tool="split"]');
  ok("หน้าแรก: กดไทล์สลับในหน้าเดิม (ไม่เปลี่ยน URL)", page.url() === BASE && (await page.getAttribute(".tool-tile.active", "data-tool")) === "split");
  await page.goto(BASE + "?tool=pdf2word", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".tool-tile.active"));
  ok("?tool=pdf2word เลือกเครื่องมือนั้น", (await page.getAttribute(".tool-tile.active", "data-tool")) === "pdf2word");
  await page.goto(BASE + "?tool=__proto__", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".tool-tile.active"));
  ok("?tool= ที่ไม่มีจริงถูกเมินและใช้ค่าเริ่มต้น", (await page.getAttribute(".tool-tile.active", "data-tool")) === "img2pdf");

  /* ---------- กดไทล์อื่นบนหน้าเครื่องมือ → ไปหน้าของเครื่องมือนั้น ---------- */
  await page.goto(BASE + "merge-pdf.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".tool-tile.active"));
  await Promise.all([page.waitForURL("**/split-pdf.html"), page.click('.tool-tile[data-tool="split"]')]);
  await page.waitForFunction(() => document.querySelector(".tool-tile.active"));
  ok("กดไทล์ 'แยกหน้า' บนหน้ารวม PDF → ไปหน้า split-pdf.html และเลือกถูกตัว", (await page.getAttribute(".tool-tile.active", "data-tool")) === "split" && (await page.textContent("h1")) === tools.find((x) => x.id === "split").th.h1);
  await page.click('.tool-tile[data-tool="split"]');
  ok("กดไทล์ของหน้าตัวเองไม่ทำให้หน้าโหลดซ้ำ", page.url().endsWith("/split-pdf.html"));

  /* ---------- ใช้งานจริงบนหน้าเครื่องมือ ---------- */
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "merge-pdf.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.PDFLib && document.querySelector(".tool-tile.active"));
  await page.setInputFiles("#file-input", [fx("clean.pdf"), fx("doc3.pdf")]);
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await page.click("#process-btn");
  const d = await dl;
  const pdf = await PDFDocument.load(fs.readFileSync(await d.path()));
  const a = (await PDFDocument.load(fs.readFileSync(fx("clean.pdf")))).getPageCount(), b = (await PDFDocument.load(fs.readFileSync(fx("doc3.pdf")))).getPageCount();
  ok("หน้า merge-pdf.html: รวม PDF ได้จริง (" + a + "+" + b + " หน้า)", d.suggestedFilename() === "EasyConvert_Merged.pdf" && pdf.getPageCount() === a + b, d.suggestedFilename() + " " + pdf.getPageCount());

  /* ---------- มือถือ + โหมดมืด ---------- */
  await page.setViewportSize({ width: 360, height: 800 });
  for (const f of ["merge-pdf.html", "pdf-to-word.html", "reduce-file-size.html"]) {
    await page.goto(BASE + f, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector(".tool-tile.active"));
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(f + ": ไม่เลื่อนซ้าย-ขวาบนจอ 360px", ovf <= 0, "เกิน " + ovf + "px");
  }
  await page.evaluate(() => localStorage.setItem("ec-theme", "dark"));
  await page.goto(BASE + "merge-pdf.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".tool-tile.active"));
  const darkBg = await page.evaluate(() => getComputedStyle(document.querySelector(".seo-tool-links a")).backgroundColor);
  ok("โหมดมืด: ลิงก์เครื่องมือใช้สีพื้นของธีม (ไม่ขาวโพลน)", darkBg === "rgb(22, 29, 40)", darkBg);

  await browser.close(); srv.close();
  console.log(results.join("\n"));
  console.log("\n" + results.filter((r) => r.startsWith("PASS")).length + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
