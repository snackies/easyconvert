/* ตัวนับการเข้าชมหน้าเว็บ (Vercel Web Analytics)
   โหลดจากโดเมนของเราเอง (/_vercel/insights/) ไม่ใช้คุกกี้ ไม่ส่งไฟล์ ชื่อไฟล์ หรือสิ่งที่พิมพ์ในเครื่องมือ
   ไม่ทำงานเมื่อ: (1) เปิดจากเครื่องตัวเอง (localhost) (2) เบราว์เซอร์ส่งสัญญาณ Do Not Track / Global Privacy Control
   (3) ผู้ใช้กดปิดเองในหน้า privacy.html (เก็บ ec_nostats=1 ไว้ในเบราว์เซอร์นั้น)
   คำอธิบายสำหรับผู้ใช้อยู่ที่ privacy.html หัวข้อ "การนับสถิติการเข้าชม" — ถ้าแก้ไฟล์นี้ ต้องแก้หน้านั้นให้ตรงด้วย */
(function () {
  "use strict";
  var KEY = "ec_nostats";
  var SRC = "/_vercel/insights/script.js";

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {} }
  function signal() {
    var n = navigator;
    return n.doNotTrack === "1" || window.doNotTrack === "1" || n.msDoNotTrack === "1" || n.globalPrivacyControl === true;
  }
  function onLocal() {
    var h = location.hostname;
    return location.protocol === "file:" || !h || h === "localhost" || h === "[::1]" || /^127\./.test(h) || /\.local$/.test(h);
  }
  var forced = !!(window.__EC_TEST__ && window.__EC_TEST__.analytics); // ใช้ในเทสต์อัตโนมัติเท่านั้น
  // เหตุผลที่ไม่นับ (ว่าง = นับ)
  function reason() {
    if (get() === "1") return "optout";
    if (signal()) return "signal";
    if (onLocal() && !forced) return "local";
    return "";
  }

  function load() {
    if (reason() || document.getElementById("ec-insights")) return;
    var s = document.createElement("script");
    s.id = "ec-insights";
    s.defer = true;
    s.src = SRC;
    s.onerror = function () {}; // ยังไม่เปิด Analytics ใน Vercel = ไม่พบสคริปต์ ไม่กระทบการใช้งาน
    document.head.appendChild(s);
  }
  // รอให้หน้าโหลดเสร็จก่อนเล็กน้อย ไม่แย่งทรัพยากรจากเครื่องมือ
  function start() { setTimeout(load, 1500); }
  if (document.readyState === "complete") start(); else window.addEventListener("load", start);

  // ปุ่มปิด/เปิดในหน้า privacy.html
  function wire() {
    var btn = document.getElementById("stats-toggle"), state = document.getElementById("stats-state");
    if (!btn || !state) return;
    function paint() {
      var off = get() === "1", r = reason();
      btn.textContent = off ? "เปิดการนับสถิติอีกครั้ง" : "ปิดการนับสถิติบนเบราว์เซอร์นี้";
      state.textContent = off ? "ตอนนี้: ปิด (ตามที่คุณเลือก)"
        : r === "signal" ? "ตอนนี้: ปิดอัตโนมัติ เพราะเบราว์เซอร์ส่งสัญญาณ Do Not Track หรือ Global Privacy Control"
        : r === "local" ? "ตอนนี้: ปิด (เปิดเว็บจากเครื่องตัวเอง)"
        : "ตอนนี้: เปิด";
    }
    btn.addEventListener("click", function () { set(get() === "1" ? "" : "1"); paint(); });
    paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
