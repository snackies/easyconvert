/* PDF -> Word (.docx จริง) ทำในเบราว์เซอร์ ไม่ใช้เซิร์ฟเวอร์
 *
 * ขั้นตอน
 *  1) ดึงข้อความและตำแหน่งจากแต่ละหน้าด้วย pdf.js (รวมการหมุนหน้า)
 *  2) จัดเป็นบรรทัด -> ย่อหน้า (รวมบรรทัดที่เป็นย่อหน้าเดียวกันอย่างระมัดระวัง) คงขนาด/ตัวหนา/ตัวเอียง
 *     ช่องว่างกว้างในบรรทัดเดียวกันกลายเป็นแท็บพร้อมตำแหน่งเดิม (ใกล้เคียงคอลัมน์)
 *  3) ดึงรูปจากรายการคำสั่งของหน้า (ติดตามเมทริกซ์ตำแหน่ง) แล้ววางตามลำดับบนลงล่าง
 *  4) ประกอบไฟล์ .docx (ZIP + XML) ด้วย JSZip โดยแต่ละหน้า PDF = 1 section ตามขนาดและขอบเดิม
 *
 * ข้อจำกัดที่ตั้งใจ: ไม่สร้างตารางจริง ไม่รองรับข้อความแนวตั้ง/เฉียง PDF สแกนต้องใช้ OCR
 */
