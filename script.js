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

// New features variables
let isHighlighting = false;
let highlightStart = null;
let currentImage = null;
let pdfMetadata = {
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: 'PDF EditorZ'
};

// Page reordering variables
let originalPageOrder = [];
let currentPageOrder = [];
let isDraggingPage = false;
let draggedPageIndex = -1;

// OCR variables
let isOCRRunning = false;
let ocrWorker = null;

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
    
    // Redraw all annotations ONLY for current page
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
        case 'highlight':
            addHighlightToOverlay(annotation);
            break;
        case 'image':
            addImageToOverlay(annotation);
            break;
        case 'form':
        case 'checkbox':
        case 'radio':
        case 'textfield':
        case 'date':
            addFormElementToOverlay(annotation);
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
        case 'sticky-note':
            addStickyNoteToOverlay(annotation);
            break;
        case 'callout':
            addCalloutToOverlay(annotation);
            break;
        case 'stamp':
            addStampToOverlay(annotation);
            break;
        case 'strikethrough':
            addStrikethroughToOverlay(annotation);
            break;
        case 'underline':
            addUnderlineToOverlay(annotation);
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
    textElement.style.zIndex = '10';
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
    // Add signature to overlay for drag & drop
    addSignatureToOverlay(annotation);
}

function addSignatureToOverlay(annotation) {
    const signatureDiv = document.createElement('div');
    signatureDiv.className = 'signature-annotation';
    signatureDiv.setAttribute('data-annotation-id', annotation.id);
    signatureDiv.style.position = 'absolute';
    signatureDiv.style.left = (annotation.x * currentScale) + 'px';
    signatureDiv.style.top = (annotation.y * currentScale) + 'px';
    signatureDiv.style.width = (annotation.width * currentScale) + 'px';
    signatureDiv.style.height = (annotation.height * currentScale) + 'px';
    signatureDiv.style.border = '2px solid transparent';
    signatureDiv.style.cursor = 'move';
    signatureDiv.style.transition = 'all 0.2s ease';
    
    if (annotation.image) {
        const img = document.createElement('img');
        img.src = annotation.image;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        img.draggable = false;
        signatureDiv.appendChild(img);
    }
    
    // Add click handler for selection
    signatureDiv.addEventListener('click', function() {
        selectElement(signatureDiv, annotation);
    });
    
    overlay.appendChild(signatureDiv);
}

function drawShapeAnnotation(annotation) {
    // Add shape to overlay for drag & drop
    addShapeToOverlay(annotation);
}

function addShapeToOverlay(annotation) {
    const shapeDiv = document.createElement('div');
    shapeDiv.className = 'shape-annotation';
    shapeDiv.setAttribute('data-annotation-id', annotation.id);
    shapeDiv.style.position = 'absolute';
    shapeDiv.style.left = (annotation.x * currentScale) + 'px';
    shapeDiv.style.top = (annotation.y * currentScale) + 'px';
    shapeDiv.style.width = (annotation.width * currentScale) + 'px';
    shapeDiv.style.height = (annotation.height * currentScale) + 'px';
    shapeDiv.style.border = '2px solid transparent';
    shapeDiv.style.cursor = 'move';
    shapeDiv.style.transition = 'all 0.2s ease';
    shapeDiv.style.pointerEvents = 'auto';
    
    // Create SVG for the shape
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.pointerEvents = 'none';
    
    const strokeWidth = (annotation.strokeWidth || 2) / currentScale;
    
    switch (annotation.shapeType) {
        case 'rectangle':
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', strokeWidth/2);
            rect.setAttribute('y', strokeWidth/2);
            rect.setAttribute('width', annotation.width * currentScale - strokeWidth);
            rect.setAttribute('height', annotation.height * currentScale - strokeWidth);
            rect.setAttribute('stroke', annotation.color);
            rect.setAttribute('stroke-width', strokeWidth);
            rect.setAttribute('fill', annotation.filled ? annotation.color : 'transparent');
            svg.appendChild(rect);
            break;
            
        case 'circle':
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            const radius = Math.min(annotation.width, annotation.height) * currentScale / 2 - strokeWidth/2;
            circle.setAttribute('cx', annotation.width * currentScale / 2);
            circle.setAttribute('cy', annotation.height * currentScale / 2);
            circle.setAttribute('r', radius);
            circle.setAttribute('stroke', annotation.color);
            circle.setAttribute('stroke-width', strokeWidth);
            circle.setAttribute('fill', annotation.filled ? annotation.color : 'transparent');
            svg.appendChild(circle);
            break;
            
        case 'arrow':
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '10%');
            line.setAttribute('y1', '50%');
            line.setAttribute('x2', '90%');
            line.setAttribute('y2', '50%');
            line.setAttribute('stroke', annotation.color);
            line.setAttribute('stroke-width', strokeWidth);
            line.setAttribute('marker-end', 'url(#arrowhead)');
            
            // Create arrowhead marker
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrowhead');
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '7');
            marker.setAttribute('refX', '10');
            marker.setAttribute('refY', '3.5');
            marker.setAttribute('orient', 'auto');
            
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
            polygon.setAttribute('fill', annotation.color);
            
            marker.appendChild(polygon);
            defs.appendChild(marker);
            svg.appendChild(defs);
            svg.appendChild(line);
            break;
    }
    
    shapeDiv.appendChild(svg);
    
    // Add click handler for selection
    shapeDiv.addEventListener('click', function() {
        selectElement(shapeDiv, annotation);
    });
    
    overlay.appendChild(shapeDiv);
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
        selectedElement.classList.remove('selected');
        selectedElement.style.border = '2px solid transparent';
    }
    
    selectedElement = element;
    element.classList.add('selected');
    
    // Add resize handles for resizable elements (all except text and highlight)
    if (element.classList.contains('image-annotation') || 
        element.classList.contains('form-annotation') ||
        element.classList.contains('signature-annotation') ||
        element.classList.contains('shape-annotation')) {
        addResizeHandles(element, annotation);
    }
}

function editText(element, annotation) {
    isEditingText = true; // Set editing flag
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = annotation.text;
    input.style.position = 'absolute';
    input.style.left = element.style.left;
    input.style.top = element.style.top;
    input.style.fontSize = element.style.fontSize;
    input.style.color = element.style.color;
    input.style.border = 'none';
    input.style.background = 'transparent';
    input.style.outline = 'none';
    input.style.fontFamily = 'inherit';
    input.style.width = Math.max(100, element.offsetWidth) + 'px';
    
    overlay.appendChild(input);
    input.focus();
    input.select();
    
    const saveText = () => {
        isEditingText = false; // Reset editing flag
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
            isEditingText = false; // Reset editing flag
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
        handle.setAttribute('data-position', position);
        handle.style.position = 'absolute';
        handle.style.width = '8px';
        handle.style.height = '8px';
        handle.style.background = '#3b82f6';
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
        
        // Add resize functionality
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            isResizingElement = true;
            resizeHandlePosition = position;
            currentResizeElement = element;
            currentResizeAnnotation = annotation;
            
            const rect = element.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();
            
            resizeStartData = {
                mouseX: e.clientX,
                mouseY: e.clientY,
                elementX: rect.left - overlayRect.left,
                elementY: rect.top - overlayRect.top,
                elementWidth: rect.width,
                elementHeight: rect.height
            };
        });
        
        overlay.appendChild(handle);
    });
}

