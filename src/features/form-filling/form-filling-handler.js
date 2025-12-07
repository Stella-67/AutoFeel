// ==================== Form Filling Handler ====================
// Main entry points for form filling functionality

/**
 * Handle Alt+V command - Auto-fill entire form
 * Loops through unfilled fields and fills them one by one
 */
async function handleAutoFillForm() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('[FormFilling] No active tab found');
      return;
    }

    // Check if page is accessible
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('file://')
    )) {
      console.error('[FormFilling] Cannot run on special pages:', tab.url);
      console.error('[FormFilling] This extension only works on regular web pages (http:// or https://)');
      return;
    }

    await notifyTab(tab.id, 'Detecting form fields...', 'loading');

    const { savedContext } = await chrome.storage.local.get(['savedContext']);

    if (!savedContext) {
      console.error('[FormFilling] No saved context found.');
      console.error('[FormFilling] Please use Alt+C first on a page with your information (e.g., resume, profile) to save it to memory.');
      console.error('[FormFilling] Then come back to this form and use Alt+V to auto-fill.');
      return;
    }

    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // Clear filled field tracking (start fresh)
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_FILLED_FIELDS' });
    } catch (e) {
      console.warn('[FormFilling] Failed to clear filled fields (old content script?):', e.message);
    }

    // New strategy: Loop and fill top unfilled field each time
    let totalTokens = 0;
    let totalFilledCount = 0;
    let iterationCount = 0;
    const MAX_ITERATIONS = 100; // Safety limit

    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      // Detect current form state
      let detectionResult;
      try {
        detectionResult = await chrome.tabs.sendMessage(tab.id, {
          type: 'DETECT_FORM_FIELDS',
          onlyUnfilled: true
        });
      } catch (error) {
        console.error('[FormFilling] Failed to detect fields:', error);
        break;
      }

      if (!detectionResult || !detectionResult.success || !detectionResult.fields || detectionResult.fields.length === 0) {
        console.log('[FormFilling] No more unfilled fields detected');
        break;
      }

      const unfilledFields = detectionResult.fields;
      const totalFields = totalFilledCount + unfilledFields.length;

      console.log(`[FormFilling] Page status: Total=${totalFields}, Filled=${totalFilledCount}, Unfilled=${unfilledFields.length}`);

      // Get the first (topmost) unfilled field
      const topField = unfilledFields[0];
      console.log(`[FormFilling] Processing top unfilled field: "${topField.label}" (${topField.type})`);

      // Show progress
      await notifyTab(tab.id, `Filling ${totalFilledCount + 1}/${totalFields}: ${topField.label}`, 'loading');

      // Use Option+Click strategy: check if selection field or text field
      // Exclude searchable text inputs (type='text' with isDynamicDropdown) from recursive filling
      const isSelectionField = (topField.type === 'radio' ||
                                topField.type === 'checkbox' ||
                                topField.type === 'select' ||
                                topField.type === 'button-select' ||
                                topField.isDynamicDropdown) &&
                                !(topField.type === 'text' && topField.isDynamicDropdown);

      let fillResult;
      if (isSelectionField) {
        // Selection field: use recursive filling (same as Option+Click)
        fillResult = await recursiveFillFromField(tab, topField.id, savedContext, config, 0);
      } else {
        // Text field or searchable text input: fill only this one field (same as Option+Click)
        fillResult = await fillSingleFieldNonRecursive(tab, topField, savedContext, config);
      }

      if (fillResult.success) {
        totalFilledCount += fillResult.filledCount || 1;
        totalTokens += fillResult.totalTokens || 0;
        console.log(`[FormFilling] Successfully filled field(s). Total filled: ${totalFilledCount}`);
      } else {
        console.error(`[FormFilling] Failed to fill field "${topField.label}":`, fillResult.error);
        // Continue to next field even if this one failed
        totalFilledCount++; // Count as attempted
      }

      // Wait for page to update
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    if (iterationCount >= MAX_ITERATIONS) {
      console.warn('[FormFilling] Reached maximum iteration limit');
      await notifyTab(tab.id, `⚠️ Filled ${totalFilledCount} fields (iteration limit reached)`, 'warning');
    } else {
      await notifyTab(tab.id, `✅ Successfully filled ${totalFilledCount} fields (${totalTokens.toLocaleString()} tokens)`, 'success');
    }
  } catch (error) {
    console.error('[FormFilling] Error in handleAutoFillForm:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('[FormFilling] Failed to show error notification:', e);
    }
  }
}

