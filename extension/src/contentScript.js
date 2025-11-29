import { injectAutoFeelStyles } from './styles.js';
import { 
  isFillableElement, 
  getBlockElement, 
  buildFieldDescriptor 
} from './domDescriptors.js';
import { initSelectionMode } from './selectionMode.js';

// 初始化样式
injectAutoFeelStyles();

// Alt+Click 模式的全局状态
let isAltHeld = false;

// Alt 键状态的事件监听器
document.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') isAltHeld = true;
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') isAltHeld = false;
});

// 点击事件监听器，用于检测 Alt+Click 是否作用于可填充元素
document.addEventListener('click', (e) => {
  // 同时检查追踪状态和事件属性以提高鲁棒性
  if ((isAltHeld || e.altKey) && isFillableElement(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    handleAIClick(e.target);
  }
}, true); // 使用捕获阶段，以确保尽早捕获事件

/**
 * 处理由 Alt+Click 触发的单个字段的 AI 填充逻辑。
 * @param {Element} targetElement - 被点击的可填充元素 (input, textarea, select)。
 */
async function handleAIClick(targetElement) {
  // 对于 Alt+Click，不发送 blockSnapshot
  await handleAIInteraction(targetElement, null);
}

/**
 * 初始化选择模式功能。
 * 设置全局键盘监听器以切换选择模式 (Ctrl+Shift+A) 和 Escape 键取消。
 * 在选择模式激活时，附加鼠标事件监听器。
 * 它将一个回调函数传递给 `selectionMode.js`，该函数处理消息发送和响应。
 */
initSelectionMode({
  onBlockSelected: async ({ elements, blockSnapshot }) => {
    // 1. 选中动画：先给所有识别到的元素添加“选中”状态
    elements.forEach(el => {
      const block = getBlockElement(el);
      block.classList.add('fc-ai-selected');
    });

    // 稍微停顿一下，让用户看清选中了哪些字段
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. 串行队列：逐个处理字段
    for (const element of elements) {
      // 确保元素仍在文档中（防止页面动态变化导致报错）
      if (!document.body.contains(element)) continue;

      // 移除选中状态，准备开始填充
      const block = getBlockElement(element);
      block.classList.remove('fc-ai-selected');

      // 滚动到当前处理的字段（可选，提升体验）
      // element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 执行 AI 交互（填充 + 动画）
      await handleAIInteraction(element, blockSnapshot);

      // 在处理下一个字段前，稍微停顿一下，形成“流式”节奏感
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
});

/**
 * AI 交互的统一处理器，由 Alt+Click 和选择模式调用。
 * 它准备字段描述符和可选的块快照，向后台脚本发送消息，并处理响应（视觉反馈）。
 * @param {Element} targetElement - 交互的主要元素（例如，被点击的字段或选区中的第一个字段）。
 * @param {object|null} blockSnapshot - 如果由选择模式触发，则为快照数据，否则为 null。
 */
async function handleAIInteraction(targetElement, blockSnapshot) {
  const block = getBlockElement(targetElement);
  
  // 视觉效果：添加 'filling' 类以指示 AI 正在工作
  block.classList.add('fc-ai-filling');

  const fieldDescriptor = buildFieldDescriptor(targetElement);

  try {
    const payload = {
      fieldDescriptor,
      sessionId: null // 未来用作会话ID的占位符
    };

    // 如果提供了 blockSnapshot（来自选择模式），则将其包含在 payload 中
    if (blockSnapshot) {
      payload.blockSnapshot = blockSnapshot;
    }

    // 发送消息给后台脚本
    const response = await chrome.runtime.sendMessage({
      type: "FC_FILL_FIELD",
      payload
    });

    // 处理来自后台脚本的响应
    handleResponse(targetElement, block, response);

  } catch (err) {
    // 处理错误，特别是 'Extension context invalidated' 错误，这需要刷新页面
    const errorMessage = err.message || String(err);
    if (errorMessage.includes("Extension context invalidated")) {
      console.error("AutoFeel: Extension context invalidated. Please reload the page.");
      alert("AutoFeel: 请刷新页面以重新连接到更新的扩展。");
    } else {
      console.error("Extension messaging error:", err);
    }
    // 应用失败的视觉反馈
    handleResponse(targetElement, block, { status: 'fail', reason: 'extension_error' });
  }
}

/**
 * 处理后台脚本的响应，并应用视觉反馈。
 * 成功时设置字段值并播放相应动画；失败时播放失败动画。
 * @param {Element} inputEl - 要更新的 input/textarea/select 元素。
 * @param {Element} blockEl - 应用动画的块元素。
 * @param {object} response - 来自后台脚本的响应对象 {status, value, reason}。
 */
function handleResponse(inputEl, blockEl, response) {
  // 处理完成后移除 'filling' 类
  blockEl.classList.remove('fc-ai-filling');

  if (response && response.status === 'success') {
    // 成功状态：应用成功动画并更新输入值
    blockEl.classList.add('fc-ai-success');
    
    if (response.value !== null && response.value !== undefined) {
      if (inputEl.isContentEditable) {
        // 对于富文本编辑器 (contenteditable)，使用 execCommand 模拟用户输入
        // 这能确保大多数编辑器（如 ProseMirror, Ed, etc.）正确捕获变更
        inputEl.focus();
        // 选中所有内容以便替换（类似 .value = ... 的行为），或者根据需求决定是否全选
        // 这里简单实现为：选中所有内容然后替换
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, response.value);
      } else {
        // 标准 input/textarea
        inputEl.value = response.value;
        // 派发 'input' 和 'change' 事件，以通知框架（如 React, Vue）值已更改
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 动画结束后移除成功动画类
    setTimeout(() => {
      blockEl.classList.remove('fc-ai-success');
    }, 600); // 匹配 CSS 动画时长

  } else {
    // 失败状态：应用失败动画
    blockEl.classList.add('fc-ai-fail');
    console.log("AI Fill Failed:", response ? response.reason : "Unknown");

    // 动画结束后移除失败动画类
    setTimeout(() => {
      blockEl.classList.remove('fc-ai-fail');
    }, 400); // 匹配 CSS 动画时长
  }
}