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

// Modern editing variables
let undoStack = [];
let redoStack = [];
let selectedElement = null;
let isDragging = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };

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

// Undo/Redo System
function saveState() {
    const state = {
        annotations: JSON.parse(JSON.stringify(annotations)),
        canvasData: canvas.toDataURL()
    };
    undoStack.push(state);
    
    // Limit undo stack to 50 operations
    if (undoStack.length > 50) {
        undoStack.shift();
    }
    
    // Clear redo stack when new action is performed
    redoStack = [];
    
    console.log('State saved, undo stack size:', undoStack.length);
}

function undo() {
    if (undoStack.length === 0) return;
    
    // Save current state to redo stack
    const currentState = {
        annotations: JSON.parse(JSON.stringify(annotations)),
        canvasData: canvas.toDataURL()
    };
    redoStack.push(currentState);
    
    // Restore previous state
    const previousState = undoStack.pop();
    annotations = previousState.annotations;
    
    // Redraw canvas
    redrawCanvas();
    console.log('Undo performed');
}

function redo() {
    if (redoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState = {
        annotations: JSON.parse(JSON.stringify(annotations)),
        canvasData: canvas.toDataURL()
    };
    undoStack.push(currentState);
    
    // Restore next state
    const nextState = redoStack.pop();
    annotations = nextState.annotations;
    
    // Redraw canvas
    redrawCanvas();
    console.log('Redo performed');
}

async function redrawCanvas() {
    // Clear overlay
    overlay.innerHTML = '';
    
    // Re-render PDF page
    await renderPage(currentPageNum);
    
    // Redraw all annotations
    annotations.forEach(annotation => {
        if (annotation.page === currentPageNum) {
            drawAnnotation(annotation);
        }
    });
}

function drawAnnotation(annotation) {
    switch (annotation.type) {
        case 'text':
            drawTextAnnotation(annotation);
            break;
        case 'draw':
            drawLineAnnotation(annotation);
            break;
        case 'signature':
            drawSignatureAnnotation(annotation);
            break;
        case 'rectangle':
        case 'circle':
        case 'arrow':
            drawShapeAnnotation(annotation);
            break;
    }
}

function drawTextAnnotation(annotation) {
    // Create editable text element
    const textElement = document.createElement('div');
    textElement.className = 'text-annotation';
    textElement.style.position = 'absolute';
    textElement.style.left = annotation.x + 'px';
    textElement.style.top = annotation.y + 'px';
    textElement.style.fontSize = annotation.size + 'px';
    textElement.style.color = annotation.color;
    textElement.style.fontFamily = 'Arial, sans-serif';
    textElement.style.cursor = 'move';
    textElement.style.userSelect = 'none';
    textElement.style.padding = '2px';
    textElement.style.border = '1px dashed transparent';
    textElement.textContent = annotation.text;
    textElement.setAttribute('data-annotation-id', annotation.id);
    
    // Make it editable and draggable
    textElement.addEventListener('click', () => selectElement(textElement, annotation));
    textElement.addEventListener('dblclick', () => editText(textElement, annotation));
    
    overlay.appendChild(textElement);
}

function drawLineAnnotation(annotation) {
    ctx.beginPath();
    ctx.moveTo(annotation.x1, annotation.y1);
    ctx.lineTo(annotation.x2, annotation.y2);
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.width;
    ctx.lineCap = 'round';
    ctx.stroke();
}

function drawSignatureAnnotation(annotation) {
    if (annotation.image) {
        const img = new Image();
        img.onload = function() {
            ctx.drawImage(img, annotation.x, annotation.y, annotation.width, annotation.height);
        };
        img.src = annotation.image;
    }
}

function drawShapeAnnotation(annotation) {
    ctx.beginPath();
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.width || 2;
    
    switch (annotation.shapeType) {
        case 'rectangle':
            ctx.rect(annotation.x, annotation.y, annotation.width, annotation.height);
            break;
        case 'circle':
            const radius = Math.min(annotation.width, annotation.height) / 2;
            ctx.arc(annotation.x + radius, annotation.y + radius, radius, 0, 2 * Math.PI);
            break;
        case 'arrow':
            drawArrow(annotation.x1, annotation.y1, annotation.x2, annotation.y2);
            break;
    }
    
    if (annotation.filled) {
        ctx.fillStyle = annotation.color;
        ctx.fill();
    } else {
        ctx.stroke();
    }
}

function drawArrow(x1, y1, x2, y2) {
    const headLength = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    // Draw line
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    
    // Draw arrowhead
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
}

// Modern text editing
function selectElement(element, annotation) {
    // Deselect previous element
    if (selectedElement) {
        selectedElement.style.border = '1px dashed transparent';
    }
    
    selectedElement = element;
    element.style.border = '1px dashed #667eea';
    
    // Add resize handles if needed
    addResizeHandles(element, annotation);
}

function editText(element, annotation) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = annotation.text;
    input.style.position = 'absolute';
    input.style.left = element.style.left;
    input.style.top = element.style.top;
    input.style.fontSize = element.style.fontSize;
    input.style.color = element.style.color;
    input.style.border = '2px solid #667eea';
    input.style.background = 'white';
    input.style.padding = '2px';
    input.style.borderRadius = '4px';
    input.style.outline = 'none';
    
    overlay.appendChild(input);
    input.focus();
    input.select();
    
    const saveText = () => {
        if (input.value.trim()) {
            saveState(); // Save for undo
            annotation.text = input.value;
            element.textContent = input.value;
        }
        overlay.removeChild(input);
    };
    
    input.addEventListener('blur', saveText);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveText();
        } else if (e.key === 'Escape') {
            overlay.removeChild(input);
        }
    });
}

