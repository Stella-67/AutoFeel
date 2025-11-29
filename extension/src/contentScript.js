// 1. Inject CSS Styles
const style = document.createElement('style');
style.textContent = `
.fc-ai-filling {
  position: relative;
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
  transition: all 0.2s ease;
  z-index: 9999;
}

.fc-ai-success {
  animation: fcAiSuccessFlash 0.6s ease;
}

.fc-ai-fail {
  animation: fcAiShake 0.4s ease;
}

@keyframes fcAiSuccessFlash {
  0%   { box-shadow: 0 0 0 rgba(0, 200, 0, 0.0); }
  50%  { box-shadow: 0 0 0 3px rgba(0, 200, 0, 0.6); }
  100% { box-shadow: 0 0 0 rgba(0, 200, 0, 0.0); }
}

@keyframes fcAiShake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-3px); }
  75%      { transform: translateX(3px); }
}

.fc-selection-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.05);
  cursor: crosshair;
  z-index: 999999; /* above everything */
}

.fc-selection-rect {
  position: absolute;
  border: 1px dashed rgba(0, 120, 255, 0.8);
  background: rgba(0, 120, 255, 0.1);
}
`;
document.head.appendChild(style);

// 2. State & Event Listeners
let isAltHeld = false;
let autoIdCounter = 0;

// Selection Mode State
let selectionMode = false;
let selectionOverlay = null;
let selectionRectEl = null;
let selectionStart = null;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') isAltHeld = true;
  
  // Toggle Selection Mode: Ctrl + Shift + A
  if (e.code === 'KeyA' && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    if (!selectionMode) {
      enterSelectionMode();
    } else {
      exitSelectionMode();
    }
  }
  
  // Escape to cancel selection mode
  if (selectionMode && e.key === 'Escape') {
    exitSelectionMode();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') isAltHeld = false;
});

document.addEventListener('click', (e) => {
  // Check both our tracking state and the event state for robustness
  if ((isAltHeld || e.altKey) && isFillableElement(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    handleAIClick(e.target);
  }
}, true); // Use capture to ensure we catch it before others if possible

function isFillableElement(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

// --- Selection Mode Logic ---

function enterSelectionMode() {
  selectionMode = true;
  
  selectionOverlay = document.createElement('div');
  selectionOverlay.className = 'fc-selection-overlay';
  document.body.appendChild(selectionOverlay);
  
  selectionOverlay.addEventListener('mousedown', onSelectionMouseDown);
  // We attach move/up to document to handle dragging outside the window/overlay bounds comfortably
  document.addEventListener('mousemove', onSelectionMouseMove);
  document.addEventListener('mouseup', onSelectionMouseUp);
}

function exitSelectionMode() {
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }
  if (selectionRectEl) {
    selectionRectEl.remove();
    selectionRectEl = null;
  }
  
  document.removeEventListener('mousemove', onSelectionMouseMove);
  document.removeEventListener('mouseup', onSelectionMouseUp);
  
  selectionStart = null;
  selectionMode = false;
}

function onSelectionMouseDown(e) {
  if (e.button !== 0) return; // Left click only
  e.preventDefault();
  
  selectionStart = { x: e.clientX, y: e.clientY };
  
  selectionRectEl = document.createElement('div');
  selectionRectEl.className = 'fc-selection-rect';
  selectionOverlay.appendChild(selectionRectEl);
  
  updateSelectionRect(e.clientX, e.clientY);
}

function onSelectionMouseMove(e) {
  if (!selectionStart || !selectionRectEl) return;
  e.preventDefault();
  updateSelectionRect(e.clientX, e.clientY);
}

function onSelectionMouseUp(e) {
  if (!selectionStart) return;
  
  // Calculate final rect dimensions
  const x1 = selectionStart.x;
  const y1 = selectionStart.y;
  const x2 = e.clientX;
  const y2 = e.clientY;
  
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  
  // Only process if selection is large enough (avoid accidental clicks)
  if (width > 5 && height > 5) {
    const rect = {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.min(x1, x2) + width,
      bottom: Math.min(y1, y2) + height
    };
    handleSelectionRect(rect);
  }
  
  exitSelectionMode();
}

function updateSelectionRect(currentX, currentY) {
  const x1 = selectionStart.x;
  const y1 = selectionStart.y;
  const x2 = currentX;
  const y2 = currentY;
  
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  
  selectionRectEl.style.left = left + 'px';
  selectionRectEl.style.top = top + 'px';
  selectionRectEl.style.width = width + 'px';
  selectionRectEl.style.height = height + 'px';
}

function getElementsInSelection(rect) {
  const candidates = document.querySelectorAll('input, textarea, select');
  return Array.from(candidates).filter(el => {
    // Only visible elements
    if (el.offsetParent === null) return false;
    
    const r = el.getBoundingClientRect();
    // Check intersection
    const horizontally = r.left < rect.right && r.right > rect.left;
    const vertically   = r.top  < rect.bottom && r.bottom > rect.top;
    return horizontally && vertically;
  });
}

function buildBlockSnapshot(rect, elements) {
  const fields = elements.map(el => buildFieldDescriptor(el));
  return {
    url: window.location.href,
    title: document.title,
    selection_rect: rect, // { left, top, right, bottom } in viewport coords
    fields
  };
}

async function handleSelectionRect(rect) {
  const elements = getElementsInSelection(rect);
  
  if (!elements.length) {
    console.log('[AutoFeel] No fields in selection.');
    return;
  }
  
  // Primary field is the first one found (usually top-left most in DOM order)
  const primaryFieldEl = elements[0];
  const fieldDescriptor = buildFieldDescriptor(primaryFieldEl);
  const blockSnapshot = buildBlockSnapshot(rect, elements);
  
  // Visual effect on the primary field
  const blockElement = getBlockElement(primaryFieldEl);
  blockElement.classList.add('fc-ai-filling');

  try {
    const response = await chrome.runtime.sendMessage({
      type: "FC_FILL_FIELD",
      payload: {
        fieldDescriptor,
        blockSnapshot,
        sessionId: null
      }
    });

    handleResponse(primaryFieldEl, blockElement, response);

  } catch (err) {
    if (err.message.includes("Extension context invalidated")) {
      console.error("AutoFeel: Extension context invalidated. Please reload the page.");
      alert("AutoFeel: Please reload the page to reconnect to the updated extension.");
    } else {
      console.error("Extension messaging error:", err);
    }
    handleResponse(primaryFieldEl, blockElement, { status: 'fail', reason: 'extension_error' });
  }
}

// 3. Core Logic
async function handleAIClick(targetElement) {
  const block = getBlockElement(targetElement);
  
  // Visual: Start Loading
  block.classList.add('fc-ai-filling');

  const fieldDescriptor = buildFieldDescriptor(targetElement);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "FC_FILL_FIELD",
      payload: {
        fieldDescriptor,
        sessionId: null
      }
    });

    handleResponse(targetElement, block, response);

  } catch (err) {
    if (err.message.includes("Extension context invalidated")) {
      console.error("AutoFeel: Extension context invalidated. Please reload the page.");
      alert("AutoFeel: Please reload the page to reconnect to the updated extension.");
    } else {
      console.error("Extension messaging error:", err);
    }
    handleResponse(targetElement, block, { status: 'fail', reason: 'extension_error' });
  }
}

