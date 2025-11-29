import { buildFieldDescriptor } from './domDescriptors.js';

let selectionMode = false;
let selectionOverlay = null;
let selectionRectEl = null;
let selectionStart = null;
let onBlockSelectedCallback = null;

export function initSelectionMode(options) {
  onBlockSelectedCallback = options.onBlockSelected;

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyA' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (!selectionMode) {
        enterSelectionMode();
      } else {
        exitSelectionMode();
      }
    }

    if (selectionMode && e.key === 'Escape') {
      exitSelectionMode();
    }
  });
}

function enterSelectionMode() {
  selectionMode = true;

  selectionOverlay = document.createElement('div');
  selectionOverlay.className = 'fc-selection-overlay';
  document.body.appendChild(selectionOverlay);

  selectionOverlay.addEventListener('mousedown', onSelectionMouseDown);
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
  if (e.button !== 0) return;
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

  const x1 = selectionStart.x;
  const y1 = selectionStart.y;
  const x2 = e.clientX;
  const y2 = e.clientY;

  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

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
  const candidates = document.querySelectorAll('input, textarea, select, [contenteditable]');
  return Array.from(candidates).filter(el => {
    if (el.offsetParent === null) return false;

    const r = el.getBoundingClientRect();

    if (r.width < 10 || r.height < 10) return false;

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
    selection_rect: rect,
    fields
  };
}

function handleSelectionRect(rect) {
  const elements = getElementsInSelection(rect);

  if (!elements.length) {
    console.log('[AutoFeel] No fields in selection.');
    return;
  }

  const primaryFieldEl = elements[0];
  const blockSnapshot = buildBlockSnapshot(rect, elements);

  if (onBlockSelectedCallback) {
    onBlockSelectedCallback({
      rect,
      elements,
      primaryElement: primaryFieldEl,
      blockSnapshot
    });
  }
}
