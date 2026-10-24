const { verify, readBody } = require("../lib/token");
 
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ premium: false });
  try {
    const { token } = readBody(req);
    const payload = verify(token);
    return res.status(200).json(payload ? { premium: true, exp: payload.exp } : { premium: false });
  } catch (e) {
    console.error("verify failed:", e.message);
    return res.status(500).json({ premium: false, error: "server_error" });
  }
}
