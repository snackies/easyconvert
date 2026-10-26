/* OCR ในเบราว์เซอร์ (Tesseract) สำหรับ PDF ที่เป็นภาพสแกนหรือตัวอักษรถูกแปลงเป็นเส้นวาด
 * ไฟล์ทั้งหมดอยู่ในเว็บเราเอง (vendor/ocr) ไม่โหลดจากภายนอก และโหลดเฉพาะตอนที่จำเป็นเท่านั้น
 * ภาพของหน้าไม่ถูกส่งออกจากเครื่อง การอ่านทำใน Web Worker ของเบราว์เซอร์ */
(function () {
  "use strict";
  const EC = (window.EC = window.EC || {});
  const BASE = "vendor/ocr/";
  let loading = null, worker = null, workerP = null, progressCb = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("load " + src));
      document.head.appendChild(s);
    });
  }

  // เลือกไฟล์ core ที่เครื่องรองรับ (SIMD เร็วกว่า) โดยระบุไฟล์ตรง ๆ จึงไม่ต้องมีไฟล์ชุดอื่น
  function coreFile() {
    let simd = false;
    try {
      simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (e) {}
    return BASE + (simd ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js");
  }

  async function ensureWorker() {
    if (worker) return worker;
    if (workerP) return workerP;
    workerP = (async () => {
      if (typeof window.Tesseract === "undefined") {
        loading = loading || loadScript(BASE + "tesseract.min.js");
        await loading;
      }
      if (typeof window.Tesseract === "undefined") throw new Error("ocr lib missing");
      const w = await window.Tesseract.createWorker("tha+eng", 1, {
        workerPath: BASE + "worker.min.js",
        corePath: coreFile(),
        langPath: BASE.replace(/\/$/, ""),
        gzip: false,
        cacheMethod: "none",
        workerBlobURL: false,
        logger: (m) => { if (progressCb && m && m.status === "recognizing text") progressCb(m.progress || 0); },
      });
      worker = w;
      return w;
    })();
    try { return await workerP; } catch (e) { workerP = null; loading = null; throw e; }
  }

  function clean(s) {
    return String(s || "").replace(/\u0000/g, "").replace(/\u0E4D\u0E32/g, "\u0E33");
  }

  /* อ่านข้อความจากภาพ คืนค่าเป็นบรรทัดและคำพร้อมตำแหน่ง (หน่วยพิกเซลของภาพ) */
  async function recognize(canvas, onProgress) {
    const w = await ensureWorker();
    progressCb = onProgress || null;
    let r;
    try { r = await w.recognize(canvas, {}, { blocks: true, text: false }); } finally { progressCb = null; }
    const lines = [];
    ((r.data && r.data.blocks) || []).forEach((b) =>
      (b.paragraphs || []).forEach((p) =>
        (p.lines || []).forEach((l) => {
          const words = (l.words || [])
            .map((wd) => ({ text: clean(wd.text).trim(), conf: wd.confidence, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 }))
            .filter((wd) => wd.text);
          if (words.length) lines.push({ words, x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1, conf: l.confidence });
        })
      )
    );
    return lines;
  }

  async function terminate() {
    const w = worker;
    worker = null; workerP = null; progressCb = null;
    if (w) { try { await w.terminate(); } catch (e) {} }
  }

  EC.ocr = { recognize, terminate, isReady: () => !!worker };
})();
