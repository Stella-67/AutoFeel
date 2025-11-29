import { injectAutoFeelStyles } from './styles.js';
import { isFillableElement, getBlockElement, buildFieldDescriptor } from './domDescriptors.js';
import { initSelectionMode } from './selectionMode.js';

injectAutoFeelStyles();

let isModifierHeld = false;

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) isModifierHeld = true;
});

document.addEventListener('keyup', (e) => {
  if (e.metaKey || e.ctrlKey) isModifierHeld = false;
});

document.addEventListener('click', (e) => {
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
    await handleAIInteraction(targetElement, null, '');
  }
}

function showPromptDialog(targetElement) {
  return new Promise((resolve) => {
    const existingDialog = document.querySelector('.fc-prompt-dialog');
    if (existingDialog) existingDialog.remove();

    const block = getBlockElement(targetElement);
    const rect = block.getBoundingClientRect();

    const dialog = document.createElement('div');
    dialog.className = 'fc-prompt-dialog';
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

    dialog.style.position = 'absolute';
    dialog.style.left = `${rect.left + window.pageXOffset}px`;
    dialog.style.top = `${rect.bottom + window.pageYOffset + 8}px`;
    dialog.style.zIndex = '999999';

    document.body.appendChild(dialog);

    const input = dialog.querySelector('.fc-prompt-input');
    const generateBtn = dialog.querySelector('.fc-btn-generate');
    const cancelBtn = dialog.querySelector('.fc-btn-cancel');

    input.focus();

    const cleanup = () => {
      dialog.remove();
    };

    generateBtn.addEventListener('click', () => {
      const value = input.value.trim();
      cleanup();
      resolve(value || '');
    });

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        const value = input.value.trim();
        cleanup();
        resolve(value || '');
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });

    document.addEventListener('click', (e) => {
      if (!dialog.contains(e.target)) {
        cleanup();
        resolve(null);
      }
    }, { once: true, capture: true });
  });
}

initSelectionMode({
  onBlockSelected: async ({ elements, blockSnapshot }) => {
    elements.forEach(el => {
      const block = getBlockElement(el);
      block.classList.add('fc-ai-selected');
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    for (const element of elements) {
      if (!document.body.contains(element)) continue;

      const block = getBlockElement(element);
      block.classList.remove('fc-ai-selected');

      await handleAIInteraction(element, blockSnapshot);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
});

async function handleAIInteraction(targetElement, blockSnapshot, customPrompt = '') {
  const block = getBlockElement(targetElement);
  block.classList.add('fc-ai-filling');

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
      alert("AutoFeel: 请刷新页面以重新连接到更新的扩展。");
    } else {
      console.error("Extension messaging error:", err);
    }
    handleResponse(targetElement, block, { status: 'fail', reason: 'extension_error' });
  }
}

function handleResponse(inputEl, blockEl, response) {
  blockEl.classList.remove('fc-ai-filling');

  if (response && response.status === 'success') {
    blockEl.classList.add('fc-ai-success');

    if (response.value !== null && response.value !== undefined) {
      if (inputEl.isContentEditable) {
        inputEl.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, response.value);
      } else {
        inputEl.value = response.value;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    setTimeout(() => {
      blockEl.classList.remove('fc-ai-success');
    }, 600);

  } else {
    blockEl.classList.add('fc-ai-fail');
    console.log("AI Fill Failed:", response ? response.reason : "Unknown");

    setTimeout(() => {
      blockEl.classList.remove('fc-ai-fail');
    }, 400);
  }
}
