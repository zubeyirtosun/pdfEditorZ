// Global variables
let currentPdf = null;
let currentPageNum = 1;
let pdfDoc = null;
let pageCount = 0;
let currentScale = 1.0;
let activeTool = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let annotations = [];
let currentSignature = null;

// Check if libraries are loaded
function checkLibraries() {
    console.log('Kütüphane kontrolü başlatılıyor...');
    
    if (typeof pdfjsLib === 'undefined') {
        console.error('PDF.js kütüphanesi yüklenemedi!');
        return false;
    }
    
    if (typeof PDFLib === 'undefined') {
        console.error('PDF-lib kütüphanesi yüklenemedi!');
        return false;
    }
    
    console.log('✅ Tüm kütüphaneler başarıyla yüklendi');
    return true;
}

// Alternative CDN loader
async function loadAlternativeCDNs() {
    console.log('Alternatif CDN\'ler yükleniyor...');
    
    // Alternative PDF.js
    if (typeof pdfjsLib === 'undefined') {
        try {
            const script1 = document.createElement('script');
            script1.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
            document.head.appendChild(script1);
            
            await new Promise((resolve, reject) => {
                script1.onload = resolve;
                script1.onerror = reject;
            });
            
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            }
        } catch (error) {
            console.error('Alternatif PDF.js yüklenemedi:', error);
        }
    }
    
    // Alternative PDF-lib
    if (typeof PDFLib === 'undefined') {
        try {
            const script2 = document.createElement('script');
            script2.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
            document.head.appendChild(script2);
            
            await new Promise((resolve, reject) => {
                script2.onload = resolve;
                script2.onerror = reject;
            });
        } catch (error) {
            console.error('Alternatif PDF-lib yüklenemedi:', error);
        }
    }
    
    return checkLibraries();
}

// PDF.js setup
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// DOM elements
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const welcomeScreen = document.getElementById('welcomeScreen');
const pageNavigation = document.getElementById('pageNavigation');
const pageInfo = document.getElementById('pageInfo');
const pageInput = document.getElementById('pageInput');
const zoomLevel = document.getElementById('zoomLevel');
const sizePicker = document.getElementById('sizePicker');
const sizeValue = document.getElementById('sizeValue');
const colorPicker = document.getElementById('colorPicker');
const overlay = document.getElementById('pdfOverlay');

// Size picker event
sizePicker.addEventListener('input', function() {
    sizeValue.textContent = this.value + 'px';
});

// Load PDF function
async function loadPDF(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log('Seçilen dosya:', file.name, 'Boyut:', file.size, 'bytes');
    
    // File type check
    if (file.type !== 'application/pdf') {
        alert('Lütfen sadece PDF dosyası seçin!');
        return;
    }

    // Check if libraries are loaded
    if (!checkLibraries()) {
        alert('PDF kütüphaneleri yüklenirken hata oluştu. Sayfayı yenileyin veya internet bağlantınızı kontrol edin.');
        
        // Try to load alternative CDNs
        const loaded = await loadAlternativeCDNs();
        if (!loaded) {
            alert('PDF kütüphaneleri yüklenemedi. Lütfen sayfayı yenileyin.');
            return;
        }
    }

    try {
        console.log('PDF yükleme başladı...');
        
        // Show loading indicator
        const welcomeText = document.querySelector('.welcome-screen h2');
        const originalText = welcomeText.textContent;
        welcomeText.textContent = 'PDF Yükleniyor...';
        
        const arrayBuffer = await file.arrayBuffer();
        console.log('ArrayBuffer oluşturuldu, boyut:', arrayBuffer.byteLength);
        
        // Load with PDF.js for display
        console.log('PDF.js ile yükleme başladı...');
        pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        pageCount = pdfDoc.numPages;
        console.log('PDF.js yükleme tamamlandı. Sayfa sayısı:', pageCount);
        
        // Load with PDF-lib for editing
        console.log('PDF-lib ile yükleme başladı...');
        currentPdf = await PDFLib.PDFDocument.load(arrayBuffer);
        console.log('PDF-lib yükleme tamamlandı');
        
        // Hide welcome screen and show PDF
        welcomeScreen.style.display = 'none';
        canvas.style.display = 'block';
        pageNavigation.style.display = 'flex';
        
        // Render first page
        await renderPage(1);
        updatePageInfo();
        
        console.log('PDF başarıyla yüklendi:', pageCount, 'sayfa');
        
    } catch (error) {
        console.error('PDF yükleme detaylı hatası:', error);
        
        // Restore welcome text
        const welcomeText = document.querySelector('.welcome-screen h2');
        welcomeText.textContent = 'PDF EditorZ\'e Hoş Geldiniz!';
        
        // More specific error messages
        let errorMessage = 'PDF yüklenirken bir hata oluştu. ';
        
        if (error.message.includes('Invalid PDF')) {
            errorMessage += 'Bu dosya geçerli bir PDF değil veya hasarlı olabilir.';
        } else if (error.message.includes('Password')) {
            errorMessage += 'Bu PDF şifre korumalı. Şu anda şifreli PDF\'ler desteklenmiyor.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage += 'Ağ bağlantısı sorunu. İnternet bağlantınızı kontrol edin.';
        } else if (error.name === 'InvalidPDFException') {
            errorMessage += 'PDF dosyası hasarlı veya desteklenmeyen formatta.';
        } else {
            errorMessage += 'Detaylar: ' + error.message;
        }
        
        alert(errorMessage);
        
        // Reset file input
        document.getElementById('pdfInput').value = '';
    }
}

