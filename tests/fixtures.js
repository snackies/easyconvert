const sharp = require("sharp"), { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib"), fs = require("fs");
(async () => {
  fs.mkdirSync(__dirname + "/fx", { recursive: true });
  const w = 1800, h = 1150, buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0; // ภาพสัญญาณรบกวน = บีบยากที่สุด
  // วาดโครงให้เหมือนบัตร: ใช้พื้นอ่อนทับบางส่วนให้มีขอบ/พื้นเรียบด้วย
  const card = await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).blur(2.5).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(__dirname + "/fx/idcard.jpg", card);
  fs.writeFileSync(__dirname + "/fx/flatcard.jpg", await sharp({ create: { width: 1800, height: 1150, channels: 3, background: { r: 226, g: 232, b: 224 } } }).jpeg({ quality: 92 }).toBuffer());
  fs.writeFileSync(__dirname + "/fx/idcard.png", await sharp(card).png().toBuffer());
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const img = await doc.embedJpg(card);
  for (let i = 1; i <= 3; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText("Hello EasyConvert page " + i, { x: 50, y: 790, size: 22, font });
    p.drawText("Total 1,234.50 THB", { x: 50, y: 750, size: 14, font });
    p.drawImage(img, { x: 40, y: 200, width: 515, height: 330 });
  }
  fs.writeFileSync(__dirname + "/fx/doc3.pdf", await doc.save());
  const d2 = await PDFDocument.create(); const f2 = await d2.embedFont(StandardFonts.Helvetica);
  d2.addPage([595, 842]).drawText("Second file", { x: 50, y: 790, size: 22, font: f2 });
  fs.writeFileSync(__dirname + "/fx/small.pdf", await d2.save());
  // หน้าสะอาด (พื้นขาว) ใช้ตรวจตำแหน่งลายเซ็นด้วยพิกเซล: ปกติ 2 หน้า และหมุน 90 องศา
  const clean = await PDFDocument.create(); const cf = await clean.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) { const p = clean.addPage([595, 842]); p.drawText("Clean page " + i + " hello", { x: 50, y: 790, size: 20, font: cf }); }
  fs.writeFileSync(__dirname + "/fx/clean.pdf", await clean.save());
  const rot = await PDFDocument.create(); const rf = await rot.embedFont(StandardFonts.Helvetica);
  const rp = rot.addPage([595, 842]); rp.drawText("Rotated page text", { x: 50, y: 790, size: 20, font: rf }); rp.setRotation(degrees(90));
  const rp2 = rot.addPage([595, 842]); rp2.drawText("Rotated 270", { x: 50, y: 790, size: 20, font: rf }); rp2.setRotation(degrees(270));
  fs.writeFileSync(__dirname + "/fx/rot.pdf", await rot.save());
  // PDF สแกน: มีแต่ภาพ ไม่มีข้อความ
  const scan = await PDFDocument.create(); const si = await scan.embedJpg(card);
  const sp = scan.addPage([595, 842]); sp.drawImage(si, { x: 0, y: 200, width: 595, height: 380 });
  fs.writeFileSync(__dirname + "/fx/scan.pdf", await scan.save());
  // ภาพถ่ายตัวอย่างสำหรับ docx (ไล่สี มีรายละเอียด)
  const gw = 640, gh = 400, gb = Buffer.alloc(gw * gh * 3);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = (y * gw + x) * 3; gb[i] = (x / gw) * 255; gb[i + 1] = (y / gh) * 255; gb[i + 2] = 160 + 60 * Math.sin(x / 25); }
  fs.writeFileSync(__dirname + "/fx/photo.jpg", await sharp(gb, { raw: { width: gw, height: gh, channels: 3 } }).jpeg({ quality: 88 }).toBuffer());
  // รูปลายเซ็นบนกระดาษขาว (เส้นหมึกเข้มบนพื้นขาวนวล) สำหรับทดสอบ "ทำพื้นขาวให้โปร่งใส"
  fs.writeFileSync(__dirname + "/fx/sigimg.jpg", await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220"><rect width="600" height="220" fill="#f4f2ec"/><path d="M30 150 C80 40 130 40 150 120 S230 190 270 90 S350 30 400 110 S500 160 570 70" stroke="#22262e" stroke-width="9" fill="none" stroke-linecap="round"/></svg>')).jpeg({ quality: 90 }).toBuffer());
  // PDF ภาษาไทยจริง: ใช้ Chromium "พิมพ์เป็น PDF" (เหมือน Google Docs/เบราว์เซอร์) ฟอนต์ Sarabun ฝังในไฟล์
  // ต้องมีฟอนต์ Sarabun ติดตั้งในเครื่อง (ดาวน์โหลดฟรีจาก Google Fonts) ไม่มีก็ข้ามเทสต์ที่ใช้ไฟล์นี้
  const { execSync } = require("child_process");
  try {
    const { chromium } = require("playwright");
    const br = await chromium.launch(); const pg = await br.newPage();
    const para = "บริษัท อีซี่คอนเวิร์ต จำกัด ขอแจ้งเงื่อนไขการใช้บริการสำหรับผู้ใช้ทุกท่าน ไฟล์ของท่านจะถูกประมวลผลในเครื่องของท่านเองและไม่ถูกส่งไปยังเซิร์ฟเวอร์ใด ๆ ท่านสามารถตรวจสอบได้ด้วยการเปิดโหมดเครื่องบินแล้วทดลองใช้งานเครื่องมือทุกตัว";
    const img = "data:image/jpeg;base64," + fs.readFileSync(__dirname + "/fx/photo.jpg").toString("base64");
    await pg.setContent('<html><head><meta charset="utf-8"><style>body{font-family:"Sarabun";font-size:14pt;margin:0} h1{text-align:center;font-size:24pt} td{border:1px solid #444;padding:4px} .r{text-align:right}</style></head><body><h1>ใบแจ้งเงื่อนไขการใช้บริการ</h1><p>' + para + '</p><p><b>หมายเหตุสำคัญ:</b> กรุณาเก็บเอกสารนี้ไว้เป็นหลักฐาน</p><p>' + para + '</p><img src="' + img + '" width="300"><table style="border-collapse:collapse"><tr><td>รายการ</td><td>จำนวน</td><td>ราคา</td></tr><tr><td>แพ็กเกจรายเดือน</td><td>1</td><td>29.00</td></tr></table><p>' + para + '</p><p class="r">ลงชื่อ ผู้ให้บริการ</p></body></html>');
    await pg.pdf({ path: __dirname + "/fx/thai_chrome.pdf", format: "A4", margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } });
    await br.close();
  } catch (e) { console.log("skip thai_chrome.pdf:", e.message.slice(0, 80)); }
  try { execSync("qpdf --encrypt userpw ownerpw 256 -- " + __dirname + "/fx/small.pdf " + __dirname + "/fx/enc.pdf"); } catch (e) { console.log("skip enc.pdf (needs qpdf)"); }
  console.log("fixtures ready");
})();
