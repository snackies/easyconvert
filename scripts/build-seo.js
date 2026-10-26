#!/usr/bin/env node
// สร้างหน้า SEO ของแต่ละเครื่องมือ + sitemap.xml + robots.txt จาก public/index.html และ scripts/seo-data.js
//   node scripts/build-seo.js          เขียนไฟล์ (รันซ้ำได้ ผลเหมือนเดิม)
//   node scripts/build-seo.js --check  ตรวจว่าไฟล์ในโปรเจกต์ตรงกับที่สร้างได้ (ไม่แก้ไฟล์) ใช้ในเทสต์
//   SITE_URL=https://โดเมนของคุณ node scripts/build-seo.js   เปลี่ยนโดเมน (จะบันทึกลง scripts/seo-config.json)
//
// ถ้าแก้ public/index.html (โครงหน้า) ให้รันสคริปต์นี้ใหม่ทุกครั้ง เพื่อให้หน้าเครื่องมือทั้ง 10 หน้าตามทัน
// ส่วนที่สคริปต์นี้เป็นเจ้าของ: ช่วงระหว่างเครื่องหมาย seo:head / seo:content / seo:tools ใน index.html
// และช่วง seo:keys ใน translations.js (อย่าแก้ด้วยมือ) กับไฟล์ public/<slug>.html, sitemap.xml, robots.txt
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const CONFIG = path.join(__dirname, "seo-config.json");
const DEFAULT_SITE = "https://easyconvert-five.vercel.app";
const { tools, FREE } = require("./seo-data");
const { PLANS } = require(path.join(ROOT, "lib", "plans.js"));

const OTHER_PAGES = ["guide.html", "guide-en.html", "privacy.html", "terms.html"];
const read = (f) => fs.readFileSync(f, "utf8");

function siteUrl(override) {
  let u = override || process.env.SITE_URL;
  if (!u) { try { u = JSON.parse(read(CONFIG)).siteUrl; } catch (e) { /* ใช้ค่าเริ่มต้น */ } }
  u = String(u || DEFAULT_SITE).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u)) throw new Error("SITE_URL ต้องเป็น https://โดเมน (ไม่มี path ต่อท้าย): " + u);
  return u;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ld = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

function loadTranslations(src) {
  return new Function(src + "\nreturn translations;")();
}

/* ---------- ช่วงที่สคริปต์เป็นเจ้าของ ---------- */
function fillHtml(src, name, body, file) {
  const a = "<!-- seo:" + name + ":start -->", b = "<!-- seo:" + name + ":end -->";
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0 || j < i) throw new Error("ไม่พบเครื่องหมาย " + a + " ใน " + file + " (ให้รัน addseo.js ก่อน)");
  const lineStart = src.lastIndexOf("\n", j) + 1;
  const indent = /^[ \t]*$/.test(src.slice(lineStart, j)) ? src.slice(lineStart, j) : "";
  return src.slice(0, i + a.length) + "\n" + (body ? body + "\n" : "") + indent + src.slice(j);
}
function fillJs(src, lang, body) {
  const a = "/* seo:keys:" + lang + ":start */", b = "/* seo:keys:" + lang + ":end */";
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0 || j < i) throw new Error("ไม่พบเครื่องหมาย " + a + " ใน translations.js (ให้รัน addseo.js ก่อน)");
  return src.slice(0, i + a.length) + "\n" + body + "\n    " + src.slice(j);
}
const lines = (arr, pad) => arr.map((l) => pad + l).join("\n");

/* ---------- ส่วน <head> ---------- */
function headBlock(o) {
  const out = [
    '<link rel="canonical" href="' + esc(o.url) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="EasyConvert">',
    '<meta property="og:locale" content="th_TH">',
    '<meta property="og:locale:alternate" content="en_US">',
    '<meta property="og:title" content="' + esc(o.title) + '">',
    '<meta property="og:description" content="' + esc(o.desc) + '">',
    '<meta property="og:url" content="' + esc(o.url) + '">',
    '<meta property="og:image" content="' + esc(o.site) + '/og.png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="EasyConvert: เครื่องมือ PDF และรูปภาพ ไฟล์ไม่ออกจากเครื่องคุณ">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(o.title) + '">',
    '<meta name="twitter:description" content="' + esc(o.desc) + '">',
    '<meta name="twitter:image" content="' + esc(o.site) + '/og.png">',
    '<script type="application/ld+json">' + ld({ "@context": "https://schema.org", "@graph": o.graph }) + "</script>",
  ];
  return lines(out, "    ");
}

function offers() {
  const out = [{ "@type": "Offer", name: "Free trial / ทดลองฟรี", price: "0", priceCurrency: "THB" }];
  for (const k of ["week", "month", "year"]) {
    out.push({ "@type": "Offer", name: PLANS[k].label, price: String(PLANS[k].amount / 100), priceCurrency: "THB" });
  }
  return out;
}

