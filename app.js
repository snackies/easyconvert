(function() {
    let currentLang = 'th';
    let isPremiumUser = false;
    let activeTool = 'img2pdf';
    let selectedFilesList = [];
    let userCountryCode = 'TH';
    const CRYPTO_SECRET = "EASYCONVERT_SECRET_PASSPHRASE_2026";

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cloudflare.com';

    function changeLanguage(lang) {
        currentLang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                if (key === "drop_instruction") {
                    el.innerHTML = translations[lang][key];
                } else {
                    el.innerText = translations[lang][key];
                }
            }
        });
        
        document.getElementById('tab-img2pdf').innerHTML = "📷 " + (lang === 'th' ? "Image to PDF" : "Image to PDF");
        document.getElementById('tab-pdf2img').innerHTML = "📄 " + (lang === 'th' ? "PDF to Image" : "PDF to Image");
        document.getElementById('tab-merge').innerHTML = "🧩 " + (lang === 'th' ? "Merge PDF" : "Merge PDF");
        document.getElementById('tab-split').innerHTML = "✂️ " + (lang === 'th' ? "Split PDF" : "Split PDF");
        document.getElementById('tab-compress').innerHTML = "🗜️ " + (lang === 'th' ? "PDF Compressor" : "PDF Compressor");
        document.getElementById('tab-pdf2word').innerHTML = "📝 " + (lang === 'th' ? "PDF to Word" : "PDF to Word");
        document.getElementById('tab-pdf2excel').innerHTML = "📊 " + (lang === 'th' ? "PDF to Excel" : "PDF to Excel");
        
        updatePricingDisplay();
        verifySecurePremiumToken();
        
        if (selectedFilesList.length === 0) {
            document.getElementById('file-status').innerText = translations[currentLang].no_file;
        } else {
            document.getElementById('file-status').innerText = translations[currentLang].file_ready_text.replace("{count}", selectedFilesList.length);
        }
    }

    function verifySecurePremiumToken() {
        const savedToken = localStorage.getItem('ec_premium_hash');
        const tokenSource = localStorage.getItem('ec_premium_user');
        const badge = document.getElementById('user-badge');
        
        if (savedToken && tokenSource) {
            const expectedHash = btoa(tokenSource + "_" + CRYPTO_SECRET);
            if (savedToken === expectedHash) {
                isPremiumUser = true;
                badge.innerText = translations[currentLang].premium_tier;
                badge.className = "badge premium";
                document.getElementById('ad-top').style.display = 'none';
                return;
            }
        }
        badge.innerText = translations[currentLang].btn_upgrade;
        badge.className = "badge upgrade";
        document.getElementById('ad-top').style.display = 'block';
    }

    function updatePricingDisplay() {
        const priceElement = document.getElementById('price-text');
        if (userCountryCode === 'TH') {
            priceElement.innerText = (currentLang === 'th') ? "👑 สมัครสมาชิกรายเดือน: เพียง 29 บาท" : "👑 Premium Monthly: Only 29 THB";
        } else {
            priceElement.innerText = (currentLang === 'th') ? "👑 สมาชิกพรีเมียมสากล: เพียง $1.99 USD" : "👑 Global Premium Pass: Only $1.99 USD";
        }
    }

    async function checkPurchasingPower() {
        try {
            const res = await fetch('https://ipapi.co');
            const data = await res.json();
            userCountryCode = data.country_code || 'TH';
        } catch (e) {}
        updatePricingDisplay();
    }

    async function executeFileProcessing() {
        if (selectedFilesList.length === 0) {
            alert(translations[currentLang].alert_select_file);
            return;
        }

        let totalSizeMB = 0;
        for(let i=0; i<selectedFilesList.length; i++) { totalSizeMB += selectedFilesList[i].size / 1024 / 1024; }
        
        if (!isPremiumUser) {
            if (totalSizeMB > 15 || activeTool !== 'img2pdf') {
                openGateModal();
                return;
            }
        }

        const statusLabel = document.getElementById('file-status');
        statusLabel.innerText = translations[currentLang].status_processing;

        try {
            if (activeTool === 'img2pdf') {
                const pdfDoc = await PDFLib.PDFDocument.create();
                for (let i = 0; i < selectedFilesList.length; i++) {
                    const arrayBuffer = await selectedFilesList[i].arrayBuffer();
                    let img = selectedFilesList[i].type === "image/png" ? await pdfDoc.embedPng(arrayBuffer) : await pdfDoc.embedJpg(arrayBuffer);
                    const page = pdfDoc.addPage([img.width, img.height]);
                    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                }
                const pdfBytes = await pdfDoc.save();
                triggerLocalDownload(pdfBytes, "EasyConvert_Images.pdf", "application/pdf");
            } 
            else if (activeTool === 'pdf2img') {
                const arrayBuffer = await selectedFilesList[0].arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({scale: 1.5});
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height; canvas.width = viewport.width;
                
                await page.render({canvasContext: context, viewport: viewport}).promise;
                canvas.toBlob((blob) => { triggerBlobDownload(blob, "EasyConvert_Page_1.jpg"); }, 'image/jpeg');
            }
            else if (activeTool === 'merge') {
                const mergedPdf = await PDFLib.PDFDocument.create();
                for (let i = 0; i < selectedFilesList.length; i++) {
                    const arrayBuffer = await selectedFilesList[i].arrayBuffer();
                    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
                    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
                const pdfBytes = await mergedPdf.save();
                triggerLocalDownload(pdfBytes, "EasyConvert_Merged.pdf", "application/pdf");
            }
            else if (activeTool === 'split') {
                const rangeInput = document.getElementById('page-range').value || "1";
                const arrayBuffer = await selectedFilesList[0].arrayBuffer();
                const srcPdf = await PDFLib.PDFDocument.load(arrayBuffer);
                const splitPdf = await PDFLib.PDFDocument.create();
                
                let pageIndices = [];
                if (rangeInput.includes('-')) {
                    const parts = rangeInput.split('-');
                    const start = parseInt(parts[0]) - 1;
                    const end = parseInt(parts[1]) - 1;
                    for (let i = start; i <= end; i++) { if(i < srcPdf.getPageCount()) pageIndices.push(i); }
                } else {
                    const idx = parseInt(rangeInput) - 1;
                    if(idx < srcPdf.getPageCount()) pageIndices = [idx];
                }

                const copiedPages = await splitPdf.copyPages(srcPdf, pageIndices);
                copiedPages.forEach((page) => splitPdf.addPage(page));
                const pdfBytes = await splitPdf.save();
                triggerLocalDownload(pdfBytes, `EasyConvert_Split_Page_${rangeInput}.pdf`, "application/pdf");
            }
            else if (activeTool === 'compress') {
                const arrayBuffer = await selectedFilesList[0].arrayBuffer();
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
                const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
                triggerLocalDownload(pdfBytes, "Compressed_" + selectedFilesList[0].name, "application/pdf");
            }
            else if (activeTool === 'pdf2word') {
                const arrayBuffer = await selectedFilesList[0].arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
                const pdf = await loadingTask.promise;
                let fullText = "";
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n\n";
                }
                
                const bytes = new TextEncoder().encode(fullText);
                triggerLocalDownload(bytes, selectedFilesList[0].name.replace(".pdf", "") + "_EasyConvert.doc", "application/msword");
            }
            else if (activeTool === 'pdf2excel') {
                const arrayBuffer = await selectedFilesList[0].arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
                const pdf = await loadingTask.promise;
                let csvContent = "";
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    let lastY = -1;
                    let rowText = "";
                    for (let item of textContent.items) {
                        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                            csvContent += rowText + "\n";
                            rowText = "";
                            }
                            rowText += (rowText === "" ? "" : ",") + "${item.str.replace(/"/g, '""')}";
                            lastY = item.transform[5];
                            }
                            csvContent += rowText + "\n";
                            }
                            const bytes = new TextEncoder().encode("\uFEFF" + csvContent);
                            triggerLocalDownload(bytes, selectedFilesList[0].name.replace(".pdf", "") + "_EasyConvert.csv", "text/csv;charset=utf-8;");
                            }
                            statusLabel.innerText = translations[currentLang].status_done;
                            } catch (err) {
                            alert(translations[currentLang].status_error + err.message);
                            statusLabel.innerText = translations[currentLang].status_error_label;
                            }
                            }
                            function triggerLocalDownload(bytes, filename, type) {
                            const blob = new Blob([bytes], { type: type });
                            triggerBlobDownload(blob, filename);
                            }
                            function triggerBlobDownload(blob, filename) {
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob); link.download = filename;
                            document.body.appendChild(link); link.click(); document.body.removeChild(link);
                            URL.revokeObjectURL(link.href);
                            }
                            function openGateModal() { document.getElementById('gate-modal').style.display = 'flex'; }
                            function closeGateModal() { document.getElementById('gate-modal').style.display = 'none'; }
                            function startRewardedAd() {
                            const btn = document.getElementById('watch-ad-btn');
                            let timeLeft = 15; btn.disabled = true;
                            const counter = setInterval(() => {
                            btn.innerText = translations[currentLang].ad_countdown.replace("{time}", timeLeft);
                            timeLeft--;
                            if (timeLeft < 0) {
                            clearInterval(counter);
                            btn.disabled = false;
                            btn.innerText = translations[currentLang].btn_watch;
                            closeGateModal();
                            alert(translations[currentLang].alert_ad_done);
                            isPremiumUser = true;
executeFileProcessing().then(() => {
isPremiumUser = false;
verifySecurePremiumToken();
});
}
}, 1000);
}
// 🔄 ระบบชำระเงินจำลองพรีเมียมรองรับแยกภูมิภาคสากล
function simulatePayment() {
if (userCountryCode === 'TH') {
const email = prompt(translations[currentLang].prompt_email);
if (email) {
const generateHash = btoa(email + "" + CRYPTO_SECRET);
localStorage.setItem('ec_premium_user', email);
localStorage.setItem('ec_premium_hash', generateHash);
alert(translations[currentLang].alert_pay_done);
closeGateModal();
window.location.reload();
}
} else {
alert("Redirecting to secure Global Stripe Payment Gateway ($1.99 USD)...");
const mockEmail = "inter_user@example.com";
const generateHash = btoa(mockEmail + "" + CRYPTO_SECRET);
localStorage.setItem('ec_premium_user', mockEmail);
localStorage.setItem('ec_premium_hash', generateHash);
closeGateModal();
window.location.reload();
}
}
// ดักฟังและเชื่อมโยง Event Listener มั่นคงหลัง DOM พร้อมทำงาน ป้องกันหน้าเว็บนิ่งค้าง
document.addEventListener("DOMContentLoaded", function() {
document.querySelectorAll('.tab-btn').forEach(button => {
button.addEventListener('click', function() {
activeTool = this.getAttribute('data-tool');
document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
this.classList.add('active');
document.getElementById('split-options').style.display = (activeTool === 'split') ? 'block' : 'none';
const currentTabName = this.innerText;
document.getElementById('file-status').innerText = translations[currentLang].switch_text + currentTabName;
});
});
document.getElementById('lang-toggle').addEventListener('change', function() { changeLanguage(this.value); });
document.getElementById('user-badge').addEventListener('click', openGateModal);
document.getElementById('close-modal-btn').addEventListener('click', closeGateModal);
document.getElementById('pay-btn').addEventListener('click', simulatePayment);
document.getElementById('watch-ad-btn').addEventListener('click', startRewardedAd);
document.getElementById('file-input').addEventListener('change', function(e) {
if(e.target.files.length > 0) {
selectedFilesList = e.target.files;
document.getElementById('file-status').innerText = translations[currentLang].file_ready_text.replace("{count}", e.target.files.length);
}
});
document.getElementById('process-btn').addEventListener('click', executeFileProcessing);
const dropZone = document.getElementById('drop-area');
if(dropZone) {
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); });
dropZone.addEventListener('drop', (e) => {
e.preventDefault();
if(e.dataTransfer.files.length > 0) {
selectedFilesList = e.dataTransfer.files;
document.getElementById('file-status').innerText = translations[currentLang].file_ready_text.replace("{count}", selectedFilesList.length);
}
});
}
// เริ่มต้นลำดับทำงานเมื่อเปิดหน้าจอ
changeLanguage('th');
initAntiCheat();
checkPurchasingPower();
});
})();