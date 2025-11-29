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
    handleAIClick(e.target);
  }
}, true);

async function handleAIClick(targetElement) {
  await handleAIInteraction(targetElement, null);
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

async function handleAIInteraction(targetElement, blockSnapshot) {
  const block = getBlockElement(targetElement);
  block.classList.add('fc-ai-filling');

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
