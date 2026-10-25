# EasyConvert

เครื่องมือแปลงไฟล์ PDF/รูปภาพ ประมวลผลในเบราว์เซอร์ทั้งหมด + ระบบพรีเมียมผ่าน Stripe

## โครงสร้าง
- `public/` เว็บหน้าบ้าน (static)
- `api/` Vercel Serverless Functions: geo, create-checkout, claim, verify
- `lib/token.js` เซ็น/ตรวจ token (HMAC-SHA256)

## Deploy บน Vercel
1. push โฟลเดอร์นี้ขึ้น GitHub แล้ว Import ที่ vercel.com/new (Framework: Other, ไม่ต้องมี build command)
2. Settings > Environment Variables ใส่
   - `STRIPE_SECRET_KEY` (เริ่มด้วย sk_test_ ก่อน)
   - `TOKEN_SECRET` (สุ่มด้วย `openssl rand -hex 32`)
3. Stripe Dashboard > Settings > Payment methods เปิดบัตร และ PromptPay (สำหรับ THB)
4. Redeploy แล้วทดสอบด้วยบัตรทดสอบ 4242 4242 4242 4242 ก่อนเปลี่ยนเป็น sk_live_

รันในเครื่อง: `npx vercel dev`
