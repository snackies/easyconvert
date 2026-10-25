/* เครื่องมือ "เซ็นเอกสาร" ทำงานในเบราว์เซอร์ทั้งหมด ไม่อัปโหลดไฟล์
 *
 * ขั้นตอน: สร้างลายเซ็น/ข้อความเป็นภาพ PNG โปร่งใส -> พรีวิวหน้า PDF -> ลากวาง/ย่อขยาย
 *          -> ฝังภาพลงไฟล์เดิมด้วย pdf-lib (ข้อความเดิมยังเลือก/ค้นหาได้ ไม่แปลงเป็นภาพ)
 *
 * ตำแหน่งเก็บเป็น "สัดส่วนของหน้าที่เห็นบนจอ" (0-1) แล้วตอนบันทึกจึงแปลงเป็นพิกัด PDF ด้วย
 * viewport.convertToPdfPoint ของ pdf.js ซึ่งคิดการหมุนหน้า (/Rotate) และกรอบหน้า (CropBox) ให้เอง
 */
(function () {
  "use strict";
  const EC = window.EC;
  if (!EC) return;
  const { $, t, fmt, store } = EC;

  const SAVED_KEY = "ec_sig";
  const MAX_STAMP_W = 900; // ความกว้างสูงสุดของภาพที่ฝัง (พิกเซล) กันไฟล์บวม
  const FONTS = {
    sriracha: { family: '"Sriracha Sig","Plex Thai",cursive', weight: 400, px: 110 },
    charmonman: { family: '"Charmonman Sig","Plex Thai",serif', weight: 700, px: 110 },
    plain: { family: '"Plex Thai",sans-serif', weight: 600, px: 80 },
  };

  /* ---------- สถานะ ---------- */
  let file = null;
  let pdf = null;
  let pageNo = 1;
  let pageCount = 0;
  let pageAspect = 1.414; // สูง/กว้าง ของหน้าที่แสดงอยู่
  let loadToken = 0;
  let renderToken = 0;
  let renderTask = null;
  let items = [];
  let nextId = 1;
  let tab = "draw";
  let ink = "#1b2f9e";
  let fontKey = "sriracha";
  let padHas = false;
  let imgBitmap = null;
  let previewToken = 0;

  /* ---------- ตัวช่วยภาพ ---------- */
  function trim(src, pad) {
    const w = src.width, h = src.height;
    const data = src.getContext("2d").getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 10) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const p = pad == null ? 6 : pad;
    x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p);
    x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
    const out = EC.newCanvas(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext("2d").drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function limitWidth(c) {
    if (c.width <= MAX_STAMP_W) return c;
    const s = MAX_STAMP_W / c.width;
    const out = EC.newCanvas(c.width * s, c.height * s);
    out.getContext("2d").drawImage(c, 0, 0, out.width, out.height);
    return out;
  }

  function recolor(src, color) {
    const c = EC.newCanvas(src.width, src.height);
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  async function textCanvas(text, spec, color) {
    const font = spec.weight + " " + spec.px + "px " + spec.family;
    try { if (document.fonts && document.fonts.load) await document.fonts.load(font, text); } catch (e) {}
    const probe = EC.newCanvas(10, 10).getContext("2d");
    probe.font = font;
    const w = Math.ceil(probe.measureText(text).width) + spec.px;
    const c = EC.newCanvas(Math.min(w, 4000), Math.ceil(spec.px * 2.3));
    const g = c.getContext("2d");
    g.font = font;
    g.fillStyle = color;
    g.textBaseline = "alphabetic";
    g.fillText(text, spec.px * 0.5, spec.px * 1.5);
    return trim(c);
  }

  function imageCanvas(bmp, clean) {
    const s = Math.min(1, MAX_STAMP_W / bmp.width);
    const c = EC.newCanvas(bmp.width * s, bmp.height * s);
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0, c.width, c.height);
    if (clean) {
      // ทำพื้นสว่างให้โปร่งใส เหลือเฉพาะเส้นหมึก ความโปร่งใสไล่ตามความสว่าง ขอบจึงไม่แข็ง
      const img = g.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const a = l >= 225 ? 0 : l <= 140 ? 255 : Math.round(((225 - l) / 85) * 255);
        d[i + 3] = Math.min(d[i + 3], a);
      }
      g.putImageData(img, 0, 0);
    }
    return trim(c);
  }

  /* ---------- สร้างภาพที่จะประทับ ---------- */
  async function buildCandidate() {
    if (tab === "draw") {
      if (!padHas) return null;
      return trim(recolor($("sg-pad"), ink));
    }
    if (tab === "type") {
      const text = $("sg-type-text").value.trim();
      return text ? textCanvas(text, FONTS[fontKey], ink) : null;
    }
    if (tab === "text") {
      const text = $("sg-text-input").value.trim();
      return text ? textCanvas(text, FONTS.plain, ink) : null;
    }
    if (tab === "image") return imgBitmap ? imageCanvas(imgBitmap, $("sg-img-clean").checked) : null;
    return null;
  }

  async function updatePreview() {
    const token = ++previewToken;
    const box = $("sg-preview");
    if (tab === "draw") { box.hidden = true; return; }
    const cand = await buildCandidate();
    if (token !== previewToken) return;
    if (!cand) { box.hidden = true; return; }
    const s = Math.min(1, 600 / cand.width);
    box.width = Math.max(1, Math.round(cand.width * s));
    box.height = Math.max(1, Math.round(cand.height * s));
    const g = box.getContext("2d");
    g.clearRect(0, 0, box.width, box.height);
    g.drawImage(cand, 0, 0, box.width, box.height);
    box.hidden = false;
  }

  /* ---------- ช่องวาดลายเซ็น ---------- */
  function initPad() {
    const pad = $("sg-pad");
    const ctx = pad.getContext("2d");
    let drawing = false;
    let last = null;
    let prevMid = null;
    const pos = (e) => {
      const r = pad.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * pad.width) / r.width, y: ((e.clientY - r.top) * pad.height) / r.height };
    };
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch (err) {}
      drawing = true;
      last = pos(e);
      prevMid = last;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.8, 0, Math.PI * 2);
      ctx.fill();
      padHas = true;
    });
    pad.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = pos(e);
      const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 5.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(prevMid.x, prevMid.y);
      ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
      ctx.stroke();
      prevMid = mid;
      last = p;
    });
    const end = () => { drawing = false; };
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
    pad.addEventListener("pointerleave", end);
    $("sg-pad-clear").addEventListener("click", () => {
      ctx.clearRect(0, 0, pad.width, pad.height);
      padHas = false;
    });
  }

  /* ---------- แท็บ / ตัวเลือก ---------- */
  function setTab(name) {
    tab = name;
    document.querySelectorAll("[data-sg-tab]").forEach((b) => {
      const on = b.getAttribute("data-sg-tab") === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-sg-panel]").forEach((p) => {
      p.classList.toggle("is-hidden", p.getAttribute("data-sg-panel") !== name);
    });
    $("sg-ink-row").hidden = name === "image";
    setMsg("");
    updatePreview();
  }

  function setMsg(text) { $("sg-msg").textContent = text || ""; }

  function todayText() {
    const lang = EC.getLang();
    return new Date().toLocaleDateString(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  function setPlaceholders() {
    $("sg-type-text").placeholder = t("sg_type_ph");
    $("sg-text-input").placeholder = t("sg_text_ph");
  }

  function refreshSaved() {
    $("sg-saved-row").hidden = !store.get(SAVED_KEY);
  }

  /* ---------- รายการที่วางบนหน้า ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const itemFh = (it) => (it.fw * (it.nh / it.nw)) / it.aspect;

  function fitItem(it) {
    // ไม่ให้ล้นหน้า: ถ้าสูงเกินให้ลดความกว้างตามสัดส่วน
    it.fw = clamp(it.fw, 0.04, 1);
    let fh = itemFh(it);
    if (fh > 1) { it.fw = (it.aspect * it.nw) / it.nh; fh = 1; }
    it.fx = clamp(it.fx, 0, 1 - it.fw);
    it.fy = clamp(it.fy, 0, 1 - fh);
  }

  function placeEl(el, it) {
    el.style.left = it.fx * 100 + "%";
    el.style.top = it.fy * 100 + "%";
    el.style.width = it.fw * 100 + "%";
    el.style.height = itemFh(it) * 100 + "%";
  }

  function removeItem(id) {
    items = items.filter((x) => x.id !== id);
    renderLayer();
  }

  function renderLayer() {
    const layer = $("sg-layer");
    layer.innerHTML = "";
    items.filter((it) => it.page === pageNo).forEach((it) => {
      const el = document.createElement("div");
      el.className = "sg-item";
      el.tabIndex = 0;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "signature");
      const img = document.createElement("img");
      img.alt = "";
      img.src = it.src;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "sg-del";
      del.textContent = "×";
      del.setAttribute("aria-label", t("sg_remove"));
      const rs = document.createElement("button");
      rs.type = "button";
      rs.className = "sg-rs";
      rs.tabIndex = -1;
      rs.setAttribute("aria-hidden", "true");
      el.appendChild(img);
      el.appendChild(del);
      el.appendChild(rs);
      placeEl(el, it);
      layer.appendChild(el);

      del.addEventListener("click", (e) => { e.stopPropagation(); removeItem(it.id); });
      del.addEventListener("pointerdown", (e) => e.stopPropagation());

      // ลากย้าย
      el.addEventListener("pointerdown", (e) => {
        if (e.target === rs || e.target === del) return;
        e.preventDefault();
        el.focus();
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        const r = $("sg-stage").getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY, ox = it.fx, oy = it.fy;
        const move = (ev) => {
          it.fx = ox + (ev.clientX - sx) / r.width;
          it.fy = oy + (ev.clientY - sy) / r.height;
          fitItem(it);
          placeEl(el, it);
        };
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      });

      // ย่อขยาย (คงสัดส่วนภาพ)
      rs.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { rs.setPointerCapture(e.pointerId); } catch (err) {}
        const r = $("sg-stage").getBoundingClientRect();
        const move = (ev) => {
          const left = r.left + it.fx * r.width;
          let w = (ev.clientX - left) / r.width;
          w = clamp(w, 0.04, 1 - it.fx);
          const maxByHeight = ((1 - it.fy) * it.aspect * it.nw) / it.nh;
          it.fw = Math.min(w, maxByHeight);
          placeEl(el, it);
        };
        const up = () => {
          rs.removeEventListener("pointermove", move);
          rs.removeEventListener("pointerup", up);
          rs.removeEventListener("pointercancel", up);
        };
        rs.addEventListener("pointermove", move);
        rs.addEventListener("pointerup", up);
        rs.addEventListener("pointercancel", up);
      });

      // คีย์บอร์ด: ลูกศรขยับ 1% (Shift = 5%), Delete ลบ, +/- ย่อขยาย
      el.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 0.05 : 0.01;
        let used = true;
        if (e.key === "ArrowLeft") it.fx -= step;
        else if (e.key === "ArrowRight") it.fx += step;
        else if (e.key === "ArrowUp") it.fy -= step;
        else if (e.key === "ArrowDown") it.fy += step;
        else if (e.key === "+" || e.key === "=") it.fw *= 1.08;
        else if (e.key === "-") it.fw /= 1.08;
        else if (e.key === "Delete" || e.key === "Backspace") { removeItem(it.id); return; }
        else used = false;
        if (used) { e.preventDefault(); fitItem(it); placeEl(el, it); }
      });
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("image load failed"));
      im.src = src;
    });
  }

  function pushItem(src, nw, nh, isText) {
    const it = { id: nextId++, page: pageNo, src, nw, nh, aspect: pageAspect, fx: 0, fy: 0, fw: isText ? 0.26 : 0.3 };
    // ไม่ให้เริ่มสูงเกิน 18% ของหน้า
    const maxFw = (0.18 * it.aspect * nw) / nh;
    it.fw = Math.min(it.fw, maxFw);
    const same = items.filter((x) => x.page === pageNo).length;
    it.fx = (1 - it.fw) / 2 + (same % 4) * 0.03;
    it.fy = 0.7 - (same % 4) * 0.05;
    fitItem(it);
    items.push(it);
    renderLayer();
  }

  async function addFromCandidate() {
    setMsg("");
    const cand = await buildCandidate();
    if (!cand) { setMsg(t("sg_empty")); return; }
    const c = limitWidth(cand);
    const src = c.toDataURL("image/png");
    if (tab !== "text" && $("sg-remember").checked && src.length < 400000) store.set(SAVED_KEY, src);
    refreshSaved();
    pushItem(src, c.width, c.height, tab === "text");
  }

  async function addSaved() {
    const src = store.get(SAVED_KEY);
    if (!src) return;
    try {
      const im = await loadImage(src);
      pushItem(src, im.naturalWidth, im.naturalHeight, false);
    } catch (e) {
      store.del(SAVED_KEY);
      refreshSaved();
    }
  }

  /* ---------- แสดงหน้า PDF ---------- */
  function updateNav() {
    $("sg-pageinfo").textContent = fmt(t("sg_page"), { i: pageNo, n: pageCount });
    $("sg-prev").disabled = pageNo <= 1;
    $("sg-next").disabled = pageNo >= pageCount;
  }

  async function showPage(n) {
    if (!pdf) return;
    const token = ++renderToken;
    if (renderTask) { try { renderTask.cancel(); } catch (e) {} renderTask = null; }
    pageNo = clamp(n, 1, pageCount);
    updateNav();
    let page;
    try { page = await pdf.getPage(pageNo); } catch (e) { setMsg(EC.friendlyError(e)); return; }
    if (token !== renderToken) return;
    const base = page.getViewport({ scale: 1 });
    pageAspect = base.height / base.width;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = $("sg-stage").clientWidth || 600;
    let targetW = clamp(Math.round(cssW * dpr), 500, 1300);
    let scale = targetW / base.width;
    const area = base.width * scale * base.height * scale;
    if (area > EC.MAX_AREA) scale *= Math.sqrt(EC.MAX_AREA / area);
    const vp = page.getViewport({ scale });
    const canvas = $("sg-page");
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    renderLayer();
    try {
      renderTask = page.render({ canvasContext: ctx, viewport: vp });
      await renderTask.promise;
    } catch (e) {
      if (!(e && e.name === "RenderingCancelledException")) setMsg(EC.friendlyError(e));
      return;
    }
    if (token === renderToken && page.cleanup) page.cleanup();
  }

  function resetAll() {
    ++loadToken;
    ++renderToken;
    if (renderTask) { try { renderTask.cancel(); } catch (e) {} renderTask = null; }
    if (pdf && pdf.destroy) { try { pdf.destroy(); } catch (e) {} }
    pdf = null;
    file = null;
    items = [];
    pageCount = 0;
    pageNo = 1;
    $("sg-layer").innerHTML = "";
    $("sg-page").width = 300; // ล้างภาพหน้าเก่า ไม่ให้ค้างตอนโหลดไฟล์ใหม่
    $("sg-page").height = 150;
    $("sg-work").classList.add("is-hidden");
    $("sg-need").hidden = false;
    setMsg("");
  }

  async function onFiles(files) {
    const f = files[0];
    if (!f) { resetAll(); return; }
    if (f === file) return;
    resetAll();
    file = f;
    const token = loadToken;
    $("sg-need").hidden = true;
    $("sg-work").classList.remove("is-hidden");
    setMsg(t("sg_loading"));
    try {
      const doc = await EC.loadPdfJs(f);
      if (token !== loadToken) { doc.destroy(); return; }
      pdf = doc;
      pageCount = doc.numPages;
      setMsg("");
      await showPage(1);
    } catch (e) {
      if (token !== loadToken) return;
      const msg = EC.friendlyError(e);
      resetAll();
      $("sg-need").hidden = true;
      $("sg-work").classList.add("is-hidden");
      alert(msg);
    }
  }

  /* ---------- บันทึกลงไฟล์ ---------- */
  function dataUrlToBytes(url) {
    const bin = atob(url.split(",")[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function run(files) {
    const f = files[0];
    if (!items.length) throw new Error(t("sg_none_placed"));
    EC.needLib("PDFLib");
    const doc = await PDFLib.PDFDocument.load(await f.arrayBuffer());
    const jsDoc = pdf && file === f ? pdf : await EC.loadPdfJs(f);
    const embedded = new Map();
    const ordered = items.slice().sort((a, b) => a.page - b.page || a.id - b.id);
    for (let i = 0; i < ordered.length; i++) {
      const it = ordered[i];
      EC.setProgress(i / ordered.length);
      let img = embedded.get(it.src);
      if (!img) {
        img = await doc.embedPng(dataUrlToBytes(it.src));
        embedded.set(it.src, img);
      }
      const vp = (await jsDoc.getPage(it.page)).getViewport({ scale: 1 });
      const W = it.fw * vp.width;
      const H = (W * it.nh) / it.nw;
      const X = it.fx * vp.width;
      const Y = it.fy * vp.height;
      // มุมล่างซ้าย/ล่างขวา/บนซ้ายของกรอบบนหน้าจอ -> พิกัด PDF (รวมการหมุนหน้าแล้ว)
      const p0 = vp.convertToPdfPoint(X, Y + H);
      const p1 = vp.convertToPdfPoint(X + W, Y + H);
      const p3 = vp.convertToPdfPoint(X, Y);
      doc.getPage(it.page - 1).drawImage(img, {
        x: p0[0],
        y: p0[1],
        width: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
        height: Math.hypot(p3[0] - p0[0], p3[1] - p0[1]),
        rotate: PDFLib.degrees((Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI),
      });
    }
    const out = await doc.save();
    EC.download(out, EC.baseName(f.name) + "_signed.pdf", "application/pdf");
    return { message: fmt(t("sg_done"), { n: items.length, size: EC.fmtSize(out.length) }) };
  }

  /* ---------- เริ่มต้น ---------- */
  function init() {
    initPad();
    setPlaceholders();
    refreshSaved();
    document.querySelectorAll("[data-sg-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.getAttribute("data-sg-tab"))));
    document.querySelectorAll("[data-sg-ink]").forEach((b) =>
      b.addEventListener("click", () => {
        ink = b.getAttribute("data-sg-ink");
        document.querySelectorAll("[data-sg-ink]").forEach((x) => x.classList.toggle("active", x === b));
        updatePreview();
      })
    );
    document.querySelectorAll("[data-sg-font]").forEach((b) =>
      b.addEventListener("click", () => {
        fontKey = b.getAttribute("data-sg-font");
        document.querySelectorAll("[data-sg-font]").forEach((x) => x.classList.toggle("active", x === b));
        updatePreview();
      })
    );
    $("sg-type-text").addEventListener("input", updatePreview);
    $("sg-text-input").addEventListener("input", updatePreview);
    $("sg-today").addEventListener("click", () => { $("sg-text-input").value = todayText(); updatePreview(); });
    $("sg-img-clean").addEventListener("change", updatePreview);
    $("sg-img-input").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        if (imgBitmap && imgBitmap.close) imgBitmap.close();
        imgBitmap = await createImageBitmap(f);
      } catch (err) { imgBitmap = null; }
      updatePreview();
    });
    $("sg-add").addEventListener("click", addFromCandidate);
    $("sg-saved-use").addEventListener("click", addSaved);
    $("sg-saved-del").addEventListener("click", () => { store.del(SAVED_KEY); refreshSaved(); });
    $("sg-prev").addEventListener("click", () => showPage(pageNo - 1));
    $("sg-next").addEventListener("click", () => showPage(pageNo + 1));
    $("sg-preview").hidden = true;
    setTab("draw");
    EC.langListeners.push(() => { setPlaceholders(); if (pageCount) updateNav(); });
  }

  EC.tools.sign = { run, onFiles, onLeave: resetAll };
  EC.esign = { _state: () => ({ items, pageNo, pageCount }) }; // ใช้ในการทดสอบอัตโนมัติ
  init();
})();
