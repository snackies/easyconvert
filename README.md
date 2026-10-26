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

## หน้า SEO ต่อเครื่องมือ
 
หน้า `public/merge-pdf.html` และอีก 9 หน้า, `sitemap.xml`, `robots.txt` ถูก**สร้างอัตโนมัติ**จาก `public/index.html` กับ `scripts/seo-data.js`
- แก้ข้อความ SEO: แก้ `scripts/seo-data.js` แล้วรัน `node scripts/build-seo.js`
- แก้โครงหน้า `public/index.html`: รัน `node scripts/build-seo.js` ทุกครั้งเพื่อให้ทั้ง 10 หน้าตามทัน (`node scripts/build-seo.js --check` ใช้ตรวจ)
- เปลี่ยนโดเมน: `SITE_URL=https://โดเมน node scripts/build-seo.js`
- ห้ามแก้ด้วยมือในช่วงระหว่าง `seo:head`, `seo:content`, `seo:tools` (index.html) และ `seo:keys` (translations.js)

## ตัวนับการเข้าชม และการติดตั้งเป็นแอป
 
- ตัวนับ: `public/analytics.js` โหลด Vercel Web Analytics เฉพาะบนเว็บจริง (ไม่ทำงานบน localhost, เมื่อมี Do Not Track / Global Privacy Control, หรือผู้ใช้กดปิดในหน้า privacy.html) ต้องเปิด **Analytics → Enable** ในแดชบอร์ด Vercel ก่อนจึงจะมีข้อมูล ถ้าแก้ตัวนับ ต้องแก้หัวข้อ "การนับสถิติการเข้าชม" ใน privacy.html ให้ตรงด้วย
- แอป: `public/manifest.webmanifest` + ไอคอน `icon-*.png`, `apple-touch-icon.png` ถ้าติดตั้งแล้วมีปัญหา (เช่น บันทึกไฟล์บน iPad) ให้แก้ `"display": "standalone"` เป็น `"browser"`