// Render page function
async function renderPage(pageNum) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Update overlay size
        overlay.style.width = viewport.width + 'px';
        overlay.style.height = viewport.height + 'px';
        
        currentPageNum = pageNum;
        updatePageInfo();
        
        console.log('Sayfa render edildi:', pageNum);
    } catch (error) {
        console.error('Sayfa render hatası:', error);
    }
}

// Page navigation functions
function nextPage() {
    if (currentPageNum < pageCount) {
        renderPage(currentPageNum + 1);
    }
}

function previousPage() {
    if (currentPageNum > 1) {
        renderPage(currentPageNum - 1);
    }
}

function goToPage(pageNum) {
    const num = parseInt(pageNum);
    if (num >= 1 && num <= pageCount) {
        renderPage(num);
    }
}

// Zoom functions
function zoomIn() {
    if (currentScale < 3) {
        currentScale += 0.25;
        renderPage(currentPageNum);
        updateZoomLevel();
    }
}

function zoomOut() {
    if (currentScale > 0.5) {
        currentScale -= 0.25;
        renderPage(currentPageNum);
        updateZoomLevel();
    }
}

function updateZoomLevel() {
    zoomLevel.textContent = Math.round(currentScale * 100) + '%';
}

function updatePageInfo() {
    pageInfo.textContent = `Sayfa: ${currentPageNum} / ${pageCount}`;
    pageInput.value = currentPageNum;
    pageInput.max = pageCount;
}

// Tool activation
function activateTool(tool) {
    // Remove active class from all tools
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to selected tool
    document.getElementById(tool + 'Tool').classList.add('active');
    
    activeTool = tool;
    
    // Special handling for signature tool
    if (tool === 'signature') {
        openSignatureModal();
    }
    
    // Update cursor based on tool
    updateCursor();
    
    console.log('Aktif araç:', tool);
}

function updateCursor() {
    switch (activeTool) {
        case 'text':
            canvas.style.cursor = 'text';
            break;
        case 'draw':
            canvas.style.cursor = 'crosshair';
            break;
        case 'signature':
            canvas.style.cursor = 'pointer';
            break;
        default:
            canvas.style.cursor = 'default';
    }
}

// Canvas event listeners
canvas.addEventListener('click', handleCanvasClick);
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);

function handleCanvasClick(event) {
    if (!activeTool) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    switch (activeTool) {
        case 'text':
            addTextAnnotation(x, y);
            break;
        case 'signature':
            if (currentSignature) {
                addSignature(x, y);
            }
            break;
    }
}

function handleMouseDown(event) {
    if (activeTool === 'draw') {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = event.clientX - rect.left;
        lastY = event.clientY - rect.top;
    }
}

function handleMouseMove(event) {
    if (activeTool === 'draw' && isDrawing) {
        const rect = canvas.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        
        drawLine(lastX, lastY, currentX, currentY);
        
        lastX = currentX;
        lastY = currentY;
    }
}

function handleMouseUp() {
    isDrawing = false;
}

// Drawing function
function drawLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = colorPicker.value;
    ctx.lineWidth = parseInt(sizePicker.value) / 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Save annotation
    annotations.push({
        type: 'draw',
        x1, y1, x2, y2,
        color: colorPicker.value,
        width: parseInt(sizePicker.value) / 4,
        page: currentPageNum
    });
}

// Text annotation
function addTextAnnotation(x, y) {
    const text = prompt('Eklemek istediğiniz metni girin:');
    if (!text) return;
    
    ctx.font = `${sizePicker.value}px Arial`;
    ctx.fillStyle = colorPicker.value;
    ctx.fillText(text, x, y);
    
    // Save annotation
    annotations.push({
        type: 'text',
        x, y, text,
        size: parseInt(sizePicker.value),
        color: colorPicker.value,
        page: currentPageNum
    });
    
    console.log('Metin eklendi:', text);
}

