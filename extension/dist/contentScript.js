(() => {
  // src/styles.js
  function injectAutoFeelStyles() {
    if (document.getElementById("fc-autofeel-styles")) return;
    const style = document.createElement("style");
    style.id = "fc-autofeel-styles";
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

.fc-ai-selected {
  outline: 2px dashed #4a90e2;
  outline-offset: 2px;
  animation: fcAiSelectedPulse 1s infinite;
}

@keyframes fcAiSelectedPulse {
  0% { outline-color: rgba(74, 144, 226, 0.4); }
  50% { outline-color: rgba(74, 144, 226, 1); }
  100% { outline-color: rgba(74, 144, 226, 0.4); }
}
`;
    document.head.appendChild(style);
  }

  // src/domDescriptors.js
  var autoIdCounter = 0;
  function isFillableElement(el) {
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
  }
  function getBlockElement(el) {
    return el.parentElement || el;
  }
  function buildFieldDescriptor(el) {
    return {
      dom_id: getDomId(el),
      label: getLabel(el),
      placeholder: el.placeholder || null,
      type: el.tagName === "TEXTAREA" ? "textarea" : el.type || "other",
      current_value: el.value || "",
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
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.innerText.trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      const inputInClone = clone.querySelector("input, textarea, select");
      if (inputInClone) inputInClone.remove();
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
    if (e.button !== 0) return;
    e.preventDefault();
    selectionStart = { x: e.clientX, y: e.clientY };
    selectionRectEl = document.createElement("div");
    selectionRectEl.className = "fc-selection-rect";
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
    selectionRectEl.style.left = left + "px";
    selectionRectEl.style.top = top + "px";
    selectionRectEl.style.width = width + "px";
    selectionRectEl.style.height = height + "px";
  }
  function getElementsInSelection(rect) {
    const candidates = document.querySelectorAll("input, textarea, select");
    return Array.from(candidates).filter((el) => {
      if (el.offsetParent === null) return false;
      const r = el.getBoundingClientRect();
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
      // 以视口坐标表示 { left, top, right, bottom }
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
  var isAltHeld = false;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Alt") isAltHeld = true;
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Alt") isAltHeld = false;
  });
  document.addEventListener("click", (e) => {
    if ((isAltHeld || e.altKey) && isFillableElement(e.target)) {
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
        if (!document.body.contains(element)) continue;
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
        // 未来用作会话ID的占位符
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
        inputEl.value = response.value;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
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
})();