function appNode(site, url, name, desc) {
  return {
    "@type": "WebApplication", "@id": url + "#app", name, url, description: desc,
    applicationCategory: "UtilitiesApplication", operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript", inLanguage: ["th", "en"], offers: offers(),
  };
}

/* ---------- เนื้อหาในหน้า ---------- */
const TXT = {
  th: {
    how: (n) => "วิธีใช้ “" + n + "” 3 ขั้นตอน", uses: "เหมาะกับงานแบบไหน", rel: "เครื่องมืออื่นที่ใช้คู่กัน",
    faq: (n) => "คำถามที่พบบ่อยของ “" + n + "”", free: FREE.th, verify: "ตรวจสอบเองว่าไฟล์ไม่ถูกอัปโหลด",
  },
  en: {
    how: (n) => "How to use “" + n + "” in 3 steps", uses: "What it's good for", rel: "Tools that go well with this one",
    faq: (n) => "FAQ: “" + n + "”", free: FREE.en, verify: "Check for yourself that nothing is uploaded",
  },
};

function contentBlock(tool, tr) {
  const out = [];
  for (const lang of ["th", "en"]) {
    const d = tool[lang], x = TXT[lang], names = tr[lang];
    const id = "seo-" + tool.id + "-" + lang;
    out.push('<section class="seo" data-seo-lang="' + lang + '" lang="' + lang + '" aria-labelledby="' + id + '">');
    out.push('    <h2 class="section-title" id="' + id + '">' + escText(x.how(names["tab_" + tool.id])) + "</h2>");
    out.push('    <ol class="seo-steps">');
    d.steps.forEach((s) => out.push("        <li>" + escText(s) + "</li>"));
    out.push("    </ol>");
    out.push('    <h2 class="section-title">' + x.uses + "</h2>");
    out.push('    <ul class="seo-uses">');
    d.uses.forEach((s) => out.push("        <li>" + escText(s) + "</li>"));
    out.push("    </ul>");
    out.push('    <h2 class="section-title">' + escText(x.faq(names["tab_" + tool.id])) + "</h2>");
    out.push('    <div class="faq">');
    d.faq.forEach(([q, a]) => out.push("        <details><summary>" + escText(q) + "</summary><p>" + escText(a) + "</p></details>"));
    out.push("    </div>");
    out.push('    <h2 class="section-title">' + x.rel + "</h2>");
    out.push('    <ul class="seo-rel">');
    tool.related.forEach((rid) => {
      const r = tools.find((t) => t.id === rid);
      out.push('        <li><a href="' + r.slug + '">' + r.icon + " " + escText(names["tab_" + rid]) + "</a></li>");
    });
    out.push("    </ul>");
    out.push('    <p class="seo-note">' + escText(x.free) + ' · <a href="privacy.html">' + x.verify + "</a></p>");
    out.push("</section>");
  }
  return lines(out, "    ");
}

function toolsNav(tr) {
  const out = [];
  out.push('<section class="seo-tools" aria-labelledby="seo-tools-title">');
  out.push('    <h2 class="section-title" id="seo-tools-title" data-i18n="seo_tools_title">' + escText(tr.th.seo_tools_title) + "</h2>");
  out.push('    <ul class="seo-tool-links">');
  tools.forEach((t) => {
    out.push('        <li><a href="' + t.slug + '" data-tool-link="' + t.id + '"><span aria-hidden="true">' + t.icon + '</span> <span data-i18n="tab_' + t.id + '">' + escText(tr.th["tab_" + t.id]) + "</span></a></li>");
  });
  out.push("    </ul>");
  out.push("</section>");
  return lines(out, "    ");
}

const KEYS = {
  th: { seo_tools_title: "เครื่องมือทั้งหมด" },
  en: { seo_tools_title: "All tools" },
};

function keysBody(lang) {
  const o = Object.assign({}, KEYS[lang]);
  tools.forEach((t) => { o["seo_" + t.id + "_h1"] = t[lang].h1; o["seo_" + t.id + "_sub"] = t[lang].sub; });
  return Object.keys(o).map((k) => "    " + k + ": " + JSON.stringify(o[k]) + ",").join("\n");
}