// Global resize variables
let isResizingElement = false;
let resizeHandlePosition = '';
let currentResizeElement = null;
let currentResizeAnnotation = null;
let resizeStartData = null;

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
            case 'image':
            case 'form':
            case 'highlight':
            case 'shape':
                // Check if eraser overlaps with element area
                shouldKeep = !(x >= annotation.x && x <= annotation.x + annotation.width &&
                              y >= annotation.y && y <= annotation.y + annotation.height);
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
        // Clear overlay before changing page
        overlay.innerHTML = '';
        renderPage(currentPageNum + 1);
    }
}

function previousPage() {
    if (currentPageNum > 1) {
        // Clear overlay before changing page
        overlay.innerHTML = '';
        renderPage(currentPageNum - 1);
    }
}

function goToPage(pageNum) {
    const num = parseInt(pageNum);
    if (num >= 1 && num <= pageCount) {
        // Clear overlay before changing page
        overlay.innerHTML = '';
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
    
    // Special handling for different tools
    if (tool === 'signature') {
        openSignatureModal();
    } else if (tool === 'image' && !currentImage) {
        // If image tool is activated but no image is loaded, open file dialog once
        showNotification('Resim seçin ve PDF üzerinde yerleştirmek için tıklayın', 'info');
        document.getElementById('imageInput').click();
        // Don't return here, let the tool be activated so user can choose cursor tool
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
        case 'cursor':
            canvas.style.cursor = 'default';
            break;
        case 'text':
            canvas.style.cursor = 'text';
            break;
        case 'highlight':
            canvas.style.cursor = 'cell';
            break;
        case 'image':
            canvas.style.cursor = 'copy';
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
            if (activeTool && activeTool.startsWith('form-')) {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = 'default';
            }
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

// Global event listeners for resize operations that might go outside overlay
document.addEventListener('mousemove', function(event) {
    if (isResizingElement) {
        handleOverlayMouseMove(event);
    }
});

document.addEventListener('mouseup', function(event) {
    if (isResizingElement) {
        handleOverlayMouseUp(event);
    }
});

function handleCanvasClick(event) {
    if (!activeTool) return;
    
    const rect = canvas.getBoundingClientRect();
    // Scale coordinates based on zoom level
    const x = (event.clientX - rect.left) / currentScale;
    const y = (event.clientY - rect.top) / currentScale;
    
    switch (activeTool) {
        case 'cursor':
            // Cursor tool for selection and navigation only
            deselectAllElements();
            break;
        case 'text':
            addModernTextAnnotation(x, y);
            break;
        case 'image':
            addImageAnnotation(x, y);
            break;
        case 'signature':
            if (currentSignature) {
                addSignature(x, y);
            }
            break;
        case 'eraser':
            eraseAt(x, y);
            break;
        case 'sticky-note':
            addStickyNote(x, y);
            break;
        case 'callout':
            addCalloutBox(x, y);
            break;
        case 'stamp':
            addStamp(x, y);
            break;
        case 'strikethrough':
            addStrikethrough(x, y, 100);
            break;
        case 'underline':
            addUnderline(x, y, 100);
            break;
        default:
            // Handle form tools
            if (activeTool && activeTool.startsWith('form-')) {
                const formType = activeTool.replace('form-', '');
                addFormElementAnnotation(x, y, formType);
            }
            break;
    }
}

function deselectAllElements() {
    // Deselect any selected elements
    if (selectedElement) {
        selectedElement.classList.remove('selected');
        selectedElement.style.border = '2px solid transparent';
        selectedElement = null;
        document.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
    }
    
    // Clear any active selections from all annotation types
    document.querySelectorAll('.text-annotation.selected, .image-annotation.selected, .form-annotation.selected, .signature-annotation.selected, .shape-annotation.selected, .highlight-overlay.selected').forEach(element => {
        element.classList.remove('selected');
    });
}

function handleMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / currentScale;
    const y = (event.clientY - rect.top) / currentScale;
    
    switch (activeTool) {
        case 'cursor':
            // Cursor tool doesn't draw or create anything
            break;
            
        case 'highlight':
            startHighlight(event);
            saveState(); // Save state before highlighting
            break;
            
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
    
    // Update highlight selection
    if (activeTool === 'highlight') {
        updateHighlight(event);
    }
    
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
    
    // Hide eraser indicator if not in eraser mode
    if (activeTool !== 'eraser') {
        const indicator = document.getElementById('eraserIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
}

function handleMouseUp(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / currentScale;
    const y = (event.clientY - rect.top) / currentScale;
    
    if (activeTool === 'highlight') {
        finishHighlight(event);
    }
    
    if (activeTool === 'shape' && isDrawingShape) {
        addShapeAnnotation(shapeStartX, shapeStartY, x, y);
        isDrawingShape = false;
    }
    
    isDrawing = false;
    
    // Hide eraser indicator when mouse up
    const indicator = document.getElementById('eraserIndicator');
    if (indicator && activeTool === 'eraser') {
        indicator.style.display = 'none';
    }
}

// Overlay event handlers for drag and drop
function handleOverlayMouseDown(event) {
    // Check if target is draggable annotation
    const annotationClasses = [
        'text-annotation',
        'image-annotation', 
        'form-annotation',
        'signature-annotation',
        'shape-annotation',
        'highlight-overlay'
    ];
    
    let element = null;
    
    // Find the correct annotation element
    for (const className of annotationClasses) {
        if (event.target.classList.contains(className)) {
            element = event.target;
            break;
        }
        // Check if parent element is an annotation (for nested elements like img)
        if (event.target.parentElement?.classList.contains(className)) {
            element = event.target.parentElement;
            break;
        }
    }
    
    if (element) {
        isDragging = true;
        selectedElement = element;
        
        const rect = overlay.getBoundingClientRect();
        dragOffset.x = (event.clientX - rect.left - parseInt(element.style.left)) / currentScale;
        dragOffset.y = (event.clientY - rect.top - parseInt(element.style.top)) / currentScale;
        event.preventDefault();
        
        // Show selection for the element
        const annotationId = element.getAttribute('data-annotation-id');
        const annotation = annotations.find(a => a.id === annotationId);
        if (annotation) {
            selectElement(element, annotation);
        }
    }
}

function handleOverlayMouseMove(event) {
    if (isResizingElement && currentResizeElement && currentResizeAnnotation) {
        const deltaX = event.clientX - resizeStartData.mouseX;
        const deltaY = event.clientY - resizeStartData.mouseY;
        
        let newX = resizeStartData.elementX;
        let newY = resizeStartData.elementY;
        let newWidth = resizeStartData.elementWidth;
        let newHeight = resizeStartData.elementHeight;
        
        // Calculate new dimensions based on resize handle position
        switch (resizeHandlePosition) {
            case 'nw':
                newX = resizeStartData.elementX + deltaX;
                newY = resizeStartData.elementY + deltaY;
                newWidth = resizeStartData.elementWidth - deltaX;
                newHeight = resizeStartData.elementHeight - deltaY;
                break;
            case 'ne':
                newY = resizeStartData.elementY + deltaY;
                newWidth = resizeStartData.elementWidth + deltaX;
                newHeight = resizeStartData.elementHeight - deltaY;
                break;
            case 'sw':
                newX = resizeStartData.elementX + deltaX;
                newWidth = resizeStartData.elementWidth - deltaX;
                newHeight = resizeStartData.elementHeight + deltaY;
                break;
            case 'se':
                newWidth = resizeStartData.elementWidth + deltaX;
                newHeight = resizeStartData.elementHeight + deltaY;
                break;
        }
        
        // Minimum size constraints
        const minSize = 20;
        if (newWidth < minSize || newHeight < minSize) {
            return;
        }
        
        // Update element visual style
        currentResizeElement.style.left = newX + 'px';
        currentResizeElement.style.top = newY + 'px';
        currentResizeElement.style.width = newWidth + 'px';
        currentResizeElement.style.height = newHeight + 'px';
        
        // Update annotation data (convert back to unscaled coordinates)
        currentResizeAnnotation.x = newX / currentScale;
        currentResizeAnnotation.y = newY / currentScale;
        currentResizeAnnotation.width = newWidth / currentScale;
        currentResizeAnnotation.height = newHeight / currentScale;
        
        // Update resize handles position
        if (selectedElement === currentResizeElement) {
            addResizeHandles(currentResizeElement, currentResizeAnnotation);
        }
        
        event.preventDefault();
    } else if (isDragging && selectedElement) {
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
    if (isResizingElement) {
        isResizingElement = false;
        resizeHandlePosition = '';
        currentResizeElement = null;
        currentResizeAnnotation = null;
        resizeStartData = null;
        saveState(); // Save state after resizing
    } else if (isDragging) {
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
    
    // Set editing flag since we'll start editing immediately
    isEditingText = true;
    
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
    
    saveState(); // Save state before adding shape
    
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
        strokeWidth: parseInt(sizePicker.value) / 2,
        filled: false,
        page: currentPageNum
    };
    
    annotations.push(annotation);
    addShapeToOverlay(annotation);
    
    updateAnnotationCounter();
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
    
    saveState(); // Save state before adding signature
    
    // Generate unique ID
    const id = 'signature_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Create annotation
    const annotation = {
        id: id,
        type: 'signature',
        x: x - 50,
        y: y - 25,
        width: 100,
        height: 50,
        image: currentSignature,
        page: currentPageNum
    };
    
    annotations.push(annotation);
    
    // Add to overlay for drag & drop
    addSignatureToOverlay(annotation);
    
    updateAnnotationCounter();
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
            // Removed notification to prevent spam during auto-save
            console.log('Auto-save completed silently');
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
            console.log(`PDF boyutları: ${width}x${height}`);
            
            for (const annotation of pageAnnotations) {
                try {
                    // Direct coordinate mapping - no scale conversion needed
                    // since annotations are already stored in PDF coordinate space
                    
                    switch (annotation.type) {
                        case 'text':
                            const textFont = await currentPdf.embedFont(PDFLib.StandardFonts.Helvetica);
                            // PDF coordinate system has origin at bottom-left
                            const pdfY = height - annotation.y - annotation.size;
                            
                            page.drawText(annotation.text || 'Metin', {
                                x: annotation.x,
                                y: pdfY,
                                size: annotation.size,
                                color: PDFLib.rgb(
                                    parseInt(annotation.color.slice(1, 3), 16) / 255,
                                    parseInt(annotation.color.slice(3, 5), 16) / 255,
                                    parseInt(annotation.color.slice(5, 7), 16) / 255
                                ),
                                font: textFont
                            });
                            console.log('Metin eklendi:', annotation.text, `PDF pos: ${annotation.x}, ${pdfY}`);
                            break;
                        
                        case 'highlight':
                            const hlY = height - annotation.y - annotation.height;
                            page.drawRectangle({
                                x: annotation.x,
                                y: hlY,
                                width: annotation.width,
                                height: annotation.height,
                                color: PDFLib.rgb(
                                    parseInt(annotation.color.slice(1, 3), 16) / 255,
                                    parseInt(annotation.color.slice(3, 5), 16) / 255,
                                    parseInt(annotation.color.slice(5, 7), 16) / 255
                                ),
                                opacity: 0.3
                            });
                            console.log('Vurgulama eklendi');
                            break;
                        
                        case 'image':
                            if (annotation.image) {
                                try {
                                    const base64Data = annotation.image.split(',')[1];
                                    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                                    
                                    let image;
                                    if (annotation.image.includes('data:image/png')) {
                                        image = await currentPdf.embedPng(imageBytes);
                                    } else {
                                        image = await currentPdf.embedJpg(imageBytes);
                                    }
                                    
                                    const imgY = height - annotation.y - annotation.height;
                                    page.drawImage(image, {
                                        x: annotation.x,
                                        y: imgY,
                                        width: annotation.width,
                                        height: annotation.height
                                    });
                                    console.log('Resim eklendi');
                                } catch (imgError) {
                                    console.warn('Resim ekleme hatası:', imgError);
                                }
                            }
                            break;
                        
                        case 'form':
                            const formFont = await currentPdf.embedFont(PDFLib.StandardFonts.Helvetica);
                            let formText = '';
                            
                            switch (annotation.formType) {
                                case 'checkbox':
                                    formText = annotation.value ? '☑' : '☐';
                                    break;
                                case 'radio':
                                    formText = annotation.value ? '●' : '○';
                                    break;
                                case 'textfield':
                                    formText = annotation.value || 'Metin...';
                                    break;
                                case 'date':
                                    formText = annotation.value || new Date().toLocaleDateString('tr-TR');
                                    break;
                            }
                            
                            const formY = height - annotation.y - 12;
                            page.drawText(formText, {
                                x: annotation.x,
                                y: formY,
                                size: 12,
                                color: PDFLib.rgb(0, 0, 0),
                                font: formFont
                            });
                            console.log('Form elemanı eklendi:', annotation.formType);
                            break;
                        
                        case 'draw':
                            const lineY1 = height - annotation.y1;
                            const lineY2 = height - annotation.y2;
                            page.drawLine({
                                start: { x: annotation.x1, y: lineY1 },
                                end: { x: annotation.x2, y: lineY2 },
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
                        case 'rectangle':
                        case 'circle':
                        case 'arrow':
                            const shapeColor = PDFLib.rgb(
                                parseInt(annotation.color.slice(1, 3), 16) / 255,
                                parseInt(annotation.color.slice(3, 5), 16) / 255,
                                parseInt(annotation.color.slice(5, 7), 16) / 255
                            );
                            
                            const shapeY = height - annotation.y - annotation.height;
                            
                            if (annotation.shapeType === 'rectangle' || annotation.type === 'rectangle') {
                                page.drawRectangle({
                                    x: annotation.x,
                                    y: shapeY,
                                    width: annotation.width,
                                    height: annotation.height,
                                    borderColor: shapeColor,
                                    borderWidth: annotation.strokeWidth || 2
                                });
                            } else if (annotation.shapeType === 'circle' || annotation.type === 'circle') {
                                const radius = Math.min(annotation.width, annotation.height) / 2;
                                page.drawCircle({
                                    x: annotation.x + radius,
                                    y: shapeY + radius,
                                    size: radius,
                                    borderColor: shapeColor,
                                    borderWidth: annotation.strokeWidth || 2
                                });
                            }
                            console.log('Şekil eklendi:', annotation.shapeType);
                            break;
                        
                        case 'signature':
                            if (annotation.image) {
                                try {
                                    const base64Data = annotation.image.split(',')[1];
                                    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                                    
                                    let image;
                                    if (annotation.image.includes('data:image/png')) {
                                        image = await currentPdf.embedPng(imageBytes);
                                    } else {
                                        image = await currentPdf.embedJpg(imageBytes);
                                    }
                                    
                                    const sigY = height - annotation.y - annotation.height;
                                    page.drawImage(image, {
                                        x: annotation.x,
                                        y: sigY,
                                        width: annotation.width,
                                        height: annotation.height
                                    });
                                    console.log('İmza eklendi');
                                } catch (sigError) {
                                    console.warn('İmza ekleme hatası:', sigError);
                                }
                            }
                            break;
                    }
                } catch (annotationError) {
                    console.error('Annotation işleme hatası:', annotationError, annotation);
                }
            }
        }
        
        console.log('Tüm annotations başarıyla uygulandı');
    } catch (error) {
        console.error('Apply annotations hatası:', error);
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

// Separate function for manual saves with notification
function saveStateWithNotification() {
    saveState();
    showNotification('Değişiklik kaydedildi', 'success');
}

// Initialize modern features
document.addEventListener('DOMContentLoaded', function() {
    enableAutoSave();
    loadAutoSave();
    
    // Add modern UI enhancements
    addModernUIElements();
    
    // Set cursor tool as default
    activateTool('cursor');
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
    const metadataModal = document.getElementById('metadataModal');
    const pageReorderModal = document.getElementById('pageReorderModal');
    const ocrModal = document.getElementById('ocrModal');
    
    if (event.target === signatureModal) {
        closeSignatureModal();
    } else if (event.target === helpModal) {
        closeHelpModal();
    } else if (event.target === metadataModal) {
        closeMetadataModal();
    } else if (event.target === pageReorderModal) {
        closePageReorderModal();
    } else if (event.target === ocrModal) {
        closeOCRModal();
    }
});

// Global variable to track if we're editing text
let isEditingText = false;

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    // Skip shortcuts if user is editing text
    if (isEditingText || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.contentEditable === 'true') {
        // Only allow Ctrl shortcuts during text editing
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
        return; // Exit early, don't process other shortcuts
    }

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
    
    // Tool shortcuts - only when not editing text
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
        case 'h':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('highlight');
            }
            break;
        case 'i':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('image');
            }
            break;
        case 'd':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('draw');
            }
            break;
        case 'c':
            if (!event.ctrlKey && !event.metaKey) {
                activateTool('cursor');
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
                selectedElement.classList.remove('selected');
                selectedElement.style.border = '2px solid transparent';
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
                updateAnnotationCounter();
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

// Highlight Tool Functions
function startHighlight(event) {
    if (activeTool !== 'highlight') return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / currentScale;
    const y = (event.clientY - rect.top) / currentScale;
    
    highlightStart = { x, y };
    isHighlighting = true;
    
    // Create temporary highlight overlay
    const highlightOverlay = document.createElement('div');
    highlightOverlay.className = 'highlight-overlay';
    highlightOverlay.id = 'tempHighlight';
    highlightOverlay.style.left = event.clientX - rect.left + 'px';
    highlightOverlay.style.top = event.clientY - rect.top + 'px';
    highlightOverlay.style.width = '0px';
    highlightOverlay.style.height = '0px';
    
    const container = document.getElementById('pdfContainer');
    container.appendChild(highlightOverlay);
}

function updateHighlight(event) {
    if (!isHighlighting || activeTool !== 'highlight') return;
    
    const rect = canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    
    const startX = highlightStart.x * currentScale;
    const startY = highlightStart.y * currentScale;
    
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);
    
    const tempHighlight = document.getElementById('tempHighlight');
    if (tempHighlight) {
        tempHighlight.style.left = left + 'px';
        tempHighlight.style.top = top + 'px';
        tempHighlight.style.width = width + 'px';
        tempHighlight.style.height = height + 'px';
    }
}

function finishHighlight(event) {
    if (!isHighlighting || activeTool !== 'highlight') return;
    
    const rect = canvas.getBoundingClientRect();
    const endX = (event.clientX - rect.left) / currentScale;
    const endY = (event.clientY - rect.top) / currentScale;
    
    const width = Math.abs(endX - highlightStart.x);
    const height = Math.abs(endY - highlightStart.y);
    
    // Only create highlight if area is significant
    if (width > 10 && height > 10) {
        const annotation = {
            id: Date.now().toString(),
            type: 'highlight',
            page: currentPageNum,
            x: Math.min(highlightStart.x, endX),
            y: Math.min(highlightStart.y, endY),
            width: width,
            height: height,
            color: colorPicker.value
        };
        
        annotations.push(annotation);
        addHighlightToOverlay(annotation);
        saveState();
        showNotification('Vurgulama eklendi', 'success');
    }
    
    // Remove temporary highlight
    const tempHighlight = document.getElementById('tempHighlight');
    if (tempHighlight) {
        tempHighlight.remove();
    }
    
    isHighlighting = false;
    highlightStart = null;
}

function addHighlightToOverlay(annotation) {
    const highlightDiv = document.createElement('div');
    highlightDiv.className = 'highlight-overlay';
    highlightDiv.setAttribute('data-annotation-id', annotation.id);
    highlightDiv.style.position = 'absolute';
    highlightDiv.style.left = (annotation.x * currentScale) + 'px';
    highlightDiv.style.top = (annotation.y * currentScale) + 'px';
    highlightDiv.style.width = (annotation.width * currentScale) + 'px';
    highlightDiv.style.height = (annotation.height * currentScale) + 'px';
    highlightDiv.style.backgroundColor = annotation.color + '40'; // Add transparency
    highlightDiv.style.border = '1px solid ' + annotation.color;
    highlightDiv.style.pointerEvents = 'auto';
    highlightDiv.style.cursor = 'move';
    highlightDiv.style.zIndex = '5';
    
    // Add click handler for selection
    highlightDiv.addEventListener('click', function(e) {
        e.stopPropagation();
        selectElement(highlightDiv, annotation);
    });
    
    overlay.appendChild(highlightDiv);
}

// Image Upload Functions
function loadImage(event) {
    const file = event.target.files[0];
    if (!file) {
        activateTool('cursor'); // Go back to cursor if no file selected
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        currentImage = e.target.result;
        activateTool('image');
        showNotification('Resim yüklendi! PDF üzerinde yerleştirmek için tıklayın.', 'success');
    };
    reader.readAsDataURL(file);
    
    // Clear the input value to allow selecting the same file again
    event.target.value = '';
}

function addImageAnnotation(x, y) {
    if (!currentImage) {
        showNotification('Önce bir resim yükleyin!', 'warning');
        document.getElementById('imageInput').click();
        activateTool('cursor'); // Switch back to cursor to prevent repeated dialogs
        return;
    }
    
    const annotation = {
        id: Date.now().toString(),
        type: 'image',
        page: currentPageNum,
        x: x,
        y: y,
        width: 100, // Default width
        height: 100, // Default height
        image: currentImage
    };
    
    annotations.push(annotation);
    addImageToOverlay(annotation);
    saveState();
    showNotification('Resim eklendi', 'success');
    currentImage = null; // Reset after use
    activateTool('cursor'); // Switch back to cursor after adding image
}

function addImageToOverlay(annotation) {
    const imageDiv = document.createElement('div');
    imageDiv.className = 'image-annotation';
    imageDiv.setAttribute('data-annotation-id', annotation.id);
    imageDiv.style.left = (annotation.x * currentScale) + 'px';
    imageDiv.style.top = (annotation.y * currentScale) + 'px';
    imageDiv.style.width = (annotation.width * currentScale) + 'px';
    imageDiv.style.height = (annotation.height * currentScale) + 'px';
    
    const img = document.createElement('img');
    img.src = annotation.image;
    img.draggable = false;
    imageDiv.appendChild(img);
    
    // Add click handler for selection
    imageDiv.addEventListener('click', function() {
        selectElement(imageDiv, annotation);
    });
    
    overlay.appendChild(imageDiv);
}

// Form Elements Functions
function addFormElement(type) {
    showNotification(`${getFormElementName(type)} eklemek için PDF üzerinde tıklayın.`, 'info');
    activeTool = 'form-' + type;
    updateCursor();
}

function getFormElementName(type) {
    const names = {
        'checkbox': 'Checkbox',
        'radio': 'Radio Button',
        'textfield': 'Metin Alanı',
        'date': 'Tarih Alanı'
    };
    return names[type] || type;
}

function addFormElementAnnotation(x, y, formType) {
    const annotation = {
        id: Date.now().toString(),
        type: 'form',
        formType: formType,
        page: currentPageNum,
        x: x,
        y: y,
        width: getFormElementWidth(formType),
        height: getFormElementHeight(formType),
        value: getFormElementDefaultValue(formType)
    };
    
    annotations.push(annotation);
    addFormElementToOverlay(annotation);
    saveState();
    showNotification(`${getFormElementName(formType)} eklendi`, 'success');
}

function getFormElementWidth(type) {
    const widths = {
        'checkbox': 20,
        'radio': 20,
        'textfield': 120,
        'date': 100
    };
    return widths[type] || 100;
}

function getFormElementHeight(type) {
    const heights = {
        'checkbox': 20,
        'radio': 20,
        'textfield': 24,
        'date': 24
    };
    return heights[type] || 24;
}

function getFormElementDefaultValue(type) {
    const defaults = {
        'checkbox': false,
        'radio': false,
        'textfield': 'Metin...',
        'date': new Date().toISOString().split('T')[0]
    };
    return defaults[type] || '';
}

function addFormElementToOverlay(annotation) {
    const formDiv = document.createElement('div');
    formDiv.className = `form-annotation ${annotation.formType}`;
    formDiv.setAttribute('data-annotation-id', annotation.id);
    formDiv.style.left = (annotation.x * currentScale) + 'px';
    formDiv.style.top = (annotation.y * currentScale) + 'px';
    formDiv.style.width = (annotation.width * currentScale) + 'px';
    formDiv.style.height = (annotation.height * currentScale) + 'px';
    
    // Add content based on form type
    if (annotation.formType === 'textfield') {
        formDiv.textContent = annotation.value;
    } else if (annotation.formType === 'date') {
        formDiv.textContent = annotation.value;
    }
    
    // Add click handler for selection
    formDiv.addEventListener('click', function() {
        selectElement(formDiv, annotation);
    });
    
    overlay.appendChild(formDiv);
}

// PDF Metadata Functions
function openMetadataModal() {
    if (!currentPdf) {
        showNotification('Önce bir PDF dosyası yükleyin!', 'error');
        return;
    }
    
    // Load current metadata
    loadCurrentMetadata();
    document.getElementById('metadataModal').style.display = 'block';
}

function closeMetadataModal() {
    document.getElementById('metadataModal').style.display = 'none';
}

async function loadCurrentMetadata() {
    try {
        // Get current metadata from PDF
        const metadata = await currentPdf.getMetadata();
        
        // Update form fields
        document.getElementById('pdfTitle').value = metadata.title || '';
        document.getElementById('pdfAuthor').value = metadata.author || '';
        document.getElementById('pdfSubject').value = metadata.subject || '';
        document.getElementById('pdfKeywords').value = metadata.keywords || '';
        document.getElementById('pdfCreator').value = metadata.creator || '';
        
        // Update display
        const currentMetadataDiv = document.getElementById('currentMetadata');
        currentMetadataDiv.innerHTML = `
            <div><strong>Başlık:</strong> ${metadata.title || 'Belirtilmemiş'}</div>
            <div><strong>Yazar:</strong> ${metadata.author || 'Belirtilmemiş'}</div>
            <div><strong>Konu:</strong> ${metadata.subject || 'Belirtilmemiş'}</div>
            <div><strong>Anahtar Kelimeler:</strong> ${metadata.keywords || 'Belirtilmemiş'}</div>
            <div><strong>Oluşturan:</strong> ${metadata.creator || 'Belirtilmemiş'}</div>
            <div><strong>Oluşturma Tarihi:</strong> ${metadata.creationDate ? new Date(metadata.creationDate).toLocaleDateString('tr-TR') : 'Belirtilmemiş'}</div>
        `;
        
        // Store in global variable
        pdfMetadata = {
            title: metadata.title || '',
            author: metadata.author || '',
            subject: metadata.subject || '',
            keywords: metadata.keywords || '',
            creator: metadata.creator || 'PDF EditorZ'
        };
        
    } catch (error) {
        console.warn('Metadata okunamadı:', error);
        document.getElementById('currentMetadata').innerHTML = `
            <p style="color: #dc3545;">Mevcut metadata bilgisi okunamadı.</p>
        `;
    }
}

function saveMetadata() {
    try {
        // Get values from form
        pdfMetadata.title = document.getElementById('pdfTitle').value;
        pdfMetadata.author = document.getElementById('pdfAuthor').value;
        pdfMetadata.subject = document.getElementById('pdfSubject').value;
        pdfMetadata.keywords = document.getElementById('pdfKeywords').value;
        pdfMetadata.creator = document.getElementById('pdfCreator').value;
        
        // Update PDF metadata
        currentPdf.setTitle(pdfMetadata.title);
        currentPdf.setAuthor(pdfMetadata.author);
        currentPdf.setSubject(pdfMetadata.subject);
        currentPdf.setKeywords(pdfMetadata.keywords.split(',').map(k => k.trim()));
        currentPdf.setCreator(pdfMetadata.creator);
        currentPdf.setModificationDate(new Date());
        
        showNotification('PDF metadata başarıyla güncellendi!', 'success');
        closeMetadataModal();
        saveState();
        
    } catch (error) {
        console.error('Metadata kaydetme hatası:', error);
        showNotification('Metadata kaydedilirken bir hata oluştu: ' + error.message, 'error');
    }
}

function resetMetadata() {
    // Reset form to original values
    loadCurrentMetadata();
    showNotification('Metadata sıfırlandı', 'info');
}

// Enhanced canvas event listeners for highlight functionality
canvas.addEventListener('mousedown', function(event) {
    if (activeTool === 'highlight') {
        startHighlight(event);
        event.preventDefault();
    } else {
        handleMouseDown(event);
    }
});

canvas.addEventListener('mousemove', function(event) {
    if (activeTool === 'highlight' && isHighlighting) {
        updateHighlight(event);
        event.preventDefault();
    } else {
        handleMouseMove(event);
    }
});

canvas.addEventListener('mouseup', function(event) {
    if (activeTool === 'highlight' && isHighlighting) {
        finishHighlight(event);
        event.preventDefault();
    } else {
        handleMouseUp(event);
    }
});

// Dark Mode Functions
function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Update button text and icon
    const toggleButton = document.getElementById('darkModeToggle');
    if (newTheme === 'dark') {
        toggleButton.innerHTML = '<i class="fas fa-sun"></i> Aydınlık Mod';
    } else {
        toggleButton.innerHTML = '<i class="fas fa-moon"></i> Karanlık Mod';
    }
    
    // Save preference to localStorage
    localStorage.setItem('theme', newTheme);
    
    showNotification(`${newTheme === 'dark' ? 'Karanlık' : 'Aydınlık'} mod etkinleştirildi`, 'success');
}

function initializeTheme() {
    // Check for saved theme preference or default to 'light'
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Update button text and icon
    const toggleButton = document.getElementById('darkModeToggle');
    if (savedTheme === 'dark') {
        toggleButton.innerHTML = '<i class="fas fa-sun"></i> Aydınlık Mod';
    } else {
        toggleButton.innerHTML = '<i class="fas fa-moon"></i> Karanlık Mod';
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('PDF Editor Z başlatılıyor...');
    
    // Initialize theme first
    initializeTheme();
    
    // Initialize sidebar state
    initializeSidebar();
    
    // Check if all libraries are loaded
    setTimeout(() => {
        if (!checkLibraries()) {
            loadAlternativeCDNs().then(success => {
                if (success) {
                    console.log('✅ Alternatif CDN\'ler başarıyla yüklendi');
                } else {
                    console.error('❌ Kütüphaneler yüklenemedi');
                    alert('Gerekli kütüphaneler yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
                }
            });
        }
    }, 100);
    
    // Add modern UI elements
    addModernUIElements();
    
    // Enable auto-save
    enableAutoSave();
    
    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();
    
    // Initialize context menu
    initializeContextMenu();
    
    console.log('🚀 PDF Editor Z hazır!');
});

// Keyboard Shortcuts
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(event) {
        // Prevent default for our shortcuts
        const isCtrl = event.ctrlKey || event.metaKey;
        
        // Global shortcuts (work everywhere)
        if (isCtrl) {
            switch (event.key.toLowerCase()) {
                case 'z':
                    if (!event.shiftKey) {
                        event.preventDefault();
                        undo();
                        return;
                    }
                    break;
                case 'y':
                    event.preventDefault();
                    redo();
                    return;
                case 's':
                    event.preventDefault();
                    downloadPDF();
                    return;
                case 'o':
                    event.preventDefault();
                    document.getElementById('pdfInput').click();
                    return;
                case 'd':
                    event.preventDefault();
                    toggleDarkMode();
                    return;
                case 'h':
                    event.preventDefault();
                    showHelp();
                    return;
                case 'a':
                    event.preventDefault();
                    selectAllAnnotations();
                    return;
                case 'delete':
                case 'backspace':
                    event.preventDefault();
                    deleteSelectedAnnotations();
                    return;
            }
        }
        
        // Tool shortcuts (only when not editing text)
        if (!isEditingText && !event.target.matches('input, textarea')) {
            switch (event.key.toLowerCase()) {
                case 'c':
                    event.preventDefault();
                    activateTool('cursor');
                    break;
                case 't':
                    event.preventDefault();
                    activateTool('text');
                    break;
                case 'h':
                    if (!event.ctrlKey) {
                        event.preventDefault();
                        activateTool('highlight');
                    }
                    break;
                case 'i':
                    event.preventDefault();
                    activateTool('image');
                    break;
                case 'd':
                    if (!event.ctrlKey) {
                        event.preventDefault();
                        activateTool('draw');
                    }
                    break;
                case 'e':
                    event.preventDefault();
                    activateTool('eraser');
                    break;
                case 's':
                    if (!event.ctrlKey) {
                        event.preventDefault();
                        activateTool('signature');
                    }
                    break;
                case 'r':
                    event.preventDefault();
                    selectShape('rectangle');
                    activateTool('shape');
                    break;
                case 'escape':
                    event.preventDefault();
                    deselectAllElements();
                    activateTool('cursor');
                    break;
                case 'delete':
                    event.preventDefault();
                    deleteSelectedAnnotations();
                    break;
                case 'arrowleft':
                    event.preventDefault();
                    previousPage();
                    break;
                case 'arrowright':
                    event.preventDefault();
                    nextPage();
                    break;
                case '+':
                case '=':
                    event.preventDefault();
                    zoomIn();
                    break;
                case '-':
                    event.preventDefault();
                    zoomOut();
                    break;
                case '0':
                    event.preventDefault();
                    resetZoom();
                    break;
            }
        }
        
        // Numeric shortcuts for pages
        if (!isEditingText && event.key >= '1' && event.key <= '9') {
            const pageNum = parseInt(event.key);
            if (pageNum <= pageCount) {
                event.preventDefault();
                goToPage(pageNum);
            }
        }
    });
}

function selectAllAnnotations() {
    if (!currentPdf || annotations.length === 0) {
        showNotification('Seçilecek annotation bulunamadı', 'warning');
        return;
    }
    
    // Select all annotations on current page
    const currentPageAnnotations = annotations.filter(a => a.page === currentPageNum);
    if (currentPageAnnotations.length === 0) {
        showNotification('Bu sayfada seçilecek element bulunamadı', 'warning');
        return;
    }
    
    // Visual feedback for all annotations
    document.querySelectorAll('[data-annotation-id]').forEach(element => {
        element.style.border = '2px solid var(--accent-color)';
        element.classList.add('selected');
    });
    
    showNotification(`${currentPageAnnotations.length} element seçildi`, 'success');
}

function deleteSelectedAnnotations() {
    const selectedElements = document.querySelectorAll('[data-annotation-id].selected');
    if (selectedElements.length === 0 && !selectedElement) {
        showNotification('Silinecek element seçilmemiş', 'warning');
        return;
    }
    
    saveState(); // Save state before deletion
    
    let deletedCount = 0;
    
    // Delete currently selected element
    if (selectedElement) {
        const annotationId = selectedElement.getAttribute('data-annotation-id');
        const index = annotations.findIndex(a => a.id === annotationId);
        if (index !== -1) {
            annotations.splice(index, 1);
            selectedElement.remove();
            selectedElement = null;
            deletedCount++;
        }
    }
    
    // Delete all selected elements
    selectedElements.forEach(element => {
        if (element !== selectedElement) { // Avoid double deletion
            const annotationId = element.getAttribute('data-annotation-id');
            const index = annotations.findIndex(a => a.id === annotationId);
            if (index !== -1) {
                annotations.splice(index, 1);
                element.remove();
                deletedCount++;
            }
        }
    });
    
    // Clear resize handles
    document.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
    
    showNotification(`${deletedCount} element silindi`, 'success');
}

function resetZoom() {
    currentScale = 1.0;
    renderPage(currentPageNum);
    updateZoomLevel();
    showNotification('Zoom sıfırlandı', 'info');
}

// Sidebar Toggle Functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
        sidebar.classList.remove('collapsed');
        localStorage.setItem('sidebarCollapsed', 'false');
    } else {
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebarCollapsed', 'true');
    }
}

function initializeSidebar() {
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    const sidebar = document.getElementById('sidebar');
    
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
    }
}

