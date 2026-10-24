// ใช้ header ของ Vercel แทนการเรียก ipapi.co (ไม่ติด rate limit / CORS)
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ country: req.headers["x-vercel-ip-country"] || "TH" });
};
