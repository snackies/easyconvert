// แพ็กเกจและราคา (หน่วย amount = สตางค์) แก้ราคาที่นี่ที่เดียว
// ถ้าเปลี่ยนราคา ให้แก้ตัวเลขใน public/app.js (PRICES) ให้ตรงกันด้วย
const PLANS = {
  day: { days: 1, amount: 1500, label: "1 day" }, // 15 บาท
  month: { days: 30, amount: 2900, label: "30 days" }, // 29 บาท
  year: { days: 365, amount: 19900, label: "365 days" }, // 199 บาท
};

module.exports = { PLANS };
