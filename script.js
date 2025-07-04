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

// Modern PDF editor features
let autoSaveEnabled = true;
let lastSavedState = null;
let annotationCounter = 0;

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
    textElement.style.left = (annotation.x * currentScale) + 'px';
    textElement.style.top = (annotation.y * currentScale) + 'px';
    textElement.style.fontSize = (annotation.size * currentScale) + 'px';
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
    let somethingErased = false;
    
    // Remove annotations within eraser radius
    const originalLength = annotations.length;
    annotations = annotations.filter(annotation => {
        if (annotation.page !== currentPageNum) return true;
        
        let shouldKeep = true;
        switch (annotation.type) {
            case 'text':
                const textDistance = Math.sqrt(
                    Math.pow(annotation.x - x, 2) + Math.pow(annotation.y - y, 2)
                );
                shouldKeep = textDistance > eraserSize;
                break;
                
            case 'draw':
                const lineDistance = distanceToLine(x, y, annotation.x1, annotation.y1, annotation.x2, annotation.y2);
                shouldKeep = lineDistance > eraserSize;
                break;
                
            case 'signature':
                shouldKeep = !(x >= annotation.x && x <= annotation.x + annotation.width &&
                              y >= annotation.y && y <= annotation.y + annotation.height);
                break;
                
            case 'shape':
                const shapeCenter = {
                    x: annotation.x + annotation.width / 2,
                    y: annotation.y + annotation.height / 2
                };
                const distanceToShape = Math.sqrt(
                    Math.pow(shapeCenter.x - x, 2) + Math.pow(shapeCenter.y - y, 2)
                );
                shouldKeep = distanceToShape > eraserSize;
                break;
                
            default:
                shouldKeep = true;
        }
        
        if (!shouldKeep) {
            somethingErased = true;
            // Remove from overlay if it's a text element
            const element = overlay.querySelector(`[data-annotation-id="${annotation.id}"]`);
            if (element) {
                element.remove();
            }
        }
        return shouldKeep;
    });
    
    // Only redraw if something was actually erased
    if (somethingErased) {
        redrawCanvas();
    }
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
    // Scale coordinates based on zoom level
    const x = (event.clientX - rect.left) / currentScale;
    const y = (event.clientY - rect.top) / currentScale;
    
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
    const x = (event.clientX - rect.left) / currentScale;
    const y = (event.clientY - rect.top) / currentScale;
    
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
    const currentX = (event.clientX - rect.left) / currentScale;
    const currentY = (event.clientY - rect.top) / currentScale;
    
    // Update eraser indicator (use screen coordinates for visual indicator)
    if (activeTool === 'eraser') {
        const indicator = document.getElementById('eraserIndicator');
        if (indicator) {
            const indicatorSize = parseInt(sizePicker.value) * currentScale;
            indicator.style.left = (event.clientX - indicatorSize / 2) + 'px';
            indicator.style.top = (event.clientY - indicatorSize / 2) + 'px';
            indicator.style.width = indicatorSize + 'px';
            indicator.style.height = indicatorSize + 'px';
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
    const x = (event.clientX - rect.left) / currentScale;
    const y = (event.clientY - rect.top) / currentScale;
    
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
        dragOffset.x = (event.clientX - rect.left - parseInt(event.target.style.left)) / currentScale;
        dragOffset.y = (event.clientY - rect.top - parseInt(event.target.style.top)) / currentScale;
        event.preventDefault();
    }
}

