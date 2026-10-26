(function () {
  "use strict";
 
  // จุดเชื่อมให้โมดูลเครื่องมือแยกไฟล์ (esign.js, docx.js) ลงทะเบียนตัวเองได้
  const EC = (window.EC = window.EC || {});
  EC.tools = EC.tools || {};
  EC.langListeners = EC.langListeners || [];
 
  /* ============ ค่าคงที่ ============ */
  const FREE_LIMIT_MB = 15;
  const TRIAL_PER_DAY = 2; // ทดลองฟรีต่อเครื่องมือต่อวัน
  const PRICES = { week: 19, month: 29, year: 199 }; // ต้องตรงกับ lib/plans.js
  const PLAN_DAYS = { week: 7, month: 30, year: 365 };
  const MAX_AREA = 12e6; // จำกัดพื้นที่ canvas (พิกเซล) กันเครื่องมือถือแรมเต็ม
  const FONT = '"Plex Thai","Sukhumvit Set","Thonburi","Noto Sans Thai","Leelawadee UI",sans-serif';
 
  const TOOLS = [
    { id: "img2pdf", icon: "📷", kinds: ["image"], multi: true },
    { id: "pdf2img", icon: "🖼️", kinds: ["pdf"] },
    { id: "merge", icon: "🧩", kinds: ["pdf"], multi: true },
    { id: "split", icon: "✂️", kinds: ["pdf"] },
    { id: "compress", icon: "🗜️", kinds: ["pdf"] },
    { id: "shrink", icon: "📏", kinds: ["image", "pdf"], multi: true, isNew: true },
    { id: "watermark", icon: "🪪", kinds: ["image", "pdf"], multi: true, isNew: true },
    { id: "sign", icon: "✍️", kinds: ["pdf"], isNew: true },
    { id: "pdf2word", icon: "📝", kinds: ["pdf"] },
    { id: "pdf2excel", icon: "📊", kinds: ["pdf"] },
  ];
  const toolById = (id) => TOOLS.find((x) => x.id === id);
 
  /* ============ สถานะ ============ */
  let currentLang = "th";
  let isPremiumUser = false;
  let premiumExp = 0; // เวลาหมดอายุ (วินาที epoch)
  let activeTool = "img2pdf";
  let selectedFiles = [];
  let busy = false;
  let claiming = false;
  let checkingOut = false;
  let countdownTimer = null;
  let wmTouched = false;
 
  const $ = (id) => document.getElementById(id);
  const t = (key) => (translations[currentLang] && translations[currentLang][key]) || key;
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  function fmtSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  }
  function needLib(name) {
    if (typeof window[name] === "undefined") throw new Error(t("lib_error"));
  }
 
  /* ============ ตรวจเบราว์เซอร์ ============ */
  function checkEnvironment() {
    const ua = navigator.userAgent || "";
    const inApp = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|MicroMessenger|Messenger/i.test(ua);
    let old = false;
    try {
      old = !(window.pdfjsLib && window.PDFLib && window.JSZip && window.File && window.Blob && window.Promise &&
        window.URL && URL.createObjectURL && HTMLCanvasElement.prototype.toBlob);
    } catch (e) { old = true; }
    $("env-old").hidden = !old;
    $("env-inapp").hidden = !inApp;
    $("env-copy").hidden = !inApp;
    $("env-banner").hidden = !(old || inApp);
    $("env-copy").addEventListener("click", () => {
      const url = location.origin + location.pathname;
      const btn = $("env-copy");
      const done = () => { btn.textContent = t("env_copied"); setTimeout(() => { btn.textContent = t("env_copy"); }, 2000); };
      const fallback = () => {
        try {
          const ta = document.createElement("textarea");
          ta.value = url;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          done();
        } catch (e) {}
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done, fallback); return; }
      } catch (e) {}
      fallback();
    });
  }

  /* ============ ภาษา / หน้าจอ ============ */
  function changeLanguage(lang) {
    currentLang = lang;
    store.set("ec_lang", lang);
    document.documentElement.lang = lang;
    $("lang-toggle").value = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const text = translations[lang][el.getAttribute("data-i18n")];
      if (text) el.textContent = text;
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const text = translations[lang][el.getAttribute("data-i18n-html")];
      if (text) el.innerHTML = text;
    });
    renderPlans();
    renderWmChips();
    EC.langListeners.forEach((fn) => { try { fn(lang); } catch (e) { console.error(e); } });
    renderBadge();
    renderToolHeader();
    updateTrialInfo();
    updateStatus();
  }
 
  function renderBadge() {
    const badge = $("user-badge");
    badge.textContent = isPremiumUser ? t("premium_tier") : t("btn_upgrade");
    badge.className = "badge" + (isPremiumUser ? " premium" : "");
    updateProInfo();
    updateTrialInfo();
  }
 
  function renderToolHeader() {
    $("tool-title").textContent = t("tab_" + activeTool);
    $("tool-desc").textContent = t("desc_" + activeTool);
    const kinds = toolById(activeTool).kinds;
    const key = kinds.length === 2 ? "drop_types_both" : kinds[0] === "image" ? "drop_types_img" : "drop_types_pdf";
    $("drop-types").textContent = t(key);
  }
 
  function updateStatus() {
    $("file-status").textContent = selectedFiles.length
      ? fmt(t("file_ready_text"), { count: selectedFiles.length })
      : t("no_file");
  }
 
  function renderPlans() {
    ["plans-main", "plans-modal"].forEach((boxId) => {
      const box = $(boxId);
      box.innerHTML = "";
      ["week", "month", "year"].forEach((plan) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "plan" + (plan === "year" ? " best" : "");
        b.setAttribute("data-plan", plan);
        const tag = plan === "year" ? t("plan_best") : plan === "month" ? t("plan_popular") : "";
        const perDay =
          '<span class="pnote">' + fmt(t("plan_perday"), { x: (PRICES[plan] / PLAN_DAYS[plan]).toFixed(2) }) + "</span>";
        b.innerHTML =
          (tag ? '<span class="ptag">' + tag + "</span>" : "") +
          '<span class="pwrap"><span class="pname">' + t("plan_" + plan + "_name") + "</span>" +
          '<span class="pprice">' + fmt(t("price_fmt"), { p: PRICES[plan] }) + "</span>" +
          '<span class="pnote">' + t("plan_" + plan + "_note") + "</span>" + perDay + "</span>" +
          '<span class="pcta">' + t("plan_cta") + "</span>";
        box.appendChild(b);
      });
    });
  }
 
  function renderWmChips() {
    const box = $("wm-chips");
    box.innerHTML = "";
    [1, 2, 3].forEach((n) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "chip";
      c.textContent = t("wm_preset_" + n);
      c.addEventListener("click", () => {
        $("wm-text").value = t("wm_preset_" + n);
        wmTouched = true;
      });
      box.appendChild(c);
    });
    if (!wmTouched) $("wm-text").value = t("wm_preset_1");
  }
 
  function buildToolGrid() {
    const grid = $("tool-grid");
    TOOLS.forEach((tool) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tool-tile";
      b.setAttribute("data-tool", tool.id);
      b.innerHTML =
        '<span class="ti" aria-hidden="true">' + tool.icon + "</span>" +
        '<span class="tn" data-i18n="tab_' + tool.id + '"></span>' +
        (tool.isNew ? '<span class="tag" data-i18n="tag_new"></span>' : "");
      b.addEventListener("click", () => selectTool(tool.id));
      grid.appendChild(b);
    });
  }
 
  function notifyFiles() {
    const h = EC.tools[activeTool];
    if (h && h.onFiles) {
      try { h.onFiles(selectedFiles.slice()); } catch (e) { console.error(e); }
    }
  }
 
  function selectTool(id) {
    const prev = EC.tools[activeTool];
    if (prev && prev.onLeave) { try { prev.onLeave(); } catch (e) { console.error(e); } }
    activeTool = id;
    selectedFiles = [];
    hideSaveLink();
    $("file-input").value = "";
    document.querySelectorAll(".tool-tile").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-tool") === id);
    });
    const tool = toolById(id);
    const accept = [];
    if (tool.kinds.includes("image")) accept.push("image/*");
    if (tool.kinds.includes("pdf")) accept.push("application/pdf,.pdf");
    $("file-input").accept = accept.join(",");
    $("file-input").multiple = !!tool.multi;
    document.querySelectorAll(".options[data-tool]").forEach((el) => {
      el.style.display = el.getAttribute("data-tool") === id ? "block" : "none";
    });
    $("receipt").hidden = true;
    $("progress").hidden = true;
    renderToolHeader();
    renderFileList();
    updateTrialInfo();
    updateStatus();
    notifyFiles();
  }
 
  /* ============ ไฟล์ที่เลือก ============ */
  function fileKind(file) {
    if (file.type && file.type.startsWith("image/")) return "image";
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
    return null;
  }
 
  function setFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;
    const tool = toolById(activeTool);
    const valid = files.filter((f) => tool.kinds.includes(fileKind(f)));
    if (valid.length !== files.length) alert(t("alert_wrong_type"));
    if (!valid.length) return;
    if (tool.multi) {
      const key = (f) => f.name + "|" + f.size + "|" + f.lastModified;
      const have = new Set(selectedFiles.map(key));
      valid.forEach((f) => { if (!have.has(key(f))) selectedFiles.push(f); });
    } else {
      selectedFiles = [valid[0]];
    }
    renderFileList();
    updateStatus();
    notifyFiles();
  }
 
  function renderFileList() {
    const list = $("file-list");
    list.innerHTML = "";
    selectedFiles.forEach((file, idx) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "fname";
      name.textContent = file.name;
      const size = document.createElement("span");
      size.className = "fsize";
      size.textContent = fmtSize(file.size);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "×";
      rm.setAttribute("aria-label", t("remove_file"));
      rm.addEventListener("click", () => {
        selectedFiles.splice(idx, 1);
        renderFileList();
        updateStatus();
        notifyFiles();
      });
      li.appendChild(name);
      li.appendChild(size);
      li.appendChild(rm);
      list.appendChild(li);
    });
  }
 
  /* ============ สิทธิ์ทดลอง 2 ครั้ง/วัน ============ */
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function readTrial() {
    try {
      const o = JSON.parse(store.get("ec_trial") || "{}");
      if (o.date === todayStr() && o.counts) return o;
    } catch (e) {}
    return { date: todayStr(), counts: {} };
  }
  function trialLeft(tool) {
    return Math.max(0, TRIAL_PER_DAY - (readTrial().counts[tool] || 0));
  }
  function trialConsume(tool) {
    const o = readTrial();
    o.counts[tool] = (o.counts[tool] || 0) + 1;
    store.set("ec_trial", JSON.stringify(o));
  }
  function updateTrialInfo() {
    const el = $("trial-info");
    const freeChip = $("pt-free");
    if (freeChip) freeChip.style.display = isPremiumUser ? "none" : "";
    if (isPremiumUser) {
      el.style.display = "none";
      return;
    }
    const left = trialLeft(activeTool);
    el.style.display = "block";
    el.textContent = left > 0
      ? fmt(t("trial_left"), { n: left, max: TRIAL_PER_DAY })
      : fmt(t("trial_out"), { max: TRIAL_PER_DAY });
  }
  function gateReason(totalMB) {
    if (isPremiumUser) return null;
    if (totalMB > FREE_LIMIT_MB) return "size";
    if (trialLeft(activeTool) <= 0) return "trial";
    return null;
  }
 
  /* ============ Premium: ตรวจสิทธิ์ / ชำระเงิน / กู้คืน ============ */
  const PENDING_KEY = "ec_pending_session";
  const PENDING_AT_KEY = "ec_pending_at";
 
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  }
  function setPending(id) { store.set(PENDING_KEY, id); store.set(PENDING_AT_KEY, String(Date.now())); }
  function clearPending() { store.del(PENDING_KEY); store.del(PENDING_AT_KEY); }
  function pendingAgeMs() { return Date.now() - Number(store.get(PENDING_AT_KEY) || 0); }
 
  function readLocalExp() {
    try {
      const tok = store.get("ec_token");
      if (!tok) return 0;
      const b64 = tok.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(b64)).exp || 0;
    } catch (e) {
      return 0;
    }
  }
 
  async function verifyPremium() {
    const token = store.get("ec_token");
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
          if (!data.premium) store.del("ec_token");
        }
      } catch (e) {}
      // เซิร์ฟเวอร์ตอบไม่ได้ชั่วคราว: เชื่อวันหมดอายุในเครื่อง ไม่ให้ผู้ที่จ่ายแล้วถูกล็อกเอง
      if (!answered && readLocalExp() * 1000 > Date.now()) {
        isPremiumUser = true;
        premiumExp = readLocalExp();
      }
    }
    renderBadge();
  }
 
  function grantAccess(token, exp) {
    store.set("ec_token", token);
    clearPending();
    isPremiumUser = true;
    premiumExp = exp || readLocalExp();
    renderBadge();
    closeGateModal();
    closeRestoreModal();
    updateStatus();
    alert(t("alert_pay_done"));
  }
 
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
    const sid = store.get(PENDING_KEY);
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
          await sleep(3000); // PromptPay อาจยืนยันช้า รอแล้วลองใหม่
          continue;
        }
        if (status === 402 && pendingAgeMs() > 30 * 60 * 1000) {
          clearPending();
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
 
  async function startCheckout(plan) {
    if (checkingOut || !PRICES[plan]) return;
    checkingOut = true;
    try {
      const { ok, data } = await postJSON("/api/create-checkout", { plan });
      if (ok && typeof data.url === "string" && data.url.startsWith("https://checkout.stripe.com/")) {
        if (data.id) setPending(data.id); // จำรหัสไว้ก่อนไปหน้าจ่ายเงิน ปลดล็อกได้แม้ไม่ถูกพากลับมาเอง
        location.href = data.url;
        return;
      }
      alert(t("pay_failed"));
    } catch (e) {
      alert(t("pay_failed"));
    }
    checkingOut = false;
  }
 
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
      if (ok && data.token) grantAccess(data.token, data.exp);
      else if (status === 404 || status === 400) msg.textContent = t("restore_not_found");
      else if (status === 429) msg.textContent = t("restore_too_many");
      else if (status === 410) msg.textContent = t("restore_expired");
      else msg.textContent = t("restore_error") + " [" + status + ": " + (data.error || "error") + "]";
    } catch (e) {
      msg.textContent = t("restore_error") + " [network]";
    }
    btn.disabled = false;
  }
 
  /* ============ วันหมดอายุ + นับถอยหลัง ============ */
  function formatRemaining(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return (d > 0 ? d + " " + t("pro_days") + " " : "") + pad(h) + ":" + pad(m) + ":" + pad(s);
  }
  function tickCountdown() {
    const left = premiumExp * 1000 - Date.now();
    if (left <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      $("pro-info").style.display = "none";
      $("file-status").textContent = t("pro_expired");
      verifyPremium();
      return;
    }
    const when = new Date(premiumExp * 1000).toLocaleString(currentLang === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
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
    box.style.display = "flex";
    tickCountdown();
    if (premiumExp * 1000 > Date.now() && !countdownTimer) countdownTimer = setInterval(tickCountdown, 1000);
  }
 
  /* ============ ตัวช่วยประมวลผลภาพ/PDF ============ */
  function limitScale(w, h) {
    const a = w * h;
    return a > MAX_AREA ? Math.sqrt(MAX_AREA / a) : 1;
  }
  function newCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function canvasToBlob(canvas, type, q) {
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, q)
    );
  }
  function bitmapToCanvas(bmp, scale) {
    const s = Math.min(scale || 1, limitScale(bmp.width * (scale || 1), bmp.height * (scale || 1)) * (scale || 1));
    const c = newCanvas(bmp.width * s, bmp.height * s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }
  function freeCanvas(c) { c.width = c.height = 0; }
 
  function friendlyError(err) {
    const m = (err && (err.name + " " + err.message)) || "";
    if (/PasswordException|encrypted|password/i.test(m)) return t("err_encrypted");
    if (/InvalidPDF|Invalid PDF|No PDF header|Failed to parse/i.test(m)) return t("err_bad_pdf");
    return (err && err.message) || String(err);
  }
 
  async function loadPdfJs(file) {
    needLib("pdfjsLib");
    return pdfjsLib.getDocument({
      data: await file.arrayBuffer(),
      isEvalSupported: false,
      standardFontDataUrl: "vendor/standard_fonts/",
      cMapUrl: "vendor/cmaps/",
      cMapPacked: true,
    }).promise;
  }
  async function renderPageToCanvas(page, scale) {
    const base = page.getViewport({ scale: 1 });
    const s = Math.min(scale, Math.sqrt(MAX_AREA / (base.width * base.height)));
    const vp = page.getViewport({ scale: s });
    const c = newCanvas(vp.width, vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }
 
  function setProgress(frac) {
    $("progress").hidden = false;
    $("progress-bar").style.width = Math.round(Math.min(1, Math.max(0, frac)) * 100) + "%";
  }
  function setPageStatus(i, n, round) {
    $("file-status").textContent =
      fmt(t("progress_page"), { i, n }) + (round ? fmt(t("progress_round"), { r: round }) : "");
    setProgress((i - 1) / n);
  }
 
  // แปลงทุกหน้า PDF เป็นภาพ JPEG แล้วประกอบเป็น PDF ใหม่ (ใช้ทั้งลดขนาด ย่อให้ได้ขนาด และลายน้ำ)
  async function rasterizePdf(file, opts) {
    needLib("PDFLib");
    const pdf = await loadPdfJs(file);
    const out = await PDFLib.PDFDocument.create();
    for (let i = 1; i <= pdf.numPages; i++) {
      setPageStatus(i, pdf.numPages, opts.round);
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const canvas = await renderPageToCanvas(page, opts.scale);
      if (opts.mark) drawWatermark(canvas.getContext("2d"), canvas.width, canvas.height, opts.mark.text, opts.mark.opacity);
      const blob = await canvasToBlob(canvas, "image/jpeg", opts.quality);
      const img = await out.embedJpg(await blob.arrayBuffer());
      const p = out.addPage([base.width, base.height]);
      p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      freeCanvas(canvas);
      if (page.cleanup) page.cleanup();
    }
    return out.save();
  }
 
  async function ensureFont() {
    try { if (document.fonts && document.fonts.load) await document.fonts.load('700 24px "Plex Thai"', "ก A"); } catch (e) {}
  }
 
  function drawWatermark(ctx, w, h, text, opacity) {
    const label = (text || "").trim() || "COPY";
    const size = Math.max(14, Math.round(Math.min(w, h) / 20));
    ctx.save();
    ctx.font = "700 " + size + "px " + FONT;
    ctx.textBaseline = "middle";
    ctx.globalAlpha = opacity;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size / 10);
    const textW = ctx.measureText(label).width;
    const stepX = textW + size * 2.2;
    const stepY = size * 3.2;
    const diag = Math.hypot(w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    let row = 0;
    for (let y = -diag; y <= diag; y += stepY, row++) {
      const off = (row % 2) * (stepX / 2);
      for (let x = -diag - stepX; x <= diag; x += stepX) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(label, x + off, y);
        ctx.fillStyle = "#c62828";
        ctx.fillText(label, x + off, y);
      }
    }
    ctx.restore();
  }
 
  // ค้นหาคุณภาพ/ขนาดที่ทำให้ไฟล์ไม่เกินเป้าหมาย encode(scale, quality) -> { size, data }
  async function searchToTarget(encode, target) {
    const scales = [1, 0.85, 0.7, 0.55, 0.42, 0.32, 0.25];
    let smallest = null;
    for (const sc of scales) {
      const hi = await encode(sc, 0.92);
      if (!smallest || hi.size < smallest.size) smallest = hi;
      if (hi.size <= target) return { size: hi.size, data: hi.data, ok: true };
      const lo = await encode(sc, 0.35);
      if (lo.size < smallest.size) smallest = lo;
      if (lo.size > target) continue;
      let a = 0.35, b = 0.92, good = lo;
      for (let i = 0; i < 6; i++) {
        const m = (a + b) / 2;
        const r = await encode(sc, m);
        if (r.size <= target) { good = r; a = m; } else { b = m; }
      }
      return { size: good.size, data: good.data, ok: true };
    }
    return { size: smallest.size, data: smallest.data, ok: false };
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
    if (!out.length) throw new Error(t("invalid_range"));
    return out;
  }
 
  const baseName = (name) => name.replace(/\.[^.]+$/, "");
  // iPad/iPhone: การสั่งดาวน์โหลดด้วยโค้ดหลังประมวลผลเสร็จทำให้ Safari ค้าง เปิดตัวเลือกไฟล์ไม่ได้อีก
  // จึงให้ผู้ใช้แตะปุ่ม "บันทึกไฟล์" เอง (แตะจริง = ดาวน์โหลดที่ Safari รองรับเต็มที่)
  let lastBlobUrl = null;
  function isIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function doneText() { return t(isIOS() ? "status_done_ios" : "status_done"); }
  function hideSaveLink() {
    const box = $("save-box");
    if (box) box.hidden = true;
    if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }
  }
  function download(data, filename, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    const url = URL.createObjectURL(blob);
    lastBlobUrl = url;
    const link = $("save-link");
    link.href = url;
    link.setAttribute("download", filename);
    link.textContent = "⬇ " + t("save_btn") + " (" + filename + ")";
    $("save-hint").textContent = t(isIOS() ? "save_hint_ios" : "save_hint");
    $("save-box").hidden = false;
    if (!isIOS()) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }
  async function deliver(results, zipName) {
    if (results.length === 1) {
      download(results[0].data, results[0].name, results[0].type);
      return;
    }
    needLib("JSZip");
    const zip = new JSZip();
    const used = {};
    results.forEach((r) => {
      let n = r.name;
      if (used[n]) { used[n]++; n = baseName(r.name) + "_" + used[n] + r.name.slice(baseName(r.name).length); } else { used[n] = 1; }
      zip.file(n, r.data);
    });
    download(await zip.generateAsync({ type: "blob" }), zipName, "application/zip");
  }
 
  /* ============ เครื่องมือแต่ละตัว ============ */
  async function needsReencode(file) {
    // รูปจากกล้องมักมี EXIF หมุนภาพ ถ้าฝัง JPEG ตรง ๆ ภาพจะตะแคง จึงตรวจแล้ววาดผ่าน canvas
    try {
      const raw = await createImageBitmap(file, { imageOrientation: "none" });
      const fixed = await createImageBitmap(file);
      const diff = raw.width !== fixed.width || raw.height !== fixed.height;
      if (raw.close) raw.close();
      if (fixed.close) fixed.close();
      return diff;
    } catch (e) {
      return false;
    }
  }
  async function jpegBytesFromCanvasOf(file) {
    const bmp = await createImageBitmap(file);
    const c = bitmapToCanvas(bmp, 1);
    const blob = await canvasToBlob(c, "image/jpeg", 0.92);
    if (bmp.close) bmp.close();
    freeCanvas(c);
    return blob.arrayBuffer();
  }
 
  async function imagesToPdf() {
    needLib("PDFLib");
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgress(i / selectedFiles.length);
      let img;
      if (file.type === "image/png") img = await pdfDoc.embedPng(await file.arrayBuffer());
      else if (file.type === "image/jpeg" && !(await needsReencode(file))) img = await pdfDoc.embedJpg(await file.arrayBuffer());
      else img = await pdfDoc.embedJpg(await jpegBytesFromCanvasOf(file));
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    download(await pdfDoc.save(), "EasyConvert_Images.pdf", "application/pdf");
  }
 
  async function pdfToImages(file) {
    const pdf = await loadPdfJs(file);
    const results = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      setPageStatus(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const c = await renderPageToCanvas(page, 2);
      results.push({ name: "Page_" + i + ".jpg", data: await canvasToBlob(c, "image/jpeg", 0.92), type: "image/jpeg" });
      freeCanvas(c);
      if (page.cleanup) page.cleanup();
    }
    await deliver(results, baseName(file.name) + "_pages.zip");
  }
 
  async function mergePdfs() {
    needLib("PDFLib");
    const merged = await PDFLib.PDFDocument.create();
    for (let i = 0; i < selectedFiles.length; i++) {
      setProgress(i / selectedFiles.length);
      const src = await PDFLib.PDFDocument.load(await selectedFiles[i].arrayBuffer());
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    download(await merged.save(), "EasyConvert_Merged.pdf", "application/pdf");
  }
 
  async function splitPdf(file) {
    needLib("PDFLib");
    const src = await PDFLib.PDFDocument.load(await file.arrayBuffer());
    const indices = parseRanges($("page-range").value || "1", src.getPageCount());
    const out = await PDFLib.PDFDocument.create();
    (await out.copyPages(src, indices)).forEach((p) => out.addPage(p));
    download(await out.save(), baseName(file.name) + "_pages.pdf", "application/pdf");
  }
 
  async function compressPdf(file) {
    needLib("PDFLib");
    const level = $("compress-level").value;
    let bytes;
    if (level === "light") {
      const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer());
      bytes = await doc.save({ useObjectStreams: true });
    } else {
      bytes = await rasterizePdf(file, level === "strong" ? { scale: 1.0, quality: 0.5 } : { scale: 1.5, quality: 0.7 });
    }
    if (bytes.length >= file.size) {
      $("file-status").textContent = fmt(t("compress_no_gain"), { from: fmtSize(file.size), to: fmtSize(bytes.length) });
      return false;
    }
    download(bytes, baseName(file.name) + "_compressed.pdf", "application/pdf");
    return { message: fmt(t("shrink_ok"), { from: fmtSize(file.size), to: fmtSize(bytes.length) }) };
  }
 
  function readTargetBytes() {
    const v = parseFloat($("target-size").value);
    const bytes = v * ($("target-unit").value === "mb" ? 1048576 : 1024);
    if (!(v > 0) || bytes < 10 * 1024) throw new Error(t("invalid_size"));
    return Math.round(bytes);
  }
 
  async function shrinkImage(file, target) {
    const bmp = await createImageBitmap(file);
    const encode = async (scale, q) => {
      const c = bitmapToCanvas(bmp, scale);
      const blob = await canvasToBlob(c, "image/jpeg", q);
      freeCanvas(c);
      return { size: blob.size, data: blob };
    };
    const res = await searchToTarget(encode, target);
    if (bmp.close) bmp.close();
    return res;
  }
 
  async function shrinkPdf(file, target) {
    const combos = [[1.6, 0.75], [1.3, 0.6], [1.0, 0.5], [0.8, 0.4], [0.65, 0.32]];
    let best = null;
    for (let i = 0; i < combos.length; i++) {
      const bytes = await rasterizePdf(file, { scale: combos[i][0], quality: combos[i][1], round: i + 1 });
      const r = { size: bytes.length, data: bytes };
      if (!best || r.size < best.size) best = r;
      if (r.size <= target) return { ...r, ok: true };
    }
    return { ...best, ok: false };
  }
 
  async function shrinkFiles() {
    const target = readTargetBytes();
    const results = [];
    let allOk = true;
    let first = null;
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgress(i / selectedFiles.length);
      let r;
      if (file.size <= target) {
        r = { size: file.size, data: file, ok: true, keep: true };
      } else if (fileKind(file) === "image") {
        r = await shrinkImage(file, target);
      } else {
        r = await shrinkPdf(file, target);
      }
      if (!r.ok) allOk = false;
      if (!first) first = { from: file.size, to: r.size };
      const isPdf = fileKind(file) === "pdf";
      results.push({
        name: r.keep ? file.name : baseName(file.name) + "_" + (isPdf ? "small.pdf" : "small.jpg"),
        data: r.data,
        type: isPdf ? "application/pdf" : "image/jpeg",
      });
    }
    await deliver(results, "EasyConvert_shrunk.zip");
    if (!allOk) return { message: fmt(t("shrink_fail"), { to: fmtSize(first.to) }) };
    if (results.length === 1) return { message: fmt(t("shrink_ok"), { from: fmtSize(first.from), to: fmtSize(first.to) }) };
    return { message: doneText() + " " + t("zip_note") };
  }
 
  async function watermarkFiles() {
    await ensureFont();
    const mark = { text: $("wm-text").value, opacity: parseInt($("wm-opacity").value, 10) / 100 };
    const results = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgress(i / selectedFiles.length);
      if (fileKind(file) === "image") {
        const bmp = await createImageBitmap(file);
        const c = bitmapToCanvas(bmp, 1);
        drawWatermark(c.getContext("2d"), c.width, c.height, mark.text, mark.opacity);
        const png = file.type === "image/png";
        results.push({
          name: baseName(file.name) + "_watermark" + (png ? ".png" : ".jpg"),
          data: await canvasToBlob(c, png ? "image/png" : "image/jpeg", 0.92),
          type: png ? "image/png" : "image/jpeg",
        });
        if (bmp.close) bmp.close();
        freeCanvas(c);
      } else {
        const bytes = await rasterizePdf(file, { scale: 2, quality: 0.9, mark });
        results.push({ name: baseName(file.name) + "_watermark.pdf", data: bytes, type: "application/pdf" });
      }
    }
    await deliver(results, "EasyConvert_watermark.zip");
  }
 
  async function extractPageTexts(file) {
    const pdf = await loadPdfJs(file);
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      setPageStatus(i, pdf.numPages);
      pages.push((await (await pdf.getPage(i)).getTextContent()).items);
    }
    return pages;
  }
 
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
      [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, cells]) => {
        cells.sort((a, b) => a.x - b.x);
        lines.push(cells.map((c) => quote(c.s)).join(","));
      });
    }
    download(new TextEncoder().encode("\uFEFF" + lines.join("\r\n")), baseName(file.name) + "_EasyConvert.csv", "text/csv;charset=utf-8");
  }
 
  async function runTool(tool) {
    const file = selectedFiles[0];
    const plugin = EC.tools[tool];
    if (plugin && plugin.run) return plugin.run(selectedFiles.slice());
    switch (tool) {
      case "img2pdf": return imagesToPdf();
      case "pdf2img": return pdfToImages(file);
      case "merge": return mergePdfs();
      case "split": return splitPdf(file);
      case "compress": return compressPdf(file);
      case "shrink": return shrinkFiles();
      case "watermark": return watermarkFiles();
      case "pdf2excel": return pdfToExcel(file);
    }
  }
 
  /* ============ สั่งประมวลผล + ใบรับรอง ============ */
  function countDataRequests() {
    // นับคำขอส่งข้อมูล (fetch/XHR/beacon) จากบันทึกของเบราว์เซอร์เอง ไม่ใช่ตัวนับของโค้ดเรา
    try {
      return performance.getEntriesByType("resource").filter((e) => ["fetch", "xmlhttprequest", "beacon"].indexOf(e.initiatorType) >= 0).length;
    } catch (e) {
      return 0;
    }
  }
  function showReceipt(nFiles, seconds, netDiff) {
    $("rc-files").textContent = fmt(t("receipt_files_val"), { n: nFiles });
    $("rc-time").textContent = fmt(t("receipt_time_val"), { s: seconds });
    $("rc-net").textContent = String(netDiff);
    $("rc-note").textContent = netDiff === 0 ? t("receipt_ok_note") : t("receipt_warn_note");
    $("receipt").className = "receipt" + (netDiff === 0 ? "" : " warn");
    $("receipt").hidden = false;
  }
 
  async function executeFileProcessing() {
    if (busy) return;
    if (!selectedFiles.length) {
      alert(t("alert_select_file"));
      return;
    }
    const totalMB = selectedFiles.reduce((s, f) => s + f.size, 0) / 1048576;
    const reason = gateReason(totalMB);
    if (reason) {
      openGateModal(reason);
      return;
    }
 
    busy = true;
    hideSaveLink();
    const btn = $("process-btn");
    btn.disabled = true;
    $("receipt").hidden = true;
    setProgress(0);
    $("file-status").textContent = t("status_processing");
    const t0 = performance.now();
    const netBefore = countDataRequests();
    try {
      const res = await runTool(activeTool);
      if (res !== false) {
        if (!isPremiumUser) trialConsume(activeTool);
        $("file-status").textContent = (res && res.message) || doneText();
        const seconds = ((performance.now() - t0) / 1000).toFixed(1);
        showReceipt(selectedFiles.length, seconds, Math.max(0, countDataRequests() - netBefore));
      }
    } catch (err) {
      alert(t("status_error") + friendlyError(err));
      $("file-status").textContent = t("status_error_label");
    } finally {
      busy = false;
      btn.disabled = false;
      $("progress").hidden = true;
      updateTrialInfo();
    }
  }
 
  /* ============ Modal ============ */
  function openGateModal(mode) {
    const key = mode === "size" ? "modal_desc_size" : mode === "trial" ? "modal_desc_trial" : "modal_desc_upgrade";
    $("modal-desc").textContent = t(key);
    $("gate-modal").style.display = "flex";
  }
  function closeGateModal() { $("gate-modal").style.display = "none"; }
 
  /* ============ เริ่มทำงาน ============ */
  document.addEventListener("DOMContentLoaded", function () {
    if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(2000);
    if (typeof pdfjsLib !== "undefined") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.js";
    }
    const savedLang = store.get("ec_lang");
    currentLang = savedLang === "en" ? "en" : "th";
 
    buildToolGrid();
    $("lang-toggle").addEventListener("change", (e) => changeLanguage(e.target.value));
    $("user-badge").addEventListener("click", () => { if (!isPremiumUser) openGateModal("upgrade"); });
    $("close-modal-btn").addEventListener("click", closeGateModal);
    $("restore-btn").addEventListener("click", openRestoreModal);
    $("restore-submit-btn").addEventListener("click", submitRestore);
    $("restore-cancel-btn").addEventListener("click", closeRestoreModal);
    $("process-btn").addEventListener("click", executeFileProcessing);
    $("wm-text").addEventListener("input", () => { wmTouched = true; });
    $("wm-opacity").addEventListener("input", () => { $("wm-opacity-val").textContent = $("wm-opacity").value + "%"; });
    $("wm-opacity-val").textContent = $("wm-opacity").value + "%";
 
    document.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("[data-plan]") : null;
      if (btn) startCheckout(btn.getAttribute("data-plan"));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeGateModal(); closeRestoreModal(); }
    });
    ["gate-modal", "restore-modal"].forEach((id) => {
      $(id).addEventListener("click", (e) => { if (e.target === $(id)) { closeGateModal(); closeRestoreModal(); } });
    });
    // กลับมาที่แท็บหลังจ่ายเงิน (เช่น จ่ายผ่านแอปธนาคารแล้วสลับกลับ) ให้ตรวจสิทธิ์ทันที
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && store.get(PENDING_KEY) && !isPremiumUser) claimPaidSession();
    });
    window.addEventListener("pageshow", (e) => { if (e.persisted) checkingOut = false; });
 
    const input = $("file-input");
    const drop = $("drop-area"); // INPUT_NATIVE_PICKER: label ผูกกับ input เปิดตัวเลือกไฟล์เอง
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.click(); } }); // คีย์บอร์ด: Enter เปิดตัวเลือกไฟล์ (Space เบราว์เซอร์ทำให้เอง)
    input.addEventListener("change", (e) => { setFiles(e.target.files); input.value = ""; });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); setFiles(e.dataTransfer.files); });
 
    checkEnvironment();
    selectTool("img2pdf");
    changeLanguage(currentLang);
    verifyPremium().then(claimPaidSession);
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  });
 
  Object.assign(EC, {
    $, t, fmt, store, fmtSize, baseName, download, needLib, newCanvas, canvasToBlob, freeCanvas,
    loadPdfJs, renderPageToCanvas, setProgress, setPageStatus, ensureFont, friendlyError,
    getLang: () => currentLang, FONT, MAX_AREA,
  });
 
  // ตะขอสำหรับทดสอบอัตโนมัติ (ไม่ทำงานในเว็บจริงเว้นแต่ตั้งค่า __EC_TEST__ เอง)
  if (typeof window !== "undefined" && window.__EC_TEST__) {
    window.__EC_TEST__.api = { searchToTarget, parseRanges, drawWatermark, formatRemaining, trialLeft, trialConsume, gateReason, startCheckout, selectTool, setFiles, executeFileProcessing, fmtSize };
  }
})();
 