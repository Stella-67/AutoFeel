import { FormField, ExtractedQuestion } from '../types';
import { generateUUID } from '../utils';

/**
 * Form Detection Module
 * Handles form field detection and label extraction
 */

const EXCLUDED_SELECTORS = [
  '[style*="display: none"]',
  '[hidden]',
  'noscript',
  'script',
  'style',
];

/**
 * Detect all form fields on the page
 */
export function detectForms(): FormField[] {
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
export function extractFormField(element: Element): FormField | null {
  // Skip hidden elements
  if (isElementHidden(element)) {
    return null;
  }

  const id = generateUUID();

  // Add data-field-id attribute to the element for later reference
  element.setAttribute('data-field-id', id);

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
  const label = extractFieldLabel(element as HTMLElement);

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
export function extractFieldLabel(element: HTMLElement): string {
  let label = '';

  // 1. Try to find an associated <label> element
  if (element.id) {
    const labelElement = document.querySelector(`label[for="${element.id}"]`);
    if (labelElement) {
      label = labelElement.textContent?.trim() || '';
    }
  }

  // 2. If no label, check for aria-labelledby
  if (!label && element.getAttribute('aria-labelledby')) {
    const labelId = element.getAttribute('aria-labelledby');
    const labelElement = document.getElementById(labelId!);
    if (labelElement) {
      label = labelElement.textContent?.trim() || '';
    }
  }

  // 3. Look for a heading in a shared container (for Google Forms & modern apps)
  if (!label) {
    // Google Forms often wraps questions in a div with role="listitem" or role="group"
    const container = element.closest('div[role="listitem"], div[role="group"], div[role="formitem"]');
    if (container) {
      // The question is usually in a heading element inside this container
      const heading = container.querySelector('div[role="heading"], h1, h2, h3, h4, h5, h6, [class*="question"], [class*="title"]');
      if (heading) {
        label = heading.textContent?.trim() || '';
      }
    }
  }

  // 4. Look for nearby text elements (for custom forms)
  if (!label) {
    // Check parent container for labels or text nodes
    const parent = element.parentElement;
    if (parent) {
      // Look for label-like elements in parent
      const labelLikeElements = parent.querySelectorAll('label, span, div, p');
      for (const elem of Array.from(labelLikeElements)) {
        const text = elem.textContent?.trim() || '';
        // Filter out placeholder-like text (usually shorter and generic)
        if (text && text.length > 5 && !text.toLowerCase().includes('answer') && !text.toLowerCase().includes('enter')) {
          label = text;
          break;
        }
      }
    }
  }

  // 5. Check for aria-label on the element itself
  if (!label) {
    label = element.getAttribute('aria-label') || '';
  }

  // 6. As a last resort, check for placeholder (but filter out generic ones)
  if (!label) {
    const placeholder = element.getAttribute('placeholder') || '';
    // Only use placeholder if it's not a generic instruction
    if (placeholder && !placeholder.toLowerCase().includes('answer') && !placeholder.toLowerCase().includes('enter') && !placeholder.toLowerCase().includes('type')) {
      label = placeholder;
    }
  }

  return label.trim().substring(0, 200); // Limit to 200 chars
}

/**
 * Extract all questions from visible page for batch processing
 */
export function extractAllPageQuestions(): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  const formFields = detectForms();

  formFields.forEach((field) => {
    if (field.fieldType === 'textarea' || field.label.length > 10) {
      const question: ExtractedQuestion = {
        fieldId: field.id,
        questionText: field.label || field.placeholder || '',
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
export function extractFormContext(): string {
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
 * Check if an element is hidden
 */
export function isElementHidden(element: Element): boolean {
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
export function generateCSSSelector(element: Element): string {
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
