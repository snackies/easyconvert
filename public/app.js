(function () {
  "use strict";
 
  const FREE_LIMIT_MB = 15;
  const FREE_TOOLS = ["img2pdf"]; // เครื่องมืออื่นล็อกไว้สำหรับสมาชิกพรีเมียม
  const IMAGE_TOOLS = ["img2pdf"];
  const MULTI_TOOLS = ["img2pdf", "merge"];
 
  let currentLang = localStorage.getItem("ec_lang") || "th";
  let isPremiumUser = false;
  let oneTimePass = false; // สิทธิ์ใช้ฟรี 1 ครั้งจากการดูโฆษณา
  let activeTool = "img2pdf";
  let selectedFiles = [];
  let userCountry = "TH";
  let busy = false;
  let premiumExp = 0; // เวลาหมดอายุของสิทธิ์ (วินาที epoch)
  let countdownTimer = null;
 
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
    applyLocks();
    updateProInfo();
  }
 
  /* ---------- วันหมดอายุ + นับถอยหลัง ---------- */
 
  function formatRemaining(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return (d > 0 ? d + " " + t("pro_days") + " " : "") + pad(h) + ":" + pad(m) + ":" + pad(sec);
  }
 
  function tickCountdown() {
    const left = premiumExp * 1000 - Date.now();
    if (left <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      $("pro-info").style.display = "none";
      $("file-status").textContent = t("pro_expired");
      verifyPremium(); // สิทธิ์หมดอายุ: ตรวจกับเซิร์ฟเวอร์แล้วล็อกเครื่องมือกลับ
      return;
    }
    const when = new Date(premiumExp * 1000).toLocaleString(
      currentLang === "th" ? "th-TH" : "en-GB",
      { dateStyle: "medium", timeStyle: "short" }
    );
    $("pro-expire").textContent = t("pro_until") + " " + when;
    $("pro-countdown").textContent = t("pro_left") + " " + formatRemaining(left);
    $("pro-info").classList.toggle("warn", left < 3 * 86400 * 1000);
  }
 
  function updateProInfo() {
    const box = $("pro-info");
    if (!isPremiumUser || !premiumExp) {
      box.style.display = "none";
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      return;
    }
    box.style.display = "block";
    tickCountdown();
    if (premiumExp * 1000 > Date.now() && !countdownTimer) {
      countdownTimer = setInterval(tickCountdown, 1000);
    }
  }
 
  function isLocked(tool) {
    return !isPremiumUser && !FREE_TOOLS.includes(tool);
  }
 
  function applyLocks() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("locked", isLocked(btn.getAttribute("data-tool")));
    });
    // ถ้าสิทธิ์หมดอายุขณะเปิดเครื่องมือที่ล็อกอยู่ ให้กลับไปเครื่องมือฟรี
    if (isLocked(activeTool)) {
      const free = document.querySelector('.tab-btn[data-tool="' + FREE_TOOLS[0] + '"]');
      if (free) selectTool(free, true);
    }
  }
 
  function selectTool(button, silent) {
    activeTool = button.getAttribute("data-tool");
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    selectedFiles = [];
    $("file-input").value = "";
    applyToolUI();
    if (silent) updateStatus();
    else $("file-status").textContent = t("switch_text") + button.textContent.replace("🔒", "").trim();
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
 
  const PENDING_KEY = "ec_pending_session";
  const PENDING_AT_KEY = "ec_pending_at";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let claiming = false;
 
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  }
 
  function getPending() {
    try { return localStorage.getItem(PENDING_KEY); } catch (e) { return null; }
  }
  function setPending(id) {
    try {
      localStorage.setItem(PENDING_KEY, id);
      localStorage.setItem(PENDING_AT_KEY, String(Date.now()));
    } catch (e) {}
  }
  function clearPending() {
    try {
      localStorage.removeItem(PENDING_KEY);
      localStorage.removeItem(PENDING_AT_KEY);
    } catch (e) {}
  }
  function pendingAgeMs() {
    try { return Date.now() - Number(localStorage.getItem(PENDING_AT_KEY) || 0); } catch (e) { return Infinity; }
  }
 
  // อ่านวันหมดอายุจาก token ในเครื่อง (ใช้เป็นตัวสำรองเมื่อเซิร์ฟเวอร์ตอบไม่ได้ชั่วคราว)
  function readLocalExp() {
    try {
      const tok = localStorage.getItem("ec_token");
      if (!tok) return 0;
      const b64 = tok.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(b64)).exp || 0;
    } catch (e) {
      return 0;
    }
  }
 
  async function verifyPremium() {
    const token = localStorage.getItem("ec_token");
    isPremiumUser = false;
    premiumExp = 0;
    if (token) {
      let answered = false;
      try {
        const { ok, data } = await postJSON("/api/verify", { token });
        if (ok) {
          answered = true;
          isPremiumUser = !!data.premium;
          premiumExp = data.premium ? data.exp || readLocalExp() : 0;
          if (!data.premium) localStorage.removeItem("ec_token");
        }
      } catch (e) {}
      // เซิร์ฟเวอร์ตอบไม่ได้ชั่วคราว: เชื่อวันหมดอายุในเครื่อง เพื่อไม่ให้ผู้ที่จ่ายแล้วถูกล็อกเอง
      if (!answered && readLocalExp() * 1000 > Date.now()) {
        isPremiumUser = true;
        premiumExp = readLocalExp();
      }
    }
    renderBadge();
  }
 
  // ได้รับ token จากเซิร์ฟเวอร์: ปลดล็อกทันที ไม่ต้องรีเฟรช
  function grantAccess(token, exp) {
    localStorage.setItem("ec_token", token);
    clearPending();
    isPremiumUser = true;
    premiumExp = exp || readLocalExp();
    renderBadge();
    closeGateModal();
    closeRestoreModal();
    updateStatus();
    alert(t("alert_pay_done"));
  }
 
  // ขอสิทธิ์จากรหัสการชำระเงินที่เก็บไว้ (รอได้นานสุด 3 นาทีกรณี PromptPay ยังยืนยันไม่เสร็จ)
  async function claimPaidSession() {
    const params = new URLSearchParams(location.search);
    if (params.get("canceled")) {
      clearPending();
      history.replaceState(null, "", location.pathname);
    }
    const urlSid = params.get("session_id");
    if (urlSid) {
      setPending(urlSid);
      history.replaceState(null, "", location.pathname);
    }
    const sid = getPending();
    if (!sid) return false;
    if (isPremiumUser) {
      clearPending();
      return true;
    }
    if (claiming) return false;
 
    claiming = true;
    $("file-status").textContent = t("pay_verifying");
    const deadline = Date.now() + 3 * 60 * 1000;
    try {
      for (;;) {
        const { ok, status, data } = await postJSON("/api/claim", { session_id: sid });
        if (ok && data.token) {
          grantAccess(data.token, data.exp);
          return true;
        }
        if (status === 402 && Date.now() < deadline) {
          await sleep(3000); // ยังไม่ชำระ/ยังยืนยันไม่เสร็จ: รอแล้วลองใหม่
          continue;
        }
        if (status === 402 && pendingAgeMs() > 30 * 60 * 1000) {
          clearPending(); // ค้างนานเกินไป ถือว่าไม่ได้ชำระ ไม่ต้องรบกวนผู้ใช้
          return false;
        }
        if (status === 400 || status === 410) clearPending();
        alert(t("alert_pay_unverified") + " [" + status + ": " + (data.error || "error") + "]");
        return false;
      }
    } catch (e) {
      alert(t("alert_pay_unverified") + " [network]");
      return false;
    } finally {
      claiming = false;
      updateStatus();
    }
  }
 
  async function startCheckout() {
    const btn = $("pay-btn");
    btn.disabled = true;
    try {
      const { ok, data } = await postJSON("/api/create-checkout", {});
      if (ok && data.url) {
        if (data.id) setPending(data.id); // จำรหัสไว้ก่อนไปหน้าจ่ายเงิน ปลดล็อกได้แม้ไม่ได้ถูกพากลับมาโดยอัตโนมัติ
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
    return totalMB > FREE_LIMIT_MB || isLocked(activeTool);
  }
 
  async function executeFileProcessing() {
    if (busy) return;
    if (selectedFiles.length === 0) {
      alert(t("alert_select_file"));
      return;
    }
    const totalMB = selectedFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
    if (needsGate(totalMB)) {
      openGateModal(isLocked(activeTool) ? "tool" : "size");
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
 
  // mode "size": ไฟล์ใหญ่ (จ่ายหรือดูโฆษณาได้) / mode "tool": เครื่องมือล็อก (จ่ายเท่านั้น)
  function openGateModal(mode) {
    const toolOnly = mode === "tool";
    $("modal-desc").textContent = t(toolOnly ? "modal_desc_upgrade" : "modal_desc");
    $("or-text").style.display = toolOnly ? "none" : "block";
    $("watch-ad-btn").style.display = toolOnly ? "none" : "block";
    $("gate-modal").style.display = "flex";
  }
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
 
  // กู้สิทธิ์ด้วยตนเอง: อีเมลที่ใช้จ่าย + เลขที่ใบเสร็จจาก Stripe (หรือรหัส cs_/pi_)
  function openRestoreModal() {
    closeGateModal();
    $("restore-msg").textContent = "";
    $("restore-modal").style.display = "flex";
  }
  function closeRestoreModal() { $("restore-modal").style.display = "none"; }
 
  async function submitRestore() {
    const email = $("restore-email").value.trim();
    const ref = $("restore-receipt").value.trim();
    const msg = $("restore-msg");
    const btn = $("restore-submit-btn");
    msg.textContent = "";
 
    const isId = /^(cs|pi)_/.test(ref);
    if (!ref || (!isId && !email)) {
      msg.textContent = t("restore_need_fields");
      return;
    }
    btn.disabled = true;
    try {
      const body = isId ? { session_id: ref } : { email, receipt: ref };
      const { ok, status, data } = await postJSON("/api/claim", body);
      if (ok && data.token) {
        grantAccess(data.token, data.exp);
      } else if (status === 404 || status === 400) {
        msg.textContent = t("restore_not_found");
      } else if (status === 429) {
        msg.textContent = t("restore_too_many");
      } else if (status === 410) {
        msg.textContent = t("restore_expired");
      } else {
        msg.textContent = t("restore_error") + " [" + status + ": " + (data.error || "error") + "]";
      }
    } catch (e) {
      msg.textContent = t("restore_error") + " [network]";
    }
    btn.disabled = false;
  }
 
  /* ---------- Init ---------- */
 
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.addEventListener("click", function () {
        if (isLocked(this.getAttribute("data-tool"))) {
          openGateModal("tool"); // เครื่องมือล็อก: ไม่สลับเครื่องมือ แสดงหน้าอัปเกรด
          return;
        }
        selectTool(this, false);
      });
    });
 
    $("lang-toggle").addEventListener("change", (e) => changeLanguage(e.target.value));
    $("user-badge").addEventListener("click", () => { if (!isPremiumUser) openGateModal("tool"); });
    $("restore-btn").addEventListener("click", openRestoreModal);
    $("restore-submit-btn").addEventListener("click", submitRestore);
    $("restore-cancel-btn").addEventListener("click", closeRestoreModal);
    // กลับมาที่แท็บหลังจ่ายเงิน (เช่น จ่ายผ่านแอปธนาคารแล้วสลับกลับ) ให้ตรวจสิทธิ์ทันที
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && getPending() && !isPremiumUser) claimPaidSession();
    });
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
 
