// เซิร์ฟเวอร์ทดสอบ: เสิร์ฟ public/ พร้อมส่วนหัวความปลอดภัยชุดเดียวกับ vercel.json
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "public");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
const base = {}; cfg.headers[0].headers.forEach(h => base[h.key] = h.value);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".pfb": "application/octet-stream", ".bcmap": "application/octet-stream", ".ttf": "font/ttf", ".xml": "application/xml", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
module.exports = function start(port, apiHandler) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    if (u.startsWith("/api/")) return apiHandler ? apiHandler(req, res) : (res.writeHead(404, { "content-type": "application/json" }), res.end("{}"));
    let f = path.join(ROOT, u === "/" ? "index.html" : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, base); return res.end("nf"); }
    res.writeHead(200, { ...base, "content-type": types[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
};
