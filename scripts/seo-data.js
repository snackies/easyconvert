// ข้อมูล SEO ของแต่ละเครื่องมือ (ไทย/อังกฤษ) — แก้ข้อความที่ไฟล์นี้ แล้วรัน: node scripts/build-seo.js
// build-seo.js จะสร้างหน้า public/<slug>.html, sitemap.xml, robots.txt และอัปเดตส่วน seo ใน index.html / translations.js
// ทุกข้อความต้องตรงกับพฤติกรรมจริงของเครื่องมือ (ดูคู่มือ public/guide.html) ห้ามเขียนเกินจริง

const FREE = {
  th: "ทดลองฟรี 2 ครั้งต่อเครื่องมือต่อวัน ไฟล์ไม่เกิน 15 MB",
  en: "Free to try: 2 runs per tool per day, files up to 15 MB",
};

const tools = [
  {
    id: "img2pdf", slug: "image-to-pdf.html", icon: "📷",
    related: ["merge", "shrink", "compress"],
    th: {
      title: "รูปเป็น PDF รวมหลายรูปเป็นไฟล์เดียว ไม่อัปโหลดไฟล์",
      desc: "รวมรูปถ่ายเอกสาร ใบเสร็จ สำเนาบัตร เป็น PDF ไฟล์เดียวในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลด ไม่ต้องสมัครสมาชิก ทดลองฟรีวันละ 2 ครั้ง",
      h1: "แปลงรูปเป็น PDF รวมหลายรูปเป็นไฟล์เดียว",
      sub: "เหมาะกับรูปถ่ายเอกสาร ใบเสร็จ และสำเนาบัตร ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางรูปทั้งหมดในกรอบด้านบน (JPG, PNG, WebP) เลือกพร้อมกันหลายรูปได้",
        "ตรวจลำดับในรายการ รูปแรกในรายการจะเป็นหน้าแรกของ PDF",
        "กด “เริ่มประมวลผล” แล้วบันทึกไฟล์ EasyConvert_Images.pdf",
      ],
      uses: [
        "ส่งเอกสารสมัครงานหรือสมัครเรียนที่รับเป็น PDF ไฟล์เดียว",
        "รวมรูปใบเสร็จหลายใบเพื่อเบิกค่าใช้จ่าย",
        "รวมสำเนาบัตรและเอกสารประกอบเป็นไฟล์เดียว",
      ],
      faq: [
        ["รองรับรูปแบบรูปอะไรบ้าง", "รองรับ JPG, PNG และ WebP เลือกพร้อมกันได้หลายรูป"],
        ["รูปของฉันถูกอัปโหลดไปที่เซิร์ฟเวอร์ไหม", "ไม่ การรวมรูปทำในเบราว์เซอร์ของคุณ ตรวจสอบเองได้โดยเปิดโหมดเครื่องบินหลังโหลดหน้าเว็บแล้วลองใช้ (ดูวิธีที่หน้าความเป็นส่วนตัว)"],
        ["ถ้าเรียงรูปผิดลำดับต้องทำอย่างไร", "กด × ที่รูปนั้นเพื่อเอาออก แล้วเพิ่มใหม่ รูปที่เพิ่มทีหลังจะต่อท้ายรายการเสมอ"],
      ],
    },
    en: {
      h1: "Convert images to one PDF",
      sub: "Great for photos of documents, receipts and ID copies. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop all your images into the box above (JPG, PNG, WebP). You can select several at once.",
        "Check the order in the list. The first image becomes the first page of the PDF.",
        "Press “Start” and save EasyConvert_Images.pdf.",
      ],
      uses: [
        "Send job or school applications that accept a single PDF",
        "Combine several receipts for an expense claim",
        "Put ID copies and supporting documents into one file",
      ],
      faq: [
        ["Which image formats are supported?", "JPG, PNG and WebP. You can pick several images at once."],
        ["Are my images uploaded to a server?", "No. The PDF is built in your browser. You can verify it yourself: load the page, switch on airplane mode and try it (see the privacy page)."],
        ["What if the order is wrong?", "Press × on an image to remove it and add it again. Images you add later are always placed at the end of the list."],
      ],
    },
  },
  {
    id: "pdf2img", slug: "pdf-to-image.html", icon: "🖼️",
    related: ["img2pdf", "split", "compress"],
    th: {
      title: "แปลง PDF เป็นรูป JPG ทุกหน้า ไม่อัปโหลดไฟล์",
      desc: "แปลงแต่ละหน้าของ PDF เป็นรูป JPG ในเบราว์เซอร์ ได้ไฟล์ ZIP เมื่อมีหลายหน้า ไฟล์ไม่ถูกอัปโหลด ไม่ต้องสมัครสมาชิก ทดลองฟรีวันละ 2 ครั้ง",
      h1: "แปลง PDF เป็นรูป JPG ทุกหน้า",
      sub: "ได้รูปแยกตามหน้า ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางไฟล์ PDF ในกรอบด้านบน (ครั้งละ 1 ไฟล์)",
        "กด “เริ่มประมวลผล” แล้วรอจนครบทุกหน้า",
        "บันทึกไฟล์ที่ได้ หน้าเดียวได้รูป JPG หลายหน้าได้ไฟล์ ZIP",
      ],
      uses: [
        "เอาหน้า PDF ไปแปะในสไลด์ เอกสาร หรือโพสต์โซเชียล",
        "ส่งหน้าเอกสารเป็นรูปทางแชต",
        "เก็บแต่ละหน้าเป็นรูปเพื่อแก้ไขต่อในแอปแต่งรูป",
      ],
      faq: [
        ["ไฟล์ที่ได้เป็นอะไร", "PDF หน้าเดียวได้รูป JPG หนึ่งรูป ถ้ามีหลายหน้าจะได้ไฟล์ ชื่อไฟล์_pages.zip ข้างในคือ Page_1.jpg, Page_2.jpg ไล่ตามหน้า"],
        ["เปิดไฟล์ ZIP บน iPhone หรือ iPad ได้ไหม", "ได้ แตะไฟล์ ZIP ในแอป “ไฟล์” เพื่อแตกไฟล์"],
        ["ไฟล์ใหญ่กว่า 15 MB ทำได้ไหม", "การใช้ฟรีรองรับไฟล์ไม่เกิน 15 MB แพ็กเกจพรีเมียมรองรับไฟล์ใหญ่กว่านั้น ขึ้นอยู่กับหน่วยความจำของเครื่องคุณ"],
      ],
    },
    en: {
      h1: "Convert PDF to JPG images, every page",
      sub: "Get one image per page. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop a PDF into the box above (one file at a time).",
        "Press “Start” and wait until every page is done.",
        "Save the result: one page gives a JPG, several pages give a ZIP.",
      ],
      uses: [
        "Put PDF pages into slides, documents or social posts",
        "Send document pages as pictures in a chat",
        "Keep each page as an image to edit in a photo app",
      ],
      faq: [
        ["What do I get?", "A one-page PDF gives one JPG. A longer PDF gives a ZIP named filename_pages.zip containing Page_1.jpg, Page_2.jpg and so on, in page order."],
        ["Can I open the ZIP on an iPhone or iPad?", "Yes. Tap the ZIP file in the Files app to extract it."],
        ["Can I convert files larger than 15 MB?", "Free use supports files up to 15 MB. Premium plans allow larger files, depending on your device's memory."],
      ],
    },
  },
  {
    id: "merge", slug: "merge-pdf.html", icon: "🧩",
    related: ["split", "compress", "img2pdf"],
    th: {
      title: "รวม PDF หลายไฟล์เป็นไฟล์เดียว ไม่อัปโหลดไฟล์",
      desc: "รวมไฟล์ PDF หลายไฟล์เป็นไฟล์เดียวในเบราว์เซอร์ ข้อความในไฟล์ยังเลือกได้ ไฟล์ไม่ถูกอัปโหลด ไม่ต้องสมัครสมาชิก ทดลองฟรีวันละ 2 ครั้ง",
      h1: "รวม PDF หลายไฟล์เป็นไฟล์เดียว",
      sub: "ต่อไฟล์ตามลำดับที่ต้องการ ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางไฟล์ PDF ทั้งหมดที่จะรวมในกรอบด้านบน",
        "ตรวจลำดับในรายการ ไฟล์บนสุดจะอยู่หน้าแรกของไฟล์ที่รวม",
        "กด “เริ่มประมวลผล” แล้วบันทึกไฟล์ EasyConvert_Merged.pdf",
      ],
      uses: [
        "รวมใบสมัคร เรซูเม่ และเอกสารแนบเป็นไฟล์เดียว",
        "ต่อรายงานหลายบทเป็นเล่มเดียว",
        "รวมสัญญาและเอกสารประกอบก่อนส่งให้ลูกค้า",
      ],
      faq: [
        ["ลำดับการรวมเป็นอย่างไร", "ไฟล์บนสุดในรายการจะอยู่หน้าแรก ถ้าลำดับไม่ตรง กด × เอาไฟล์ออกแล้วเพิ่มใหม่ตามลำดับที่ต้องการ ไฟล์ที่เพิ่มทีหลังจะต่อท้ายรายการ"],
        ["รวมแล้วข้อความยังเลือกและค้นหาได้ไหม", "ได้ การรวมคัดลอกหน้าเดิมมาต่อกัน ไม่ได้แปลงเป็นภาพ"],
        ["ไฟล์ที่รวมต้องมีขนาดเท่าไร", "การใช้ฟรีรองรับขนาดรวมไม่เกิน 15 MB ถ้าใหญ่กว่านั้นใช้แพ็กเกจพรีเมียม หรือลดขนาดไฟล์ก่อนด้วยเครื่องมือลดขนาด PDF"],
      ],
    },
    en: {
      h1: "Merge several PDFs into one",
      sub: "Join files in the order you want. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop all the PDFs you want to merge into the box above.",
        "Check the order. The file at the top becomes the first pages of the merged PDF.",
        "Press “Start” and save EasyConvert_Merged.pdf.",
      ],
      uses: [
        "Combine an application form, résumé and attachments",
        "Join report chapters into a single document",
        "Bundle a contract and its supporting papers before sending",
      ],
      faq: [
        ["How is the order decided?", "The file at the top of the list comes first. To change the order, press × to remove a file and add it again. Files added later go to the end of the list."],
        ["Can I still select and search the text?", "Yes. Merging copies the original pages one after another; it does not turn them into images."],
        ["How large can the files be?", "Free use supports up to 15 MB in total. For more, use a Premium plan, or shrink the files first with the Compress PDF tool."],
      ],
    },
  },
  {
    id: "split", slug: "split-pdf.html", icon: "✂️",
    related: ["merge", "compress", "sign"],
    th: {
      title: "แยกหน้า PDF เลือกเก็บเฉพาะบางหน้า ไม่อัปโหลดไฟล์",
      desc: "เลือกเก็บเฉพาะหน้าที่ต้องการจาก PDF เช่น 1-3, 5, 7-10 ได้ไฟล์ใหม่ ข้อความยังเลือกได้ ไฟล์ไม่ถูกอัปโหลด ไม่ต้องสมัครสมาชิก ทดลองฟรีวันละ 2 ครั้ง",
      h1: "แยกหน้า PDF เก็บเฉพาะหน้าที่ต้องการ",
      sub: "พิมพ์เลขหน้า เช่น 1-3, 5 แล้วได้ไฟล์ใหม่ ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางไฟล์ PDF ในกรอบด้านบน (ครั้งละ 1 ไฟล์)",
        "พิมพ์หน้าที่ต้องการเก็บในช่อง เช่น 2-4 หรือ 1-3, 5, 7-10",
        "กด “เริ่มประมวลผล” แล้วบันทึกไฟล์ ชื่อไฟล์_pages.pdf",
      ],
      uses: [
        "ตัดเฉพาะหน้าที่ต้องส่งออกจากเอกสารเล่มใหญ่",
        "เอาหน้าที่ไม่ต้องการหรือมีข้อมูลส่วนตัวออกก่อนส่งต่อ",
        "แยกหน้าสำคัญของสัญญาหรือใบเสร็จมาเก็บ",
      ],
      faq: [
        ["พิมพ์ช่วงหน้าอย่างไร", "2-4 คือหน้า 2 ถึง 4 · 5 คือหน้า 5 หน้าเดียว · 1-3, 5, 7-10 คือหลายช่วงคั่นด้วยจุลภาค"],
        ["ไฟล์ต้นฉบับถูกแก้ไหม", "ไม่ ได้ไฟล์ใหม่แยกต่างหาก ไฟล์เดิมอยู่ครบ และข้อความในหน้าที่เก็บยังเลือกและค้นหาได้"],
        ["ถ้าใส่เลขหน้าเกินจำนวนหน้าของไฟล์จะเกิดอะไรขึ้น", "ระบบจะแจ้งว่ารูปแบบช่วงหน้าไม่ถูกต้อง ให้ตรวจเลขหน้าอีกครั้ง"],
      ],
    },
    en: {
      h1: "Extract pages from a PDF",
      sub: "Type page numbers such as 1-3, 5 and get a new file. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop a PDF into the box above (one file at a time).",
        "Type the pages to keep, for example 2-4 or 1-3, 5, 7-10.",
        "Press “Start” and save filename_pages.pdf.",
      ],
      uses: [
        "Cut out only the pages you need from a long document",
        "Remove unwanted or private pages before forwarding",
        "Keep the key pages of a contract or receipt",
      ],
      faq: [
        ["How do I write the page range?", "2-4 means pages 2 to 4 · 5 means page 5 only · 1-3, 5, 7-10 means several ranges separated by commas."],
        ["Is my original file changed?", "No. You get a separate new file. The pages you keep stay selectable and searchable."],
        ["What if I enter a page number beyond the last page?", "You will see a message that the page range is invalid. Check the numbers and try again."],
      ],
    },
  },
  {
    id: "compress", slug: "compress-pdf.html", icon: "🗜️",
    related: ["shrink", "merge", "split"],
    th: {
      title: "ลดขนาดไฟล์ PDF ส่งอีเมลหรือ LINE ได้ ไม่อัปโหลดไฟล์",
      desc: "ลดขนาด PDF ให้เล็กลงเพื่อส่งอีเมล LINE หรืออัปโหลด เลือกได้ 3 ระดับ ทำในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลด ไม่ต้องสมัครสมาชิก ทดลองฟรีวันละ 2 ครั้ง",
      h1: "ลดขนาดไฟล์ PDF ให้เล็กลง",
      sub: "เลือกระดับการบีบอัดได้ 3 ระดับ ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางไฟล์ PDF ในกรอบด้านบน (ครั้งละ 1 ไฟล์)",
        "เลือก “ระดับการบีบอัด” เบา กลาง หรือแรง",
        "กด “เริ่มประมวลผล” แล้วบันทึกไฟล์ ชื่อไฟล์_compressed.pdf",
      ],
      uses: [
        "ทำให้ไฟล์เล็กพอส่งอีเมลหรือแนบในแชต",
        "ลดขนาดเอกสารสแกนที่ใหญ่เกินไป",
        "เตรียมไฟล์ก่อนอัปโหลดขึ้นเว็บที่จำกัดขนาด",
      ],
      faq: [
        ["ควรเลือกระดับไหน", "ลองระดับ “เบา” ก่อน ซึ่งคงข้อความไว้ ถ้ายังใหญ่เกินค่อยเพิ่มเป็นกลางหรือแรง"],
        ["ทำไมบีบอัดแล้วข้อความเลือกหรือค้นหาไม่ได้", "ระดับกลางและแรงจะแปลงแต่ละหน้าเป็นภาพเพื่อให้ไฟล์เล็กลงมาก ข้อความจึงเลือกหรือค้นหาไม่ได้ ระดับเบายังเลือกและค้นหาข้อความได้"],
        ["ถ้าบีบอัดแล้วไฟล์ไม่เล็กลงจะเกิดอะไรขึ้น", "ระบบจะไม่ให้ดาวน์โหลดไฟล์ที่ไม่เล็กลง และแนะนำให้เลือกระดับที่แรงขึ้น ถ้าต้องการขนาดเฉพาะเจาะจง เช่น ไม่เกิน 200 KB ให้ใช้เครื่องมือ “ย่อให้ได้ขนาด”"],
      ],
    },
    en: {
      h1: "Compress a PDF to make it smaller",
      sub: "Three compression levels. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop a PDF into the box above (one file at a time).",
        "Choose a compression level: light, medium or strong.",
        "Press “Start” and save filename_compressed.pdf.",
      ],
      uses: [
        "Make a file small enough for email or a chat attachment",
        "Shrink scanned documents that are too large",
        "Prepare a file for a website with an upload size limit",
      ],
      faq: [
        ["Which level should I choose?", "Try “light” first. It keeps the text. If the file is still too big, move up to medium or strong."],
        ["Why can't I select text after compressing?", "Medium and strong turn each page into an image to make the file much smaller, so the text can no longer be selected or searched. Light keeps selectable text."],
        ["What if the file doesn't get smaller?", "The tool won't give you a file that isn't smaller, and suggests a stronger level. If you need an exact limit such as 200 KB, use the Shrink to size tool."],
      ],
    },
  },
  {
    id: "shrink", slug: "reduce-file-size.html", icon: "📏",
    related: ["compress", "img2pdf", "watermark"],
    th: {
      title: "ย่อรูปและ PDF ให้ไม่เกิน KB หรือ MB ที่กำหนด",
      desc: "ย่อรูปหรือ PDF ให้ไม่เกินขนาดที่เว็บกำหนด เช่น 200 KB สำหรับสมัครงานหรือยื่นเอกสาร ทำในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลด ทดลองฟรีวันละ 2 ครั้ง",
      h1: "ย่อรูปและ PDF ให้ไม่เกินขนาดที่กำหนด",
      sub: "ตั้งขนาดสูงสุด เช่น ไม่เกิน 200 KB แล้วระบบลดคุณภาพทีละน้อยจนได้ขนาด ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางรูปหรือ PDF ในกรอบด้านบน (หลายไฟล์ได้)",
        "พิมพ์ขนาดสูงสุดที่ต้องการ แล้วเลือกหน่วย KB หรือ MB",
        "กด “เริ่มประมวลผล” ดูขนาดเดิมและขนาดใหม่ แล้วบันทึกไฟล์",
      ],
      uses: [
        "ย่อรูปถ่ายและเอกสารให้ผ่านเว็บสมัครงานที่จำกัดขนาด",
        "ยื่นเอกสารออนไลน์ที่กำหนดว่าไฟล์ต้องไม่เกิน 1 หรือ 2 MB",
        "ย่อรูปบัตรหรือเอกสารหลายไฟล์พร้อมกัน",
      ],
      faq: [
        ["เว็บสมัครงานจำกัดขนาดไฟล์ ต้องทำอย่างไร", "ตั้งขนาดสูงสุดตามที่เว็บกำหนด เช่น 200 KB แล้วกดเริ่มประมวลผล ระบบจะลดคุณภาพทีละน้อยจนได้ขนาดตามต้องการ"],
        ["ถ้าไฟล์เล็กกว่าขนาดที่ตั้งไว้อยู่แล้วล่ะ", "ไฟล์นั้นจะถูกส่งคืนตามเดิม ไม่ถูกลดคุณภาพโดยไม่จำเป็น"],
        ["ย่อ PDF แล้วข้อความยังเลือกได้ไหม", "ไม่ PDF ที่ถูกย่อจะกลายเป็นภาพ ข้อความเลือกไม่ได้ ถ้าย่อจนเล็กที่สุดแล้วยังไม่ถึงขนาดที่ตั้ง ระบบจะแจ้งให้ลองเพิ่มขนาดเป้าหมาย"],
      ],
    },
    en: {
      h1: "Shrink images and PDFs to a size limit",
      sub: "Set a maximum such as 200 KB and the tool lowers quality step by step until it fits. Nothing is uploaded.",
      steps: [
        "Drop images or PDFs into the box above (several files are fine).",
        "Type the maximum size you need and choose KB or MB.",
        "Press “Start”, check the original and new sizes, then save.",
      ],
      uses: [
        "Fit photos and documents into a job site with a size limit",
        "Submit online forms that cap files at 1 or 2 MB",
        "Shrink several ID or document files at once",
      ],
      faq: [
        ["A job site limits file size. What do I do?", "Set the maximum to the site's limit, for example 200 KB, and press Start. Quality is lowered step by step until the file fits."],
        ["What if the file is already smaller than my limit?", "It is returned unchanged, so quality is not reduced for no reason."],
        ["Can I still select text in a shrunk PDF?", "No. A shrunk PDF becomes images. If it can't reach your limit even at the smallest setting, you'll be asked to try a larger target."],
      ],
    },
  },
  {
    id: "watermark", slug: "id-card-watermark.html", icon: "🪪",
    related: ["shrink", "img2pdf", "sign"],
    th: {
      title: "ใส่ลายน้ำสำเนาบัตรประชาชน ระบุวัตถุประสงค์ ไม่อัปโหลดไฟล์",
      desc: "ใส่ข้อความลายน้ำพาดบนสำเนาบัตรประชาชนหรือเอกสาร ระบุว่าใช้เพื่ออะไร กันนำไปใช้ผิดวัตถุประสงค์ ทำในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลด",
      h1: "ใส่ลายน้ำสำเนาบัตรประชาชนและเอกสาร",
      sub: "ระบุผู้รับและวัตถุประสงค์บนสำเนา ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางรูปหรือ PDF ของสำเนาในกรอบด้านบน (หลายไฟล์ได้)",
        "พิมพ์ข้อความลายน้ำ หรือเลือกข้อความสำเร็จรูปแล้วแก้ต่อ ปรับ “ความเข้ม” ให้อ่านชัดแต่ไม่บังข้อมูลสำคัญ",
        "กด “เริ่มประมวลผล” แล้วบันทึกไฟล์",
      ],
      uses: [
        "ส่งสำเนาบัตรประชาชนให้บริษัทหรือหน่วยงานโดยระบุว่าใช้เพื่ออะไร",
        "ส่งสำเนาพาสปอร์ตหรือทะเบียนบ้านเพื่อสมัครบริการ",
        "ใส่ข้อความระบุผู้รับกับเอกสารที่ส่งออกไปหลายที่",
      ],
      faq: [
        ["ข้อความลายน้ำควรเขียนอย่างไร", "ควรบอก 3 อย่าง คือ ใครคือผู้รับ ใช้เพื่ออะไร และห้ามใช้อย่างอื่น เช่น “สำเนาเพื่อสมัครงานบริษัท ABC เท่านั้น ห้ามใช้เพื่อการอื่น”"],
        ["ลายน้ำลบออกจากไฟล์ได้ไหม", "ไม่ได้ ผลลัพธ์เป็นภาพ ลายน้ำจึงลบออกจากไฟล์ไม่ได้ และถ้าเป็น PDF ข้อความในไฟล์จะเลือกไม่ได้ ควรเก็บไฟล์ต้นฉบับไว้ด้วย"],
        ["ไฟล์บัตรประชาชนของฉันถูกส่งไปที่เซิร์ฟเวอร์ไหม", "ไม่ การใส่ลายน้ำทำในเบราว์เซอร์ของคุณ ไฟล์ไม่ถูกอัปโหลด แต่ควรระวังการส่งต่อไฟล์ผ่านช่องทางอื่นหลังจากนั้นด้วย"],
      ],
    },
    en: {
      h1: "Add a purpose watermark to ID card copies and documents",
      sub: "State who the copy is for and why. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop the images or PDFs of your copies into the box above (several files are fine).",
        "Type the watermark text or tap a preset and edit it. Adjust the opacity so it stays readable without hiding key details.",
        "Press “Start” and save the file.",
      ],
      uses: [
        "Send an ID card copy to a company or agency and say what it's for",
        "Send passport or house registration copies for a service sign-up",
        "Mark each copy with its recipient when you send documents to several places",
      ],
      faq: [
        ["What should the watermark say?", "Say three things: who the recipient is, what it is for, and that it must not be used for anything else. For example: “Copy for ABC Co. job application only. Not for any other use.”"],
        ["Can the watermark be removed?", "No. The result is an image, so the watermark can't be taken out of the file, and a PDF's text is no longer selectable. Keep your original file as well."],
        ["Is my ID card file sent to a server?", "No. The watermark is added in your browser and the file is not uploaded. Be careful how you share the file afterwards."],
      ],
    },
  },
  {
    id: "sign", slug: "sign-pdf.html", icon: "✍️",
    related: ["merge", "watermark", "compress"],
    th: {
      title: "เซ็นเอกสาร PDF วาดลายเซ็นออนไลน์ ไม่อัปโหลดไฟล์",
      desc: "วาด พิมพ์ หรือใช้รูปลายเซ็น แล้ววางบนเอกสาร PDF ข้อความเดิมยังเลือกได้ ทำในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลด ทดลองฟรีวันละ 2 ครั้ง",
      h1: "เซ็นเอกสาร PDF ออนไลน์",
      sub: "วาดหรือพิมพ์ลายเซ็นแล้ววางบนเอกสาร ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางไฟล์ PDF ในกรอบด้านบน ขั้นตอนเซ็นจะปรากฏใต้กรอบ",
        "สร้างลายเซ็นด้วยการวาด พิมพ์ชื่อ ใช้รูปภาพ หรือพิมพ์ข้อความ/วันที่ แล้วลากไปวางตรงตำแหน่งที่ต้องการ",
        "กด “เริ่มประมวลผล” แล้วบันทึกไฟล์ ชื่อไฟล์_signed.pdf",
      ],
      uses: [
        "เซ็นสัญญา ใบเสนอราคา หรือแบบฟอร์มโดยไม่ต้องพิมพ์ออกมา",
        "ใส่วันที่และชื่อบนเอกสารที่ต้องส่งกลับ",
        "ใช้รูปลายเซ็นที่ถ่ายหรือสแกนไว้วางบน PDF",
      ],
      faq: [
        ["เป็นลายเซ็นดิจิทัลหรือไม่", "ไม่ใช่ เป็นภาพลายเซ็นที่วางบนเอกสาร ไม่ใช่ลายเซ็นดิจิทัลที่ออกโดยผู้ให้บริการรับรอง ถ้าหน่วยงานกำหนดให้ใช้ลายเซ็นดิจิทัล ต้องใช้บริการที่ได้รับการรับรอง"],
        ["ข้อความเดิมในไฟล์ยังเลือกได้ไหม", "ได้ ข้อความเดิมยังเลือกและค้นหาได้ ไฟล์ต้นฉบับไม่ถูกแก้ ผลลัพธ์เป็นไฟล์ใหม่"],
        ["ลายเซ็นของฉันถูกเก็บไว้ที่ไหน", "ไม่ถูกส่งไปที่ไหน ถ้าติ๊ก “จำลายเซ็นไว้ในเครื่องนี้เท่านั้น” จะเก็บในเบราว์เซอร์ของเครื่องนี้เพื่อไม่ต้องวาดใหม่ทุกครั้ง"],
      ],
    },
    en: {
      h1: "Sign a PDF online",
      sub: "Draw or type a signature and place it on your document. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop a PDF into the box above. The signing steps appear below it.",
        "Create a signature by drawing, typing a name, using an image, or typing text or a date, then drag it into place.",
        "Press “Start” and save filename_signed.pdf.",
      ],
      uses: [
        "Sign a contract, quote or form without printing it",
        "Add your name and the date to a document you must send back",
        "Place a photographed or scanned signature on a PDF",
      ],
      faq: [
        ["Is this a digital signature?", "No. It is an image of your signature placed on the document, not a digital signature issued by a certification provider. If an agency requires a digital signature, use a certified service."],
        ["Can I still select the original text?", "Yes. The existing text stays selectable and searchable. Your original file is not changed; you get a new file."],
        ["Where is my signature stored?", "It isn't sent anywhere. If you tick “Remember my signature on this device only”, it is kept in this browser so you don't have to redraw it each time."],
      ],
    },
  },
  {
    id: "pdf2word", slug: "pdf-to-word.html", icon: "📝",
    related: ["pdf2excel", "compress", "split"],
    th: {
      title: "แปลง PDF เป็น Word (.docx) อ่านภาษาไทยจากไฟล์สแกนได้",
      desc: "แปลง PDF เป็นไฟล์ Word (.docx) แก้ไขได้ คงย่อหน้า ขนาดตัวอักษร ตัวหนา และรูป มี OCR ภาษาไทยและอังกฤษในเครื่อง ไฟล์ไม่ถูกอัปโหลด ทดลองฟรีวันละ 2 ครั้ง",
      h1: "แปลง PDF เป็น Word (.docx) แก้ไขได้",
      sub: "คงย่อหน้า ขนาดตัวอักษร ตัวหนา และรูป มี OCR ภาษาไทย/อังกฤษสำหรับไฟล์สแกน ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางไฟล์ PDF ในกรอบด้านบน (ครั้งละ 1 ไฟล์)",
        "กด “เริ่มประมวลผล” หน้าสแกนใช้เวลานานกว่าปกติ หน้าละหลายวินาที",
        "เปิดไฟล์ .docx ด้วย Word แล้วตรวจทานก่อนใช้งานจริง",
      ],
      uses: [
        "แก้ไขเอกสาร PDF ที่ไม่มีไฟล์ต้นฉบับ",
        "ดึงข้อความจากเอกสารที่สแกนมาเป็นข้อความที่แก้ไขได้",
        "นำเนื้อหาจาก PDF ไปปรับต่อใน Word",
      ],
      faq: [
        ["รองรับ PDF ที่เป็นภาพสแกนไหม", "รองรับด้วย OCR ที่อ่านภาษาไทยและอังกฤษในเครื่องคุณ ไม่เกิน 20 หน้าต่อไฟล์ ครั้งแรกต้องโหลดตัวอ่านประมาณ 10 MB ซึ่งต้องออนไลน์ในครั้งนั้น"],
        ["ผลลัพธ์ตรงกับต้นฉบับ 100% ไหม", "ไม่รับประกัน ตารางซับซ้อนหรือเอกสารหลายคอลัมน์อาจเพี้ยน OCR อาจอ่านผิด โดยเฉพาะตัวไทยเล็ก ๆ และลายมือ ควรตรวจทานใน Word ก่อนใช้งานจริง"],
        ["คงรูปแบบอะไรไว้ได้บ้าง", "คงย่อหน้า ขนาดตัวอักษร ตัวหนา และรูปภาพ เหมาะกับเอกสารที่เป็นข้อความเป็นหลัก"],
      ],
    },
    en: {
      h1: "Convert PDF to an editable Word (.docx) file",
      sub: "Keeps paragraphs, font sizes, bold text and images, with Thai and English OCR for scans. Nothing is uploaded.",
      steps: [
        "Drop a PDF into the box above (one file at a time).",
        "Press “Start”. Scanned pages take longer, several seconds per page.",
        "Open the .docx in Word and proofread it before real use.",
      ],
      uses: [
        "Edit a PDF when you don't have the original file",
        "Turn a scanned document into editable text",
        "Reuse content from a PDF in Word",
      ],
      faq: [
        ["Does it support scanned PDFs?", "Yes, using OCR that reads Thai and English on your device, up to 20 pages per file. The first time, it downloads a reader of about 10 MB, so you need to be online once."],
        ["Will the result match the original exactly?", "It isn't guaranteed. Complex tables or multi-column layouts may shift, and OCR can misread small Thai characters and handwriting. Proofread in Word before real use."],
        ["What formatting is kept?", "Paragraphs, font sizes, bold text and images. It works best for documents that are mostly text."],
      ],
    },
  },
  {
    id: "pdf2excel", slug: "pdf-to-excel.html", icon: "📊",
    related: ["pdf2word", "split", "merge"],
    th: {
      title: "แปลง PDF เป็น Excel (CSV) ดึงตัวเลขจากตาราง",
      desc: "ดึงข้อความและตัวเลขจากตารางใน PDF เป็นไฟล์ CSV เปิดด้วย Excel หรือ Google Sheets ได้ ทำในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลด ทดลองฟรีวันละ 2 ครั้ง",
      h1: "แปลง PDF เป็น Excel (CSV) ดึงข้อมูลจากตาราง",
      sub: "ได้ไฟล์ .csv เปิดด้วย Excel หรือ Google Sheets ทำในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลด",
      steps: [
        "วางไฟล์ PDF ที่มีข้อความจริงในกรอบด้านบน (ครั้งละ 1 ไฟล์)",
        "กด “เริ่มประมวลผล”",
        "เปิดไฟล์ .csv ด้วย Excel หรือ Google Sheets ข้อความแต่ละแถวใน PDF จะเป็นหนึ่งแถว",
      ],
      uses: [
        "ดึงตัวเลขจากสเตทเมนต์หรือรายงานไปคำนวณต่อ",
        "คัดลอกรายการในตารางโดยไม่ต้องพิมพ์ใหม่",
        "ย้ายข้อมูลจากใบแจ้งหนี้ใน PDF เข้าชีต",
      ],
      faq: [
        ["ได้ไฟล์ .xlsx หรือไม่", "ได้ไฟล์ .csv ซึ่งเปิดด้วย Excel หรือ Google Sheets ได้ ชื่อไฟล์_EasyConvert.csv"],
        ["ใช้กับ PDF ที่เป็นภาพสแกนได้ไหม", "ยังไม่รองรับ เครื่องมือนี้ไม่มี OCR ถ้าเปิด PDF แล้วลากเลือกข้อความไม่ได้ ให้ลองแปลงเป็น Word ก่อนด้วยเครื่องมือ PDF เป็น Word"],
        ["ตารางจะออกมาแบบไหน", "ข้อความแต่ละแถวใน PDF จะเป็นหนึ่งแถวในไฟล์ ตารางซับซ้อนอาจไม่ตรงคอลัมน์ ควรตรวจตัวเลขก่อนนำไปใช้"],
      ],
    },
    en: {
      h1: "Convert PDF tables to Excel (CSV)",
      sub: "Get a .csv you can open in Excel or Google Sheets. It runs on your device and nothing is uploaded.",
      steps: [
        "Drop a PDF that contains real text into the box above (one file at a time).",
        "Press “Start”.",
        "Open the .csv in Excel or Google Sheets. Each line of text in the PDF becomes one row.",
      ],
      uses: [
        "Pull numbers from a statement or report for further calculation",
        "Copy table entries without retyping them",
        "Move invoice data from a PDF into a sheet",
      ],
      faq: [
        ["Do I get an .xlsx file?", "You get a .csv file named filename_EasyConvert.csv, which opens in Excel or Google Sheets."],
        ["Does it work on scanned PDFs?", "Not yet. This tool has no OCR. If you can't drag-select text in the PDF, convert it with the PDF to Word tool first."],
        ["What will the table look like?", "Each line of text in the PDF becomes one row. Complex tables may not line up into columns, so check the numbers before using them."],
      ],
    },
  },
];

module.exports = { tools, FREE };