// Context Menu Functions
let contextMenuTarget = null;
let copiedAnnotation = null;

function initializeContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    
    // Add context menu to PDF overlay
    overlay.addEventListener('contextmenu', function(event) {
        event.preventDefault();
        
        // Check if right-clicked on an annotation
        const target = event.target.closest('[data-annotation-id]');
        contextMenuTarget = target;
        
        showContextMenu(event.clientX, event.clientY, target);
    });
    
    // Add context menu to canvas for general actions
    canvas.addEventListener('contextmenu', function(event) {
        event.preventDefault();
        contextMenuTarget = null;
        showContextMenu(event.clientX, event.clientY, null);
    });
    
    // Hide context menu on click elsewhere
    document.addEventListener('click', function(event) {
        if (!contextMenu.contains(event.target)) {
            hideContextMenu();
        }
    });
    
    // Hide on scroll
    document.addEventListener('scroll', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);
}

function showContextMenu(x, y, target) {
    const contextMenu = document.getElementById('contextMenu');
    const items = contextMenu.querySelectorAll('.context-menu-item');
    
    // Enable/disable menu items based on context
    items.forEach(item => {
        const action = item.getAttribute('onclick')?.match(/handleContextAction\('(.+?)'\)/)?.[1];
        if (action) {
            item.style.display = shouldShowContextAction(action, target) ? 'flex' : 'none';
        }
    });
    
    // Position the menu
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
    
    // Ensure menu stays within viewport
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = (y - rect.height) + 'px';
    }
    
    // Show with animation
    setTimeout(() => {
        contextMenu.classList.add('show');
    }, 10);
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.classList.remove('show');
    setTimeout(() => {
        contextMenu.style.display = 'none';
    }, 200);
}