// Signature functions
function openSignatureModal() {
    document.getElementById('signatureModal').style.display = 'block';
    initSignatureCanvas();
}

function closeSignatureModal() {
    document.getElementById('signatureModal').style.display = 'none';
}

function switchSignatureTab(tab) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.signature-tab').forEach(tab => tab.classList.remove('active'));
    
    // Activate selected tab
    event.target.classList.add('active');
    document.getElementById(tab + 'Tab').classList.add('active');
}

function initSignatureCanvas() {
    const sigCanvas = document.getElementById('signatureCanvas');
    const sigCtx = sigCanvas.getContext('2d');
    let isSignatureDrawing = false;
    
    sigCanvas.addEventListener('mousedown', (e) => {
        isSignatureDrawing = true;
        const rect = sigCanvas.getBoundingClientRect();
        sigCtx.beginPath();
        sigCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    });
    
    sigCanvas.addEventListener('mousemove', (e) => {
        if (isSignatureDrawing) {
            const rect = sigCanvas.getBoundingClientRect();
            sigCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
            sigCtx.stroke();
        }
    });
    
    sigCanvas.addEventListener('mouseup', () => {
        isSignatureDrawing = false;
    });
}

function clearSignature() {
    const sigCanvas = document.getElementById('signatureCanvas');
    const sigCtx = sigCanvas.getContext('2d');
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
}

function saveSignature() {
    const sigCanvas = document.getElementById('signatureCanvas');
    currentSignature = sigCanvas.toDataURL();
    closeSignatureModal();
    alert('İmza kaydedildi! Şimdi PDF üzerinde istediğiniz yere tıklayın.');
}

function saveTypedSignature() {
    const text = document.getElementById('signatureText').value;
    const font = document.getElementById('signatureFont').value;
    
    if (!text) {
        alert('Lütfen imzanızı yazın.');
        return;
    }
    
    // Create signature from text
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = 300;
    tempCanvas.height = 100;
    
    tempCtx.font = `30px ${font}`;
    tempCtx.fillStyle = '#000';
    tempCtx.textAlign = 'center';
    tempCtx.fillText(text, 150, 50);
    
    currentSignature = tempCanvas.toDataURL();
    closeSignatureModal();
    alert('İmza kaydedildi! Şimdi PDF üzerinde istediğiniz yere tıklayın.');
}

function addSignature(x, y) {
    if (!currentSignature) return;
    
    const img = new Image();
    img.onload = function() {
        ctx.drawImage(img, x - 50, y - 25, 100, 50);
        
        // Save annotation
        annotations.push({
            type: 'signature',
            x: x - 50,
            y: y - 25,
            width: 100,
            height: 50,
            image: currentSignature,
            page: currentPageNum
        });
    };
    img.src = currentSignature;
    
    console.log('İmza eklendi');
}

// Page operations
function rotatePage() {
    if (!currentPdf) return;
    
    try {
        const pages = currentPdf.getPages();
        const page = pages[currentPageNum - 1];
        page.setRotation(PDFLib.degrees(90));
        
        console.log('Sayfa döndürüldü');
        alert('Sayfa döndürüldü! Değişiklikleri görmek için PDF\'i indirin.');
    } catch (error) {
        console.error('Sayfa döndürme hatası:', error);
    }
}

async function deletePage() {
    if (!currentPdf || pageCount <= 1) {
        alert('Son sayfa silinemez!');
        return;
    }
    
    if (!confirm('Bu sayfayı silmek istediğinizden emin misiniz?')) {
        return;
    }
    
    try {
        currentPdf.removePage(currentPageNum - 1);
        pageCount--;
        
        if (currentPageNum > pageCount) {
            currentPageNum = pageCount;
        }
        
        // Reload the PDF to reflect changes
        const pdfBytes = await currentPdf.save();
        const newPdf = await PDFLib.PDFDocument.load(pdfBytes);
        currentPdf = newPdf;
        
        // Reload for display
        pdfDoc = await pdfjsLib.getDocument(pdfBytes).promise;
        renderPage(currentPageNum);
        updatePageInfo();
        
        console.log('Sayfa silindi');
    } catch (error) {
        console.error('Sayfa silme hatası:', error);
        alert('Sayfa silinirken bir hata oluştu.');
    }
}