/**
 * Handle Option+Click on a field - Fill single field or recursively fill from that field
 * @param {string} fieldId - ID of the clicked field
 */
async function handleFillSingleFieldByClick(fieldId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('[FormFilling] No active tab found');
      return;
    }

    // Check if page is accessible
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('file://')
    )) {
      console.error('[FormFilling] Cannot run on special pages:', tab.url);
      return;
    }

    await notifyTab(tab.id, 'Analyzing clicked field...', 'loading');

    // Get saved context
    const { savedContext } = await chrome.storage.local.get(['savedContext']);

    if (!savedContext) {
      await notifyTab(tab.id, 'No saved context. Use Alt+C first to save your information.', 'error');
      console.error('[FormFilling] No saved context found. Please use Alt+C first.');
      return;
    }

    // Get LLM config
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // Detect the clicked field first to check its type
    let detectionResult;
    try {
      detectionResult = await chrome.tabs.sendMessage(tab.id, {
        type: 'DETECT_FORM_FIELDS',
        onlyUnfilled: false
      });
    } catch (error) {
      console.error('[FormFilling] Failed to detect field:', error);
      await notifyTab(tab.id, 'Failed to detect field', 'error');
      return;
    }

    if (!detectionResult || !detectionResult.success) {
      await notifyTab(tab.id, 'Failed to detect field', 'error');
      return;
    }

    const clickedField = detectionResult.fields.find(f => f.id === fieldId);
    if (!clickedField) {
      await notifyTab(tab.id, 'Field not found', 'error');
      return;
    }

    // Determine if this should use recursive filling (for fields that might trigger conditional sub-questions)
    // Exclude searchable text inputs (type='text' with isDynamicDropdown) as they don't trigger conditional fields
    const isSelectionField = (clickedField.type === 'radio' ||
                              clickedField.type === 'checkbox' ||
                              clickedField.type === 'select' ||
                              clickedField.type === 'button-select' ||
                              clickedField.isDynamicDropdown) &&
                              !(clickedField.type === 'text' && clickedField.isDynamicDropdown);

    if (isSelectionField) {
      // This is a selection field - use recursive filling to handle conditional sub-questions
      console.log(`[FormFilling] Option+Click: Selection field detected, starting recursive fill from "${clickedField.label}"`);
      const result = await recursiveFillFromField(tab, fieldId, savedContext, config, 0);

      if (result.success) {
        const tokenInfo = result.totalTokens > 0 ? ` (${result.totalTokens.toLocaleString()} tokens)` : '';
        await notifyTab(tab.id, `✅ Filled ${result.filledCount} field(s)${tokenInfo}`, 'success');
        console.log(`[FormFilling] Recursive fill completed: ${result.filledCount} fields filled`);
      } else {
        await notifyTab(tab.id, result.error || 'Failed to fill fields', 'error');
      }
    } else {
      // This is a text field - fill only this one field, no recursion
      console.log(`[FormFilling] Option+Click: Text field detected, filling single field "${clickedField.label}" without recursion`);
      const result = await fillSingleFieldNonRecursive(tab, clickedField, savedContext, config);

      if (result.success) {
        const tokenInfo = result.totalTokens > 0 ? ` (${result.totalTokens.toLocaleString()} tokens)` : '';
        await notifyTab(tab.id, `✅ Filled "${clickedField.label}"${tokenInfo}`, 'success');
      } else {
        await notifyTab(tab.id, result.error || 'Failed to fill field', 'error');
      }
    }

  } catch (error) {
    console.error('[FormFilling] Error in handleFillSingleFieldByClick:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('[FormFilling] Failed to show error notification:', e);
    }
  }
}
