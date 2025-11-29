/**
 * 用于生成无ID元素的唯一ID的计数器。
 * @type {number}
 */
let autoIdCounter = 0;

/**
 * 检查一个HTML元素是否是可填充的（input, textarea, select）。
 * @param {Element} el 要检查的HTML元素。
 * @returns {boolean} 如果元素可填充，则返回true，否则返回false。
 */
export function isFillableElement(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/**
 * 获取最适合应用视觉效果的“块”元素。
 * MVP版本中，这是元素的父元素。
 * @param {Element} el 目标input/textarea元素。
 * @returns {Element} 块元素。
 */
export function getBlockElement(el) {
  return el.parentElement || el;
}

/**
 * 为给定的表单字段元素构建一个描述符对象。
 * 此描述符包含有关页面上字段上下文的信息。
 * @param {Element} el 表单字段元素 (input, textarea, select)。
 * @returns {object} 字段描述符。
 */
export function buildFieldDescriptor(el) {
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

/**
 * 为元素获取一个稳定的DOM ID。优先使用element.id，
 * 否则生成一个唯一的data属性，如 'fc-auto-N'。
 * @param {Element} el HTML元素。
 * @returns {string} 元素的DOM ID。
 */
export function getDomId(el) {
  if (el.id) return el.id;
  
  if (el.dataset.fcAutoId) return el.dataset.fcAutoId;

  const newId = `fc-auto-${++autoIdCounter}`;
  el.dataset.fcAutoId = newId;
  return newId;
}

/**
 * 尝试为表单元素查找用户可见的标签。
 * 检查关联的<label for="...">、父级<label>或附近的文本/元素。
 * @param {Element} el 表单字段元素。
 * @returns {string|null} 标签文本，如果找不到则返回null。
 */
export function getLabel(el) {
  // 1. 尝试 <label for="id">
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.innerText.trim();
  }

  // 2. 尝试最近的父级 <label> (隐式关联)
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // 克隆并移除输入元素本身以获取纯文本
    const clone = parentLabel.cloneNode(true);
    const inputInClone = clone.querySelector('input, textarea, select');
    if (inputInClone) inputInClone.remove();
    return clone.innerText.trim();
  }

  // 3. 简单启发式：前一个兄弟元素或父级文本
  // 查找可能为label或span的前一个元素兄弟
  let sibling = el.previousElementSibling;
  if (sibling && (sibling.tagName === 'LABEL' || sibling.tagName === 'SPAN' || sibling.tagName === 'DIV')) {
    return sibling.innerText.trim();
  }

  // 4. 父元素的文本内容 (不包括输入元素本身)
  if (el.parentElement) {
    const parentText = el.parentElement.innerText;
    // 这是一个粗略的尝试，可能会捕获过多内容，但对MVP来说足够了。
    // 尝试通过移除元素自身的值来隔离标签文本，但这可能不总是准确。
    return parentText.replace(el.value, '').trim().slice(0, 50); 
  }

  return null;
}
