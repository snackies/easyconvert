// ทดสอบเครื่องมือใหม่: เซ็นเอกสาร + PDF เป็น Word (.docx)
const { chromium } = require("playwright");
const start = require("./server");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const JSZip = require("jszip");
const PORT = 4180, BASE = "http://localhost:" + PORT + "/";
const OUT = path.join(__dirname, "out"); fs.mkdirSync(OUT, { recursive: true });
const results = []; let failed = 0;
function ok(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  -> " + extra : "")); if (!cond) failed++; }
const fx = (n) => path.join(__dirname, "fx", n);
const sh = (c) => execSync(c, { encoding: "utf8", timeout: 180000 });

(async () => {
  const srv = await start(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1000, height: 1200 } });
  const page = await ctx.newPage();
  const errors = [], dialogs = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", e => (window.__csp = window.__csp || []).push(e.violatedDirective + " " + e.blockedURI)); });
  await page.goto(BASE); await page.waitForFunction(() => window.EC && EC.tools.sign && EC.tools.pdf2word && window.PDFLib && window.pdfjsLib);
  ok("plugins registered (sign, pdf2word) and 10 tools in grid", (await page.locator(".tool-tile").count()) === 10);

  const resetQuota = () => page.evaluate(() => localStorage.removeItem("ec_trial"));
  async function download(clickSel) {
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await page.click(clickSel);
    const d = await dl; return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) };
  }
  async function pick(tool, file) { await page.click('.tool-tile[data-tool="' + tool + '"]'); await page.setInputFiles("#file-input", [fx(file)]); }
  const pageReady = () => page.waitForFunction(() => { const c = document.getElementById("sg-page"); if (!c || c.width < 100) return false; const d = c.getContext("2d").getImageData(0, 0, 1, 1).data; return d[3] === 255; }, null, { timeout: 20000 });

  /* ================= PDF -> DOCX ================= */
  await resetQuota();
  await pick("pdf2word", "thai_chrome.pdf");
  let r = await download("#process-btn");
  fs.writeFileSync(path.join(OUT, "thai.docx"), r.buf);
  const status1 = await page.textContent("#file-status");
  ok("docx: file named .docx", r.name === "thai_chrome.docx", r.name);
  let z = await JSZip.loadAsync(r.buf);
  const names = Object.keys(z.files).filter(n => !z.files[n].dir);
  ok("docx: has required parts", ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"].every(n => names.includes(n)), names.join(","));
  let xmlBad = [];
  for (const n of names.filter(n => /\.(xml|rels)$/.test(n))) { fs.writeFileSync("/tmp/_x.xml", await z.files[n].async("string")); try { sh("xmllint --noout /tmp/_x.xml"); } catch (e) { xmlBad.push(n); } }
  ok("docx: every XML part is well-formed (xmllint)", xmlBad.length === 0, xmlBad.join(","));
  const doc = await z.files["word/document.xml"].async("string");
  const text = doc.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "");
  ok("docx: Thai title + note text present", text.includes("ใบแจ้ง") && text.includes("หมายเหตุสำคัญ") && text.includes("ลงชื่อ".replace("ื่", "ื")) );
  ok("docx: sara-am recombined (จำกัด, no split nikhahit+aa)", text.includes("จำกัด") && !text.includes("\u0E4D\u0E32"));
  ok("docx: honest warning shown when source PDF lacks Thai tone marks", /ตรวจทาน/.test(status1), status1);
  ok("docx: bold kept (w:b)", /<w:b\/>/.test(doc));
  ok("docx: centered title (jc center)", /w:jc w:val="center"/.test(doc));
  ok("docx: image extracted", names.some(n => n.startsWith("word/media/")), names.filter(n => n.startsWith("word/media/")).join(","));
  const pgw = +((doc.match(/<w:pgSz w:w="(\d+)"/) || [])[1] || 0), pgh = +((doc.match(/w:h="(\d+)"/) || [])[1] || 0);
  ok("docx: page size = A4 (±0.5%) in twips", Math.abs(pgw - 11906) < 60 && Math.abs(pgh - 16838) < 85, pgw + "x" + pgh);
  ok("docx: table text kept in reading order", /รายการ.*จำนวน.*ราคา/.test(text) && /แพ็กเกจรายเดือน.*29\.00/.test(text));
  // เปิดด้วย LibreOffice จริง
  sh("cd " + OUT + " && soffice --headless --convert-to pdf thai.docx >/dev/null 2>&1");
  const info = sh("pdfinfo " + path.join(OUT, "thai.pdf"));
  const lt = sh("pdftotext " + path.join(OUT, "thai.pdf") + " -");
  const srcPages = sh("pdfinfo " + fx("thai_chrome.pdf"));
  ok("docx: opens in LibreOffice, same page count as source (1)", /Pages:\s+1\b/.test(info) && /Pages:\s+1\b/.test(srcPages), (info.match(/Pages:.*/) || [""])[0]);
  ok("docx: text survives round trip through LibreOffice", lt.includes("ใบแจ้ง") && lt.includes("แพ็กเกจรายเดือน") && lt.includes("จำกัด"));
  sh("cd " + OUT + " && pdftoppm -r 60 -png thai.pdf thai_docx");

  await resetQuota();
  await pick("pdf2word", "doc3.pdf");
  r = await download("#process-btn"); fs.writeFileSync(path.join(OUT, "doc3.docx"), r.buf);
  z = await JSZip.loadAsync(r.buf);
  const media3 = Object.keys(z.files).filter(n => n.startsWith("word/media/") && !z.files[n].dir);
  ok("docx doc3: 3 images (one per page) extracted", media3.length === 3, media3.length + "");
  sh("cd " + OUT + " && soffice --headless --convert-to pdf doc3.docx >/dev/null 2>&1");
  const lt3 = sh("pdftotext " + path.join(OUT, "doc3.pdf") + " -");
  ok("docx doc3: 3 pages in LibreOffice, text per page", /Pages:\s+3\b/.test(sh("pdfinfo " + path.join(OUT, "doc3.pdf"))) && lt3.includes("Hello EasyConvert page 3") && lt3.includes("Total 1,234.50 THB"), (sh("pdfinfo " + path.join(OUT, "doc3.pdf")).match(/Pages:.*/) || [""])[0]);
  sh("cd " + OUT + " && pdftoppm -r 50 -png doc3.pdf doc3_docx");

  dialogs.length = 0; await resetQuota();
  await pick("pdf2word", "scan.pdf");
  await page.click("#process-btn"); await page.waitForFunction(() => !document.getElementById("process-btn").disabled);
  ok("docx: scanned PDF gives clear OCR-needed message (no file)", dialogs.some(d => /OCR/.test(d)), dialogs.join("|"));
  dialogs.length = 0; await resetQuota();
  await pick("pdf2word", "enc.pdf");
  await page.click("#process-btn"); await page.waitForFunction(() => !document.getElementById("process-btn").disabled);
  ok("docx: password-protected PDF gives friendly message", dialogs.some(d => /รหัสผ่าน|password/i.test(d)), dialogs.join("|"));

  /* ================= เซ็นเอกสาร ================= */
  // หาขอบเขตพิกเซลสีน้ำเงินหมึกของหน้าที่เรนเดอร์จากไฟล์ผลลัพธ์
  async function inkBox(buf, pageNo) {
    return page.evaluate(async ([b64, n]) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const d = await pdfjsLib.getDocument({ data: u, isEvalSupported: false, standardFontDataUrl: "vendor/standard_fonts/" }).promise;
      const pg = await d.getPage(n); const vp = pg.getViewport({ scale: 1.5 });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      const im = g.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cnt = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (im[i + 2] > im[i] + 70 && im[i + 2] > im[i + 1] + 50) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      const tc = await pg.getTextContent();
      return { cnt, x0: x0 / c.width, x1: x1 / c.width, y0: y0 / c.height, y1: y1 / c.height, text: tc.items.map(i => i.str).join(" "), pages: d.numPages };
    }, [buf.toString("base64"), pageNo]);
  }
  const itemRects = () => page.evaluate(() => EC.esign._state().items.map(it => ({ page: it.page, x0: it.fx, y0: it.fy, x1: it.fx + it.fw, y1: it.fy + (it.fw * it.nh / it.nw) / it.aspect })));
  async function drawSig() {
    await page.click('[data-sg-tab="draw"]');
    const box = await page.locator("#sg-pad").boundingBox();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.6); await page.mouse.down();
    for (let i = 0; i <= 40; i++) await page.mouse.move(box.x + box.width * (0.1 + i * 0.02), box.y + box.height * (0.5 + 0.3 * Math.sin(i / 3)));
    await page.mouse.up();
  }
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // 1) หน้าปกติ: วาดลายเซ็น วางแล้วลากย้าย ย่อขยาย แล้วบันทึก
  await resetQuota();
  await pick("sign", "clean.pdf"); await pageReady();
  ok("sign: page preview rendered, work panel visible", await page.isVisible("#sg-work"));
  dialogs.length = 0;
  await page.click("#process-btn"); await page.waitForFunction(() => !document.getElementById("process-btn").disabled);
  ok("sign: pressing process with nothing placed gives clear message", dialogs.some(d => /ยังไม่ได้วาง|Nothing is placed/.test(d)), dialogs.join("|"));
  await page.click("#sg-add"); ok("sign: adding empty pad shows hint, adds nothing", (await page.locator(".sg-item").count()) === 0 && (await page.textContent("#sg-msg")).length > 5);
  await drawSig(); await page.click("#sg-add");
  ok("sign: drawn signature added to page", (await page.locator(".sg-item").count()) === 1);
  const before = (await itemRects())[0];
  await page.locator(".sg-item").scrollIntoViewIfNeeded(); const ib = await page.locator(".sg-item").boundingBox();
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2); await page.mouse.down(); await page.mouse.move(ib.x + ib.width / 2 - 120, ib.y + ib.height / 2 - 200, { steps: 8 }); await page.mouse.up();
  const moved = (await itemRects())[0];
  ok("sign: drag moves signature left/up", moved.x0 < before.x0 - 0.05 && moved.y0 < before.y0 - 0.05, JSON.stringify([before.x0.toFixed(2), moved.x0.toFixed(2)]));
  await page.locator(".sg-rs").scrollIntoViewIfNeeded(); const rs = await page.locator(".sg-rs").boundingBox();
  await page.mouse.move(rs.x + rs.width / 2, rs.y + rs.height / 2); await page.mouse.down(); await page.mouse.move(rs.x + rs.width / 2 + 80, rs.y + rs.height / 2 + 20, { steps: 6 }); await page.mouse.up();
  const grown = (await itemRects())[0];
  ok("sign: resize handle enlarges (keeps aspect)", (grown.x1 - grown.x0) > (moved.x1 - moved.x0) + 0.05, ((moved.x1 - moved.x0).toFixed(2)) + " -> " + (grown.x1 - grown.x0).toFixed(2));
  await page.locator(".sg-item").focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  const kb = (await itemRects())[0]; ok("sign: keyboard arrows move item", kb.x0 > grown.x0 + 0.015);
  let want = (await itemRects())[0];
  r = await download("#process-btn");
  let ib1 = await inkBox(r.buf, 1);
  ok("sign: output keeps 2 pages and ORIGINAL TEXT (still selectable)", ib1.pages === 2 && /Clean page 1 hello/.test(ib1.text), "pages " + ib1.pages);
  ok("sign: ink lands where it was placed (±3%)", ib1.cnt > 300 && near(ib1.x0, want.x0, 0.03) && near(ib1.x1, want.x1, 0.03) && near(ib1.y0, want.y0, 0.03) && near(ib1.y1, want.y1, 0.03),
    "ink " + [ib1.x0, ib1.y0, ib1.x1, ib1.y1].map(v => v.toFixed(3)) + " want " + [want.x0, want.y0, want.x1, want.y1].map(v => v.toFixed(3)));
  fs.writeFileSync(path.join(OUT, "signed_clean.pdf"), r.buf);

  // 2) หน้า 2: พิมพ์ชื่อ (ลายมือไทย) + ข้อความวันที่ ในไฟล์เดียวกัน
  await resetQuota();
  await pick("sign", "clean.pdf"); await pageReady();
  await page.click("#sg-next"); await page.waitForFunction(() => /2 \/ 2/.test(document.getElementById("sg-pageinfo").textContent));
  await page.click('[data-sg-tab="type"]'); await page.fill("#sg-type-text", "สมชาย ใจดี");
  await page.waitForFunction(() => !document.getElementById("sg-preview").hidden);
  await page.click("#sg-add");
  await page.click('[data-sg-tab="text"]'); await page.click("#sg-today"); ok("sign: 'today' fills a Thai Buddhist-era date", /25|ต\.ค\./.test(await page.inputValue("#sg-text-input")), await page.inputValue("#sg-text-input"));
  await page.click("#sg-add");
  ok("sign: two items on page 2", (await page.locator(".sg-item").count()) === 2);
  want = await itemRects();
  r = await download("#process-btn");
  const p2 = await inkBox(r.buf, 2), p1 = await inkBox(r.buf, 1);
  const uni = { x0: Math.min(want[0].x0, want[1].x0), y0: Math.min(want[0].y0, want[1].y0), x1: Math.max(want[0].x1, want[1].x1), y1: Math.max(want[0].y1, want[1].y1) };
  ok("sign: page 2 has ink inside placed area, page 1 has none", p2.cnt > 300 && p1.cnt === 0 && near(p2.x0, uni.x0, 0.04) && near(p2.y1, uni.y1, 0.04), "p2 " + p2.cnt + " p1 " + p1.cnt + " bbox " + [p2.x0, p2.y0, p2.x1, p2.y1].map(v => v.toFixed(3)));
  fs.writeFileSync(path.join(OUT, "signed_p2.pdf"), r.buf);

  // 3) หน้าหมุน 90 และ 270 องศา: ตำแหน่งต้องตรงกับที่เห็นบนจอ
  for (const [pg, label] of [[1, "rotate 90"], [2, "rotate 270"]]) {
    await resetQuota();
    await pick("sign", "rot.pdf"); await pageReady();
    if (pg === 2) { await page.click("#sg-next"); await page.waitForFunction(() => /2 \/ 2/.test(document.getElementById("sg-pageinfo").textContent)); }
    await drawSig(); await page.click("#sg-add");
    await page.locator(".sg-item").scrollIntoViewIfNeeded(); const ibx = await page.locator(".sg-item").boundingBox();
    await page.mouse.move(ibx.x + ibx.width / 2, ibx.y + ibx.height / 2); await page.mouse.down(); await page.mouse.move(ibx.x + 40, ibx.y - 150, { steps: 6 }); await page.mouse.up();
    const w2 = (await itemRects())[0];
    r = await download("#process-btn");
    const bx = await inkBox(r.buf, pg);
    ok("sign " + label + ": ink position matches on-screen placement (±3%)", bx.cnt > 300 && near(bx.x0, w2.x0, 0.03) && near(bx.x1, w2.x1, 0.03) && near(bx.y0, w2.y0, 0.03) && near(bx.y1, w2.y1, 0.03),
      "ink " + [bx.x0, bx.y0, bx.x1, bx.y1].map(v => v.toFixed(3)) + " want " + [w2.x0, w2.y0, w2.x1, w2.y1].map(v => v.toFixed(3)));
    fs.writeFileSync(path.join(OUT, "signed_rot" + pg + ".pdf"), r.buf);
  }

  // 4) รูปลายเซ็น (ทำพื้นขาวโปร่งใส) + จำลายเซ็น + ลบรายการ
  await resetQuota();
  await pick("sign", "clean.pdf"); await pageReady();
  await page.click('[data-sg-tab="image"]'); await page.setInputFiles("#sg-img-input", [fx("flatcard.jpg")]);
  await page.waitForTimeout(400); await page.click("#sg-add");
  ok("sign: a blank image (nothing but background) adds nothing and says so", (await page.locator(".sg-item").count()) === 0 && (await page.textContent("#sg-msg")).length > 5);
  await page.setInputFiles("#sg-img-input", [fx("sigimg.jpg")]);
  await page.waitForFunction(() => !document.getElementById("sg-preview").hidden); await page.click("#sg-add");
  ok("sign: signature photo added", (await page.locator(".sg-item").count()) === 1);
  const alphaCorner = await page.evaluate(async () => { const src = EC.esign._state().items[0].src; const im = new Image(); im.src = src; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); const a = g.getImageData(2, 2, 1, 1).data[3]; let ink = 0; const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) ink++; return { a, ink, total: c.width * c.height }; });
  ok("sign: white paper made transparent, ink kept", alphaCorner.a === 0 && alphaCorner.ink > 500 && alphaCorner.ink < alphaCorner.total * 0.5, JSON.stringify(alphaCorner));
  await page.locator(".sg-item").count() && await page.locator(".sg-del").click();
  ok("sign: delete button removes item", (await page.locator(".sg-item").count()) === 0);
  await page.click('[data-sg-tab="draw"]'); await drawSig(); await page.check("#sg-remember"); await page.click("#sg-add");
  const saved = await page.evaluate(() => (localStorage.getItem("ec_sig") || "").slice(0, 22));
  ok("sign: remember-signature stores PNG locally (opt-in only)", saved === "data:image/png;base64,", saved);
  await page.reload(); await page.waitForFunction(() => window.EC && EC.tools.sign);
  await pick("sign", "clean.pdf"); await pageReady();
  ok("sign: saved signature offered after reload", await page.isVisible("#sg-saved-row"));
  await page.click("#sg-saved-use"); await page.waitForSelector(".sg-item", { timeout: 5000 }).catch(() => {}); ok("sign: saved signature can be reused", (await page.locator(".sg-item").count()) === 1);
  await page.click("#sg-saved-del"); ok("sign: delete saved removes it", (await page.evaluate(() => localStorage.getItem("ec_sig"))) === null);

  // 5) ไฟล์ใส่รหัสผ่าน / ไม่ใช่ PDF จริง
  dialogs.length = 0;
  await pick("sign", "enc.pdf"); await page.waitForTimeout(1500);
  ok("sign: encrypted PDF -> friendly message, no broken UI", dialogs.some(d => /รหัสผ่าน|password/i.test(d)) && !(await page.isVisible("#sg-work")), dialogs.join("|"));
  fs.writeFileSync(fx("fake.pdf"), "this is not a pdf at all");
  dialogs.length = 0; await pick("sign", "fake.pdf"); await page.waitForTimeout(1500);
  ok("sign: corrupt PDF -> friendly message", dialogs.length > 0 && !(await page.isVisible("#sg-work")), dialogs.join("|"));
  // เปลี่ยนเครื่องมือกลับไปมาแล้วยังใช้ได้ ไม่ค้าง
  await pick("sign", "clean.pdf"); await pageReady(); await page.click('.tool-tile[data-tool="merge"]'); await pick("sign", "clean.pdf"); await pageReady();
  ok("sign: switching tools back and forth is stable", await page.isVisible("#sg-work"));

  const csp = await page.evaluate(() => window.__csp || []);
  ok("zero CSP violations (incl. embedded Thai PDF fonts, canvas, data: images)", csp.length === 0, csp.join(" ; "));
  const bad = errors.filter(e => !/favicon|\/api\//i.test(e)); ok("no console errors", bad.length === 0, bad.slice(0, 4).join(" || "));

  console.log(results.join("\n")); console.log("\nFAILED:", failed);
  await browser.close(); srv.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.log(results.join("\n")); console.error("CRASH", e); process.exit(2); });
