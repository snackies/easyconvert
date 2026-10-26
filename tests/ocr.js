// ทดสอบ OCR: PDF ที่เป็นภาพทั้งหน้าต้องได้ข้อความจริงใน Word, PDF ข้อความปกติต้องไม่โหลด OCR, และไม่มีไฟล์ออกนอกเว็บ
const { chromium } = require("playwright");
const start = require("./server");
const fs = require("fs"), path = require("path");
const JSZip = require("jszip");
let bad = 0;
const ok = (c, m, extra) => { console.log((c ? "PASS " : "FAIL ") + m + (extra ? "  -> " + extra : "")); if (!c) bad++; };

(async () => {
  const srv = await start(4260);
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [], external = [];
  let ocrReq = 0;
  p.on("console", (m) => { if (["error", "warning"].includes(m.type())) errs.push(m.text()); });
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("dialog", (d) => d.dismiss());
  p.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== "http://localhost:4260" && !/^(data|blob):/.test(r.url())) external.push(r.url()); if (/vendor\/ocr\//.test(u.pathname)) ocrReq++; });
  await p.goto("http://localhost:4260/", { waitUntil: "load" });
  await p.waitForFunction(() => window.PDFLib && window.pdfjsLib && window.JSZip && window.EC && window.EC.ocr);

  async function convert(buf, name) {
    await p.click('.tool-tile[data-tool="pdf2word"]');
    await p.setInputFiles("#file-input", [{ name, mimeType: "application/pdf", buffer: Buffer.from(buf) }]);
    const dl = p.waitForEvent("download", { timeout: 120000 });
    await p.click("#process-btn");
    const d = await dl;
    const file = path.join(__dirname, "out", name + ".docx");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(await d.path(), file);
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const xml = await zip.file("word/document.xml").async("string");
    return { text: (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, "")).join(" "), status: await p.textContent("#file-status") };
  }

  // 1) ภาพสแกน: วาดข้อความลงภาพ แล้วใส่เป็น PDF หน้าเดียว (ไม่มีข้อความจริง)
  const scanBytes = await p.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 1240; c.height = 1754;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
    g.font = "44px Arial"; g.fillText("Invoice 2026 EasyConvert Company", 120, 200); g.fillText("Total amount 1,234.50 THB", 120, 300);
    g.font = "44px 'Plex Thai', sans-serif"; g.fillText("ทดสอบการอ่านตัวหนังสือภาษาไทย", 120, 400);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const png = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFLib.PDFDocument.create(); const pg = doc.addPage([595, 842]);
    const img = await doc.embedPng(png); pg.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    return Array.from(await doc.save());
  });
  const r1 = await convert(scanBytes, "ocr_scan");
  ok(/Invoice/.test(r1.text) && /EasyConvert/.test(r1.text), "ocr: ภาพสแกนได้ข้อความอังกฤษเป็นข้อความ Word", r1.text.slice(0, 80));
  ok(/1,234\.50/.test(r1.text), "ocr: อ่านตัวเลขได้ถูก (1,234.50)");
  ok(/ทดสอบ/.test(r1.text), "ocr: อ่านภาษาไทยได้", r1.text.slice(-60));
  ok(/OCR/.test(r1.status), "ocr: มีคำเตือนให้ตรวจทานผล OCR", r1.status.slice(-80));
  ok(ocrReq > 0, "ocr: โหลดไฟล์ OCR จากเว็บเราเอง", ocrReq + " requests");

  // 2) PDF ข้อความปกติ: ต้องไม่โหลด OCR
  const before = ocrReq;
  const clean = fs.readFileSync(path.join(__dirname, "fx", "clean.pdf"));
  const r2 = await convert(clean, "ocr_clean");
  ok(/Clean page 1 hello/.test(r2.text), "ocr: PDF ข้อความปกติแปลงได้เหมือนเดิม");
  ok(ocrReq === before, "ocr: PDF ข้อความปกติไม่โหลดไฟล์ OCR เลย");

  ok(external.length === 0, "ocr: ไม่มีคำขอไปโดเมนอื่น", external.slice(0, 2).join(" "));
  ok(errs.length === 0, "ocr: ไม่มี error/CSP violation", errs.join(" | ").slice(0, 200));
  await b.close(); srv.close && srv.close();
  console.log("FAILED:", bad);
  process.exit(bad ? 1 : 0);
})();