function shouldShowContextAction(action, target) {
    switch (action) {
        case 'copy':
        case 'duplicate':
        case 'delete':
        case 'bringToFront':
        case 'sendToBack':
        case 'properties':
            return target !== null; // Only show if annotation is selected
        case 'paste':
            return copiedAnnotation !== null; // Only show if something is copied
        default:
            return true;
    }
}

function handleContextAction(action) {
    hideContextMenu();
    
    switch (action) {
        case 'copy':
            copyAnnotation();
            break;
        case 'paste':
            pasteAnnotation();
            break;
        case 'duplicate':
            duplicateAnnotation();
            break;
        case 'delete':
            deleteContextTarget();
            break;
        case 'bringToFront':
            bringToFront();
            break;
        case 'sendToBack':
            sendToBack();
            break;
        case 'properties':
            showPropertiesModal();
            break;
    }
}

function copyAnnotation() {
    if (!contextMenuTarget) return;
    
    const annotationId = contextMenuTarget.getAttribute('data-annotation-id');
    const annotation = annotations.find(a => a.id === annotationId);
    
    if (annotation) {
        copiedAnnotation = JSON.parse(JSON.stringify(annotation));
        showNotification('Element kopyalandı', 'success');
    }
}

function pasteAnnotation() {
    if (!copiedAnnotation) return;
    
    // Create new annotation with offset position
    const newAnnotation = JSON.parse(JSON.stringify(copiedAnnotation));
    newAnnotation.id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    newAnnotation.x += 20; // Offset slightly
    newAnnotation.y += 20;
    newAnnotation.page = currentPageNum;
    
    annotations.push(newAnnotation);
    drawAnnotation(newAnnotation);
    saveState();
    
    showNotification('Element yapıştırıldı', 'success');
}

