// api/secure-verify.js
import crypto from 'crypto';

export default async function handler(req, res) {
    // กำหนดรหัสผ่านลับฝังลึกระดับ Server-Side ป้องกันแฮกเกอร์แกะรหัสจากหน้าบราวเซอร์
    const CRYPTO_SECRET = "@3asyC0vert_$ecret_20261024";
    
    if (req.method === 'POST') {
        try {
            const body = JSON.parse(req.body);
            if (!body.user || !body.hash) {
                return res.status(200).json({ premium: false });
            }
            
            // คำนวณลายเซ็นดิจิทัลที่ปลอดภัยบนฝั่งเซิร์ฟเวอร์
            const expectedHash = crypto.createHash('sha256').update(body.user + "_" + CRYPTO_SECRET).digest('base64');
            
            if (body.hash === expectedHash) {
                return res.status(200).json({ premium: true });
            }
        } catch (e) {}
    }
    return res.status(200).json({ premium: false });
}
