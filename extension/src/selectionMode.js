import { buildFieldDescriptor } from './domDescriptors.js';

/**
 * 用于选择模式的状态变量。
 */
let selectionMode = false;
let selectionOverlay = null;
let selectionRectEl = null;
let selectionStart = null;
let onBlockSelectedCallback = null;

/**
 * 初始化选择模式功能。
 * 设置全局键盘监听器以切换选择模式 (Ctrl+Shift+A) 和 Escape 取消。
 * 在选择模式激活时，附加鼠标事件监听器。
 * @param {object} options - 配置选项。
 * @param {function({rect: object, elements: Element[], primaryElement: Element, blockSnapshot: object})} options.onBlockSelected - 当完成一个有效的矩形选择时调用的回调函数。
 */
export function initSelectionMode(options) {
  onBlockSelectedCallback = options.onBlockSelected;

  document.addEventListener('keydown', (e) => {
    // 切换选择模式: Ctrl + Shift + A
    if (e.code === 'KeyA' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (!selectionMode) {
        enterSelectionMode();
      } else {
        exitSelectionMode();
      }
    }

    // Escape 键取消选择模式
    if (selectionMode && e.key === 'Escape') {
      exitSelectionMode();
    }
  });
}

/**
 * 进入选择模式，创建全屏覆盖层并附加鼠标监听器。
 */
function enterSelectionMode() {
  selectionMode = true;

  selectionOverlay = document.createElement('div');
  selectionOverlay.className = 'fc-selection-overlay';
  document.body.appendChild(selectionOverlay);

  selectionOverlay.addEventListener('mousedown', onSelectionMouseDown);
  // 将 move/up 事件附加到 document 上，以便在窗口/覆盖层边界外拖动时也能正常工作
  document.addEventListener('mousemove', onSelectionMouseMove);
  document.addEventListener('mouseup', onSelectionMouseUp);
}

/**
 * 退出选择模式，清理DOM元素和事件监听器。
 */
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

/**
 * 处理 mousedown 事件，开始绘制选择矩形。
 * @param {MouseEvent} e 鼠标事件。
 */
function onSelectionMouseDown(e) {
  if (e.button !== 0) return; // 只允许左键点击
  e.preventDefault();

  selectionStart = { x: e.clientX, y: e.clientY };

  selectionRectEl = document.createElement('div');
  selectionRectEl.className = 'fc-selection-rect';
  selectionOverlay.appendChild(selectionRectEl);

  updateSelectionRect(e.clientX, e.clientY);
}

/**
 * 处理 mousemove 事件，更新选择矩形的大小和位置。
 * @param {MouseEvent} e 鼠标事件。
 */
function onSelectionMouseMove(e) {
  if (!selectionStart || !selectionRectEl) return;
  e.preventDefault();
  updateSelectionRect(e.clientX, e.clientY);
}

/**
 * 处理 mouseup 事件，完成选择矩形的绘制。
 * 如果选择有效，则调用 handleSelectionRect。
 * @param {MouseEvent} e 鼠标事件。
 */
function onSelectionMouseUp(e) {
  if (!selectionStart) return;

  const x1 = selectionStart.x;
  const y1 = selectionStart.y;
  const x2 = e.clientX;
  const y2 = e.clientY;

  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  // 仅当选择区域足够大时才处理，以避免意外点击
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

/**
 * 随着鼠标移动，更新选择矩形的视觉表示。
 * @param {number} currentX 鼠标的当前X坐标。
 * @param {number} currentY 鼠标的当前Y坐标。
 */
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

/**
 * 查找与给定矩形相交的所有可填充HTML元素 (input, textarea, select)。
 * @param {object} rect - 选择矩形 {left, top, right, bottom}。
 * @returns {Element[]} 相交的可填充元素的数组。
 */
function getElementsInSelection(rect) {
  const candidates = document.querySelectorAll('input, textarea, select');
  return Array.from(candidates).filter(el => {
    // 只考虑可见元素
    if (el.offsetParent === null) return false;
    
    const r = el.getBoundingClientRect();
    // 检查元素边界矩形与选择矩形之间的相交
    const horizontally = r.left < rect.right && r.right > rect.left;
    const vertically   = r.top  < rect.bottom && r.bottom > rect.top;
    return horizontally && vertically;
  });
}

/**
 * 构建一个表示选定区域及其内部字段的快照对象。
 * @param {object} rect - 选择矩形 {left, top, right, bottom}。
 * @param {Element[]} elements - 选择区域内的可填充元素的数组。
 * @returns {object} 块快照对象。
 */
function buildBlockSnapshot(rect, elements) {
  const fields = elements.map(el => buildFieldDescriptor(el));
  return {
    url: window.location.href,
    title: document.title,
    selection_rect: rect, // 以视口坐标表示 { left, top, right, bottom }
    fields
  };
}

/**
 * 处理最终确定的选择矩形。它识别选区内的元素，
 * 构建快照，并调用提供的回调函数。
 * @param {object} rect - 选择矩形 {left, top, right, bottom}。
 */
function handleSelectionRect(rect) {
  const elements = getElementsInSelection(rect);

  if (!elements.length) {
    console.log('[AutoFeel] No fields in selection.');
    return;
  }

  // 主字段被选择为找到的第一个元素 (通常在DOM顺序中位于左上角)
  const primaryFieldEl = elements[0];
  const blockSnapshot = buildBlockSnapshot(rect, elements);

  // 调用初始化期间提供的回调函数
  if (onBlockSelectedCallback) {
    onBlockSelectedCallback({
      rect,
      elements,
      primaryElement: primaryFieldEl,
      blockSnapshot
    });
  }
}