function duplicateAnnotation() {
    if (!contextMenuTarget) return;
    
    copyAnnotation();
    pasteAnnotation();
}

function deleteContextTarget() {
    if (!contextMenuTarget) return;
    
    const annotationId = contextMenuTarget.getAttribute('data-annotation-id');
    const index = annotations.findIndex(a => a.id === annotationId);
    
    if (index !== -1) {
        saveState();
        annotations.splice(index, 1);
        contextMenuTarget.remove();
        showNotification('Element silindi', 'success');
    }
}

function bringToFront() {
    if (!contextMenuTarget) return;
    
    contextMenuTarget.style.zIndex = (parseInt(contextMenuTarget.style.zIndex) || 0) + 1000;
    showNotification('Element öne getirildi', 'info');
}

function sendToBack() {
    if (!contextMenuTarget) return;
    
    contextMenuTarget.style.zIndex = '1';
    showNotification('Element arkaya gönderildi', 'info');
}

function showPropertiesModal() {
    if (!contextMenuTarget) return;
    
    const annotationId = contextMenuTarget.getAttribute('data-annotation-id');
    const annotation = annotations.find(a => a.id === annotationId);
    
    if (annotation) {
        // Create a simple properties dialog
        const properties = [
            `Type: ${annotation.type}`,
            `X: ${Math.round(annotation.x)}`,
            `Y: ${Math.round(annotation.y)}`,
            `Page: ${annotation.page}`
        ];
        
        if (annotation.width) properties.push(`Width: ${Math.round(annotation.width)}`);
        if (annotation.height) properties.push(`Height: ${Math.round(annotation.height)}`);
        if (annotation.text) properties.push(`Text: ${annotation.text}`);
        if (annotation.color) properties.push(`Color: ${annotation.color}`);
        
        alert('Element Özellikleri:\n\n' + properties.join('\n'));
    }
}

