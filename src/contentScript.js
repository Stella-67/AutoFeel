// ==================== AutoFeel Content Script ====================
// Main entry point - coordinates between modules

// Note: Other modules are loaded via manifest.json in order:
// 1. notifications.js - notification display
// 2. field-detector.js - form field detection
// 3. page-extractor.js - page content extraction
// 4. field-filler.js - form field filling
// 5. contentScript.js (this file) - message handling and click events

// ==================== Message Listeners ====================

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'GET_PAGE_CONTENT') {
    // Handle async getPageContent
    getPageContent()
      .then(content => {
        sendResponse({ success: true, content: content });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }

  if (request.type === 'SHOW_NOTIFICATION') {
    showNotification(request.message, request.status);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'DETECT_FORM_FIELDS') {
    try {
      const onlyUnfilled = request.onlyUnfilled || false;
      const excludeFieldIds = request.excludeFieldIds || [];
      const afterFieldId = request.afterFieldId || null;
      const fields = detectFormFields(excludeFieldIds, afterFieldId, onlyUnfilled);
      sendResponse({ success: true, fields: fields });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (request.type === 'CLEAR_FILLED_FIELDS') {
    // Clear filled field tracking (start fresh)
    console.log('[AutoFeel CS] CLEAR_FILLED_FIELDS received');
    filledFieldKeys.clear();
    console.log('[AutoFeel CS] Cleared filled field tracking, size now:', filledFieldKeys.size);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'MARK_AS_FILLED') {
    // Mark field as filled to prevent re-detection
    console.log(`[AutoFeel CS] MARK_AS_FILLED received:`, request.fieldId, 'label:', request.fieldLabel, 'name:', request.fieldName, 'type:', request.fieldType);

    // CRITICAL: Track by composite key (survives DOM recreation, handles duplicate labels)
    if (request.fieldLabel) {
      const fieldKey = `${request.fieldLabel}||${request.fieldName || ''}||${request.fieldType}`;
      filledFieldKeys.add(fieldKey);
      console.log(`[AutoFeel CS] MARKED "${request.fieldLabel}" (${request.fieldType}, name: ${request.fieldName || 'none'}) AS FILLED`);
      console.log(`[AutoFeel CS] Key: "${fieldKey}"`);
      console.log(`[AutoFeel CS] filledFieldKeys now has ${filledFieldKeys.size} items:`, Array.from(filledFieldKeys));
    } else {
      console.error(`[AutoFeel CS] NO LABEL PROVIDED for ${request.fieldId}`);
    }

    // Also mark DOM element if it exists
    const input = document.querySelector(`[data-autofeel-id="${request.fieldId}"]`);
    if (input) {
      input.dataset.autofeelFilled = 'true';
      const inputType = input.type ? input.type.toLowerCase() : '';

      // For radio buttons, mark entire group
      if (inputType === 'radio' && input.name) {
        const radioGroup = document.querySelectorAll(`input[type="radio"][name="${input.name}"]`);
        radioGroup.forEach(radio => radio.dataset.autofeelFilled = 'true');
      }
      console.log(`[AutoFeel] Also marked DOM element ${request.fieldId}`);
    } else {
      console.warn(`[AutoFeel] Field ${request.fieldId} not found in DOM (but label tracked)`);
    }

    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'FILL_SINGLE_FIELD') {
    // Handle single field filling (one-by-one mode)
    (async () => {
      try {
        await fillSingleField(request.fieldId, request.answer);
        sendResponse({ success: true });
      } catch (error) {
        console.error('[AutoFeel] Error filling single field:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (request.type === 'DETECT_DROPDOWN_OPTIONS') {
    // Detect options from dynamic dropdown
    (async () => {
      try {
        const options = await detectDynamicDropdownOptions(request.fieldId);
        sendResponse({ success: true, options: options });
      } catch (error) {
        console.error('[AutoFeel] Error detecting dropdown options:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// ==================== Option + Click to Fill Single Field ====================

// Add click listener for Option+Click to fill individual fields
document.addEventListener('click', async (event) => {
  // Check if Option/Alt key is pressed
  if (!event.altKey) {
    return;
  }

  let target = event.target;

  // Helper function to check if element is a form field
  function isFormFieldElement(element) {
    if (!element || !element.tagName) return false;

    const tag = element.tagName;

    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (tag === 'BUTTON' && element.getAttribute('aria-haspopup') === 'listbox')
    );
  }

  // Try to find the actual form field
  // 1. Check clicked element
  // 2. Check if clicked on label - find associated input
  // 3. Check parent elements (up to 3 levels)
  let formField = null;

  if (isFormFieldElement(target)) {
    formField = target;
  } else if (target.tagName === 'LABEL') {
    // Clicked on a label - find the associated input
    if (target.htmlFor) {
      formField = document.getElementById(target.htmlFor);
    } else {
      // Label wraps input
      formField = target.querySelector('input, textarea, select, button');
    }
  } else {
    // Try parent elements (for custom radio/checkbox containers)
    let parent = target.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
      const input = parent.querySelector('input, textarea, select, button');
      if (input && isFormFieldElement(input)) {
        formField = input;
        break;
      }
      parent = parent.parentElement;
      depth++;
    }
  }

  if (!formField) {
    console.log('[AutoFeel] Option+Click: Not a form field, ignoring');
    return;
  }

  // Prevent default behavior
  event.preventDefault();
  event.stopPropagation();

  console.log('[AutoFeel] Option+Click detected on field:', formField);

  // Check if field already has autofeel-id
  let fieldId = formField.dataset.autofeelId;

  if (!fieldId) {
    // Field not yet detected, assign a temporary ID
    fieldId = `temp_${Date.now()}`;
    formField.dataset.autofeelId = fieldId;
    console.log('[AutoFeel] Assigned temporary ID:', fieldId);
  }

  // Send message to background to fill this single field
  try {
    await chrome.runtime.sendMessage({
      type: 'FILL_SINGLE_FIELD_BY_CLICK',
      fieldId: fieldId
    });
  } catch (error) {
    console.error('[AutoFeel] Error sending fill request:', error);
  }
}, true); // Use capture phase to intercept before other handlers
