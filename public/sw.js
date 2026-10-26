/* Service worker: เก็บไฟล์ของเว็บไว้ในเครื่อง เพื่อใช้งานได้แม้ไม่มีอินเทอร์เน็ต
   (และเป็นวิธีพิสูจน์ว่าการประมวลผลไม่ต้องส่งไฟล์ออกไป: เปิดโหมดเครื่องบินแล้วลองใช้ได้)
   ไม่แตะ /api/ เลย: เรียกเซิร์ฟเวอร์ตรง ๆ เสมอ */
const CACHE = "ec-v18";
const CORE = [
  "./", "index.html", "styles.css", "app.js", "esign.js", "docx.js", "translations.js", "ocr.js", "theme.js",
  "vendor/pdf-lib.min.js", "vendor/pdf.js", "vendor/pdf.worker.js", "vendor/jszip.min.js",
  "vendor/fonts/plex-thai-Regular.woff", "vendor/fonts/plex-thai-Medium.woff",
  "vendor/fonts/plex-thai-SemiBold.woff", "vendor/fonts/plex-thai-Bold.woff",
  "vendor/fonts/sriracha-Regular.woff", "vendor/fonts/charmonman-Bold.woff",
  "privacy.html", "terms.html",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // เครือข่ายก่อน (ได้เวอร์ชันใหม่เสมอเมื่อออนไลน์) ไม่มีเน็ตค่อยใช้ที่เก็บไว้
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
