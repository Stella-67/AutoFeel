// ==================== Recursive Filler ====================
// Handles recursive and non-recursive field filling strategies

/**
 * Fill a single field without recursion (for text fields)
 * @param {Object} tab - Chrome tab object
 * @param {Object} field - Field information
 * @param {Object} savedContext - User's saved context
 * @param {Object} config - LLM configuration
 * @returns {Promise<{success: boolean, totalTokens: number, error?: string}>}
 */
async function fillSingleFieldNonRecursive(tab, field, savedContext, config) {
  try {
    // Generate answer
    const answer = await generateSingleFieldAnswer(field, savedContext, config, tab);

    if (!answer.success) {
      return { success: false, totalTokens: 0, error: answer.error };
    }

    // Mark as filled
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'MARK_AS_FILLED',
        fieldId: field.id,
        fieldLabel: field.label,
        fieldName: field.name,
        fieldType: field.type
      });
    } catch (markError) {
      console.error(`[RecursiveFiller] Failed to mark field as filled:`, markError);
    }

    // Convert answer format if needed
    let answerToFill = answer.data;
    if (field.options && field.options.length > 0 && answer.data.answer) {
      const hasHierarchy = field.options.some(opt => opt.children && opt.children.length > 0);

      if (hasHierarchy) {
        console.log(`[RecursiveFiller] Hierarchical answer: "${answer.data.answer}"`);
      } else {
        const answerNum = parseInt(answer.data.answer);
        if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length) {
          if (field.isDynamicDropdown || field.type === 'button-select') {
            const optionText = field.options[answerNum - 1].label;
            console.log(`[RecursiveFiller] Converting index ${answerNum} to option text: "${optionText}"`);
            answerToFill = {
              answer: optionText,
              explanation: answer.data.explanation
            };
          }
        }
      }
    }

    // Fill the field
    const fillResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_SINGLE_FIELD',
      fieldId: field.id,
      answer: answerToFill
    });

    if (!fillResult || !fillResult.success) {
      return { success: false, totalTokens: 0, error: 'Failed to fill field' };
    }

    const totalTokens = answer.tokenUsage ? answer.tokenUsage.totalTokens : 0;
    return { success: true, totalTokens };

  } catch (error) {
    console.error('[RecursiveFiller] Error in fillSingleFieldNonRecursive:', error);
    return { success: false, totalTokens: 0, error: error.message };
  }
}

/**
 * Recursively fill fields starting from a specific field
 * After filling each field, re-detect to find newly appeared conditional fields
 *
 * @param {Object} tab - Chrome tab object
 * @param {string} startFieldId - ID of the field to start filling (null for auto-detect first unfilled)
 * @param {Object} savedContext - User's saved context
 * @param {Object} config - LLM configuration
 * @param {number} depth - Current recursion depth (for safety limit)
 * @returns {Promise<{success: boolean, filledCount: number, totalTokens: number, error?: string}>}
 */