// Advanced Annotation Tools
let currentStamp = null;

// Stamp Library Functions
const stampLibrary = {
    approval: [
        { name: 'ONAYLANDI', text: 'ONAYLANDI', color: '#10b981' },
        { name: 'REDDEDİLDİ', text: 'REDDEDİLDİ', color: '#ef4444' },
        { name: 'BEKLEMEDE', text: 'BEKLEMEDE', color: '#f59e0b' },
        { name: 'İNCELENDİ', text: 'İNCELENDİ', color: '#3b82f6' }
    ],
    status: [
        { name: 'TAMAMLANDI', text: 'TAMAMLANDI', color: '#10b981' },
        { name: 'DEVAM EDİYOR', text: 'DEVAM EDİYOR', color: '#f59e0b' },
        { name: 'İPTAL', text: 'İPTAL', color: '#ef4444' },
        { name: 'YENI', text: 'YENI', color: '#8b5cf6' }
    ],
    date: [
        { name: 'Bugün', text: new Date().toLocaleDateString('tr-TR'), color: '#3b82f6' },
        { name: 'Bu Hafta', text: 'Bu Hafta', color: '#3b82f6' },
        { name: 'Bu Ay', text: 'Bu Ay', color: '#3b82f6' },
        { name: 'Tarih', text: 'GG/AA/YYYY', color: '#3b82f6' }
    ],
    custom: [
        { name: 'GİZLİ', text: 'GİZLİ', color: '#ef4444' },
        { name: 'ÖNEMLİ', text: 'ÖNEMLİ', color: '#f59e0b' },
        { name: 'KOPYA', text: 'KOPYA', color: '#6b7280' },
        { name: 'ORJİNAL', text: 'ORJİNAL', color: '#10b981' }
    ]
};

