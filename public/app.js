(function () {
  "use strict";
 
  const FREE_LIMIT_MB = 15;
  const IMAGE_TOOLS = ["img2pdf"];
  const MULTI_TOOLS = ["img2pdf", "merge"];
 
  let currentLang = localStorage.getItem("ec_lang") || "th";
  let isPremiumUser = false;
  let oneTimePass = false; // สิทธิ์ใช้ฟรี 1 ครั้งจากการดูโฆษณา
  let activeTool = "img2pdf";
  let selectedFiles = [];
  let userCountry = "TH";
  let busy = false;
 
  const $ = (id) => document.getElementById(id);
  const t = (key) => (translations[currentLang] && translations[currentLang][key]) || key;
 
  /* ---------- i18n / UI ---------- */
 
  function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem("ec_lang", lang);
    document.documentElement.lang = lang;
    $("lang-toggle").value = lang;
 
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const text = translations[lang][key];
      if (!text) return;
      if (key === "drop_instruction") el.innerHTML = text;
      else el.textContent = text;
    });
 
    renderBadge();
    updatePricingDisplay();
    updateStatus();
  }
 
  function renderBadge() {
    const badge = $("user-badge");
    if (isPremiumUser) {
      badge.textContent = t("premium_tier");
      badge.className = "badge premium";
    } else {
      badge.textContent = t("btn_upgrade");
      badge.className = "badge upgrade";
    }
    $("ad-top").style.display = isPremiumUser ? "none" : "block";
  }
 
  function updatePricingDisplay() {
    $("price-text").textContent = currentLang === "th"
      ? "👑 พรีเมียม 30 วัน: เพียง 29 บาท (ชำระผ่าน PromptPay)"
      : "👑 Premium 30 days: Only 29 THB (pay via PromptPay)";
  }
 
  function updateStatus() {
    $("file-status").textContent = selectedFiles.length === 0
      ? t("no_file")
      : t("file_ready_text").replace("{count}", selectedFiles.length);
  }
 
  /* ---------- Premium (ตรวจสอบฝั่งเซิร์ฟเวอร์) ---------- */
 
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  }
 
  async function verifyPremium() {
    const token = localStorage.getItem("ec_token");
    isPremiumUser = false;
    if (token) {
      try {
        const { ok, data } = await postJSON("/api/verify", { token });
        if (ok) {
          isPremiumUser = !!data.premium;
          if (!data.premium) localStorage.removeItem("ec_token");
        }
        // ถ้าเซิร์ฟเวอร์ error (เช่น ตั้งค่า env ไม่ครบ) จะไม่ลบ token ทิ้ง
      } catch (e) {
        /* ออฟไลน์: ถือว่ายังไม่ใช่พรีเมียมชั่วคราว */
      }
    }
    renderBadge();
  }
 
  async function claimPaidSession() {
    const params = new URLSearchParams(location.search);
    const urlSid = params.get("session_id");
    if (urlSid) {
      try { localStorage.setItem("ec_pending_session", urlSid); } catch (e) {}
      history.replaceState(null, "", location.pathname);
    }
    let sid = null;
    try { sid = localStorage.getItem("ec_pending_session"); } catch (e) {}
    if (!sid) return;
    if (isPremiumUser) {
      localStorage.removeItem("ec_pending_session");
      return;
    }
 
    $("file-status").textContent = t("pay_verifying");
    try {
      const { ok, status, data } = await postJSON("/api/claim", { session_id: sid });
      if (ok && data.token) {
        localStorage.setItem("ec_token", data.token);
        localStorage.removeItem("ec_pending_session");
        await verifyPremium();
        alert(t("alert_pay_done"));
      } else {
        if (status === 400 || status === 410) localStorage.removeItem("ec_pending_session");
        alert(t("alert_pay_unverified") + " [" + status + ": " + (data.error || "error") + "]");
      }
    } catch (e) {
      alert(t("alert_pay_unverified") + " [network]");
    }
    updateStatus();
  }
 
  async function startCheckout() {
    const btn = $("pay-btn");
    btn.disabled = true;
    try {
      const { ok, data } = await postJSON("/api/create-checkout", {});
      if (ok && data.url) {
        alert(t("pay_redirecting"));
        location.href = data.url;
        return;
      }
      alert(t("pay_failed"));
    } catch (e) {
      alert(t("pay_failed"));
    }
    btn.disabled = false;
  }
 
  async function detectCountry() {
    try {
      const res = await fetch("/api/geo");
      const data = await res.json();
      userCountry = data.country || "TH";
    } catch (e) {}
    updatePricingDisplay();
  }
 
  /* ---------- File selection ---------- */
 
  function acceptFor(tool) {
    return IMAGE_TOOLS.includes(tool) ? "image/*" : "application/pdf,.pdf";
  }
 
  function isValidFile(file, tool) {
    if (IMAGE_TOOLS.includes(tool)) return file.type.startsWith("image/");
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }
 
  function setFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const valid = files.filter((f) => isValidFile(f, activeTool));
    if (valid.length !== files.length) alert(t("alert_wrong_type"));
    if (valid.length === 0) return;
    selectedFiles = MULTI_TOOLS.includes(activeTool) ? valid : [valid[0]];
    updateStatus();
  }
 
  function applyToolUI() {
    const input = $("file-input");
    input.accept = acceptFor(activeTool);
    input.multiple = MULTI_TOOLS.includes(activeTool);
    $("split-options").style.display = activeTool === "split" ? "block" : "none";
  }
 
  /* ---------- Processing ---------- */
 
  function needsGate(totalMB) {
    if (isPremiumUser || oneTimePass) return false;
    return totalMB > FREE_LIMIT_MB || activeTool !== "img2pdf";
  }
 
  async function executeFileProcessing() {
    if (busy) return;
    if (selectedFiles.length === 0) {
      alert(t("alert_select_file"));
      return;
    }
    const totalMB = selectedFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
    if (needsGate(totalMB)) {
      openGateModal();
      return;
    }
 
    busy = true;
    const status = $("file-status");
    status.textContent = t("status_processing");
    try {
      await runTool(activeTool);
      status.textContent = t("status_done");
    } catch (err) {
      alert(t("status_error") + err.message);
      status.textContent = t("status_error_label");
    } finally {
      busy = false;
      oneTimePass = false;
    }
  }
 
  async function runTool(tool) {
    const file = selectedFiles[0];
    switch (tool) {
      case "img2pdf": return imagesToPdf();
      case "pdf2img": return pdfToImages(file);
      case "merge": return mergePdfs();
      case "split": return splitPdf(file);
      case "compress": return compressPdf(file);
      case "pdf2word": return pdfToWord(file);
      case "pdf2excel": return pdfToExcel(file);
    }
  }
 
  async function toJpegBytes(file) {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    return blob.arrayBuffer();
  }
 
  async function imagesToPdf() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (const file of selectedFiles) {
      let img;
      if (file.type === "image/png") img = await pdfDoc.embedPng(await file.arrayBuffer());
      else if (file.type === "image/jpeg") img = await pdfDoc.embedJpg(await file.arrayBuffer());
      else img = await pdfDoc.embedJpg(await toJpegBytes(file)); // webp, gif, bmp ฯลฯ
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    download(await pdfDoc.save(), "EasyConvert_Images.pdf", "application/pdf");
  }
 
  async function loadPdfJs(file) {
    return pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  }
 
  async function pdfToImages(file) {
    const pdf = await loadPdfJs(file);
    const blobs = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      blobs.push(await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92)));
    }
    if (blobs.length === 1) {
      download(blobs[0], "EasyConvert_Page_1.jpg");
      return;
    }
    const zip = new JSZip();
    blobs.forEach((b, i) => zip.file(`Page_${i + 1}.jpg`, b));
    download(await zip.generateAsync({ type: "blob" }), "EasyConvert_Pages.zip");
  }
 
  async function mergePdfs() {
    const merged = await PDFLib.PDFDocument.create();
    for (const file of selectedFiles) {
      const src = await PDFLib.PDFDocument.load(await file.arrayBuffer());
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    download(await merged.save(), "EasyConvert_Merged.pdf", "application/pdf");
  }
 
  function parseRanges(input, max) {
    const out = [];
    for (const part of input.split(",")) {
      const s = part.trim();
      if (!s) continue;
      const m = s.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw new Error(t("invalid_range"));
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      if (a < 1 || b < a || b > max) throw new Error(t("invalid_range"));
      for (let i = a; i <= b; i++) out.push(i - 1);
    }
    if (out.length === 0) throw new Error(t("invalid_range"));
    return out;
  }
 
  async function splitPdf(file) {
    const src = await PDFLib.PDFDocument.load(await file.arrayBuffer());
    const indices = parseRanges($("page-range").value || "1", src.getPageCount());
    const out = await PDFLib.PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    download(await out.save(), "EasyConvert_Split.pdf", "application/pdf");
  }
 
  // หมายเหตุ: pdf-lib บีบอัดได้เฉพาะโครงสร้างภายใน ผลลดขนาดขึ้นกับไฟล์ต้นฉบับ
  async function compressPdf(file) {
    const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer());
    const bytes = await doc.save({ useObjectStreams: true });
    download(bytes, "Compressed_" + file.name, "application/pdf");
  }
 
  async function extractPageTexts(file) {
    const pdf = await loadPdfJs(file);
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      pages.push((await page.getTextContent()).items);
    }
    return pages;
  }
 
  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
 
  // ได้ไฟล์ .doc (HTML) ที่ Word เปิดได้ เป็นข้อความล้วน ไม่รักษา layout เดิม
  async function pdfToWord(file) {
    const pages = await extractPageTexts(file);
    const body = pages
      .map((items, idx) => {
        const text = escapeHtml(items.map((it) => it.str).join(" "));
        const brk = idx > 0 ? '<br clear="all" style="page-break-before:always">' : "";
        return brk + "<p>" + text + "</p>";
      })
      .join("");
    const html =
      '<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>' +
      body + "</body></html>";
    download(
      new TextEncoder().encode("\uFEFF" + html),
      file.name.replace(/\.pdf$/i, "") + "_EasyConvert.doc",
      "application/msword"
    );
  }
 
  // ได้ไฟล์ CSV จัดแถวตามตำแหน่งแนวตั้งของข้อความ (เหมาะกับ PDF ที่เป็นตาราง)
  async function pdfToExcel(file) {
    const pages = await extractPageTexts(file);
    const quote = (s) => '"' + s.replace(/"/g, '""') + '"';
    const lines = [];
    for (const items of pages) {
      const rows = new Map();
      for (const it of items) {
        if (!it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 4);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: it.transform[4], s: it.str });
      }
      [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([, cells]) => {
          cells.sort((a, b) => a.x - b.x);
          lines.push(cells.map((c) => quote(c.s)).join(","));
        });
    }
    download(
      new TextEncoder().encode("\uFEFF" + lines.join("\r\n")),
      file.name.replace(/\.pdf$/i, "") + "_EasyConvert.csv",
      "text/csv;charset=utf-8"
    );
  }
 
  function download(data, filename, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
 
  /* ---------- Modal / rewarded ad ---------- */
 
  function openGateModal() { $("gate-modal").style.display = "flex"; }
  function closeGateModal() { $("gate-modal").style.display = "none"; }
 
  function startRewardedAd() {
    const btn = $("watch-ad-btn");
    if (btn.disabled) return;
    let timeLeft = 15;
    btn.disabled = true;
    btn.textContent = t("ad_countdown").replace("{time}", timeLeft);
    const timer = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        btn.textContent = t("ad_countdown").replace("{time}", timeLeft);
        return;
      }
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = t("btn_watch");
      closeGateModal();
      alert(t("alert_ad_done"));
      oneTimePass = true;
      executeFileProcessing();
    }, 1000);
  }
 
  /* ---------- Init ---------- */
 
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.addEventListener("click", function () {
        activeTool = this.getAttribute("data-tool");
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        selectedFiles = [];
        $("file-input").value = "";
        applyToolUI();
        $("file-status").textContent = t("switch_text") + this.textContent;
      });
    });
 
    $("lang-toggle").addEventListener("change", (e) => changeLanguage(e.target.value));
    $("user-badge").addEventListener("click", () => { if (!isPremiumUser) openGateModal(); });
    $("close-modal-btn").addEventListener("click", closeGateModal);
    $("pay-btn").addEventListener("click", startCheckout);
    $("watch-ad-btn").addEventListener("click", startRewardedAd);
    $("process-btn").addEventListener("click", executeFileProcessing);
 
    const input = $("file-input");
    input.addEventListener("change", (e) => {
      setFiles(e.target.files);
      input.value = "";
    });
 
    const drop = $("drop-area");
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("dragover", (e) => e.preventDefault());
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      setFiles(e.dataTransfer.files);
    });
 
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
 
    applyToolUI();
    changeLanguage(currentLang);
    detectCountry();
    verifyPremium().then(claimPaidSession);
  });
})();
