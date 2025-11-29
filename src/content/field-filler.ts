/**
 * Field Filler Module
 * Handles filling form fields with generated answers
 */

/**
 * Fill a specific form field with the generated answer
 */
export function fillField(selector: string, answer: string): boolean {
  try {
    console.log('[FormAutoFill] Filling field with selector:', selector);

    let element = document.querySelector(selector);

    // If selector not found, it might be a data-field-id attribute selector
    if (!element && selector.includes('data-field-id')) {
      // Extract field ID from selector
      const match = selector.match(/data-field-id="([^"]+)"/);
      if (match) {
        element = document.querySelector(`[data-field-id="${match[1]}"]`);
      }
    }

    if (!element) {
      console.error('[FormAutoFill] Could not find element with selector:', selector);
      return false;
    }

    console.log('[FormAutoFill] Found element:', element);

    if (element instanceof HTMLTextAreaElement) {
      element.value = answer;
      triggerInputEvent(element);
      console.log('[FormAutoFill] Filled textarea');
      return true;
    } else if (element instanceof HTMLInputElement) {
      element.value = answer;
      triggerInputEvent(element);
      console.log('[FormAutoFill] Filled input');
      return true;
    } else if (element instanceof HTMLSelectElement) {
      // Find option that matches the answer
      for (const option of Array.from(element.options)) {
        if (option.value === answer || option.text === answer) {
          element.value = option.value;
          triggerInputEvent(element);
          console.log('[FormAutoFill] Filled select');
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
export function triggerInputEvent(element: HTMLElement) {
  // Dispatch change event
  element.dispatchEvent(new Event('change', { bubbles: true }));
  // Dispatch input event
  element.dispatchEvent(new Event('input', { bubbles: true }));
  // For some frameworks, might need blur/focus
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}