function openStampLibrary() {
    document.getElementById('stampLibraryModal').style.display = 'block';
    populateStampGrid('approval');
    
    // Add event listeners for category buttons
    document.querySelectorAll('.stamp-category').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.stamp-category').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            populateStampGrid(this.dataset.category);
        });
    });
}

function closeStampLibrary() {
    document.getElementById('stampLibraryModal').style.display = 'none';
}

function populateStampGrid(category) {
    const grid = document.getElementById('stampGrid');
    grid.innerHTML = '';
    
    stampLibrary[category].forEach(stamp => {
        const stampElement = document.createElement('div');
        stampElement.className = 'stamp-item';
        stampElement.innerHTML = `
            <div class="stamp-preview" style="color: ${stamp.color}; border-color: ${stamp.color};">
                ${stamp.text.substring(0, 4)}
            </div>
            <div class="stamp-name">${stamp.name}</div>
        `;
        
        stampElement.addEventListener('click', () => {
            currentStamp = stamp;
            activateTool('stamp');
            closeStampLibrary();
            showNotification(`${stamp.name} mührü seçildi`, 'success');
        });
        
        grid.appendChild(stampElement);
    });
}

// Advanced annotation creation functions
function addStickyNote(x, y) {
    saveState();
    
    const annotation = {
        id: Date.now().toString() + '_note',
        type: 'sticky-note',
        x: x,
        y: y,
        width: 120,
        height: 80,
        text: 'Not yazın...',
        color: '#f59e0b',
        page: currentPageNum
    };
    
    annotations.push(annotation);
    addStickyNoteToOverlay(annotation);
    showNotification('Yapışkan not eklendi', 'success');
}

