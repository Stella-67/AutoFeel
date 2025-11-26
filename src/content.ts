import { FormField, ExtractedQuestion } from './types';

/**
 * Content Script - Runs on every webpage
 * Detects forms, extracts questions, and handles field filling
 */

const EXCLUDED_SELECTORS = [
  '[style*="display: none"]',
  '[hidden]',
  'noscript',
  'script',
  'style',
];

/**
 * Initialize content script and listen for messages from popup/background
 */
function initializeContentScript() {
  console.log('[FormAutoFill] Content script loaded');

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender, sendResponse);
    return true; // Keep channel open for async response
  });

  // Detect forms when page loads
  detectForms();

  // Watch for dynamically added forms
  const observer = new MutationObserver(() => {
    detectForms();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Handle messages from popup and background script
 */
async function handleMessage(request: any, sender: any, sendResponse: any) {
  try {
    switch (request.action) {
      case 'fillField':
        fillField(request.fieldSelector, request.answer);
        sendResponse({ success: true });
        break;

      case 'detectForms':
        const forms = detectForms();
        sendResponse({ forms });
        break;

      case 'getPageQuestions':
        const questions = extractAllPageQuestions();
        sendResponse({ questions });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[FormAutoFill] Error handling message:', error);
    sendResponse({ error: (error as Error).message });
  }
}

/**
 * Detect all form fields on the page
 */
function detectForms(): FormField[] {
  const formFields: FormField[] = [];

  // Detect all input fields (text, email, url, etc.)
  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="url"], input[type="number"], input[type="date"], textarea'
  );

  inputs.forEach((element) => {
    const field = extractFormField(element);
    if (field) {
      formFields.push(field);
    }
  });

  // Detect select dropdowns
  const selects = document.querySelectorAll('select');
  selects.forEach((element) => {
    const field = extractFormField(element);
    if (field) {
      formFields.push(field);
    }
  });

  console.log(`[FormAutoFill] Detected ${formFields.length} form fields`);
  return formFields;
}

/**
 * Extract a single form field's metadata
 */
function extractFormField(element: Element): FormField | null {
  // Skip hidden elements
  if (isElementHidden(element)) {
    return null;
  }

  const id = generateUUID();

  // Determine field type
  let fieldType: FormField['fieldType'] = 'text';
  if (element instanceof HTMLInputElement) {
    fieldType = (element.type || 'text') as FormField['fieldType'];
  } else if (element instanceof HTMLTextAreaElement) {
    fieldType = 'textarea';
  } else if (element instanceof HTMLSelectElement) {
    fieldType = 'select';
  }

  // Extract label text
  const label = extractFieldLabel(element);

  // Get HTML attributes
  const name = element.getAttribute('name') || element.getAttribute('id') || '';
  const placeholder = element.getAttribute('placeholder') || '';
  const maxLength = element.getAttribute('maxlength') || undefined;
  const required = element.hasAttribute('required');

  // Generate CSS selector for reliable re-finding
  const selector = generateCSSSelector(element);

  return {
    id,
    fieldType,
    label,
    placeholder,
    name,
    selector,
    isRequired: required,
    maxLength: maxLength ? parseInt(maxLength) : undefined,
  };
}

/**
 * Extract the label for a form field
 */
function extractFieldLabel(element: Element): string {
  let label = '';

  // Try to find associated label element
  const labelElement = document.querySelector(`label[for="${element.id}"]`);
  if (labelElement) {
    label = labelElement.textContent?.trim() || '';
  }

  // If no label, check placeholder
  if (!label) {
    label = element.getAttribute('placeholder') || '';
  }

  // If still no label, check aria-label
  if (!label) {
    label = element.getAttribute('aria-label') || '';
  }

  // If still no label, check nearby text or parent content
  if (!label) {
    const parent = element.closest('div, fieldset, form');
    if (parent) {
      // Get text from parent, excluding the input itself
      const clone = parent.cloneNode(true) as Element;
      const inputClone = clone.querySelector(`[name="${element.getAttribute('name')}"]`);
      if (inputClone) {
        inputClone.remove();
      }
      label = clone.textContent?.trim().substring(0, 100) || '';
    }
  }

  return label.trim().substring(0, 200); // Limit to 200 chars
}

/**
 * Extract all questions from visible page for batch processing
 */
function extractAllPageQuestions(): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  const formFields = detectForms();

  formFields.forEach((field) => {
    if (field.fieldType === 'textarea' || field.label.length > 10) {
      const question: ExtractedQuestion = {
        fieldId: field.id,
        questionText: field.label || field.placeholder,
        context: extractFormContext(),
        formUrl: window.location.href,
        timestamp: new Date().toISOString(),
      };

      if (question.questionText) {
        questions.push(question);
      }
    }
  });

  return questions;
}