function handleResponse(inputEl, blockEl, response) {
  // Remove loading state
  blockEl.classList.remove('fc-ai-filling');

  if (response && response.status === 'success') {
    // Success Animation
    blockEl.classList.add('fc-ai-success');
    
    // Set Value
    if (response.value !== null && response.value !== undefined) {
      inputEl.value = response.value;
      // Dispatch events so frameworks (React/Angular) detect change
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setTimeout(() => {
      blockEl.classList.remove('fc-ai-success');
    }, 600);

  } else {
    // Fail Animation
    blockEl.classList.add('fc-ai-fail');
    console.log("AI Fill Failed:", response ? response.reason : "Unknown");

    setTimeout(() => {
      blockEl.classList.remove('fc-ai-fail');
    }, 400);
  }
}

// 4. Helpers
function getBlockElement(el) {
  return el.parentElement || el;
}

function buildFieldDescriptor(el) {
  return {
    dom_id: getDomId(el),
    label: getLabel(el),
    placeholder: el.placeholder || null,
    type: el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'other'),
    current_value: el.value || '',
    page_url: window.location.href,
    name: el.name || null
  };
}

function getDomId(el) {
  if (el.id) return el.id;
  
  if (el.dataset.fcAutoId) return el.dataset.fcAutoId;

  const newId = `fc-auto-${++autoIdCounter}`;
  el.dataset.fcAutoId = newId;
  return newId;
}

function getLabel(el) {
  // 1. Try <label for="id">
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.innerText.trim();
  }

  // 2. Try closest parent <label> (implicit association)
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Clone and remove the input itself to get just the text
    const clone = parentLabel.cloneNode(true);
    const inputInClone = clone.querySelector('input, textarea');
    if (inputInClone) inputInClone.remove();
    return clone.innerText.trim();
  }

  // 3. Simple heuristic: Previous sibling or text in parent
  // Look for previous element sibling that might be a label or span
  let sibling = el.previousElementSibling;
  if (sibling && (sibling.tagName === 'LABEL' || sibling.tagName === 'SPAN' || sibling.tagName === 'DIV')) {
    return sibling.innerText.trim();
  }

  // 4. Text content of parent (excluding the input itself)
  // This is risky as it might capture too much, but okay for MVP
  if (el.parentElement) {
    const parentText = el.parentElement.innerText;
    // Very rough, might include the input value if not careful, but innerText usually handles value differently
    return parentText.replace(el.value, '').trim().slice(0, 50); 
  }

  return null;
}
