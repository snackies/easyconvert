/* สลับโหมดมืด/สว่าง: ค่าเริ่มต้นตามระบบของเครื่อง เมื่อกดสลับจะจำไว้ในเครื่องนี้เท่านั้น */
(function () {
  var KEY = "ec-theme", root = document.documentElement;
  function get() { try { var v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; } catch (e) { return null; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function systemDark() { return !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches); }
  function effective() { return get() || (systemDark() ? "dark" : "light"); }
  function apply() {
    var v = get();
    if (v) root.setAttribute("data-theme", v); else root.removeAttribute("data-theme");
    var dark = effective() === "dark";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0e131b" : "#2340b8");
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = dark ? "\u2600\uFE0F" : "\uD83C\uDF19";
      var label = dark ? "เปลี่ยนเป็นโหมดสว่าง / Switch to light mode" : "เปลี่ยนเป็นโหมดมืด / Switch to dark mode";
      btn.setAttribute("aria-label", label); btn.setAttribute("title", label);
    }
  }
  apply(); // รันตอนอยู่ใน <head> ก่อนเนื้อหาถูกวาด
  document.addEventListener("DOMContentLoaded", function () {
    apply();
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", function () { put(effective() === "dark" ? "light" : "dark"); apply(); });
  });
  if (window.matchMedia) {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () { if (!get()) apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
  }
})();
