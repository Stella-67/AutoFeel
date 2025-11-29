// src/styles.js
function injectAutoFeelStyles() {
  if (document.getElementById("fc-autofeel-styles"))
    return;
  const style = document.createElement("style");
  style.id = "fc-autofeel-styles";
  style.textContent = `
.fc-ai-filling {
  position: relative;
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16) !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease !important;
  z-index: 10000 !important;
  background-color: white;
  border-radius: 4px;
}

.fc-ai-success {
  animation: fcAiSuccessFlash 0.6s ease;
  background-color: rgba(46, 204, 113, 0.15) !important;
  border-radius: 4px;
}

.fc-ai-fail {
  animation: fcAiShake 0.4s ease;
  box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.8) !important;
  background-color: rgba(231, 76, 60, 0.15) !important;
  border-radius: 4px;
}

@keyframes fcAiSuccessFlash {
  0%   { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.0); }
  50%  { box-shadow: 0 0 0 4px rgba(46, 204, 113, 0.8); }
  100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.0); }
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

.fc-ai-selected {
  box-shadow: 0 0 0 3px #4a90e2, 0 0 12px rgba(74, 144, 226, 0.6) !important;
  background-color: rgba(74, 144, 226, 0.15) !important;
  border-radius: 4px;
  z-index: 10001 !important;
  animation: fcAiSelectedPulse 1s infinite;
}

@keyframes fcAiSelectedPulse {
  0% { box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.4), 0 0 12px rgba(74, 144, 226, 0.2); }
  50% { box-shadow: 0 0 0 3px rgba(74, 144, 226, 1), 0 0 20px rgba(74, 144, 226, 0.6); }
  100% { box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.4), 0 0 12px rgba(74, 144, 226, 0.2); }
}
`;
  document.head.appendChild(style);
}

// src/domDescriptors.js
var autoIdCounter = 0;
function isFillableElement(el) {
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
function getBlockElement(el) {
  if (el.isContentEditable) {
    const editorContainer = el.closest('.ProseMirror, .ed-editor-content, [contenteditable="true"]');
    if (editorContainer && editorContainer !== el && editorContainer.contains(el)) {
      return editorContainer;
    }
    return el;
  }
  return el.parentElement || el;
}
function buildFieldDescriptor(el) {
  const isContentEditable = el.isContentEditable;
  let type = "other";
  if (isContentEditable) {
    type = "contenteditable";
  } else if (el.tagName === "TEXTAREA") {
    type = "textarea";
  } else {
    type = el.type || "other";
  }
  let currentValue = "";
  if (isContentEditable) {
    currentValue = el.innerText;
  } else {
    currentValue = el.value || "";
  }
  return {
    dom_id: getDomId(el),
    label: getLabel(el),
    placeholder: el.placeholder || el.getAttribute("placeholder") || null,
    type,
    current_value: currentValue,
    page_url: window.location.href,
    name: el.name || null
  };
}
function getDomId(el) {
  if (el.id)
    return el.id;
  if (el.dataset.fcAutoId)
    return el.dataset.fcAutoId;
  const newId = `fc-auto-${++autoIdCounter}`;
  el.dataset.fcAutoId = newId;
  return newId;
}
function getLabel(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label)
      return label.innerText.trim();
  }
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    const inputInClone = clone.querySelector("input, textarea, select");
    if (inputInClone)
      inputInClone.remove();
    return clone.innerText.trim();
  }
  let sibling = el.previousElementSibling;
  if (sibling && (sibling.tagName === "LABEL" || sibling.tagName === "SPAN" || sibling.tagName === "DIV")) {
    return sibling.innerText.trim();
  }
  if (el.parentElement) {
    const parentText = el.parentElement.innerText;
    return parentText.replace(el.value, "").trim().slice(0, 50);
  }
  return null;
}

