// จำกัดจำนวนคำขอต่อ IP แบบ best-effort
// เก็บในหน่วยความจำของ serverless instance จึงรีเซ็ตเมื่อ instance ใหม่ ไม่ใช่การป้องกันเต็มรูปแบบ
// ให้ตั้งกฎ Rate Limiting ใน Vercel Firewall เสริมด้วย (ดู README)
const buckets = new Map();

function clientIp(req) {
  const h = req.headers || {};
  const v = h["x-vercel-forwarded-for"] || h["x-real-ip"] || h["x-forwarded-for"] || "";
  return String(v).split(",")[0].trim().slice(0, 64) || "unknown";
}

// คืน true เมื่อเกินโควตา (นับคำขอนี้แล้ว)
function limited(req, name, max, windowMs) {
  const now = Date.now();
  if (buckets.size > 5000) buckets.clear();
  const key = name + ":" + clientIp(req);
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length > max;
}

module.exports = { limited, clientIp };