async function recursiveFillFromField(tab, startFieldId, savedContext, config, depth = 0) {
  const MAX_DEPTH = 50; // Safety limit to prevent infinite recursion

  if (depth >= MAX_DEPTH) {
    console.warn('[RecursiveFiller] Reached maximum recursion depth');
    return { success: true, filledCount: 0, totalTokens: 0 };
  }

  // Detect all fields (if startFieldId provided, detect all; otherwise detect unfilled)
  let detectionResult;
  try {
    detectionResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'DETECT_FORM_FIELDS',
      onlyUnfilled: startFieldId ? false : true  // If we have a specific field, detect all; otherwise only unfilled
    });
  } catch (error) {
    console.error('[RecursiveFiller] Failed to detect fields at depth', depth, error);
    return { success: false, filledCount: 0, totalTokens: 0, error: 'Failed to detect fields' };
  }

  if (!detectionResult || !detectionResult.success || !detectionResult.fields || detectionResult.fields.length === 0) {
    return { success: true, filledCount: 0, totalTokens: 0 };
  }

  // Find the field to fill
  let field;
  if (startFieldId) {
    // Find the specific field by ID
    field = detectionResult.fields.find(f => f.id === startFieldId);
    if (!field) {
      console.error('[RecursiveFiller] Specified field not found:', startFieldId);
      return { success: false, filledCount: 0, totalTokens: 0, error: 'Field not found' };
    }
  } else {
    // Take the first unfilled field
    field = detectionResult.fields[0];
  }

  // CRITICAL: Capture all current field IDs BEFORE filling
  // This allows us to detect truly NEW fields that appear after filling
  const fieldIdsBefore = new Set(detectionResult.fields.map(f => f.id));

  // Generate answer for this field
  const answer = await generateSingleFieldAnswer(field, savedContext, config, tab);

  if (!answer.success) {
    console.error(`[RecursiveFiller] Failed to generate answer at depth ${depth}:`, answer.error);
    return { success: false, filledCount: 0, totalTokens: 0, error: answer.error };
  }

  // Mark as filled FIRST
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'MARK_AS_FILLED',
      fieldId: field.id,
      fieldLabel: field.label,
      fieldName: field.name,
      fieldType: field.type
    });
  } catch (markError) {
    console.error(`[RecursiveFiller] Failed to mark field as filled:`, markError);
  }

  // Convert answer format if needed
  let answerToFill = answer.data;
  if (field.options && field.options.length > 0 && answer.data.answer) {
    const hasHierarchy = field.options.some(opt => opt.children && opt.children.length > 0);

    if (hasHierarchy) {
      console.log(`[RecursiveFiller] Hierarchical answer: "${answer.data.answer}"`);
    } else {
      const answerNum = parseInt(answer.data.answer);
      if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length) {
        if (field.isDynamicDropdown || field.type === 'button-select') {
          const optionText = field.options[answerNum - 1].label;
          console.log(`[RecursiveFiller] Converting index ${answerNum} to option text: "${optionText}"`);
          answerToFill = {
            answer: optionText,
            explanation: answer.data.explanation
          };
        }
      }
    }
  }

  // Fill the field
  const fillResult = await chrome.tabs.sendMessage(tab.id, {
    type: 'FILL_SINGLE_FIELD',
    fieldId: field.id,
    answer: answerToFill
  });

  if (!fillResult || !fillResult.success) {
    console.error(`[RecursiveFiller] Failed to fill field at depth ${depth}`);
    return { success: false, filledCount: 0, totalTokens: 0, error: 'Failed to fill field' };
  }

  let totalTokens = answer.tokenUsage ? answer.tokenUsage.totalTokens : 0;
  let filledCount = 1;

  // Wait for page to update (new conditional fields may appear)
  await new Promise(resolve => setTimeout(resolve, 800));

  let afterFieldsResult;
  try {
    afterFieldsResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'DETECT_FORM_FIELDS',
      onlyUnfilled: false  // Detect ALL fields to compare
    });
  } catch (error) {
    console.warn('[RecursiveFiller] Failed to re-detect fields:', error);
    // Continue anyway, we filled at least one field
    return { success: true, filledCount, totalTokens };
  }

  if (afterFieldsResult && afterFieldsResult.success && afterFieldsResult.fields && afterFieldsResult.fields.length > 0) {
    // Find truly NEW fields by comparing IDs
    const newlyAppearedFields = afterFieldsResult.fields.filter(f => !fieldIdsBefore.has(f.id));

    if (newlyAppearedFields.length > 0) {
      // Filter for selection-type fields only (radio, checkbox, select, dropdown)
      // Don't recursively fill text fields - let user handle those manually
      const newSelectionFields = newlyAppearedFields.filter(f => {
        return f.type === 'radio' ||
               f.type === 'checkbox' ||
               f.type === 'select' ||
               f.type === 'button-select' ||
               f.isDynamicDropdown;
      });

      if (newSelectionFields.length > 0) {
        // Recursively fill the first new selection field
        const recursiveResult = await recursiveFillFromField(tab, newSelectionFields[0].id, savedContext, config, depth + 1);

        filledCount += recursiveResult.filledCount;
        totalTokens += recursiveResult.totalTokens;
      }
    }
  }

  return { success: true, filledCount, totalTokens };
}