function addResizeHandles(element, annotation) {
    // Remove existing handles
    document.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
    
    // Add corner handles for resizing
    ['nw', 'ne', 'sw', 'se'].forEach(position => {
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.style.position = 'absolute';
        handle.style.width = '8px';
        handle.style.height = '8px';
        handle.style.background = '#667eea';
        handle.style.border = '1px solid white';
        handle.style.borderRadius = '50%';
        handle.style.cursor = position + '-resize';
        handle.style.zIndex = '1000';
        
        // Position handle
        const rect = element.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        
        switch (position) {
            case 'nw':
                handle.style.left = (rect.left - overlayRect.left - 4) + 'px';
                handle.style.top = (rect.top - overlayRect.top - 4) + 'px';
                break;
            case 'ne':
                handle.style.left = (rect.right - overlayRect.left - 4) + 'px';
                handle.style.top = (rect.top - overlayRect.top - 4) + 'px';
                break;
            case 'sw':
                handle.style.left = (rect.left - overlayRect.left - 4) + 'px';
                handle.style.top = (rect.bottom - overlayRect.top - 4) + 'px';
                break;
            case 'se':
                handle.style.left = (rect.right - overlayRect.left - 4) + 'px';
                handle.style.top = (rect.bottom - overlayRect.top - 4) + 'px';
                break;
        }
        
        overlay.appendChild(handle);
    });
}

// Eraser tool
function activateEraser() {
    activeTool = 'eraser';
    canvas.style.cursor = 'crosshair';
    
    // Show eraser size indicator
    const eraserIndicator = document.createElement('div');
    eraserIndicator.id = 'eraserIndicator';
    eraserIndicator.style.position = 'fixed';
    eraserIndicator.style.width = sizePicker.value + 'px';
    eraserIndicator.style.height = sizePicker.value + 'px';
    eraserIndicator.style.border = '2px solid #ff4757';
    eraserIndicator.style.borderRadius = '50%';
    eraserIndicator.style.pointerEvents = 'none';
    eraserIndicator.style.zIndex = '10000';
    eraserIndicator.style.display = 'none';
    document.body.appendChild(eraserIndicator);
}

function eraseAt(x, y) {
    const eraserSize = parseInt(sizePicker.value);
    
    // Remove annotations within eraser radius
    annotations = annotations.filter(annotation => {
        if (annotation.page !== currentPageNum) return true;
        
        switch (annotation.type) {
            case 'text':
                const textDistance = Math.sqrt(
                    Math.pow(annotation.x - x, 2) + Math.pow(annotation.y - y, 2)
                );
                return textDistance > eraserSize;
                
            case 'draw':
                const lineDistance = distanceToLine(x, y, annotation.x1, annotation.y1, annotation.x2, annotation.y2);
                return lineDistance > eraserSize;
                
            case 'signature':
                return !(x >= annotation.x && x <= annotation.x + annotation.width &&
                        y >= annotation.y && y <= annotation.y + annotation.height);
                
            default:
                return true;
        }
    });
    
    redrawCanvas();
}