/* ---------- สร้างทั้งหมด ---------- */
function build(opts) {
  opts = opts || {};
  const site = siteUrl(opts.site);
  const files = {}; // path (สัมพัทธ์กับ ROOT) -> เนื้อหา

  // 1) translations.js: ใส่คีย์ seo ก่อน แล้วอ่านชื่อเครื่องมือ
  let trSrc = read(path.join(PUB, "translations.js"));
  trSrc = fillJs(trSrc, "th", keysBody("th"));
  trSrc = fillJs(trSrc, "en", keysBody("en"));
  files["public/translations.js"] = trSrc;
  const tr = loadTranslations(trSrc);
  tools.forEach((t) => {
    ["th", "en"].forEach((l) => { if (!tr[l]["tab_" + t.id]) throw new Error("ไม่มีคีย์ tab_" + t.id + " ใน translations (" + l + ")"); });
  });

  // 2) index.html
  const idxSrc = read(path.join(PUB, "index.html"));
  const homeTitle = (idxSrc.match(/<title>([^<]*)<\/title>/) || [])[1];
  const homeDesc = (idxSrc.match(/<meta name="description" content="([^"]*)">/) || [])[1];
  if (!homeTitle || !homeDesc) throw new Error("index.html ไม่มี <title> หรือ meta description แบบบรรทัดเดียว");
  const homeUrl = site + "/";
  const homeGraph = [
    { "@type": "WebSite", "@id": site + "/#site", name: "EasyConvert", url: homeUrl, inLanguage: ["th", "en"] },
    appNode(site, homeUrl, "EasyConvert", homeDesc.replace(/&quot;/g, '"').replace(/&amp;/g, "&")),
  ];
  let home = idxSrc;
  home = fillHtml(home, "head", headBlock({ site, url: homeUrl, title: homeTitle.replace(/&amp;/g, "&"), desc: homeDesc.replace(/&amp;/g, "&"), graph: homeGraph }), "index.html");
  home = fillHtml(home, "content", "", "index.html");
  home = fillHtml(home, "tools", toolsNav(tr), "index.html");
  files["public/index.html"] = home;

  // 3) หน้าของแต่ละเครื่องมือ
  tools.forEach((t) => {
    const url = site + "/" + t.slug, name = tr.th["tab_" + t.id], d = t.th;
    const title = d.title + " | EasyConvert";
    const graph = [
      appNode(site, url, "EasyConvert: " + name, d.desc),
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "EasyConvert", item: homeUrl },
        { "@type": "ListItem", position: 2, name, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: d.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ];
    let p = home;
    const swap = (re, to, what) => {
      if (!re.test(p)) throw new Error("index.html ไม่ตรงรูปแบบที่คาด (" + what + ") — แก้ scripts/build-seo.js ให้ตรง");
      p = p.replace(re, () => to);
    };
    swap(/<title>[^<]*<\/title>/, "<title>" + escText(title) + "</title>", "title");
    swap(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + esc(d.desc) + '">', "description");
    swap(/<body>/, '<body data-tool="' + t.id + '">', "body");
    swap(/<h1 data-i18n="hero_title">[^<]*<\/h1>/, '<h1 data-i18n="seo_' + t.id + '_h1">' + escText(d.h1) + "</h1>", "h1 ของ hero");
    swap(/<p class="hero-sub" data-i18n="hero_sub">[^<]*<\/p>/, '<p class="hero-sub" data-i18n="seo_' + t.id + '_sub">' + escText(d.sub) + "</p>", "hero-sub");
    p = fillHtml(p, "head", headBlock({ site, url, title, desc: d.desc, graph }), t.slug);
    p = fillHtml(p, "content", contentBlock(t, tr), t.slug);
    files["public/" + t.slug] = p;
  });

  // 4) sitemap.xml / robots.txt
  const urls = [homeUrl].concat(tools.map((t) => site + "/" + t.slug), OTHER_PAGES.map((f) => site + "/" + f));
  files["public/sitemap.xml"] =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => "  <url><loc>" + escText(u) + "</loc></url>").join("\n") + "\n</urlset>\n";
  files["public/robots.txt"] = "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: " + site + "/sitemap.xml\n";

  return { site, files };
}

function run(argv) {
  const check = argv.includes("--check");
  if (process.env.SITE_URL && !check) {
    siteUrl(); // ตรวจรูปแบบก่อนบันทึก
    fs.writeFileSync(CONFIG, JSON.stringify({ siteUrl: siteUrl() }, null, 2) + "\n");
  }
  const { site, files } = build();
  let changed = 0;
  for (const rel of Object.keys(files)) {
    const f = path.join(ROOT, rel);
    const cur = fs.existsSync(f) ? read(f) : null;
    if (cur === files[rel]) continue;
    changed++;
    if (check) console.log("ไม่ตรง: " + rel);
    else { fs.writeFileSync(f, files[rel]); console.log("เขียนแล้ว: " + rel); }
  }
  if (check) { console.log(changed ? changed + " ไฟล์ไม่ตรงกับที่สร้างได้ → รัน node scripts/build-seo.js" : "ทุกไฟล์ตรงกัน (" + site + ")"); return changed ? 1 : 0; }
  console.log(changed ? "สร้างหน้า SEO เสร็จ (" + site + ")" : "ไม่มีอะไรเปลี่ยน (" + site + ")");
  return 0;
}

module.exports = { build, siteUrl, run };
if (require.main === module) {
  try { process.exitCode = run(process.argv.slice(2)); } catch (e) { console.error("FAIL " + e.message); process.exitCode = 1; }
}
