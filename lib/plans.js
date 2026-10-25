// แพ็กเกจและราคา (หน่วย amount = สตางค์) แก้ราคาที่นี่ที่เดียว
// ถ้าเปลี่ยนราคา ให้แก้ตัวเลขใน public/app.js (PRICES) ให้ตรงกันด้วย
//
// legacy: true = ไม่เปิดขายแล้ว แต่ต้องเก็บไว้ เพื่อให้ใบเสร็จเก่าที่เคยซื้อไว้
// ยังกู้คืนสิทธิ์ได้ถูกจำนวนวัน (claim.js อ่านจำนวนวันจากตารางนี้)
const PLANS = {
  day: { days: 1, amount: 1500, label: "1 day", legacy: true }, // 15 บาท (เลิกขาย แต่เก็บไว้ให้ใบเสร็จเก่ากู้คืนได้)
  week: { days: 7, amount: 1900, label: "7 days" }, // 19 บาท
  month: { days: 30, amount: 2900, label: "30 days" }, // 29 บาท
  year: { days: 365, amount: 19900, label: "365 days" }, // 199 บาท
};

module.exports = { PLANS };