function distanceToLine(px, py, x1, y1, x2, y2) {
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    if (length === 0) return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2));
    
    const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / Math.pow(length, 2)));
    const projection = { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    
    return Math.sqrt(Math.pow(px - projection.x, 2) + Math.pow(py - projection.y, 2));
}

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
        
        // Read file as ArrayBuffer multiple times to ensure fresh copies
        console.log('PDF dosyası okunuyor...');
        
        // First read for PDF.js (display)
        const pdfJsBuffer = await file.arrayBuffer();
        console.log('PDF.js için ArrayBuffer oluşturuldu, boyut:', pdfJsBuffer.byteLength);
        
        // Load with PDF.js for display first
        console.log('PDF.js ile yükleme başladı...');
        pdfDoc = await pdfjsLib.getDocument(pdfJsBuffer).promise;
        pageCount = pdfDoc.numPages;
        console.log('PDF.js yükleme tamamlandı. Sayfa sayısı:', pageCount);
        
        // Second read for PDF-lib (editing) - fresh ArrayBuffer
        console.log('PDF-lib için ikinci okuma başladı...');
        const pdfLibBuffer = await file.arrayBuffer();
        console.log('PDF-lib için ArrayBuffer oluşturuldu, boyut:', pdfLibBuffer.byteLength);
        
        // Load with PDF-lib for editing
        console.log('PDF-lib ile yükleme başladı...');
        currentPdf = await PDFLib.PDFDocument.load(pdfLibBuffer);
        console.log('PDF-lib yükleme tamamlandı');
        
        // Hide welcome screen and show PDF
        welcomeScreen.style.display = 'none';
        canvas.style.display = 'block';
        pageNavigation.style.display = 'flex';
        
        // Clear previous annotations and state
        annotations = [];
        undoStack = [];
        redoStack = [];
        
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
    if (tool === 'eraser') {
        // Handle eraser specially
        activateEraser();
        document.querySelector('[onclick="activateTool(\'eraser\')"]')?.classList.add('active');
    } else {
        document.getElementById(tool + 'Tool')?.classList.add('active');
        activeTool = tool;
    }
    
    // Special handling for signature tool
    if (tool === 'signature') {
        openSignatureModal();
    }
    
    // Update cursor based on tool
    updateCursor();
    
    // Clear selection when switching tools
    if (selectedElement) {
        selectedElement.style.border = '1px dashed transparent';
        selectedElement = null;
        document.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
    }
    
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
        case 'shape':
            canvas.style.cursor = 'crosshair';
            break;
        case 'eraser':
            canvas.style.cursor = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 20 20\'><circle cx=\'10\' cy=\'10\' r=\'8\' stroke=\'%23ff4757\' stroke-width=\'2\' fill=\'none\'/></svg>") 10 10, crosshair';
            break;
        default:
            canvas.style.cursor = 'default';
    }
}

// Modern shape variables
let shapeStartX = 0;
let shapeStartY = 0;
let isDrawingShape = false;
let currentShape = 'rectangle';

// Canvas event listeners
canvas.addEventListener('click', handleCanvasClick);
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);

// Overlay event listeners for drag and drop
overlay.addEventListener('mousedown', handleOverlayMouseDown);
overlay.addEventListener('mousemove', handleOverlayMouseMove);
overlay.addEventListener('mouseup', handleOverlayMouseUp);

function handleCanvasClick(event) {
    if (!activeTool) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    switch (activeTool) {
        case 'text':
            addModernTextAnnotation(x, y);
            break;
        case 'signature':
            if (currentSignature) {
                addSignature(x, y);
            }
            break;
        case 'eraser':
            eraseAt(x, y);
            break;
    }
}

function handleMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    switch (activeTool) {
        case 'draw':
            isDrawing = true;
            lastX = x;
            lastY = y;
            saveState(); // Save state before drawing
            break;
            
        case 'shape':
            isDrawingShape = true;
            shapeStartX = x;
            shapeStartY = y;
            saveState(); // Save state before adding shape
            break;
            
        case 'eraser':
            isDrawing = true;
            eraseAt(x, y);
            saveState(); // Save state before erasing
            break;
    }
}

function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    
    // Update eraser indicator
    if (activeTool === 'eraser') {
        const indicator = document.getElementById('eraserIndicator');
        if (indicator) {
            indicator.style.left = (event.clientX - parseInt(sizePicker.value) / 2) + 'px';
            indicator.style.top = (event.clientY - parseInt(sizePicker.value) / 2) + 'px';
            indicator.style.display = 'block';
        }
        
        if (isDrawing) {
            eraseAt(currentX, currentY);
        }
    }
    
    if (activeTool === 'draw' && isDrawing) {
        drawLine(lastX, lastY, currentX, currentY);
        lastX = currentX;
        lastY = currentY;
    }
}