function handleOverlayMouseMove(event) {
    if (isDragging && selectedElement) {
        const rect = overlay.getBoundingClientRect();
        const newX = (event.clientX - rect.left) / currentScale - dragOffset.x;
        const newY = (event.clientY - rect.top) / currentScale - dragOffset.y;
        
        // Update visual position (scaled)
        selectedElement.style.left = (newX * currentScale) + 'px';
        selectedElement.style.top = (newY * currentScale) + 'px';
        
        // Update annotation data (original coordinates)
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

// Auto-save functionality
function enableAutoSave() {
    autoSaveEnabled = true;
    setInterval(() => {
        if (autoSaveEnabled && annotations.length > 0) {
            autoSave();
        }
    }, 30000); // Auto-save every 30 seconds
}

function autoSave() {
    try {
        const currentState = JSON.stringify(annotations);
        if (currentState !== lastSavedState) {
            localStorage.setItem('pdfeditor_autosave', currentState);
            localStorage.setItem('pdfeditor_timestamp', Date.now());
            lastSavedState = currentState;
            showNotification('Otomatik kayıt yapıldı', 'success');
            console.log('Auto-save completed');
        }
    } catch (error) {
        console.warn('Auto-save failed:', error);
    }
}

function loadAutoSave() {
    try {
        const saved = localStorage.getItem('pdfeditor_autosave');
        const timestamp = localStorage.getItem('pdfeditor_timestamp');
        
        if (saved && timestamp) {
            const savedTime = new Date(parseInt(timestamp));
            const timeDiff = Date.now() - parseInt(timestamp);
            
            // Only load if saved within last 24 hours
            if (timeDiff < 24 * 60 * 60 * 1000) {
                const savedAnnotations = JSON.parse(saved);
                if (savedAnnotations.length > 0) {
                    const restore = confirm(
                        `${savedTime.toLocaleString()} tarihinde kaydedilmiş ${savedAnnotations.length} düzenleme bulundu. Geri yüklemek ister misiniz?`
                    );
                    
                    if (restore) {
                        annotations = savedAnnotations;
                        updateAnnotationCounter();
                        showNotification('Önceki çalışmanız geri yüklendi', 'success');
                        redrawCanvas();
                    }
                }
            }
        }
    } catch (error) {
        console.warn('Auto-save load failed:', error);
    }
}

function updateAnnotationCounter() {
    annotationCounter = annotations.length;
    const counter = document.getElementById('annotationCounter');
    const badge = document.getElementById('annotationBadge');
    
    if (counter) {
        counter.textContent = annotationCounter;
    }
    
    if (badge) {
        badge.style.display = annotationCounter > 0 ? 'inline-flex' : 'none';
    }
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 500;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto remove
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Enhanced download with progress
async function downloadPDFWithProgress() {
    if (!currentPdf) {
        showNotification('Önce bir PDF dosyası yükleyin!', 'error');
        return;
    }

    const progressModal = createProgressModal();
    document.body.appendChild(progressModal);
    
    try {
        updateProgress('PDF hazırlanıyor...', 10);
        
        // Apply annotations to PDF
        updateProgress('Düzenlemeler uygulanıyor...', 30);
        await applyAnnotations();
        
        updateProgress('PDF oluşturuluyor...', 60);
        const pdfBytes = await currentPdf.save();
        
        updateProgress('İndirme başlatılıyor...', 90);
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `edited-document-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateProgress('Tamamlandı!', 100);
        
        setTimeout(() => {
            progressModal.remove();
            showNotification(`PDF başarıyla indirildi! ${annotations.length} düzenleme dahil edildi.`, 'success');
        }, 1000);
        
        console.log('PDF indirildi');
    } catch (error) {
        console.error('PDF indirme hatası:', error);
        progressModal.remove();
        showNotification('PDF indirilirken bir hata oluştu: ' + error.message, 'error');
    }
}

function createProgressModal() {
    const modal = document.createElement('div');
    modal.className = 'progress-modal';
    modal.innerHTML = `
        <div class="progress-content">
            <h3><i class="fas fa-download"></i> PDF İndiriliyor</h3>
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <p id="progressText">Başlatılıyor...</p>
            <div class="progress-percentage" id="progressPercentage">0%</div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
    `;
    
    return modal;
}

function updateProgress(text, percentage) {
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    const progressPercentage = document.getElementById('progressPercentage');
    
    if (progressText) progressText.textContent = text;
    if (progressFill) progressFill.style.width = percentage + '%';
    if (progressPercentage) progressPercentage.textContent = percentage + '%';
}

// Keep original downloadPDF for backward compatibility
async function downloadPDF() {
    await downloadPDFWithProgress();
}

async function applyAnnotations() {
    if (annotations.length === 0) {
        console.log('Hiç annotation yok, atlaniyor...');
        return;
    }
    
    try {
        console.log('Annotations uygulanıyor...', annotations.length, 'adet');
        const pages = currentPdf.getPages();
        
        // Group annotations by page for better processing
        const annotationsByPage = {};
        annotations.forEach(ann => {
            if (!annotationsByPage[ann.page]) {
                annotationsByPage[ann.page] = [];
            }
            annotationsByPage[ann.page].push(ann);
        });
        
        console.log('Sayfa grupları:', Object.keys(annotationsByPage));
        
        for (const [pageNum, pageAnnotations] of Object.entries(annotationsByPage)) {
            const pageIndex = parseInt(pageNum) - 1;
            if (pageIndex < 0 || pageIndex >= pages.length) {
                console.warn(`Geçersiz sayfa numarası: ${pageNum}`);
                continue;
            }
            
            const page = pages[pageIndex];
            const { width, height } = page.getSize();
            console.log(`Sayfa ${pageNum} işleniyor: ${pageAnnotations.length} annotation`);
            
            for (const annotation of pageAnnotations) {
                try {
                    switch (annotation.type) {
                        case 'text':
                            // Use actual annotation coordinates (not canvas-relative)
                            const textFont = await currentPdf.embedFont(PDFLib.StandardFonts.Helvetica);
                            page.drawText(annotation.text || 'Metin', {
                                x: annotation.x,
                                y: height - annotation.y - annotation.size,
                                size: annotation.size,
                                color: PDFLib.rgb(
                                    parseInt(annotation.color.slice(1, 3), 16) / 255,
                                    parseInt(annotation.color.slice(3, 5), 16) / 255,
                                    parseInt(annotation.color.slice(5, 7), 16) / 255
                                ),
                                font: textFont
                            });
                            console.log('Metin eklendi:', annotation.text);
                            break;
                        
                        case 'draw':
                            // Draw line using actual coordinates
                            page.drawLine({
                                start: { x: annotation.x1, y: height - annotation.y1 },
                                end: { x: annotation.x2, y: height - annotation.y2 },
                                thickness: annotation.width || 2,
                                color: PDFLib.rgb(
                                    parseInt(annotation.color.slice(1, 3), 16) / 255,
                                    parseInt(annotation.color.slice(3, 5), 16) / 255,
                                    parseInt(annotation.color.slice(5, 7), 16) / 255
                                )
                            });
                            console.log('Çizgi eklendi');
                            break;
                        
                        case 'shape':
                            const shapeColor = PDFLib.rgb(
                                parseInt(annotation.color.slice(1, 3), 16) / 255,
                                parseInt(annotation.color.slice(3, 5), 16) / 255,
                                parseInt(annotation.color.slice(5, 7), 16) / 255
                            );
                            
                            if (annotation.shapeType === 'rectangle') {
                                page.drawRectangle({
                                    x: annotation.x,
                                    y: height - annotation.y - annotation.height,
                                    width: annotation.width,
                                    height: annotation.height,
                                    borderColor: shapeColor,
                                    borderWidth: 2
                                });
                            } else if (annotation.shapeType === 'circle') {
                                const radius = Math.min(annotation.width, annotation.height) / 2;
                                page.drawCircle({
                                    x: annotation.x + radius,
                                    y: height - annotation.y - radius,
                                    size: radius,
                                    borderColor: shapeColor,
                                    borderWidth: 2
                                });
                            }
                            console.log('Şekil eklendi:', annotation.shapeType);
                            break;
                        
                        case 'signature':
                            if (annotation.image) {
                                try {
                                    // Handle base64 image data
                                    const base64Data = annotation.image.split(',')[1];
                                    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                                    
                                    let image;
                                    if (annotation.image.includes('data:image/png')) {
                                        image = await currentPdf.embedPng(imageBytes);
                                    } else {
                                        image = await currentPdf.embedJpg(imageBytes);
                                    }
                                    
                                    page.drawImage(image, {
                                        x: annotation.x,
                                        y: height - annotation.y - annotation.height,
                                        width: annotation.width,
                                        height: annotation.height
                                    });
                                    console.log('İmza eklendi');
                                } catch (imgError) {
                                    console.warn('İmza ekleme hatası:', imgError);
                                }
                            }
                            break;
                            
                        default:
                            console.warn('Bilinmeyen annotation tipi:', annotation.type);
                    }
                } catch (annotationError) {
                    console.warn('Annotation işleme hatası:', annotationError, annotation);
                }
            }
        }
        
        console.log('Tüm annotations başarıyla uygulandı');
    } catch (error) {
        console.error('Annotation uygulama hatası:', error);
        throw error;
    }
}

// Enhanced state management
function saveStateWithNotification() {
    saveState();
    updateAnnotationCounter();
    showNotification('Değişiklik kaydedildi', 'success');
}

// Override original functions
const originalSaveState = saveState;
saveState = function() {
    originalSaveState();
    updateAnnotationCounter();
    if (autoSaveEnabled) {
        autoSave();
    }
};

// Initialize modern features
document.addEventListener('DOMContentLoaded', function() {
    enableAutoSave();
    loadAutoSave();
    
    // Add modern UI enhancements
    addModernUIElements();
});

function addModernUIElements() {
    // Add annotation counter to header
    const logo = document.querySelector('.logo');
    if (logo) {
        const counter = document.createElement('div');
        counter.innerHTML = `
            <span class="annotation-badge" style="display: none;">
                <i class="fas fa-edit"></i>
                <span id="annotationCounter">0</span>
            </span>
        `;
        logo.appendChild(counter);
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