// src/selectionMode.js
var selectionMode = false;
var selectionOverlay = null;
var selectionRectEl = null;
var selectionStart = null;
var onBlockSelectedCallback = null;
function initSelectionMode(options) {
  onBlockSelectedCallback = options.onBlockSelected;
  document.addEventListener("keydown", (e) => {
    if (e.code === "KeyA" && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (!selectionMode) {
        enterSelectionMode();
      } else {
        exitSelectionMode();
      }
    }
    if (selectionMode && e.key === "Escape") {
      exitSelectionMode();
    }
  });
}
function enterSelectionMode() {
  selectionMode = true;
  selectionOverlay = document.createElement("div");
  selectionOverlay.className = "fc-selection-overlay";
  document.body.appendChild(selectionOverlay);
  selectionOverlay.addEventListener("mousedown", onSelectionMouseDown);
  document.addEventListener("mousemove", onSelectionMouseMove);
  document.addEventListener("mouseup", onSelectionMouseUp);
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
  document.removeEventListener("mousemove", onSelectionMouseMove);
  document.removeEventListener("mouseup", onSelectionMouseUp);
  selectionStart = null;
  selectionMode = false;
}
function onSelectionMouseDown(e) {
  if (e.button !== 0)
    return;
  e.preventDefault();
  selectionStart = { x: e.clientX, y: e.clientY };
  selectionRectEl = document.createElement("div");
  selectionRectEl.className = "fc-selection-rect";
  selectionOverlay.appendChild(selectionRectEl);
  updateSelectionRect(e.clientX, e.clientY);
}
function onSelectionMouseMove(e) {
  if (!selectionStart || !selectionRectEl)
    return;
  e.preventDefault();
  updateSelectionRect(e.clientX, e.clientY);
}
function onSelectionMouseUp(e) {
  if (!selectionStart)
    return;
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
  selectionRectEl.style.left = left + "px";
  selectionRectEl.style.top = top + "px";
  selectionRectEl.style.width = width + "px";
  selectionRectEl.style.height = height + "px";
}
function getElementsInSelection(rect) {
  const candidates = document.querySelectorAll("input, textarea, select, [contenteditable]");
  return Array.from(candidates).filter((el) => {
    if (el.offsetParent === null)
      return false;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10)
      return false;
    const horizontally = r.left < rect.right && r.right > rect.left;
    const vertically = r.top < rect.bottom && r.bottom > rect.top;
    return horizontally && vertically;
  });
}
function buildBlockSnapshot(rect, elements) {
  const fields = elements.map((el) => buildFieldDescriptor(el));
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
    console.log("[AutoFeel] No fields in selection.");
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

// src/contentScript.js
injectAutoFeelStyles();
var isModifierHeld = false;
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey)
    isModifierHeld = true;
});
document.addEventListener("keyup", (e) => {
  if (e.metaKey || e.ctrlKey)
    isModifierHeld = false;
});
document.addEventListener("click", (e) => {
  if ((isModifierHeld || e.metaKey || e.ctrlKey) && isFillableElement(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    handleAIClick(e.target);
  }
}, true);
async function handleAIClick(targetElement) {
  await handleAIInteraction(targetElement, null);
}
initSelectionMode({
  onBlockSelected: async ({ elements, blockSnapshot }) => {
    elements.forEach((el) => {
      const block = getBlockElement(el);
      block.classList.add("fc-ai-selected");
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const element of elements) {
      if (!document.body.contains(element))
        continue;
      const block = getBlockElement(element);
      block.classList.remove("fc-ai-selected");
      await handleAIInteraction(element, blockSnapshot);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
});
async function handleAIInteraction(targetElement, blockSnapshot) {
  const block = getBlockElement(targetElement);
  block.classList.add("fc-ai-filling");
  const fieldDescriptor = buildFieldDescriptor(targetElement);
  try {
    const payload = {
      fieldDescriptor,
      sessionId: null
    };
    if (blockSnapshot) {
      payload.blockSnapshot = blockSnapshot;
    }
    const response = await chrome.runtime.sendMessage({
      type: "FC_FILL_FIELD",
      payload
    });
    handleResponse(targetElement, block, response);
  } catch (err) {
    const errorMessage = err.message || String(err);
    if (errorMessage.includes("Extension context invalidated")) {
      console.error("AutoFeel: Extension context invalidated. Please reload the page.");
      alert("AutoFeel: \u8BF7\u5237\u65B0\u9875\u9762\u4EE5\u91CD\u65B0\u8FDE\u63A5\u5230\u66F4\u65B0\u7684\u6269\u5C55\u3002");
    } else {
      console.error("Extension messaging error:", err);
    }
    handleResponse(targetElement, block, { status: "fail", reason: "extension_error" });
  }
}
function handleResponse(inputEl, blockEl, response) {
  blockEl.classList.remove("fc-ai-filling");
  if (response && response.status === "success") {
    blockEl.classList.add("fc-ai-success");
    if (response.value !== null && response.value !== void 0) {
      if (inputEl.isContentEditable) {
        inputEl.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, response.value);
      } else {
        inputEl.value = response.value;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    setTimeout(() => {
      blockEl.classList.remove("fc-ai-success");
    }, 600);
  } else {
    blockEl.classList.add("fc-ai-fail");
    console.log("AI Fill Failed:", response ? response.reason : "Unknown");
    setTimeout(() => {
      blockEl.classList.remove("fc-ai-fail");
    }, 400);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3N0eWxlcy5qcyIsICIuLi9zcmMvZG9tRGVzY3JpcHRvcnMuanMiLCAiLi4vc3JjL3NlbGVjdGlvbk1vZGUuanMiLCAiLi4vc3JjL2NvbnRlbnRTY3JpcHQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBmdW5jdGlvbiBpbmplY3RBdXRvRmVlbFN0eWxlcygpIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmYy1hdXRvZmVlbC1zdHlsZXMnKSkgcmV0dXJuO1xuXG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSAnZmMtYXV0b2ZlZWwtc3R5bGVzJztcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4uZmMtYWktZmlsbGluZyB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpIHNjYWxlKDEuMDEpO1xuICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMCwgMCwgMCwgMC4xNikgIWltcG9ydGFudDtcbiAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMnMgZWFzZSwgYm94LXNoYWRvdyAwLjJzIGVhc2UgIWltcG9ydGFudDtcbiAgei1pbmRleDogMTAwMDAgIWltcG9ydGFudDtcbiAgYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XG4gIGJvcmRlci1yYWRpdXM6IDRweDtcbn1cblxuLmZjLWFpLXN1Y2Nlc3Mge1xuICBhbmltYXRpb246IGZjQWlTdWNjZXNzRmxhc2ggMC42cyBlYXNlO1xuICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDQ2LCAyMDQsIDExMywgMC4xNSkgIWltcG9ydGFudDtcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xufVxuXG4uZmMtYWktZmFpbCB7XG4gIGFuaW1hdGlvbjogZmNBaVNoYWtlIDAuNHMgZWFzZTtcbiAgYm94LXNoYWRvdzogMCAwIDAgM3B4IHJnYmEoMjMxLCA3NiwgNjAsIDAuOCkgIWltcG9ydGFudDtcbiAgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgyMzEsIDc2LCA2MCwgMC4xNSkgIWltcG9ydGFudDtcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xufVxuXG5Aa2V5ZnJhbWVzIGZjQWlTdWNjZXNzRmxhc2gge1xuICAwJSAgIHsgYm94LXNoYWRvdzogMCAwIDAgMCByZ2JhKDQ2LCAyMDQsIDExMywgMC4wKTsgfVxuICA1MCUgIHsgYm94LXNoYWRvdzogMCAwIDAgNHB4IHJnYmEoNDYsIDIwNCwgMTEzLCAwLjgpOyB9XG4gIDEwMCUgeyBib3gtc2hhZG93OiAwIDAgMCAwIHJnYmEoNDYsIDIwNCwgMTEzLCAwLjApOyB9XG59XG5cbkBrZXlmcmFtZXMgZmNBaVNoYWtlIHtcbiAgMCUsIDEwMCUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMCk7IH1cbiAgMjUlICAgICAgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoLTNweCk7IH1cbiAgNzUlICAgICAgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoM3B4KTsgfVxufVxuXG4uZmMtc2VsZWN0aW9uLW92ZXJsYXkge1xuICBwb3NpdGlvbjogZml4ZWQ7XG4gIGluc2V0OiAwO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuMDUpO1xuICBjdXJzb3I6IGNyb3NzaGFpcjtcbiAgei1pbmRleDogOTk5OTk5OyAvKiBhYm92ZSBldmVyeXRoaW5nICovXG59XG5cbi5mYy1zZWxlY3Rpb24tcmVjdCB7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgYm9yZGVyOiAxcHggZGFzaGVkIHJnYmEoMCwgMTIwLCAyNTUsIDAuOCk7XG4gIGJhY2tncm91bmQ6IHJnYmEoMCwgMTIwLCAyNTUsIDAuMSk7XG59XG5cbi5mYy1haS1zZWxlY3RlZCB7XG4gIGJveC1zaGFkb3c6IDAgMCAwIDNweCAjNGE5MGUyLCAwIDAgMTJweCByZ2JhKDc0LCAxNDQsIDIyNiwgMC42KSAhaW1wb3J0YW50O1xuICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDc0LCAxNDQsIDIyNiwgMC4xNSkgIWltcG9ydGFudDtcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xuICB6LWluZGV4OiAxMDAwMSAhaW1wb3J0YW50O1xuICBhbmltYXRpb246IGZjQWlTZWxlY3RlZFB1bHNlIDFzIGluZmluaXRlO1xufVxuXG5Aa2V5ZnJhbWVzIGZjQWlTZWxlY3RlZFB1bHNlIHtcbiAgMCUgeyBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSg3NCwgMTQ0LCAyMjYsIDAuNCksIDAgMCAxMnB4IHJnYmEoNzQsIDE0NCwgMjI2LCAwLjIpOyB9XG4gIDUwJSB7IGJveC1zaGFkb3c6IDAgMCAwIDNweCByZ2JhKDc0LCAxNDQsIDIyNiwgMSksIDAgMCAyMHB4IHJnYmEoNzQsIDE0NCwgMjI2LCAwLjYpOyB9XG4gIDEwMCUgeyBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSg3NCwgMTQ0LCAyMjYsIDAuNCksIDAgMCAxMnB4IHJnYmEoNzQsIDE0NCwgMjI2LCAwLjIpOyB9XG59XG5gO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn0iLCAibGV0IGF1dG9JZENvdW50ZXIgPSAwO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNGaWxsYWJsZUVsZW1lbnQoZWwpIHtcbiAgcmV0dXJuIGVsLnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZWwudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJyB8fCBlbC50YWdOYW1lID09PSAnU0VMRUNUJyB8fCBlbC5pc0NvbnRlbnRFZGl0YWJsZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJsb2NrRWxlbWVudChlbCkge1xuICBpZiAoZWwuaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICBjb25zdCBlZGl0b3JDb250YWluZXIgPSBlbC5jbG9zZXN0KCcuUHJvc2VNaXJyb3IsIC5lZC1lZGl0b3ItY29udGVudCwgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcbiAgICBpZiAoZWRpdG9yQ29udGFpbmVyICYmIGVkaXRvckNvbnRhaW5lciAhPT0gZWwgJiYgZWRpdG9yQ29udGFpbmVyLmNvbnRhaW5zKGVsKSkge1xuICAgICAgIHJldHVybiBlZGl0b3JDb250YWluZXI7XG4gICAgfVxuICAgIHJldHVybiBlbDtcbiAgfVxuICByZXR1cm4gZWwucGFyZW50RWxlbWVudCB8fCBlbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmllbGREZXNjcmlwdG9yKGVsKSB7XG4gIGNvbnN0IGlzQ29udGVudEVkaXRhYmxlID0gZWwuaXNDb250ZW50RWRpdGFibGU7XG5cbiAgbGV0IHR5cGUgPSAnb3RoZXInO1xuICBpZiAoaXNDb250ZW50RWRpdGFibGUpIHtcbiAgICB0eXBlID0gJ2NvbnRlbnRlZGl0YWJsZSc7XG4gIH0gZWxzZSBpZiAoZWwudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJykge1xuICAgIHR5cGUgPSAndGV4dGFyZWEnO1xuICB9IGVsc2Uge1xuICAgIHR5cGUgPSBlbC50eXBlIHx8ICdvdGhlcic7XG4gIH1cblxuICBsZXQgY3VycmVudFZhbHVlID0gJyc7XG4gIGlmIChpc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgIGN1cnJlbnRWYWx1ZSA9IGVsLmlubmVyVGV4dDtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50VmFsdWUgPSBlbC52YWx1ZSB8fCAnJztcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZG9tX2lkOiBnZXREb21JZChlbCksXG4gICAgbGFiZWw6IGdldExhYmVsKGVsKSxcbiAgICBwbGFjZWhvbGRlcjogZWwucGxhY2Vob2xkZXIgfHwgZWwuZ2V0QXR0cmlidXRlKCdwbGFjZWhvbGRlcicpIHx8IG51bGwsXG4gICAgdHlwZTogdHlwZSxcbiAgICBjdXJyZW50X3ZhbHVlOiBjdXJyZW50VmFsdWUsXG4gICAgcGFnZV91cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgIG5hbWU6IGVsLm5hbWUgfHwgbnVsbFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RG9tSWQoZWwpIHtcbiAgaWYgKGVsLmlkKSByZXR1cm4gZWwuaWQ7XG5cbiAgaWYgKGVsLmRhdGFzZXQuZmNBdXRvSWQpIHJldHVybiBlbC5kYXRhc2V0LmZjQXV0b0lkO1xuXG4gIGNvbnN0IG5ld0lkID0gYGZjLWF1dG8tJHsrK2F1dG9JZENvdW50ZXJ9YDtcbiAgZWwuZGF0YXNldC5mY0F1dG9JZCA9IG5ld0lkO1xuICByZXR1cm4gbmV3SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYWJlbChlbCkge1xuICBpZiAoZWwuaWQpIHtcbiAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGxhYmVsW2Zvcj1cIiR7ZWwuaWR9XCJdYCk7XG4gICAgaWYgKGxhYmVsKSByZXR1cm4gbGFiZWwuaW5uZXJUZXh0LnRyaW0oKTtcbiAgfVxuXG4gIGNvbnN0IHBhcmVudExhYmVsID0gZWwuY2xvc2VzdCgnbGFiZWwnKTtcbiAgaWYgKHBhcmVudExhYmVsKSB7XG4gICAgY29uc3QgY2xvbmUgPSBwYXJlbnRMYWJlbC5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgY29uc3QgaW5wdXRJbkNsb25lID0gY2xvbmUucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QnKTtcbiAgICBpZiAoaW5wdXRJbkNsb25lKSBpbnB1dEluQ2xvbmUucmVtb3ZlKCk7XG4gICAgcmV0dXJuIGNsb25lLmlubmVyVGV4dC50cmltKCk7XG4gIH1cblxuICBsZXQgc2libGluZyA9IGVsLnByZXZpb3VzRWxlbWVudFNpYmxpbmc7XG4gIGlmIChzaWJsaW5nICYmIChzaWJsaW5nLnRhZ05hbWUgPT09ICdMQUJFTCcgfHwgc2libGluZy50YWdOYW1lID09PSAnU1BBTicgfHwgc2libGluZy50YWdOYW1lID09PSAnRElWJykpIHtcbiAgICByZXR1cm4gc2libGluZy5pbm5lclRleHQudHJpbSgpO1xuICB9XG5cbiAgaWYgKGVsLnBhcmVudEVsZW1lbnQpIHtcbiAgICBjb25zdCBwYXJlbnRUZXh0ID0gZWwucGFyZW50RWxlbWVudC5pbm5lclRleHQ7XG4gICAgcmV0dXJuIHBhcmVudFRleHQucmVwbGFjZShlbC52YWx1ZSwgJycpLnRyaW0oKS5zbGljZSgwLCA1MCk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cbiIsICJpbXBvcnQgeyBidWlsZEZpZWxkRGVzY3JpcHRvciB9IGZyb20gJy4vZG9tRGVzY3JpcHRvcnMuanMnO1xuXG5sZXQgc2VsZWN0aW9uTW9kZSA9IGZhbHNlO1xubGV0IHNlbGVjdGlvbk92ZXJsYXkgPSBudWxsO1xubGV0IHNlbGVjdGlvblJlY3RFbCA9IG51bGw7XG5sZXQgc2VsZWN0aW9uU3RhcnQgPSBudWxsO1xubGV0IG9uQmxvY2tTZWxlY3RlZENhbGxiYWNrID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRTZWxlY3Rpb25Nb2RlKG9wdGlvbnMpIHtcbiAgb25CbG9ja1NlbGVjdGVkQ2FsbGJhY2sgPSBvcHRpb25zLm9uQmxvY2tTZWxlY3RlZDtcblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICBpZiAoZS5jb2RlID09PSAnS2V5QScgJiYgZS5jdHJsS2V5ICYmIGUuc2hpZnRLZXkpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGlmICghc2VsZWN0aW9uTW9kZSkge1xuICAgICAgICBlbnRlclNlbGVjdGlvbk1vZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4aXRTZWxlY3Rpb25Nb2RlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNlbGVjdGlvbk1vZGUgJiYgZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICBleGl0U2VsZWN0aW9uTW9kZSgpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGVudGVyU2VsZWN0aW9uTW9kZSgpIHtcbiAgc2VsZWN0aW9uTW9kZSA9IHRydWU7XG5cbiAgc2VsZWN0aW9uT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBzZWxlY3Rpb25PdmVybGF5LmNsYXNzTmFtZSA9ICdmYy1zZWxlY3Rpb24tb3ZlcmxheSc7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2VsZWN0aW9uT3ZlcmxheSk7XG5cbiAgc2VsZWN0aW9uT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvblNlbGVjdGlvbk1vdXNlRG93bik7XG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIG9uU2VsZWN0aW9uTW91c2VNb3ZlKTtcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG9uU2VsZWN0aW9uTW91c2VVcCk7XG59XG5cbmZ1bmN0aW9uIGV4aXRTZWxlY3Rpb25Nb2RlKCkge1xuICBpZiAoc2VsZWN0aW9uT3ZlcmxheSkge1xuICAgIHNlbGVjdGlvbk92ZXJsYXkucmVtb3ZlKCk7XG4gICAgc2VsZWN0aW9uT3ZlcmxheSA9IG51bGw7XG4gIH1cbiAgaWYgKHNlbGVjdGlvblJlY3RFbCkge1xuICAgIHNlbGVjdGlvblJlY3RFbC5yZW1vdmUoKTtcbiAgICBzZWxlY3Rpb25SZWN0RWwgPSBudWxsO1xuICB9XG5cbiAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgb25TZWxlY3Rpb25Nb3VzZU1vdmUpO1xuICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgb25TZWxlY3Rpb25Nb3VzZVVwKTtcblxuICBzZWxlY3Rpb25TdGFydCA9IG51bGw7XG4gIHNlbGVjdGlvbk1vZGUgPSBmYWxzZTtcbn1cblxuZnVuY3Rpb24gb25TZWxlY3Rpb25Nb3VzZURvd24oZSkge1xuICBpZiAoZS5idXR0b24gIT09IDApIHJldHVybjtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIHNlbGVjdGlvblN0YXJ0ID0geyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9O1xuXG4gIHNlbGVjdGlvblJlY3RFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBzZWxlY3Rpb25SZWN0RWwuY2xhc3NOYW1lID0gJ2ZjLXNlbGVjdGlvbi1yZWN0JztcbiAgc2VsZWN0aW9uT3ZlcmxheS5hcHBlbmRDaGlsZChzZWxlY3Rpb25SZWN0RWwpO1xuXG4gIHVwZGF0ZVNlbGVjdGlvblJlY3QoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xufVxuXG5mdW5jdGlvbiBvblNlbGVjdGlvbk1vdXNlTW92ZShlKSB7XG4gIGlmICghc2VsZWN0aW9uU3RhcnQgfHwgIXNlbGVjdGlvblJlY3RFbCkgcmV0dXJuO1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIHVwZGF0ZVNlbGVjdGlvblJlY3QoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xufVxuXG5mdW5jdGlvbiBvblNlbGVjdGlvbk1vdXNlVXAoZSkge1xuICBpZiAoIXNlbGVjdGlvblN0YXJ0KSByZXR1cm47XG5cbiAgY29uc3QgeDEgPSBzZWxlY3Rpb25TdGFydC54O1xuICBjb25zdCB5MSA9IHNlbGVjdGlvblN0YXJ0Lnk7XG4gIGNvbnN0IHgyID0gZS5jbGllbnRYO1xuICBjb25zdCB5MiA9IGUuY2xpZW50WTtcblxuICBjb25zdCB3aWR0aCA9IE1hdGguYWJzKHgyIC0geDEpO1xuICBjb25zdCBoZWlnaHQgPSBNYXRoLmFicyh5MiAtIHkxKTtcblxuICBpZiAod2lkdGggPiA1ICYmIGhlaWdodCA+IDUpIHtcbiAgICBjb25zdCByZWN0ID0ge1xuICAgICAgbGVmdDogTWF0aC5taW4oeDEsIHgyKSxcbiAgICAgIHRvcDogTWF0aC5taW4oeTEsIHkyKSxcbiAgICAgIHJpZ2h0OiBNYXRoLm1pbih4MSwgeDIpICsgd2lkdGgsXG4gICAgICBib3R0b206IE1hdGgubWluKHkxLCB5MikgKyBoZWlnaHRcbiAgICB9O1xuICAgIGhhbmRsZVNlbGVjdGlvblJlY3QocmVjdCk7XG4gIH1cblxuICBleGl0U2VsZWN0aW9uTW9kZSgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTZWxlY3Rpb25SZWN0KGN1cnJlbnRYLCBjdXJyZW50WSkge1xuICBjb25zdCB4MSA9IHNlbGVjdGlvblN0YXJ0Lng7XG4gIGNvbnN0IHkxID0gc2VsZWN0aW9uU3RhcnQueTtcbiAgY29uc3QgeDIgPSBjdXJyZW50WDtcbiAgY29uc3QgeTIgPSBjdXJyZW50WTtcblxuICBjb25zdCBsZWZ0ID0gTWF0aC5taW4oeDEsIHgyKTtcbiAgY29uc3QgdG9wID0gTWF0aC5taW4oeTEsIHkyKTtcbiAgY29uc3Qgd2lkdGggPSBNYXRoLmFicyh4MiAtIHgxKTtcbiAgY29uc3QgaGVpZ2h0ID0gTWF0aC5hYnMoeTIgLSB5MSk7XG5cbiAgc2VsZWN0aW9uUmVjdEVsLnN0eWxlLmxlZnQgPSBsZWZ0ICsgJ3B4JztcbiAgc2VsZWN0aW9uUmVjdEVsLnN0eWxlLnRvcCA9IHRvcCArICdweCc7XG4gIHNlbGVjdGlvblJlY3RFbC5zdHlsZS53aWR0aCA9IHdpZHRoICsgJ3B4JztcbiAgc2VsZWN0aW9uUmVjdEVsLnN0eWxlLmhlaWdodCA9IGhlaWdodCArICdweCc7XG59XG5cbmZ1bmN0aW9uIGdldEVsZW1lbnRzSW5TZWxlY3Rpb24ocmVjdCkge1xuICBjb25zdCBjYW5kaWRhdGVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGVdJyk7XG4gIHJldHVybiBBcnJheS5mcm9tKGNhbmRpZGF0ZXMpLmZpbHRlcihlbCA9PiB7XG4gICAgaWYgKGVsLm9mZnNldFBhcmVudCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc3QgciA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgaWYgKHIud2lkdGggPCAxMCB8fCByLmhlaWdodCA8IDEwKSByZXR1cm4gZmFsc2U7XG5cbiAgICBjb25zdCBob3Jpem9udGFsbHkgPSByLmxlZnQgPCByZWN0LnJpZ2h0ICYmIHIucmlnaHQgPiByZWN0LmxlZnQ7XG4gICAgY29uc3QgdmVydGljYWxseSAgID0gci50b3AgIDwgcmVjdC5ib3R0b20gJiYgci5ib3R0b20gPiByZWN0LnRvcDtcbiAgICByZXR1cm4gaG9yaXpvbnRhbGx5ICYmIHZlcnRpY2FsbHk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidWlsZEJsb2NrU25hcHNob3QocmVjdCwgZWxlbWVudHMpIHtcbiAgY29uc3QgZmllbGRzID0gZWxlbWVudHMubWFwKGVsID0+IGJ1aWxkRmllbGREZXNjcmlwdG9yKGVsKSk7XG4gIHJldHVybiB7XG4gICAgdXJsOiB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICB0aXRsZTogZG9jdW1lbnQudGl0bGUsXG4gICAgc2VsZWN0aW9uX3JlY3Q6IHJlY3QsXG4gICAgZmllbGRzXG4gIH07XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVNlbGVjdGlvblJlY3QocmVjdCkge1xuICBjb25zdCBlbGVtZW50cyA9IGdldEVsZW1lbnRzSW5TZWxlY3Rpb24ocmVjdCk7XG5cbiAgaWYgKCFlbGVtZW50cy5sZW5ndGgpIHtcbiAgICBjb25zb2xlLmxvZygnW0F1dG9GZWVsXSBObyBmaWVsZHMgaW4gc2VsZWN0aW9uLicpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHByaW1hcnlGaWVsZEVsID0gZWxlbWVudHNbMF07XG4gIGNvbnN0IGJsb2NrU25hcHNob3QgPSBidWlsZEJsb2NrU25hcHNob3QocmVjdCwgZWxlbWVudHMpO1xuXG4gIGlmIChvbkJsb2NrU2VsZWN0ZWRDYWxsYmFjaykge1xuICAgIG9uQmxvY2tTZWxlY3RlZENhbGxiYWNrKHtcbiAgICAgIHJlY3QsXG4gICAgICBlbGVtZW50cyxcbiAgICAgIHByaW1hcnlFbGVtZW50OiBwcmltYXJ5RmllbGRFbCxcbiAgICAgIGJsb2NrU25hcHNob3RcbiAgICB9KTtcbiAgfVxufVxuIiwgImltcG9ydCB7IGluamVjdEF1dG9GZWVsU3R5bGVzIH0gZnJvbSAnLi9zdHlsZXMuanMnO1xuaW1wb3J0IHsgaXNGaWxsYWJsZUVsZW1lbnQsIGdldEJsb2NrRWxlbWVudCwgYnVpbGRGaWVsZERlc2NyaXB0b3IgfSBmcm9tICcuL2RvbURlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IGluaXRTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi9zZWxlY3Rpb25Nb2RlLmpzJztcblxuaW5qZWN0QXV0b0ZlZWxTdHlsZXMoKTtcblxubGV0IGlzTW9kaWZpZXJIZWxkID0gZmFsc2U7XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICBpZiAoZS5tZXRhS2V5IHx8IGUuY3RybEtleSkgaXNNb2RpZmllckhlbGQgPSB0cnVlO1xufSk7XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgKGUpID0+IHtcbiAgaWYgKGUubWV0YUtleSB8fCBlLmN0cmxLZXkpIGlzTW9kaWZpZXJIZWxkID0gZmFsc2U7XG59KTtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICBpZiAoKGlzTW9kaWZpZXJIZWxkIHx8IGUubWV0YUtleSB8fCBlLmN0cmxLZXkpICYmIGlzRmlsbGFibGVFbGVtZW50KGUudGFyZ2V0KSkge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGhhbmRsZUFJQ2xpY2soZS50YXJnZXQpO1xuICB9XG59LCB0cnVlKTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQUlDbGljayh0YXJnZXRFbGVtZW50KSB7XG4gIGF3YWl0IGhhbmRsZUFJSW50ZXJhY3Rpb24odGFyZ2V0RWxlbWVudCwgbnVsbCk7XG59XG5cbmluaXRTZWxlY3Rpb25Nb2RlKHtcbiAgb25CbG9ja1NlbGVjdGVkOiBhc3luYyAoeyBlbGVtZW50cywgYmxvY2tTbmFwc2hvdCB9KSA9PiB7XG4gICAgZWxlbWVudHMuZm9yRWFjaChlbCA9PiB7XG4gICAgICBjb25zdCBibG9jayA9IGdldEJsb2NrRWxlbWVudChlbCk7XG4gICAgICBibG9jay5jbGFzc0xpc3QuYWRkKCdmYy1haS1zZWxlY3RlZCcpO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwMCkpO1xuXG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG4gICAgICBpZiAoIWRvY3VtZW50LmJvZHkuY29udGFpbnMoZWxlbWVudCkpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBibG9jayA9IGdldEJsb2NrRWxlbWVudChlbGVtZW50KTtcbiAgICAgIGJsb2NrLmNsYXNzTGlzdC5yZW1vdmUoJ2ZjLWFpLXNlbGVjdGVkJyk7XG5cbiAgICAgIGF3YWl0IGhhbmRsZUFJSW50ZXJhY3Rpb24oZWxlbWVudCwgYmxvY2tTbmFwc2hvdCk7XG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzAwKSk7XG4gICAgfVxuICB9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQUlJbnRlcmFjdGlvbih0YXJnZXRFbGVtZW50LCBibG9ja1NuYXBzaG90KSB7XG4gIGNvbnN0IGJsb2NrID0gZ2V0QmxvY2tFbGVtZW50KHRhcmdldEVsZW1lbnQpO1xuICBibG9jay5jbGFzc0xpc3QuYWRkKCdmYy1haS1maWxsaW5nJyk7XG5cbiAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gYnVpbGRGaWVsZERlc2NyaXB0b3IodGFyZ2V0RWxlbWVudCk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgZmllbGREZXNjcmlwdG9yLFxuICAgICAgc2Vzc2lvbklkOiBudWxsXG4gICAgfTtcblxuICAgIGlmIChibG9ja1NuYXBzaG90KSB7XG4gICAgICBwYXlsb2FkLmJsb2NrU25hcHNob3QgPSBibG9ja1NuYXBzaG90O1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJGQ19GSUxMX0ZJRUxEXCIsXG4gICAgICBwYXlsb2FkXG4gICAgfSk7XG5cbiAgICBoYW5kbGVSZXNwb25zZSh0YXJnZXRFbGVtZW50LCBibG9jaywgcmVzcG9uc2UpO1xuXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVyci5tZXNzYWdlIHx8IFN0cmluZyhlcnIpO1xuICAgIGlmIChlcnJvck1lc3NhZ2UuaW5jbHVkZXMoXCJFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZFwiKSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIkF1dG9GZWVsOiBFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZC4gUGxlYXNlIHJlbG9hZCB0aGUgcGFnZS5cIik7XG4gICAgICBhbGVydChcIkF1dG9GZWVsOiBcdThCRjdcdTUyMzdcdTY1QjBcdTk4NzVcdTk3NjJcdTRFRTVcdTkxQ0RcdTY1QjBcdThGREVcdTYzQTVcdTUyMzBcdTY2RjRcdTY1QjBcdTc2ODRcdTYyNjlcdTVDNTVcdTMwMDJcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFeHRlbnNpb24gbWVzc2FnaW5nIGVycm9yOlwiLCBlcnIpO1xuICAgIH1cbiAgICBoYW5kbGVSZXNwb25zZSh0YXJnZXRFbGVtZW50LCBibG9jaywgeyBzdGF0dXM6ICdmYWlsJywgcmVhc29uOiAnZXh0ZW5zaW9uX2Vycm9yJyB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVSZXNwb25zZShpbnB1dEVsLCBibG9ja0VsLCByZXNwb25zZSkge1xuICBibG9ja0VsLmNsYXNzTGlzdC5yZW1vdmUoJ2ZjLWFpLWZpbGxpbmcnKTtcblxuICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICBibG9ja0VsLmNsYXNzTGlzdC5hZGQoJ2ZjLWFpLXN1Y2Nlc3MnKTtcblxuICAgIGlmIChyZXNwb25zZS52YWx1ZSAhPT0gbnVsbCAmJiByZXNwb25zZS52YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaW5wdXRFbC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICBpbnB1dEVsLmZvY3VzKCk7XG4gICAgICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdzZWxlY3RBbGwnLCBmYWxzZSwgbnVsbCk7XG4gICAgICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdpbnNlcnRUZXh0JywgZmFsc2UsIHJlc3BvbnNlLnZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlucHV0RWwudmFsdWUgPSByZXNwb25zZS52YWx1ZTtcbiAgICAgICAgaW5wdXRFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICBpbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgYmxvY2tFbC5jbGFzc0xpc3QucmVtb3ZlKCdmYy1haS1zdWNjZXNzJyk7XG4gICAgfSwgNjAwKTtcblxuICB9IGVsc2Uge1xuICAgIGJsb2NrRWwuY2xhc3NMaXN0LmFkZCgnZmMtYWktZmFpbCcpO1xuICAgIGNvbnNvbGUubG9nKFwiQUkgRmlsbCBGYWlsZWQ6XCIsIHJlc3BvbnNlID8gcmVzcG9uc2UucmVhc29uIDogXCJVbmtub3duXCIpO1xuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBibG9ja0VsLmNsYXNzTGlzdC5yZW1vdmUoJ2ZjLWFpLWZhaWwnKTtcbiAgICB9LCA0MDApO1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQU8sU0FBUyx1QkFBdUI7QUFDckMsTUFBSSxTQUFTLGVBQWUsb0JBQW9CO0FBQUc7QUFFbkQsUUFBTSxRQUFRLFNBQVMsY0FBYyxPQUFPO0FBQzVDLFFBQU0sS0FBSztBQUNYLFFBQU0sY0FBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFB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