function handleMouseUp(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (activeTool === 'shape' && isDrawingShape) {
        addShapeAnnotation(shapeStartX, shapeStartY, x, y);
        isDrawingShape = false;
    }
    
    isDrawing = false;
    
    // Hide eraser indicator
    if (activeTool === 'eraser') {
        const indicator = document.getElementById('eraserIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
}

// Overlay event handlers for drag and drop
function handleOverlayMouseDown(event) {
    if (event.target.classList.contains('text-annotation')) {
        isDragging = true;
        const rect = overlay.getBoundingClientRect();
        dragOffset.x = event.clientX - rect.left - parseInt(event.target.style.left);
        dragOffset.y = event.clientY - rect.top - parseInt(event.target.style.top);
        event.preventDefault();
    }
}

function handleOverlayMouseMove(event) {
    if (isDragging && selectedElement) {
        const rect = overlay.getBoundingClientRect();
        const newX = event.clientX - rect.left - dragOffset.x;
        const newY = event.clientY - rect.top - dragOffset.y;
        
        selectedElement.style.left = newX + 'px';
        selectedElement.style.top = newY + 'px';
        
        // Update annotation data
        const annotationId = selectedElement.getAttribute('data-annotation-id');
        const annotation = annotations.find(a => a.id === annotationId);
        if (annotation) {
            annotation.x = newX;
            annotation.y = newY;
        }
        
        event.preventDefault();
    }
}

function handleOverlayMouseUp(event) {
    if (isDragging) {
        isDragging = false;
        saveState(); // Save state after dragging
    }
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

// Modern text annotation
function addModernTextAnnotation(x, y) {
    saveState(); // Save state before adding text
    
    // Generate unique ID
    const id = 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Create annotation object
    const annotation = {
        id: id,
        type: 'text',
        x: x,
        y: y,
        text: 'Metin yazın...',
        size: parseInt(sizePicker.value),
        color: colorPicker.value,
        page: currentPageNum
    };
    
    annotations.push(annotation);
    
    // Create and show text element immediately
    drawTextAnnotation(annotation);
    
    // Select and edit immediately
    const textElement = overlay.querySelector(`[data-annotation-id="${id}"]`);
    if (textElement) {
        selectElement(textElement, annotation);
        // Auto-edit
        setTimeout(() => editText(textElement, annotation), 100);
    }
    
    console.log('Modern metin eklendi');
}

// Shape annotation
function addShapeAnnotation(startX, startY, endX, endY) {
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    if (width < 10 || height < 10) return; // Minimum size
    
    const id = 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const annotation = {
        id: id,
        type: 'shape',
        shapeType: currentShape,
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: width,
        height: height,
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        color: colorPicker.value,
        width: parseInt(sizePicker.value) / 2,
        filled: false,
        page: currentPageNum
    };
    
    annotations.push(annotation);
    drawShapeAnnotation(annotation);
    
    console.log('Şekil eklendi:', currentShape);
}

// Shape selector
function selectShape(shape) {
    currentShape = shape;
    activeTool = 'shape';
    
    // Update UI
    document.querySelectorAll('.shape-option').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-shape="${shape}"]`)?.classList.add('active');
    
    updateCursor();
    console.log('Şekil seçildi:', shape);
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
        
        // Create fresh Uint8Array for PDF-lib to avoid detached ArrayBuffer
        const pdfLibBytes = new Uint8Array(pdfBytes);
        const newPdf = await PDFLib.PDFDocument.load(pdfLibBytes);
        currentPdf = newPdf;
        
        // Create fresh Uint8Array for PDF.js
        const pdfJsBytes = new Uint8Array(pdfBytes);
        pdfDoc = await pdfjsLib.getDocument(pdfJsBytes).promise;
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
        
        // Create fresh Uint8Array for PDF-lib to avoid detached ArrayBuffer
        const pdfLibBytes = new Uint8Array(pdfBytes);
        const newPdf = await PDFLib.PDFDocument.load(pdfLibBytes);
        currentPdf = newPdf;
        
        // Create fresh Uint8Array for PDF.js
        const pdfJsBytes = new Uint8Array(pdfBytes);
        pdfDoc = await pdfjsLib.getDocument(pdfJsBytes).promise;
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
                            // Create fresh Uint8Array to avoid detached ArrayBuffer
                            const imageBytesCopy = new Uint8Array(imageBytes);
                            const image = await currentPdf.embedPng(imageBytesCopy);
                            
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
            case 'z':
                event.preventDefault();
                if (event.shiftKey) {
                    redo(); // Ctrl+Shift+Z
                } else {
                    undo(); // Ctrl+Z
                }
                break;
            case 'y':
                event.preventDefault();
                redo(); // Ctrl+Y
                break;
        }
    }
    
    // Tool shortcuts
    switch (event.key) {
        case 'ArrowLeft':
            previousPage();
            break;
        case 'ArrowRight':
            nextPage();
            break;
        case 't':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('text');
            }
            break;
        case 'd':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('draw');
            }
            break;
        case 'e':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('eraser');
            }
            break;
        case 's':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('shape');
            }
            break;
        case 'Escape':
            // Deselect current selection
            if (selectedElement) {
                selectedElement.style.border = '1px dashed transparent';
                selectedElement = null;
                document.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
            }
            activeTool = null;
            updateCursor();
            break;
        case 'Delete':
        case 'Backspace':
            // Delete selected element
            if (selectedElement) {
                const annotationId = selectedElement.getAttribute('data-annotation-id');
                annotations = annotations.filter(a => a.id !== annotationId);
                selectedElement.remove();
                selectedElement = null;
                document.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
                saveState();
                redrawCanvas();
            }
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