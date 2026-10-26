/* คู่มือ: ปุ่มสลับภาษา TH/EN จำภาษาเดียวกับหน้าหลัก (ec_lang) และคงตำแหน่ง #หัวข้อไว้ */
(function () {
  var link = document.getElementById("lang-switch");
  if (!link) return;
  var here = document.documentElement.lang === "en" ? "en" : "th";
  var saved = null;
  try { saved = localStorage.getItem("ec_lang"); } catch (e) {}
  if ((saved === "th" || saved === "en") && saved !== here) {
    location.replace((saved === "en" ? "guide-en.html" : "guide.html") + location.search + location.hash);
    return;
  }
  function sync() { link.setAttribute("href", link.getAttribute("href").split("#")[0] + location.hash); }
  sync();
  window.addEventListener("hashchange", sync);
  link.addEventListener("click", function () {
    try { localStorage.setItem("ec_lang", link.getAttribute("data-lang")); } catch (e) {}
  });
})();
