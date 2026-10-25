const crypto = require("crypto");

let warned = false;
function secret() {
  const s = process.env.TOKEN_SECRET;
  if (!s || s.length < 16) throw new Error("TOKEN_SECRET is not configured");
  if (s.length < 32 && !warned) {
    warned = true;
    console.warn("TOKEN_SECRET สั้นกว่า 32 ตัวอักษร แนะนำให้ใช้ค่าสุ่มยาวอย่างน้อย 32 ตัว");
  }
  return s;
}

function hmac(body) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + hmac(body);
}

function verify(token) {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload || typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body) || {}; } catch (e) { return {}; }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}

module.exports = { sign, verify, readBody };
