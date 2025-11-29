/**
 * Content Script - Runs on every webpage
 * Main entry point that coordinates form detection and field filling
 */

import { detectForms, extractAllPageQuestions } from './content/form-detector';
import { fillField } from './content/field-filler';

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
async function handleMessage(request: any, _sender: any, sendResponse: any) {
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}