async function addBlankPage() {
    if (!currentPdf) return;
    
    try {
        const page = currentPdf.addPage();
        pageCount++;
        
        // Reload the PDF to reflect changes
        const pdfBytes = await currentPdf.save();
        const newPdf = await PDFLib.PDFDocument.load(pdfBytes);
        currentPdf = newPdf;
        
        // Reload for display
        pdfDoc = await pdfjsLib.getDocument(pdfBytes).promise;
        updatePageInfo();
        
        console.log('Boş sayfa eklendi');
        alert('Boş sayfa eklendi!');
    } catch (error) {
        console.error('Sayfa ekleme hatası:', error);
        alert('Sayfa eklenirken bir hata oluştu.');
    }
}

// Download function
async function downloadPDF() {
    if (!currentPdf) {
        alert('Önce bir PDF dosyası yükleyin!');
        return;
    }
    
    try {
        // Apply annotations to PDF
        await applyAnnotations();
        
        const pdfBytes = await currentPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'edited-document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('PDF indirildi');
    } catch (error) {
        console.error('PDF indirme hatası:', error);
        alert('PDF indirilirken bir hata oluştu.');
    }
}

async function applyAnnotations() {
    if (annotations.length === 0) return;
    
    try {
        const pages = currentPdf.getPages();
        
        for (const annotation of annotations) {
            const page = pages[annotation.page - 1];
            const { width, height } = page.getSize();
            
            // Convert canvas coordinates to PDF coordinates
            const pdfX = (annotation.x / canvas.width) * width;
            const pdfY = height - ((annotation.y / canvas.height) * height);
            
            switch (annotation.type) {
                case 'text':
                    page.drawText(annotation.text, {
                        x: pdfX,
                        y: pdfY,
                        size: annotation.size,
                        color: PDFLib.rgb(
                            parseInt(annotation.color.substr(1, 2), 16) / 255,
                            parseInt(annotation.color.substr(3, 2), 16) / 255,
                            parseInt(annotation.color.substr(5, 2), 16) / 255
                        )
                    });
                    break;
                
                case 'signature':
                    if (annotation.image) {
                        try {
                            // Convert signature image to PDF format
                            const imageBytes = await fetch(annotation.image).then(res => res.arrayBuffer());
                            const image = await currentPdf.embedPng(imageBytes);
                            
                            page.drawImage(image, {
                                x: pdfX,
                                y: pdfY - (annotation.height / canvas.height) * height,
                                width: (annotation.width / canvas.width) * width,
                                height: (annotation.height / canvas.height) * height
                            });
                        } catch (imgError) {
                            console.warn('İmza ekleme hatası:', imgError);
                        }
                    }
                    break;
            }
        }
        
        console.log('Annotations uygulandı:', annotations.length);
    } catch (error) {
        console.error('Annotation uygulama hatası:', error);
    }
}

// Help modal
function showHelp() {
    document.getElementById('helpModal').style.display = 'block';
}

function closeHelpModal() {
    document.getElementById('helpModal').style.display = 'none';
}

// Modal close on background click
window.addEventListener('click', function(event) {
    const signatureModal = document.getElementById('signatureModal');
    const helpModal = document.getElementById('helpModal');
    
    if (event.target === signatureModal) {
        closeSignatureModal();
    } else if (event.target === helpModal) {
        closeHelpModal();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
            case 's':
                event.preventDefault();
                downloadPDF();
                break;
            case 'o':
                event.preventDefault();
                document.getElementById('pdfInput').click();
                break;
        }
    }
    
    // Page navigation with arrow keys
    switch (event.key) {
        case 'ArrowLeft':
            previousPage();
            break;
        case 'ArrowRight':
            nextPage();
            break;
    }
});

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    console.log('PDF EditorZ yüklendi!');
    
    // Check if libraries are loaded
    if (!checkLibraries()) {
        console.warn('Kütüphaneler yüklenmedi, alternatif CDN\'ler deneniyor...');
        
        // Show loading message
        const welcomeText = document.querySelector('.welcome-screen h2');
        if (welcomeText) {
            welcomeText.textContent = 'PDF Kütüphaneleri Yükleniyor...';
        }
        
        const loaded = await loadAlternativeCDNs();
        
        if (welcomeText) {
            welcomeText.textContent = loaded ? 'PDF EditorZ\'e Hoş Geldiniz!' : 'Kütüphane Yükleme Hatası!';
        }
        
        if (!loaded) {
            console.error('Kütüphaneler yüklenemedi!');
            alert('PDF düzenleme kütüphaneleri yüklenemedi. Lütfen sayfayı yenileyin veya internet bağlantınızı kontrol edin.');
        }
    }
    
    updateZoomLevel();
    
    // Set initial size value
    sizeValue.textContent = sizePicker.value + 'px';
}); 