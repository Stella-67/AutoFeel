let autoIdCounter = 0;

export function isFillableElement(el) {
  if (el.isContentEditable) {
    return true;
  }

  if (el.tagName === 'TEXTAREA') {
    return true;
  }

  if (el.tagName === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    const textInputTypes = [
      'text',
      'email',
      'tel',
      'url',
      'search',
      'password',
      'number'
    ];
    return textInputTypes.includes(type);
  }

  return false;
}

export function getBlockElement(el) {
  if (el.isContentEditable) {
    const editorContainer = el.closest('.ProseMirror, .ed-editor-content, [contenteditable="true"]');
    if (editorContainer && editorContainer !== el && editorContainer.contains(el)) {
       return editorContainer;
    }
    return el;
  }
  return el.parentElement || el;
}

export function buildFieldDescriptor(el) {
  const isContentEditable = el.isContentEditable;

  let type = 'other';
  if (isContentEditable) {
    type = 'contenteditable';
  } else if (el.tagName === 'TEXTAREA') {
    type = 'textarea';
  } else {
    type = el.type || 'other';
  }

  let currentValue = '';
  if (isContentEditable) {
    currentValue = el.innerText;
  } else {
    currentValue = el.value || '';
  }

  return {
    dom_id: getDomId(el),
    label: getLabel(el),
    placeholder: el.placeholder || el.getAttribute('placeholder') || null,
    type: type,
    current_value: currentValue,
    page_url: window.location.href,
    name: el.name || null
  };
}

export function getDomId(el) {
  if (el.id) return el.id;

  if (el.dataset.fcAutoId) return el.dataset.fcAutoId;

  const newId = `fc-auto-${++autoIdCounter}`;
  el.dataset.fcAutoId = newId;
  return newId;
}

export function getLabel(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.innerText.trim();
  }

  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    const inputInClone = clone.querySelector('input, textarea, select');
    if (inputInClone) inputInClone.remove();
    return clone.innerText.trim();
  }

  let sibling = el.previousElementSibling;
  if (sibling && (sibling.tagName === 'LABEL' || sibling.tagName === 'SPAN' || sibling.tagName === 'DIV')) {
    return sibling.innerText.trim();
  }

  if (el.parentElement) {
    const parentText = el.parentElement.innerText;
    return parentText.replace(el.value, '').trim().slice(0, 50);
  }

  return null;
}
