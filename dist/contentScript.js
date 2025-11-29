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

.fc-prompt-dialog {
  background: white;
  border: 2px solid #4a90e2;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 12px;
  min-width: 320px;
  max-width: 480px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.fc-prompt-header {
  font-size: 13px;
  font-weight: 600;
  color: #4a90e2;
  margin-bottom: 8px;
}

.fc-prompt-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.fc-prompt-input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}

.fc-prompt-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.fc-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.fc-btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.fc-btn-cancel:hover {
  background: #e0e0e0;
}

.fc-btn-generate {
  background: #4a90e2;
  color: white;
}

.fc-btn-generate:hover {
  background: #357abd;
}

.fc-btn:active {
  transform: scale(0.98);
}
`;
  document.head.appendChild(style);
}

// src/domDescriptors.js
var autoIdCounter = 0;
function isFillableElement(el) {
  if (el.isContentEditable) {
    return true;
  }
  if (el.tagName === "TEXTAREA") {
    return true;
  }
  if (el.tagName === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    const textInputTypes = [
      "text",
      "email",
      "tel",
      "url",
      "search",
      "password",
      "number"
    ];
    return textInputTypes.includes(type);
  }
  return false;
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
    handleAIClick(e.target, e.altKey);
  }
}, true);
async function handleAIClick(targetElement, showPromptInput) {
  if (showPromptInput) {
    const customPrompt = await showPromptDialog(targetElement);
    if (customPrompt !== null) {
      await handleAIInteraction(targetElement, null, customPrompt);
    }
  } else {
    await handleAIInteraction(targetElement, null, "");
  }
}
function showPromptDialog(targetElement) {
  return new Promise((resolve) => {
    const existingDialog = document.querySelector(".fc-prompt-dialog");
    if (existingDialog)
      existingDialog.remove();
    const block = getBlockElement(targetElement);
    const rect = block.getBoundingClientRect();
    const dialog = document.createElement("div");
    dialog.className = "fc-prompt-dialog";
    dialog.innerHTML = `
      <div class="fc-prompt-header">
        <span>Custom Instructions (optional)</span>
      </div>
      <textarea class="fc-prompt-input" placeholder="e.g., 'make it formal', 'keep it brief', 'be creative'..." rows="2"></textarea>
      <div class="fc-prompt-actions">
        <button class="fc-btn fc-btn-cancel">Cancel</button>
        <button class="fc-btn fc-btn-generate">Generate</button>
      </div>
    `;
    dialog.style.position = "absolute";
    dialog.style.left = `${rect.left + window.pageXOffset}px`;
    dialog.style.top = `${rect.bottom + window.pageYOffset + 8}px`;
    dialog.style.zIndex = "999999";
    document.body.appendChild(dialog);
    const input = dialog.querySelector(".fc-prompt-input");
    const generateBtn = dialog.querySelector(".fc-btn-generate");
    const cancelBtn = dialog.querySelector(".fc-btn-cancel");
    input.focus();
    const cleanup = () => {
      dialog.remove();
    };
    generateBtn.addEventListener("click", () => {
      const value = input.value.trim();
      cleanup();
      resolve(value || "");
    });
    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        const value = input.value.trim();
        cleanup();
        resolve(value || "");
      } else if (e.key === "Escape") {
        cleanup();
        resolve(null);
      }
    });
    document.addEventListener("click", (e) => {
      if (!dialog.contains(e.target)) {
        cleanup();
        resolve(null);
      }
    }, { once: true, capture: true });
  });
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
async function handleAIInteraction(targetElement, blockSnapshot, customPrompt = "") {
  const block = getBlockElement(targetElement);
  block.classList.add("fc-ai-filling");
  const fieldDescriptor = buildFieldDescriptor(targetElement);
  try {
    const payload = {
      fieldDescriptor,
      sessionId: null,
      customPrompt
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3N0eWxlcy5qcyIsICIuLi9zcmMvZG9tRGVzY3JpcHRvcnMuanMiLCAiLi4vc3JjL3NlbGVjdGlvbk1vZGUuanMiLCAiLi4vc3JjL2NvbnRlbnRTY3JpcHQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBmdW5jdGlvbiBpbmplY3RBdXRvRmVlbFN0eWxlcygpIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmYy1hdXRvZmVlbC1zdHlsZXMnKSkgcmV0dXJuO1xuXG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSAnZmMtYXV0b2ZlZWwtc3R5bGVzJztcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4uZmMtYWktZmlsbGluZyB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpIHNjYWxlKDEuMDEpO1xuICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMCwgMCwgMCwgMC4xNikgIWltcG9ydGFudDtcbiAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMnMgZWFzZSwgYm94LXNoYWRvdyAwLjJzIGVhc2UgIWltcG9ydGFudDtcbiAgei1pbmRleDogMTAwMDAgIWltcG9ydGFudDtcbiAgYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7XG4gIGJvcmRlci1yYWRpdXM6IDRweDtcbn1cblxuLmZjLWFpLXN1Y2Nlc3Mge1xuICBhbmltYXRpb246IGZjQWlTdWNjZXNzRmxhc2ggMC42cyBlYXNlO1xuICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDQ2LCAyMDQsIDExMywgMC4xNSkgIWltcG9ydGFudDtcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xufVxuXG4uZmMtYWktZmFpbCB7XG4gIGFuaW1hdGlvbjogZmNBaVNoYWtlIDAuNHMgZWFzZTtcbiAgYm94LXNoYWRvdzogMCAwIDAgM3B4IHJnYmEoMjMxLCA3NiwgNjAsIDAuOCkgIWltcG9ydGFudDtcbiAgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgyMzEsIDc2LCA2MCwgMC4xNSkgIWltcG9ydGFudDtcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xufVxuXG5Aa2V5ZnJhbWVzIGZjQWlTdWNjZXNzRmxhc2gge1xuICAwJSAgIHsgYm94LXNoYWRvdzogMCAwIDAgMCByZ2JhKDQ2LCAyMDQsIDExMywgMC4wKTsgfVxuICA1MCUgIHsgYm94LXNoYWRvdzogMCAwIDAgNHB4IHJnYmEoNDYsIDIwNCwgMTEzLCAwLjgpOyB9XG4gIDEwMCUgeyBib3gtc2hhZG93OiAwIDAgMCAwIHJnYmEoNDYsIDIwNCwgMTEzLCAwLjApOyB9XG59XG5cbkBrZXlmcmFtZXMgZmNBaVNoYWtlIHtcbiAgMCUsIDEwMCUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMCk7IH1cbiAgMjUlICAgICAgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoLTNweCk7IH1cbiAgNzUlICAgICAgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoM3B4KTsgfVxufVxuXG4uZmMtc2VsZWN0aW9uLW92ZXJsYXkge1xuICBwb3NpdGlvbjogZml4ZWQ7XG4gIGluc2V0OiAwO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuMDUpO1xuICBjdXJzb3I6IGNyb3NzaGFpcjtcbiAgei1pbmRleDogOTk5OTk5OyAvKiBhYm92ZSBldmVyeXRoaW5nICovXG59XG5cbi5mYy1zZWxlY3Rpb24tcmVjdCB7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgYm9yZGVyOiAxcHggZGFzaGVkIHJnYmEoMCwgMTIwLCAyNTUsIDAuOCk7XG4gIGJhY2tncm91bmQ6IHJnYmEoMCwgMTIwLCAyNTUsIDAuMSk7XG59XG5cbi5mYy1haS1zZWxlY3RlZCB7XG4gIGJveC1zaGFkb3c6IDAgMCAwIDNweCAjNGE5MGUyLCAwIDAgMTJweCByZ2JhKDc0LCAxNDQsIDIyNiwgMC42KSAhaW1wb3J0YW50O1xuICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDc0LCAxNDQsIDIyNiwgMC4xNSkgIWltcG9ydGFudDtcbiAgYm9yZGVyLXJhZGl1czogNHB4O1xuICB6LWluZGV4OiAxMDAwMSAhaW1wb3J0YW50O1xuICBhbmltYXRpb246IGZjQWlTZWxlY3RlZFB1bHNlIDFzIGluZmluaXRlO1xufVxuXG5Aa2V5ZnJhbWVzIGZjQWlTZWxlY3RlZFB1bHNlIHtcbiAgMCUgeyBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSg3NCwgMTQ0LCAyMjYsIDAuNCksIDAgMCAxMnB4IHJnYmEoNzQsIDE0NCwgMjI2LCAwLjIpOyB9XG4gIDUwJSB7IGJveC1zaGFkb3c6IDAgMCAwIDNweCByZ2JhKDc0LCAxNDQsIDIyNiwgMSksIDAgMCAyMHB4IHJnYmEoNzQsIDE0NCwgMjI2LCAwLjYpOyB9XG4gIDEwMCUgeyBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSg3NCwgMTQ0LCAyMjYsIDAuNCksIDAgMCAxMnB4IHJnYmEoNzQsIDE0NCwgMjI2LCAwLjIpOyB9XG59XG5cbi5mYy1wcm9tcHQtZGlhbG9nIHtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG4gIGJvcmRlcjogMnB4IHNvbGlkICM0YTkwZTI7XG4gIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgYm94LXNoYWRvdzogMCA0cHggMTZweCByZ2JhKDAsIDAsIDAsIDAuMik7XG4gIHBhZGRpbmc6IDEycHg7XG4gIG1pbi13aWR0aDogMzIwcHg7XG4gIG1heC13aWR0aDogNDgwcHg7XG4gIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsIFJvYm90bywgc2Fucy1zZXJpZjtcbn1cblxuLmZjLXByb21wdC1oZWFkZXIge1xuICBmb250LXNpemU6IDEzcHg7XG4gIGZvbnQtd2VpZ2h0OiA2MDA7XG4gIGNvbG9yOiAjNGE5MGUyO1xuICBtYXJnaW4tYm90dG9tOiA4cHg7XG59XG5cbi5mYy1wcm9tcHQtaW5wdXQge1xuICB3aWR0aDogMTAwJTtcbiAgcGFkZGluZzogOHB4O1xuICBib3JkZXI6IDFweCBzb2xpZCAjZGRkO1xuICBib3JkZXItcmFkaXVzOiA0cHg7XG4gIGZvbnQtc2l6ZTogMTNweDtcbiAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gIHJlc2l6ZTogdmVydGljYWw7XG4gIG1hcmdpbi1ib3R0b206IDhweDtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbn1cblxuLmZjLXByb21wdC1pbnB1dDpmb2N1cyB7XG4gIG91dGxpbmU6IG5vbmU7XG4gIGJvcmRlci1jb2xvcjogIzRhOTBlMjtcbiAgYm94LXNoYWRvdzogMCAwIDAgMnB4IHJnYmEoNzQsIDE0NCwgMjI2LCAwLjIpO1xufVxuXG4uZmMtcHJvbXB0LWFjdGlvbnMge1xuICBkaXNwbGF5OiBmbGV4O1xuICBnYXA6IDhweDtcbiAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbn1cblxuLmZjLWJ0biB7XG4gIHBhZGRpbmc6IDZweCAxNnB4O1xuICBib3JkZXI6IG5vbmU7XG4gIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgZm9udC1zaXplOiAxM3B4O1xuICBmb250LXdlaWdodDogNTAwO1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIHRyYW5zaXRpb246IGFsbCAwLjJzO1xufVxuXG4uZmMtYnRuLWNhbmNlbCB7XG4gIGJhY2tncm91bmQ6ICNmMGYwZjA7XG4gIGNvbG9yOiAjNjY2O1xufVxuXG4uZmMtYnRuLWNhbmNlbDpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICNlMGUwZTA7XG59XG5cbi5mYy1idG4tZ2VuZXJhdGUge1xuICBiYWNrZ3JvdW5kOiAjNGE5MGUyO1xuICBjb2xvcjogd2hpdGU7XG59XG5cbi5mYy1idG4tZ2VuZXJhdGU6aG92ZXIge1xuICBiYWNrZ3JvdW5kOiAjMzU3YWJkO1xufVxuXG4uZmMtYnRuOmFjdGl2ZSB7XG4gIHRyYW5zZm9ybTogc2NhbGUoMC45OCk7XG59XG5gO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn0iLCAibGV0IGF1dG9JZENvdW50ZXIgPSAwO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNGaWxsYWJsZUVsZW1lbnQoZWwpIHtcbiAgaWYgKGVsLmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoZWwudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJykge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGVsLnRhZ05hbWUgPT09ICdJTlBVVCcpIHtcbiAgICBjb25zdCB0eXBlID0gKGVsLnR5cGUgfHwgJ3RleHQnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHRleHRJbnB1dFR5cGVzID0gW1xuICAgICAgJ3RleHQnLFxuICAgICAgJ2VtYWlsJyxcbiAgICAgICd0ZWwnLFxuICAgICAgJ3VybCcsXG4gICAgICAnc2VhcmNoJyxcbiAgICAgICdwYXNzd29yZCcsXG4gICAgICAnbnVtYmVyJ1xuICAgIF07XG4gICAgcmV0dXJuIHRleHRJbnB1dFR5cGVzLmluY2x1ZGVzKHR5cGUpO1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QmxvY2tFbGVtZW50KGVsKSB7XG4gIGlmIChlbC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgIGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IGVsLmNsb3Nlc3QoJy5Qcm9zZU1pcnJvciwgLmVkLWVkaXRvci1jb250ZW50LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuICAgIGlmIChlZGl0b3JDb250YWluZXIgJiYgZWRpdG9yQ29udGFpbmVyICE9PSBlbCAmJiBlZGl0b3JDb250YWluZXIuY29udGFpbnMoZWwpKSB7XG4gICAgICAgcmV0dXJuIGVkaXRvckNvbnRhaW5lcjtcbiAgICB9XG4gICAgcmV0dXJuIGVsO1xuICB9XG4gIHJldHVybiBlbC5wYXJlbnRFbGVtZW50IHx8IGVsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRGaWVsZERlc2NyaXB0b3IoZWwpIHtcbiAgY29uc3QgaXNDb250ZW50RWRpdGFibGUgPSBlbC5pc0NvbnRlbnRFZGl0YWJsZTtcblxuICBsZXQgdHlwZSA9ICdvdGhlcic7XG4gIGlmIChpc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgIHR5cGUgPSAnY29udGVudGVkaXRhYmxlJztcbiAgfSBlbHNlIGlmIChlbC50YWdOYW1lID09PSAnVEVYVEFSRUEnKSB7XG4gICAgdHlwZSA9ICd0ZXh0YXJlYSc7XG4gIH0gZWxzZSB7XG4gICAgdHlwZSA9IGVsLnR5cGUgfHwgJ290aGVyJztcbiAgfVxuXG4gIGxldCBjdXJyZW50VmFsdWUgPSAnJztcbiAgaWYgKGlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgY3VycmVudFZhbHVlID0gZWwuaW5uZXJUZXh0O1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRWYWx1ZSA9IGVsLnZhbHVlIHx8ICcnO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBkb21faWQ6IGdldERvbUlkKGVsKSxcbiAgICBsYWJlbDogZ2V0TGFiZWwoZWwpLFxuICAgIHBsYWNlaG9sZGVyOiBlbC5wbGFjZWhvbGRlciB8fCBlbC5nZXRBdHRyaWJ1dGUoJ3BsYWNlaG9sZGVyJykgfHwgbnVsbCxcbiAgICB0eXBlOiB0eXBlLFxuICAgIGN1cnJlbnRfdmFsdWU6IGN1cnJlbnRWYWx1ZSxcbiAgICBwYWdlX3VybDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgbmFtZTogZWwubmFtZSB8fCBudWxsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREb21JZChlbCkge1xuICBpZiAoZWwuaWQpIHJldHVybiBlbC5pZDtcblxuICBpZiAoZWwuZGF0YXNldC5mY0F1dG9JZCkgcmV0dXJuIGVsLmRhdGFzZXQuZmNBdXRvSWQ7XG5cbiAgY29uc3QgbmV3SWQgPSBgZmMtYXV0by0keysrYXV0b0lkQ291bnRlcn1gO1xuICBlbC5kYXRhc2V0LmZjQXV0b0lkID0gbmV3SWQ7XG4gIHJldHVybiBuZXdJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExhYmVsKGVsKSB7XG4gIGlmIChlbC5pZCkge1xuICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgbGFiZWxbZm9yPVwiJHtlbC5pZH1cIl1gKTtcbiAgICBpZiAobGFiZWwpIHJldHVybiBsYWJlbC5pbm5lclRleHQudHJpbSgpO1xuICB9XG5cbiAgY29uc3QgcGFyZW50TGFiZWwgPSBlbC5jbG9zZXN0KCdsYWJlbCcpO1xuICBpZiAocGFyZW50TGFiZWwpIHtcbiAgICBjb25zdCBjbG9uZSA9IHBhcmVudExhYmVsLmNsb25lTm9kZSh0cnVlKTtcbiAgICBjb25zdCBpbnB1dEluQ2xvbmUgPSBjbG9uZS5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpO1xuICAgIGlmIChpbnB1dEluQ2xvbmUpIGlucHV0SW5DbG9uZS5yZW1vdmUoKTtcbiAgICByZXR1cm4gY2xvbmUuaW5uZXJUZXh0LnRyaW0oKTtcbiAgfVxuXG4gIGxldCBzaWJsaW5nID0gZWwucHJldmlvdXNFbGVtZW50U2libGluZztcbiAgaWYgKHNpYmxpbmcgJiYgKHNpYmxpbmcudGFnTmFtZSA9PT0gJ0xBQkVMJyB8fCBzaWJsaW5nLnRhZ05hbWUgPT09ICdTUEFOJyB8fCBzaWJsaW5nLnRhZ05hbWUgPT09ICdESVYnKSkge1xuICAgIHJldHVybiBzaWJsaW5nLmlubmVyVGV4dC50cmltKCk7XG4gIH1cblxuICBpZiAoZWwucGFyZW50RWxlbWVudCkge1xuICAgIGNvbnN0IHBhcmVudFRleHQgPSBlbC5wYXJlbnRFbGVtZW50LmlubmVyVGV4dDtcbiAgICByZXR1cm4gcGFyZW50VGV4dC5yZXBsYWNlKGVsLnZhbHVlLCAnJykudHJpbSgpLnNsaWNlKDAsIDUwKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuIiwgImltcG9ydCB7IGJ1aWxkRmllbGREZXNjcmlwdG9yIH0gZnJvbSAnLi9kb21EZXNjcmlwdG9ycy5qcyc7XG5cbmxldCBzZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG5sZXQgc2VsZWN0aW9uT3ZlcmxheSA9IG51bGw7XG5sZXQgc2VsZWN0aW9uUmVjdEVsID0gbnVsbDtcbmxldCBzZWxlY3Rpb25TdGFydCA9IG51bGw7XG5sZXQgb25CbG9ja1NlbGVjdGVkQ2FsbGJhY2sgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFNlbGVjdGlvbk1vZGUob3B0aW9ucykge1xuICBvbkJsb2NrU2VsZWN0ZWRDYWxsYmFjayA9IG9wdGlvbnMub25CbG9ja1NlbGVjdGVkO1xuXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgIGlmIChlLmNvZGUgPT09ICdLZXlBJyAmJiBlLmN0cmxLZXkgJiYgZS5zaGlmdEtleSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgaWYgKCFzZWxlY3Rpb25Nb2RlKSB7XG4gICAgICAgIGVudGVyU2VsZWN0aW9uTW9kZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXhpdFNlbGVjdGlvbk1vZGUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2VsZWN0aW9uTW9kZSAmJiBlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgIGV4aXRTZWxlY3Rpb25Nb2RlKCk7XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gZW50ZXJTZWxlY3Rpb25Nb2RlKCkge1xuICBzZWxlY3Rpb25Nb2RlID0gdHJ1ZTtcblxuICBzZWxlY3Rpb25PdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHNlbGVjdGlvbk92ZXJsYXkuY2xhc3NOYW1lID0gJ2ZjLXNlbGVjdGlvbi1vdmVybGF5JztcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzZWxlY3Rpb25PdmVybGF5KTtcblxuICBzZWxlY3Rpb25PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG9uU2VsZWN0aW9uTW91c2VEb3duKTtcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgb25TZWxlY3Rpb25Nb3VzZU1vdmUpO1xuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgb25TZWxlY3Rpb25Nb3VzZVVwKTtcbn1cblxuZnVuY3Rpb24gZXhpdFNlbGVjdGlvbk1vZGUoKSB7XG4gIGlmIChzZWxlY3Rpb25PdmVybGF5KSB7XG4gICAgc2VsZWN0aW9uT3ZlcmxheS5yZW1vdmUoKTtcbiAgICBzZWxlY3Rpb25PdmVybGF5ID0gbnVsbDtcbiAgfVxuICBpZiAoc2VsZWN0aW9uUmVjdEVsKSB7XG4gICAgc2VsZWN0aW9uUmVjdEVsLnJlbW92ZSgpO1xuICAgIHNlbGVjdGlvblJlY3RFbCA9IG51bGw7XG4gIH1cblxuICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBvblNlbGVjdGlvbk1vdXNlTW92ZSk7XG4gIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBvblNlbGVjdGlvbk1vdXNlVXApO1xuXG4gIHNlbGVjdGlvblN0YXJ0ID0gbnVsbDtcbiAgc2VsZWN0aW9uTW9kZSA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBvblNlbGVjdGlvbk1vdXNlRG93bihlKSB7XG4gIGlmIChlLmJ1dHRvbiAhPT0gMCkgcmV0dXJuO1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgc2VsZWN0aW9uU3RhcnQgPSB7IHg6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZIH07XG5cbiAgc2VsZWN0aW9uUmVjdEVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHNlbGVjdGlvblJlY3RFbC5jbGFzc05hbWUgPSAnZmMtc2VsZWN0aW9uLXJlY3QnO1xuICBzZWxlY3Rpb25PdmVybGF5LmFwcGVuZENoaWxkKHNlbGVjdGlvblJlY3RFbCk7XG5cbiAgdXBkYXRlU2VsZWN0aW9uUmVjdChlLmNsaWVudFgsIGUuY2xpZW50WSk7XG59XG5cbmZ1bmN0aW9uIG9uU2VsZWN0aW9uTW91c2VNb3ZlKGUpIHtcbiAgaWYgKCFzZWxlY3Rpb25TdGFydCB8fCAhc2VsZWN0aW9uUmVjdEVsKSByZXR1cm47XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgdXBkYXRlU2VsZWN0aW9uUmVjdChlLmNsaWVudFgsIGUuY2xpZW50WSk7XG59XG5cbmZ1bmN0aW9uIG9uU2VsZWN0aW9uTW91c2VVcChlKSB7XG4gIGlmICghc2VsZWN0aW9uU3RhcnQpIHJldHVybjtcblxuICBjb25zdCB4MSA9IHNlbGVjdGlvblN0YXJ0Lng7XG4gIGNvbnN0IHkxID0gc2VsZWN0aW9uU3RhcnQueTtcbiAgY29uc3QgeDIgPSBlLmNsaWVudFg7XG4gIGNvbnN0IHkyID0gZS5jbGllbnRZO1xuXG4gIGNvbnN0IHdpZHRoID0gTWF0aC5hYnMoeDIgLSB4MSk7XG4gIGNvbnN0IGhlaWdodCA9IE1hdGguYWJzKHkyIC0geTEpO1xuXG4gIGlmICh3aWR0aCA+IDUgJiYgaGVpZ2h0ID4gNSkge1xuICAgIGNvbnN0IHJlY3QgPSB7XG4gICAgICBsZWZ0OiBNYXRoLm1pbih4MSwgeDIpLFxuICAgICAgdG9wOiBNYXRoLm1pbih5MSwgeTIpLFxuICAgICAgcmlnaHQ6IE1hdGgubWluKHgxLCB4MikgKyB3aWR0aCxcbiAgICAgIGJvdHRvbTogTWF0aC5taW4oeTEsIHkyKSArIGhlaWdodFxuICAgIH07XG4gICAgaGFuZGxlU2VsZWN0aW9uUmVjdChyZWN0KTtcbiAgfVxuXG4gIGV4aXRTZWxlY3Rpb25Nb2RlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVNlbGVjdGlvblJlY3QoY3VycmVudFgsIGN1cnJlbnRZKSB7XG4gIGNvbnN0IHgxID0gc2VsZWN0aW9uU3RhcnQueDtcbiAgY29uc3QgeTEgPSBzZWxlY3Rpb25TdGFydC55O1xuICBjb25zdCB4MiA9IGN1cnJlbnRYO1xuICBjb25zdCB5MiA9IGN1cnJlbnRZO1xuXG4gIGNvbnN0IGxlZnQgPSBNYXRoLm1pbih4MSwgeDIpO1xuICBjb25zdCB0b3AgPSBNYXRoLm1pbih5MSwgeTIpO1xuICBjb25zdCB3aWR0aCA9IE1hdGguYWJzKHgyIC0geDEpO1xuICBjb25zdCBoZWlnaHQgPSBNYXRoLmFicyh5MiAtIHkxKTtcblxuICBzZWxlY3Rpb25SZWN0RWwuc3R5bGUubGVmdCA9IGxlZnQgKyAncHgnO1xuICBzZWxlY3Rpb25SZWN0RWwuc3R5bGUudG9wID0gdG9wICsgJ3B4JztcbiAgc2VsZWN0aW9uUmVjdEVsLnN0eWxlLndpZHRoID0gd2lkdGggKyAncHgnO1xuICBzZWxlY3Rpb25SZWN0RWwuc3R5bGUuaGVpZ2h0ID0gaGVpZ2h0ICsgJ3B4Jztcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudHNJblNlbGVjdGlvbihyZWN0KSB7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgW2NvbnRlbnRlZGl0YWJsZV0nKTtcbiAgcmV0dXJuIEFycmF5LmZyb20oY2FuZGlkYXRlcykuZmlsdGVyKGVsID0+IHtcbiAgICBpZiAoZWwub2Zmc2V0UGFyZW50ID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG5cbiAgICBjb25zdCByID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICBpZiAoci53aWR0aCA8IDEwIHx8IHIuaGVpZ2h0IDwgMTApIHJldHVybiBmYWxzZTtcblxuICAgIGNvbnN0IGhvcml6b250YWxseSA9IHIubGVmdCA8IHJlY3QucmlnaHQgJiYgci5yaWdodCA+IHJlY3QubGVmdDtcbiAgICBjb25zdCB2ZXJ0aWNhbGx5ICAgPSByLnRvcCAgPCByZWN0LmJvdHRvbSAmJiByLmJvdHRvbSA+IHJlY3QudG9wO1xuICAgIHJldHVybiBob3Jpem9udGFsbHkgJiYgdmVydGljYWxseTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkQmxvY2tTbmFwc2hvdChyZWN0LCBlbGVtZW50cykge1xuICBjb25zdCBmaWVsZHMgPSBlbGVtZW50cy5tYXAoZWwgPT4gYnVpbGRGaWVsZERlc2NyaXB0b3IoZWwpKTtcbiAgcmV0dXJuIHtcbiAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgIHRpdGxlOiBkb2N1bWVudC50aXRsZSxcbiAgICBzZWxlY3Rpb25fcmVjdDogcmVjdCxcbiAgICBmaWVsZHNcbiAgfTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU2VsZWN0aW9uUmVjdChyZWN0KSB7XG4gIGNvbnN0IGVsZW1lbnRzID0gZ2V0RWxlbWVudHNJblNlbGVjdGlvbihyZWN0KTtcblxuICBpZiAoIWVsZW1lbnRzLmxlbmd0aCkge1xuICAgIGNvbnNvbGUubG9nKCdbQXV0b0ZlZWxdIE5vIGZpZWxkcyBpbiBzZWxlY3Rpb24uJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcHJpbWFyeUZpZWxkRWwgPSBlbGVtZW50c1swXTtcbiAgY29uc3QgYmxvY2tTbmFwc2hvdCA9IGJ1aWxkQmxvY2tTbmFwc2hvdChyZWN0LCBlbGVtZW50cyk7XG5cbiAgaWYgKG9uQmxvY2tTZWxlY3RlZENhbGxiYWNrKSB7XG4gICAgb25CbG9ja1NlbGVjdGVkQ2FsbGJhY2soe1xuICAgICAgcmVjdCxcbiAgICAgIGVsZW1lbnRzLFxuICAgICAgcHJpbWFyeUVsZW1lbnQ6IHByaW1hcnlGaWVsZEVsLFxuICAgICAgYmxvY2tTbmFwc2hvdFxuICAgIH0pO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgaW5qZWN0QXV0b0ZlZWxTdHlsZXMgfSBmcm9tICcuL3N0eWxlcy5qcyc7XG5pbXBvcnQgeyBpc0ZpbGxhYmxlRWxlbWVudCwgZ2V0QmxvY2tFbGVtZW50LCBidWlsZEZpZWxkRGVzY3JpcHRvciB9IGZyb20gJy4vZG9tRGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgaW5pdFNlbGVjdGlvbk1vZGUgfSBmcm9tICcuL3NlbGVjdGlvbk1vZGUuanMnO1xuXG5pbmplY3RBdXRvRmVlbFN0eWxlcygpO1xuXG5sZXQgaXNNb2RpZmllckhlbGQgPSBmYWxzZTtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gIGlmIChlLm1ldGFLZXkgfHwgZS5jdHJsS2V5KSBpc01vZGlmaWVySGVsZCA9IHRydWU7XG59KTtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCAoZSkgPT4ge1xuICBpZiAoZS5tZXRhS2V5IHx8IGUuY3RybEtleSkgaXNNb2RpZmllckhlbGQgPSBmYWxzZTtcbn0pO1xuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gIGlmICgoaXNNb2RpZmllckhlbGQgfHwgZS5tZXRhS2V5IHx8IGUuY3RybEtleSkgJiYgaXNGaWxsYWJsZUVsZW1lbnQoZS50YXJnZXQpKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgaGFuZGxlQUlDbGljayhlLnRhcmdldCwgZS5hbHRLZXkpO1xuICB9XG59LCB0cnVlKTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQUlDbGljayh0YXJnZXRFbGVtZW50LCBzaG93UHJvbXB0SW5wdXQpIHtcbiAgaWYgKHNob3dQcm9tcHRJbnB1dCkge1xuICAgIGNvbnN0IGN1c3RvbVByb21wdCA9IGF3YWl0IHNob3dQcm9tcHREaWFsb2codGFyZ2V0RWxlbWVudCk7XG4gICAgaWYgKGN1c3RvbVByb21wdCAhPT0gbnVsbCkge1xuICAgICAgYXdhaXQgaGFuZGxlQUlJbnRlcmFjdGlvbih0YXJnZXRFbGVtZW50LCBudWxsLCBjdXN0b21Qcm9tcHQpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBhd2FpdCBoYW5kbGVBSUludGVyYWN0aW9uKHRhcmdldEVsZW1lbnQsIG51bGwsICcnKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzaG93UHJvbXB0RGlhbG9nKHRhcmdldEVsZW1lbnQpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgZXhpc3RpbmdEaWFsb2cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZmMtcHJvbXB0LWRpYWxvZycpO1xuICAgIGlmIChleGlzdGluZ0RpYWxvZykgZXhpc3RpbmdEaWFsb2cucmVtb3ZlKCk7XG5cbiAgICBjb25zdCBibG9jayA9IGdldEJsb2NrRWxlbWVudCh0YXJnZXRFbGVtZW50KTtcbiAgICBjb25zdCByZWN0ID0gYmxvY2suZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICBjb25zdCBkaWFsb2cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBkaWFsb2cuY2xhc3NOYW1lID0gJ2ZjLXByb21wdC1kaWFsb2cnO1xuICAgIGRpYWxvZy5pbm5lckhUTUwgPSBgXG4gICAgICA8ZGl2IGNsYXNzPVwiZmMtcHJvbXB0LWhlYWRlclwiPlxuICAgICAgICA8c3Bhbj5DdXN0b20gSW5zdHJ1Y3Rpb25zIChvcHRpb25hbCk8L3NwYW4+XG4gICAgICA8L2Rpdj5cbiAgICAgIDx0ZXh0YXJlYSBjbGFzcz1cImZjLXByb21wdC1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiZS5nLiwgJ21ha2UgaXQgZm9ybWFsJywgJ2tlZXAgaXQgYnJpZWYnLCAnYmUgY3JlYXRpdmUnLi4uXCIgcm93cz1cIjJcIj48L3RleHRhcmVhPlxuICAgICAgPGRpdiBjbGFzcz1cImZjLXByb21wdC1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJmYy1idG4gZmMtYnRuLWNhbmNlbFwiPkNhbmNlbDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZmMtYnRuIGZjLWJ0bi1nZW5lcmF0ZVwiPkdlbmVyYXRlPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuXG4gICAgZGlhbG9nLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICBkaWFsb2cuc3R5bGUubGVmdCA9IGAke3JlY3QubGVmdCArIHdpbmRvdy5wYWdlWE9mZnNldH1weGA7XG4gICAgZGlhbG9nLnN0eWxlLnRvcCA9IGAke3JlY3QuYm90dG9tICsgd2luZG93LnBhZ2VZT2Zmc2V0ICsgOH1weGA7XG4gICAgZGlhbG9nLnN0eWxlLnpJbmRleCA9ICc5OTk5OTknO1xuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkaWFsb2cpO1xuXG4gICAgY29uc3QgaW5wdXQgPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLmZjLXByb21wdC1pbnB1dCcpO1xuICAgIGNvbnN0IGdlbmVyYXRlQnRuID0gZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5mYy1idG4tZ2VuZXJhdGUnKTtcbiAgICBjb25zdCBjYW5jZWxCdG4gPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLmZjLWJ0bi1jYW5jZWwnKTtcblxuICAgIGlucHV0LmZvY3VzKCk7XG5cbiAgICBjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuICAgICAgZGlhbG9nLnJlbW92ZSgpO1xuICAgIH07XG5cbiAgICBnZW5lcmF0ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gaW5wdXQudmFsdWUudHJpbSgpO1xuICAgICAgY2xlYW51cCgpO1xuICAgICAgcmVzb2x2ZSh2YWx1ZSB8fCAnJyk7XG4gICAgfSk7XG5cbiAgICBjYW5jZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBjbGVhbnVwKCk7XG4gICAgICByZXNvbHZlKG51bGwpO1xuICAgIH0pO1xuXG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicgJiYgZS5jdHJsS2V5KSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gaW5wdXQudmFsdWUudHJpbSgpO1xuICAgICAgICBjbGVhbnVwKCk7XG4gICAgICAgIHJlc29sdmUodmFsdWUgfHwgJycpO1xuICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgY2xlYW51cCgpO1xuICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgaWYgKCFkaWFsb2cuY29udGFpbnMoZS50YXJnZXQpKSB7XG4gICAgICAgIGNsZWFudXAoKTtcbiAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgIH1cbiAgICB9LCB7IG9uY2U6IHRydWUsIGNhcHR1cmU6IHRydWUgfSk7XG4gIH0pO1xufVxuXG5pbml0U2VsZWN0aW9uTW9kZSh7XG4gIG9uQmxvY2tTZWxlY3RlZDogYXN5bmMgKHsgZWxlbWVudHMsIGJsb2NrU25hcHNob3QgfSkgPT4ge1xuICAgIGVsZW1lbnRzLmZvckVhY2goZWwgPT4ge1xuICAgICAgY29uc3QgYmxvY2sgPSBnZXRCbG9ja0VsZW1lbnQoZWwpO1xuICAgICAgYmxvY2suY2xhc3NMaXN0LmFkZCgnZmMtYWktc2VsZWN0ZWQnKTtcbiAgICB9KTtcblxuICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MDApKTtcblxuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuICAgICAgaWYgKCFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKGVsZW1lbnQpKSBjb250aW51ZTtcblxuICAgICAgY29uc3QgYmxvY2sgPSBnZXRCbG9ja0VsZW1lbnQoZWxlbWVudCk7XG4gICAgICBibG9jay5jbGFzc0xpc3QucmVtb3ZlKCdmYy1haS1zZWxlY3RlZCcpO1xuXG4gICAgICBhd2FpdCBoYW5kbGVBSUludGVyYWN0aW9uKGVsZW1lbnQsIGJsb2NrU25hcHNob3QpO1xuICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwMCkpO1xuICAgIH1cbiAgfVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFJSW50ZXJhY3Rpb24odGFyZ2V0RWxlbWVudCwgYmxvY2tTbmFwc2hvdCwgY3VzdG9tUHJvbXB0ID0gJycpIHtcbiAgY29uc3QgYmxvY2sgPSBnZXRCbG9ja0VsZW1lbnQodGFyZ2V0RWxlbWVudCk7XG4gIGJsb2NrLmNsYXNzTGlzdC5hZGQoJ2ZjLWFpLWZpbGxpbmcnKTtcblxuICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBidWlsZEZpZWxkRGVzY3JpcHRvcih0YXJnZXRFbGVtZW50KTtcblxuICB0cnkge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBmaWVsZERlc2NyaXB0b3IsXG4gICAgICBzZXNzaW9uSWQ6IG51bGwsXG4gICAgICBjdXN0b21Qcm9tcHRcbiAgICB9O1xuXG4gICAgaWYgKGJsb2NrU25hcHNob3QpIHtcbiAgICAgIHBheWxvYWQuYmxvY2tTbmFwc2hvdCA9IGJsb2NrU25hcHNob3Q7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcIkZDX0ZJTExfRklFTERcIixcbiAgICAgIHBheWxvYWRcbiAgICB9KTtcblxuICAgIGhhbmRsZVJlc3BvbnNlKHRhcmdldEVsZW1lbnQsIGJsb2NrLCByZXNwb25zZSk7XG5cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyLm1lc3NhZ2UgfHwgU3RyaW5nKGVycik7XG4gICAgaWYgKGVycm9yTWVzc2FnZS5pbmNsdWRlcyhcIkV4dGVuc2lvbiBjb250ZXh0IGludmFsaWRhdGVkXCIpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXV0b0ZlZWw6IEV4dGVuc2lvbiBjb250ZXh0IGludmFsaWRhdGVkLiBQbGVhc2UgcmVsb2FkIHRoZSBwYWdlLlwiKTtcbiAgICAgIGFsZXJ0KFwiQXV0b0ZlZWw6IFx1OEJGN1x1NTIzN1x1NjVCMFx1OTg3NVx1OTc2Mlx1NEVFNVx1OTFDRFx1NjVCMFx1OEZERVx1NjNBNVx1NTIzMFx1NjZGNFx1NjVCMFx1NzY4NFx1NjI2OVx1NUM1NVx1MzAwMlwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcihcIkV4dGVuc2lvbiBtZXNzYWdpbmcgZXJyb3I6XCIsIGVycik7XG4gICAgfVxuICAgIGhhbmRsZVJlc3BvbnNlKHRhcmdldEVsZW1lbnQsIGJsb2NrLCB7IHN0YXR1czogJ2ZhaWwnLCByZWFzb246ICdleHRlbnNpb25fZXJyb3InIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVJlc3BvbnNlKGlucHV0RWwsIGJsb2NrRWwsIHJlc3BvbnNlKSB7XG4gIGJsb2NrRWwuY2xhc3NMaXN0LnJlbW92ZSgnZmMtYWktZmlsbGluZycpO1xuXG4gIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgIGJsb2NrRWwuY2xhc3NMaXN0LmFkZCgnZmMtYWktc3VjY2VzcycpO1xuXG4gICAgaWYgKHJlc3BvbnNlLnZhbHVlICE9PSBudWxsICYmIHJlc3BvbnNlLnZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpbnB1dEVsLmlzQ29udGVudEVkaXRhYmxlKSB7XG4gICAgICAgIGlucHV0RWwuZm9jdXMoKTtcbiAgICAgICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ3NlbGVjdEFsbCcsIGZhbHNlLCBudWxsKTtcbiAgICAgICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2luc2VydFRleHQnLCBmYWxzZSwgcmVzcG9uc2UudmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXRFbC52YWx1ZSA9IHJlc3BvbnNlLnZhbHVlO1xuICAgICAgICBpbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgIGlucHV0RWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBibG9ja0VsLmNsYXNzTGlzdC5yZW1vdmUoJ2ZjLWFpLXN1Y2Nlc3MnKTtcbiAgICB9LCA2MDApO1xuXG4gIH0gZWxzZSB7XG4gICAgYmxvY2tFbC5jbGFzc0xpc3QuYWRkKCdmYy1haS1mYWlsJyk7XG4gICAgY29uc29sZS5sb2coXCJBSSBGaWxsIEZhaWxlZDpcIiwgcmVzcG9uc2UgPyByZXNwb25zZS5yZWFzb24gOiBcIlVua25vd25cIik7XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGJsb2NrRWwuY2xhc3NMaXN0LnJlbW92ZSgnZmMtYWktZmFpbCcpO1xuICAgIH0sIDQwMCk7XG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBTyxTQUFTLHVCQUF1QjtBQUNyQyxNQUFJLFNBQVMsZUFBZSxvQkFBb0I7QUFBRztBQUVuRCxRQUFNLFFBQVEsU0FBUyxjQUFjLE9BQU87QUFDNUMsUUFBTSxLQUFLO0FBQ1gsUUFBTSxjQUFjO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFB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