/**
 * Extract the context/title of the form
 */
function extractFormContext(): string {
  // Try to find form title
  const formTitle = document.querySelector('h1, h2, form > legend, form > fieldset > legend');
  if (formTitle) {
    return formTitle.textContent?.trim() || '';
  }

  // Try to find page title
  const pageTitle = document.title;
  if (pageTitle) {
    return pageTitle;
  }

  return '';
}

/**
 * Fill a specific form field with the generated answer
 */
function fillField(selector: string, answer: string): boolean {
  try {
    const element = document.querySelector(selector);

    if (!element) {
      console.error('[FormAutoFill] Could not find element with selector:', selector);
      return false;
    }

    if (element instanceof HTMLTextAreaElement) {
      element.value = answer;
      triggerInputEvent(element);
      return true;
    } else if (element instanceof HTMLInputElement) {
      element.value = answer;
      triggerInputEvent(element);
      return true;
    } else if (element instanceof HTMLSelectElement) {
      // Find option that matches the answer
      for (const option of element.options) {
        if (option.value === answer || option.text === answer) {
          element.value = option.value;
          triggerInputEvent(element);
          return true;
        }
      }
      // If no exact match, just set the value
      element.value = answer;
      triggerInputEvent(element);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[FormAutoFill] Error filling field:', error);
    return false;
  }
}

/**
 * Trigger change and input events to notify page of value change
 */
function triggerInputEvent(element: HTMLElement) {
  // Dispatch change event
  element.dispatchEvent(new Event('change', { bubbles: true }));
  // Dispatch input event
  element.dispatchEvent(new Event('input', { bubbles: true }));
  // For some frameworks, might need blur/focus
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Check if an element is hidden
 */
function isElementHidden(element: Element): boolean {
  if (!element) return true;

  // Check if element is in excluded list
  for (const selector of EXCLUDED_SELECTORS) {
    if (element.matches(selector)) {
      return true;
    }
  }

  // Check CSS display/visibility
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return true;
  }

  // Check if parent is hidden
  const parent = element.parentElement;
  if (parent && parent !== document.body) {
    return isElementHidden(parent);
  }

  return false;
}

/**
 * Generate a reliable CSS selector for an element
 */
function generateCSSSelector(element: Element): string {
  // Try to use ID if available
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  // Try to use name + type (for input fields)
  if (element instanceof HTMLInputElement && element.name) {
    return `input[name="${CSS.escape(element.name)}"]`;
  }

  if (element instanceof HTMLTextAreaElement && element.name) {
    return `textarea[name="${CSS.escape(element.name)}"]`;
  }

  // Build a unique selector from parent path
  const path: string[] = [];
  let currentElement: Element | null = element;

  while (currentElement && currentElement !== document.body) {
    let selector = currentElement.nodeName.toLowerCase();

    // Add index if there are siblings
    const siblings = currentElement.parentElement?.querySelectorAll(selector) || [];
    if (siblings.length > 1) {
      const index = Array.from(siblings).indexOf(currentElement) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    currentElement = currentElement.parentElement;
  }

  return path.join(' > ');
}

/**
 * Generate a simple UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}