(function () {
  "use strict";
  const EC = window.EC;
  if (!EC) return;
  const { t, fmt } = EC;

  const THAI = /[฀-๿]/;
  const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const MAX_IMG_EDGE = 2400; // พิกเซลด้านยาวสุดของรูปที่ฝัง

  /* ---------- XML ---------- */
  function cleanText(s) {
    let out = "";
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c >= 0xd800 && c <= 0xdfff) continue; // ตัวแทนที่ไม่เป็นคู่
      if (c === 0xfffe || c === 0xffff) continue;
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) continue;
      out += ch;
    }
    return out;
  }
  const esc = (s) => cleanText(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tw = (pt) => Math.round(pt * 20); // จุด -> twip

  // pdf.js บางไฟล์คืนตัวอักษรเป็น U+0000 เมื่อไฟล์ต้นฉบับไม่ได้ระบุว่าสัญลักษณ์นั้นคืออะไร (พบบ่อยกับวรรณยุกต์ไทยในบางโปรแกรมสร้าง PDF)
  // เราไม่เดา เพราะวรรณยุกต์ต่างกันความหมายต่างกัน จึงนับแล้วแจ้งผู้ใช้ให้ตรวจทาน
  function normalizeText(str) {
    const missing = (str.match(/\u0000/g) || []).length;
    // บางโปรแกรมแยกสระอำเป็น นิคหิต + สระอา ให้รวมกลับเป็นตัวเดียวเพื่อให้ค้นหา/พิมพ์ใน Word ถูกต้อง
    return { text: str.replace(/\u0000/g, "").replace(/\u0E4D\u0E32/g, "\u0E33"), missing };
  }

  /* ---------- เรขาคณิต ---------- */
  const mul = (m, n) => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];

  /* ---------- รูปภาพ ---------- */
  function getObj(page, id) {
    const store = id.indexOf("g_") === 0 ? page.commonObjs : page.objs;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 4000);
      try {
        store.get(id, (o) => { clearTimeout(timer); resolve(o); });
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  async function imageToJpeg(img) {
    if (!img || !img.width || !img.height) return null;
    let src;
    if (img.bitmap) {
      src = EC.newCanvas(img.width, img.height);
      src.getContext("2d").drawImage(img.bitmap, 0, 0);
    } else if (img.data) {
      const w = img.width, h = img.height;
      const out = new Uint8ClampedArray(w * h * 4);
      const d = img.data;
      if (img.kind === 3 && d.length >= w * h * 4) {
        out.set(d.subarray(0, w * h * 4));
      } else if (img.kind === 2 && d.length >= w * h * 3) {
        for (let i = 0, j = 0; i < w * h; i++, j += 4) {
          out[j] = d[i * 3]; out[j + 1] = d[i * 3 + 1]; out[j + 2] = d[i * 3 + 2]; out[j + 3] = 255;
        }
      } else if (img.kind === 1) {
        const rowBytes = (w + 7) >> 3;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const bit = (d[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
            const j = (y * w + x) * 4;
            out[j] = out[j + 1] = out[j + 2] = bit ? 255 : 0;
            out[j + 3] = 255;
          }
        }
      } else {
        return null;
      }
      src = EC.newCanvas(w, h);
      src.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
    } else {
      return null;
    }
    const s = Math.min(1, MAX_IMG_EDGE / Math.max(src.width, src.height));
    const dst = EC.newCanvas(src.width * s, src.height * s);
    const g = dst.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, dst.width, dst.height);
    g.drawImage(src, 0, 0, dst.width, dst.height);
    const blob = await EC.canvasToBlob(dst, "image/jpeg", 0.86);
    EC.freeCanvas(src);
    EC.freeCanvas(dst);
    return new Uint8Array(await blob.arrayBuffer());
  }

  /* ---------- ดึงข้อมูลหน้า ---------- */
  function fontFlags(page, names) {
    const map = {};
    names.forEach((name) => {
      let n = "", bold = false, italic = false;
      try {
        const f = page.commonObjs.get(name);
        n = (f && f.name) || "";
        bold = !!(f && f.bold);
        italic = !!(f && f.italic);
      } catch (e) {}
      map[name] = {
        bold: bold || /bold|black|heavy|semibold|demi/i.test(n),
        italic: italic || /italic|oblique/i.test(n),
      };
    });
    return map;
  }

  // ดึงบรรทัดข้อความตามลำดับในไฟล์ (ลำดับในไฟล์ปกติคือลำดับการอ่าน และไม่สลับตัวสระ/วรรณยุกต์ไทย)
  function buildLines(items, vp, flags) {
    const lines = [];
    let cur = null;
    let unmapped = 0;
    for (const it of items) {
      if (typeof it.str !== "string" || !it.str.length) continue;
      const norm = normalizeText(it.str);
      unmapped += norm.missing;
      if (!norm.text.length) continue;
      const m = mul(it.transform, vp.transform);
      const size = Math.hypot(m[0], m[1]);
      if (!(size > 0.5) || Math.abs(m[1]) > Math.abs(m[0])) continue; // ข้ามข้อความแนวตั้ง/เฉียง
      const part = {
        x: m[4], w: it.width || 0, text: norm.text, size,
        bold: !!(flags[it.fontName] && flags[it.fontName].bold),
        italic: !!(flags[it.fontName] && flags[it.fontName].italic),
      };
      if (cur && Math.abs(m[5] - cur.y) <= Math.max(2, 0.5 * Math.min(size, cur.size))) {
        cur.parts.push(part);
        if (part.text.trim() && size > cur.size) cur.size = size;
      } else {
        cur = { y: m[5], size, parts: [part] };
        lines.push(cur);
      }
    }
    const out = [];
    for (const ln of lines) {
      const segs = []; // กลุ่มข้อความที่คั่นด้วยช่องว่างกว้าง (แท็บ)
      let seg = null, prevEnd = null, prevText = "";
      for (const p of ln.parts) {
        const gap = prevEnd == null ? 0 : p.x - prevEnd;
        if (!seg || gap > 1.0 * ln.size) {
          if (seg && !seg.runs.length) segs.pop();
          seg = { x: p.x, runs: [] };
          segs.push(seg);
          prevText = "";
        } else if (gap > 0.22 * ln.size && !/\s$/.test(prevText) && !/^\s/.test(p.text)) {
          pushRun(seg.runs, { text: " ", size: p.size, bold: p.bold, italic: p.italic });
          prevText = " ";
        }
        pushRun(seg.runs, { text: p.text, size: p.size, bold: p.bold, italic: p.italic });
        prevText = p.text;
        prevEnd = p.x + p.w;
      }
      const real = segs.filter((s) => s.runs.some((r) => r.text.trim()));
      if (!real.length) continue;
      // ตัดช่องว่างหัวท้ายบรรทัด
      real.forEach((s) => {
        s.runs[0].text = s.runs[0].text.replace(/^\s+/, "");
        const last = s.runs[s.runs.length - 1];
        last.text = last.text.replace(/\s+$/, "");
      });
      const first = real[0];
      const lastSeg = real[real.length - 1];
      const lastPart = ln.parts[ln.parts.length - 1];
      let chars = 0, dom = null;
      real.forEach((s) => s.runs.forEach((r) => { chars += r.text.length; if (!dom || r.text.length > dom.text.length) dom = r; }));
      out.push({
        y: ln.y, size: dom ? dom.size : ln.size, left: first.x, right: lastPart.x + lastPart.w,
        segs: real, hasTab: real.length > 1, chars, bold: real.every((s) => s.runs.every((r) => r.bold || !r.text.trim())),
        lastSegStart: lastSeg.x,
      });
    }
    out.unmapped = unmapped;
    return out;
  }

  function pushRun(runs, r) {
    const last = runs[runs.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic && Math.abs(last.size - r.size) < 0.6) last.text += r.text;
    else runs.push({ text: r.text, size: r.size, bold: r.bold, italic: r.italic });
  }

  async function extractImages(page, vp, opList) {
    const OPS = pdfjsLib.OPS;
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const found = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i], args = opList.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(args, ctm);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (args && args[0]) ctm = mul(args[0], ctm); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || (OPS.paintJpegXObject && fn === OPS.paintJpegXObject)) {
        const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) =>
          vp.convertToViewportPoint(u * ctm[0] + v * ctm[2] + ctm[4], u * ctm[1] + v * ctm[3] + ctm[5])
        );
        const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
        const left = Math.min(...xs), top = Math.min(...ys);
        found.push({ fn, ref: args[0], left, top, w: Math.max(...xs) - left, h: Math.max(...ys) - top });
      }
    }
    return found;
  }

  async function extractPage(pdfjs, pageNum, imgCache) {
    const page = await pdfjs.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const opList = await page.getOperatorList();
    const flags = fontFlags(page, [...new Set(tc.items.map((i) => i.fontName).filter(Boolean))]);
    const lines = buildLines(tc.items, vp, flags);
    const textChars = lines.reduce((n, l) => n + l.chars, 0);

    const pageArea = vp.width * vp.height;
    const imgs = [];
    let skippedFull = false;
    for (const f of await extractImages(page, vp, opList)) {
      if (f.w < 12 || f.h < 12 || f.w * f.h < 400) continue;
      if (textChars >= 20 && f.w * f.h >= 0.85 * pageArea) { skippedFull = true; continue; } // ภาพพื้นหลัง/ชั้นภาพของ PDF ที่มีข้อความจริง
      const key = pageNum + ":" + (typeof f.ref === "string" ? f.ref : "inline" + imgs.length);
      let bytes = imgCache.get(key);
      if (!bytes) {
        const obj = typeof f.ref === "string" ? await getObj(page, f.ref) : f.ref;
        bytes = await imageToJpeg(obj);
        if (bytes) imgCache.set(key, bytes);
      }
      if (bytes) imgs.push({ top: f.top, left: f.left, w: f.w, h: f.h, bytes });
    }
    imgs.sort((a, b) => a.top - b.top);
    if (page.cleanup) page.cleanup();
    // ตัวอักษรที่ถูกแปลงเป็นเส้นวาด (เช่น ฟอร์มที่บันทึกจาก iPhone/iPad) ไม่มีข้อความให้ดึง นับคำสั่งระบายสีเส้นเพื่อตรวจ
    let fills = 0;
    for (const fn of opList.fnArray) if (fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.eoFill || fn === pdfjsLib.OPS.fillStroke || fn === pdfjsLib.OPS.eoFillStroke) fills++;
    return { w: vp.width, h: vp.height, lines, imgs, textChars, unmapped: lines.unmapped || 0, flat: textChars < 200 && (skippedFull || fills >= 150) };
  }

  /* ---------- จัดย่อหน้า ---------- */
  function groupParagraphs(lines, minLeft, maxRight) {
    const contentW = Math.max(40, maxRight - minLeft);
    const paras = [];
    let cur = null, prev = null;
    for (const ln of lines) {
      const pitch = prev ? ln.y - prev.y : 0;
      const cont =
        prev && !prev.hasTab && !ln.hasTab &&
        Math.abs(prev.size - ln.size) < 1 && prev.bold === ln.bold &&
        pitch > 0 && pitch < 1.75 * prev.size &&
        prev.right >= maxRight - 0.12 * contentW &&
        ln.left <= minLeft + 0.2 * contentW &&
        Math.abs(ln.left - minLeft) < 0.2 * contentW;
      if (cont) {
        const lastRun = lastRunOf(cur);
        const lastCh = lastRun ? lastRun.text.slice(-1) : "";
        const firstCh = ln.segs[0].runs[0].text.charAt(0);
        const needSpace = lastCh && !/\s/.test(lastCh) && !THAI.test(lastCh) && !THAI.test(firstCh);
        if (needSpace) pushRun(cur.runs, { text: " ", size: ln.size, bold: false, italic: false });
        ln.segs[0].runs.forEach((r) => pushRun(cur.runs, r));
        cur.lines.push(ln);
        cur.right = Math.max(cur.right, ln.right);
      } else {
        cur = { runs: [], lines: [ln], segs: ln.hasTab ? ln.segs : null, left: ln.left, right: ln.right, size: ln.size };
        if (!ln.hasTab) ln.segs[0].runs.forEach((r) => pushRun(cur.runs, r));
        paras.push(cur);
      }
      prev = ln;
    }
    return paras;
  }
  const lastRunOf = (p) => p.runs[p.runs.length - 1];

  /* ---------- XML ของ docx ---------- */
  function runXml(r) {
    const sz = Math.max(2, Math.round(r.size * 2));
    const rpr = "<w:rPr>" + (r.bold ? "<w:b/><w:bCs/>" : "") + (r.italic ? "<w:i/><w:iCs/>" : "") +
      '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr>';
    return "<w:r>" + rpr + '<w:t xml:space="preserve">' + esc(r.text) + "</w:t></w:r>";
  }

  function sectXml(pg) {
    return "<w:sectPr>" +
      '<w:pgSz w:w="' + tw(pg.w) + '" w:h="' + tw(pg.h) + '"' + (pg.w > pg.h ? ' w:orient="landscape"' : "") + "/>" +
      '<w:pgMar w:top="' + tw(pg.T) + '" w:right="' + tw(pg.R) + '" w:bottom="' + tw(pg.B) + '" w:left="' + tw(pg.L) +
      '" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  }

  function paraXml(p, o) {
    // o: before, line, indLeft, indFirst, jc, tabs[], sect
    let ppr = "";
    if (o.tabs && o.tabs.length) ppr += "<w:tabs>" + o.tabs.map((x) => '<w:tab w:val="left" w:pos="' + x + '"/>').join("") + "</w:tabs>";
    ppr += '<w:spacing w:before="' + o.before + '" w:after="0" w:line="' + o.line + '" w:lineRule="atLeast"/>';
    if (o.indLeft || o.indFirst) {
      ppr += '<w:ind w:left="' + Math.max(0, o.indLeft) + '"' +
        (o.indFirst > 0 ? ' w:firstLine="' + o.indFirst + '"' : o.indFirst < 0 ? ' w:hanging="' + -o.indFirst + '"' : "") + "/>";
    }
    if (o.jc) ppr += '<w:jc w:val="' + o.jc + '"/>';
    if (o.sect) ppr += o.sect;
    return "<w:p><w:pPr>" + ppr + "</w:pPr>" + p + "</w:p>";
  }

  function imageRunXml(rid, id, cx, cy) {
    return "<w:r><w:drawing>" +
      '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + id + '" name="Picture ' + id + '"/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="image' + id + '.jpg"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>";
  }

  const emu = (pt) => Math.max(1, Math.round(pt * 12700));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // แปลงโมเดลทุกหน้าเป็นไฟล์ docx (คืน Blob) และนับจำนวนรูป
  async function buildDocx(pages) {
    const zip = new JSZip();
    const rels = [];
    let imgNo = 0;
    let body = "";

    pages.forEach((pg, pi) => {
      const lines = pg.lines;
      const imgL = pg.imgs.length ? Math.min(...pg.imgs.map((i) => i.left)) : Infinity;
      const imgR = pg.imgs.length ? Math.max(...pg.imgs.map((i) => i.left + i.w)) : -Infinity;
      const minLeft = Math.min(lines.length ? Math.min(...lines.map((l) => l.left)) : 36, imgL);
      const maxRight = Math.max(lines.length ? Math.max(...lines.map((l) => l.right)) : pg.w - 36, imgR);
      const firstTop = Math.min(
        lines.length ? lines[0].y - 0.9 * lines[0].size : pg.h,
        pg.imgs.length ? pg.imgs[0].top : pg.h
      );
      pg.L = clamp(minLeft, 18, pg.w * 0.4);
      pg.R = clamp(pg.w - maxRight, 18, pg.w * 0.4);
      pg.T = clamp(firstTop - 2, 18, 110);
      pg.B = 36;
      const contentW = pg.w - pg.L - pg.R;
      const contentH = pg.h - pg.T - pg.B;
      const paras = groupParagraphs(lines, pg.L, pg.w - pg.R);

      // รวมรูปที่อยู่แถวเดียวกันและต่อชิดกัน (ภาพที่ถูกแบ่งเป็นชิ้น) เป็นแถวเดียว
      const rows = [];
      pg.imgs.forEach((im) => {
        const row = rows.find((r) => {
          const ov = Math.min(r.top + r.h, im.top + im.h) - Math.max(r.top, im.top);
          const near = Math.abs(im.left - r.right) < 3 || Math.abs(r.left - (im.left + im.w)) < 3;
          return ov > 0.6 * Math.min(r.h, im.h) && near;
        });
        if (row) {
          row.items.push(im);
          row.left = Math.min(row.left, im.left); row.right = Math.max(row.right, im.left + im.w);
          row.top = Math.min(row.top, im.top); row.h = Math.max(row.h, im.h);
        } else rows.push({ items: [im], left: im.left, right: im.left + im.w, top: im.top, h: im.h });
      });
      rows.forEach((r) => r.items.sort((a, b) => a.left - b.left));
      rows.sort((a, b) => a.top - b.top);
      const blocks = []; // ผสมย่อหน้ากับรูปตามลำดับบนลงล่าง
      let ii = 0;
      paras.forEach((p) => {
        const top = p.lines[0].y - 0.9 * p.size;
        while (ii < rows.length && rows[ii].top <= top + 2) blocks.push({ row: rows[ii++] });
        blocks.push({ p });
      });
      while (ii < rows.length) blocks.push({ row: rows[ii++] });

      let cursor = pg.T; // ตำแหน่ง y ที่ใช้ไปแล้ว (พิกัดจอ)
      let used = 0;
      const xml = [];
      blocks.forEach((b) => {
        if (b.row) {
          const row = b.row;
          const scale = Math.min(1, contentW / Math.max(1, row.right - row.left));
          const h = row.h * scale;
          const before = clamp(Math.round(tw(Math.max(0, row.top - cursor))), 0, tw(Math.max(0, contentH - used - h)));
          let runs = "";
          row.items.forEach((im) => {
            imgNo++;
            const rid = "rIdImg" + imgNo;
            zip.file("word/media/image" + imgNo + ".jpg", im.bytes);
            rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + imgNo + '.jpg"/>');
            runs += imageRunXml(rid, imgNo, emu(im.w * scale), emu(im.h * scale));
          });
          xml.push(paraXml(runs, {
            before, line: 240, indLeft: tw(Math.max(0, row.left - pg.L)), indFirst: 0, jc: null, tabs: null,
          }));
          used += before / 20 + h;
          cursor = row.top + h;
          return;
        }
        const p = b.p;
        const n = p.lines.length;
        const pitch = n > 1 ? (p.lines[n - 1].y - p.lines[0].y) / (n - 1) : p.size * 1.2;
        const lineH = Math.max(p.size * 1.15, pitch);
        const fb = p.lines[0].y;
        const rawBefore = fb - 0.8 * lineH - cursor;
        const heightPt = n * lineH;
        const before = clamp(tw(Math.max(0, rawBefore)), 0, tw(Math.max(0, contentH - used - heightPt)));
        const o = { before, line: tw(lineH), indLeft: 0, indFirst: 0, jc: null, tabs: null };
        let inner = "";
        if (p.segs) {
          // บรรทัดที่มีหลายคอลัมน์: ใช้แท็บ ตำแหน่งเดิมของแต่ละคอลัมน์
          const stops = [];
          p.segs.forEach((s, si) => {
            const pos = tw(s.x - pg.L);
            if (si > 0 || pos > tw(2)) { inner += "<w:r><w:tab/></w:r>"; stops.push(pos); }
            s.runs.forEach((r) => { inner += runXml(r); });
          });
          o.tabs = [...new Set(stops)].filter((x) => x > 0).sort((a, c) => a - c);
        } else {
          p.runs.forEach((r) => { inner += runXml(r); });
          const center = (p.left + p.right) / 2;
          const leftGap = p.left - pg.L, rightGap = pg.w - pg.R - p.right;
          if (n === 1 && Math.abs(center - (pg.L + contentW / 2)) < 0.025 * pg.w && leftGap > 0.06 * contentW && rightGap > 0.06 * contentW) {
            o.jc = "center";
          } else if (n === 1 && rightGap < 0.02 * pg.w && leftGap > 0.3 * contentW) {
            o.jc = "right";
          } else if (n > 1) {
            const rest = p.lines[1].left - pg.L;
            o.indLeft = tw(Math.max(0, rest));
            o.indFirst = tw(p.lines[0].left - p.lines[1].left);
          } else {
            o.indLeft = tw(Math.max(0, leftGap));
          }
        }
        xml.push(paraXml(inner, o));
        used += before / 20 + heightPt;
        cursor = p.lines[n - 1].y + 0.2 * lineH;
      });

      if (!xml.length) xml.push(paraXml("", { before: 0, line: 240, indLeft: 0, indFirst: 0, jc: null, tabs: null }));
      if (pi < pages.length - 1) {
        // ฝังการขึ้นหน้าใหม่ไว้ในย่อหน้าสุดท้าย ไม่เพิ่มย่อหน้าว่าง (กันหน้าว่างเกิน)
        xml[xml.length - 1] = xml[xml.length - 1].replace("</w:pPr>", sectXml(pg) + "</w:pPr>");
        body += xml.join("");
      } else {
        body += xml.join("") + sectXml(pg);
      }
    });

    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    zip.file("[Content_Types].xml", head +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      "</Types>");
    zip.file("_rels/.rels", head +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file("word/_rels/document.xml.rels", head +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      rels.join("") + "</Relationships>");
    zip.file("word/styles.xml", head +
      '<w:styles xmlns:w="' + W + '"><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Tahoma"/><w:sz w:val="22"/><w:szCs w:val="22"/>' +
      '<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>');
    zip.file("word/document.xml", head +
      '<w:document xmlns:w="' + W + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' + body + "</w:body></w:document>");

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: DOCX_TYPE });
    return { blob, images: imgNo };
  }

  /* ---------- เครื่องมือ ---------- */
  async function run(files) {
    const file = files[0];
    EC.needLib("JSZip");
    EC.needLib("pdfjsLib");
    const pdfjs = await EC.loadPdfJs(file);
    const pages = [];
    const imgCache = new Map();
    let chars = 0, unmapped = 0;
    for (let i = 1; i <= pdfjs.numPages; i++) {
      EC.setPageStatus(i, pdfjs.numPages);
      const pg = await extractPage(pdfjs, i, imgCache);
      chars += pg.textChars;
      unmapped += pg.unmapped;
      pages.push(pg);
    }
    if (chars < 10) throw new Error(t("dw_scan"));
    const { blob, images } = await buildDocx(pages);
    EC.download(blob, EC.baseName(file.name) + ".docx", DOCX_TYPE);
    const warn = unmapped ? " " + fmt(t("dw_warn"), { n: unmapped }) : "";
    const flatPages = [];
    pages.forEach((pg, i) => { if (pg.flat) flatPages.push(i + 1); });
    const flatWarn = flatPages.length ? " ⚠ " + fmt(t("dw_flat"), { list: flatPages.join(", ") }) : "";
    return { message: fmt(t("dw_done"), { pages: pages.length, imgs: images }) + warn + flatWarn };
  }

  EC.tools.pdf2word = { run };
  EC.docx = { extractPage, buildDocx, groupParagraphs, buildLines }; // ใช้ในการทดสอบอัตโนมัติ
})();