function addStickyNoteToOverlay(annotation) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'sticky-note';
    noteDiv.setAttribute('data-annotation-id', annotation.id);
    noteDiv.style.left = (annotation.x * currentScale) + 'px';
    noteDiv.style.top = (annotation.y * currentScale) + 'px';
    noteDiv.style.width = (annotation.width * currentScale) + 'px';
    noteDiv.style.height = (annotation.height * currentScale) + 'px';
    noteDiv.contentEditable = true;
    noteDiv.textContent = annotation.text;
    
    noteDiv.addEventListener('blur', function() {
        annotation.text = this.textContent;
        saveState();
    });
    
    noteDiv.addEventListener('click', () => selectElement(noteDiv, annotation));
    
    overlay.appendChild(noteDiv);
}

function addCalloutBox(x, y) {
    saveState();
    
    const annotation = {
        id: Date.now().toString() + '_callout',
        type: 'callout',
        x: x,
        y: y,
        width: 150,
        height: 60,
        text: 'Açıklama yazın...',
        color: colorPicker.value,
        page: currentPageNum
    };
    
    annotations.push(annotation);
    addCalloutToOverlay(annotation);
    showNotification('Açıklama kutusu eklendi', 'success');
}

function addCalloutToOverlay(annotation) {
    const calloutDiv = document.createElement('div');
    calloutDiv.className = 'callout-box';
    calloutDiv.setAttribute('data-annotation-id', annotation.id);
    calloutDiv.style.left = (annotation.x * currentScale) + 'px';
    calloutDiv.style.top = (annotation.y * currentScale) + 'px';
    calloutDiv.style.width = (annotation.width * currentScale) + 'px';
    calloutDiv.style.borderColor = annotation.color;
    calloutDiv.contentEditable = true;
    calloutDiv.textContent = annotation.text;
    
    calloutDiv.addEventListener('blur', function() {
        annotation.text = this.textContent;
        saveState();
    });
    
    calloutDiv.addEventListener('click', () => selectElement(calloutDiv, annotation));
    
    overlay.appendChild(calloutDiv);
}

function addStamp(x, y) {
    if (!currentStamp) {
        showNotification('Önce bir mühür seçin!', 'warning');
        openStampLibrary();
        return;
    }
    
    saveState();
    
    const annotation = {
        id: Date.now().toString() + '_stamp',
        type: 'stamp',
        x: x,
        y: y,
        width: 100,
        height: 40,
        text: currentStamp.text,
        color: currentStamp.color,
        page: currentPageNum
    };
    
    annotations.push(annotation);
    addStampToOverlay(annotation);
    showNotification('Mühür eklendi', 'success');
}

function addStampToOverlay(annotation) {
    const stampDiv = document.createElement('div');
    stampDiv.className = 'stamp-annotation';
    stampDiv.setAttribute('data-annotation-id', annotation.id);
    stampDiv.style.position = 'absolute';
    stampDiv.style.left = (annotation.x * currentScale) + 'px';
    stampDiv.style.top = (annotation.y * currentScale) + 'px';
    stampDiv.style.width = (annotation.width * currentScale) + 'px';
    stampDiv.style.height = (annotation.height * currentScale) + 'px';
    stampDiv.style.border = `2px solid ${annotation.color}`;
    stampDiv.style.borderRadius = '6px';
    stampDiv.style.display = 'flex';
    stampDiv.style.alignItems = 'center';
    stampDiv.style.justifyContent = 'center';
    stampDiv.style.background = 'rgba(255, 255, 255, 0.9)';
    stampDiv.style.color = annotation.color;
    stampDiv.style.fontWeight = 'bold';
    stampDiv.style.fontSize = '10px';
    stampDiv.style.cursor = 'move';
    stampDiv.textContent = annotation.text;
    
    stampDiv.addEventListener('click', () => selectElement(stampDiv, annotation));
    
    overlay.appendChild(stampDiv);
}

function addStrikethrough(x, y, width) {
    saveState();
    
    const annotation = {
        id: Date.now().toString() + '_strike',
        type: 'strikethrough',
        x: x,
        y: y,
        width: width || 100,
        height: 2,
        color: '#ef4444',
        page: currentPageNum
    };
    
    annotations.push(annotation);
    addStrikethroughToOverlay(annotation);
    showNotification('Üstü çizili eklendi', 'success');
}

function addStrikethroughToOverlay(annotation) {
    const strikeDiv = document.createElement('div');
    strikeDiv.className = 'strikethrough-annotation';
    strikeDiv.setAttribute('data-annotation-id', annotation.id);
    strikeDiv.style.position = 'absolute';
    strikeDiv.style.left = (annotation.x * currentScale) + 'px';
    strikeDiv.style.top = (annotation.y * currentScale) + 'px';
    strikeDiv.style.width = (annotation.width * currentScale) + 'px';
    strikeDiv.style.height = '2px';
    strikeDiv.style.background = annotation.color;
    strikeDiv.style.cursor = 'move';
    
    strikeDiv.addEventListener('click', () => selectElement(strikeDiv, annotation));
    
    overlay.appendChild(strikeDiv);
}

function addUnderline(x, y, width) {
    saveState();
    
    const annotation = {
        id: Date.now().toString() + '_underline',
        type: 'underline',
        x: x,
        y: y + 5,
        width: width || 100,
        height: 2,
        color: colorPicker.value,
        page: currentPageNum
    };
    
    annotations.push(annotation);
    addUnderlineToOverlay(annotation);
    showNotification('Altı çizili eklendi', 'success');
}

function addUnderlineToOverlay(annotation) {
    const underlineDiv = document.createElement('div');
    underlineDiv.className = 'underline-annotation';
    underlineDiv.setAttribute('data-annotation-id', annotation.id);
    underlineDiv.style.position = 'absolute';
    underlineDiv.style.left = (annotation.x * currentScale) + 'px';
    underlineDiv.style.top = (annotation.y * currentScale) + 'px';
    underlineDiv.style.width = (annotation.width * currentScale) + 'px';
    underlineDiv.style.height = '2px';
    underlineDiv.style.background = annotation.color;
    underlineDiv.style.cursor = 'move';
    
    underlineDiv.addEventListener('click', () => selectElement(underlineDiv, annotation));
    
    overlay.appendChild(underlineDiv);
}