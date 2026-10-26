// ต่อวันเมื่อซื้อซ้ำ: รายการที่จ่ายแล้วทั้งหมดของผู้ซื้อคนเดียวกัน เรียงตามเวลาซื้อ
// แต่ละรายการเริ่มนับเมื่อ "ซื้อ" หรือเมื่อรายการก่อนหน้า "หมด" แล้วแต่อย่างใดช้ากว่า
//   เริ่ม = max(เวลาซื้อ, เวลาหมดของรายการก่อนหน้า)   หมด = เริ่ม + จำนวนวัน
// ผลลัพธ์ไม่ขึ้นกับลำดับที่ส่งเข้ามา และรายการเดียวกันซ้ำนับครั้งเดียว (กันโกงด้วยการกดกู้คืนซ้ำ)
function chain(items) {
  const seen = new Set();
  const list = [];
  for (const it of items) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    list.push(it);
  }
  list.sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let cursor = 0;
  const starts = {};
  for (const it of list) {
    const start = Math.max(it.created, cursor);
    starts[it.id] = start;
    cursor = start + it.days * 86400;
  }
  return { exp: Math.floor(cursor), starts };
}

module.exports = { chain };
