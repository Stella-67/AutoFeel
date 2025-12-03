// ==================== Form Field Filling ====================
// Handles filling various types of form fields

async function fillSingleField(fieldId, fieldData) {
  const input = document.querySelector(`[data-autofeel-id="${fieldId}"]`);

  if (!input) {
    console.error(`[AutoFeel] Field ${fieldId} not found`);
    return;
  }

  console.log(`[AutoFeel Filler] Starting fillSingleField for ${fieldId}, fieldData:`, fieldData);

  // Extract answer and explanation
  const answer = typeof fieldData === 'string' ? fieldData : fieldData.answer;
  const explanation = typeof fieldData === 'object' ? fieldData.explanation : null;

  console.log(`[AutoFeel Filler] Extracted answer: "${answer}", explanation:`, explanation);

  // Get field type info first
  const fieldType = input.tagName.toLowerCase();
  const inputType = input.type ? input.type.toLowerCase() : '';

  console.log(`[AutoFeel Filler] Field type: ${fieldType}, input type: ${inputType}`);

  // Mark field as filled IMMEDIATELY to prevent re-detection
  input.dataset.autofeelFilled = 'true';
  if (inputType === 'radio' && input.name) {
    const radioGroup = document.querySelectorAll(`input[type="radio"][name="${input.name}"]`);
    radioGroup.forEach(radio => radio.dataset.autofeelFilled = 'true');
  }
  console.log(`[AutoFeel] Marked field ${fieldId} as filled (before filling)`);

  // Handle empty answers with hint
  if (!answer || answer.trim() === '') {
    console.warn(`[AutoFeel Filler] Empty answer, showing hint`);
    await showEmptyFieldHint(input, fieldId, explanation);
    return;
  }

  // Fill based on field type

  // Check if this is a custom searchable select (Workday-style)
  const isSearchableSelect =
    input.dataset.uxiWidgetType === 'selectinput' ||
    (input.getAttribute('placeholder') === 'Search' && input.getAttribute('autocomplete') === 'off');

  // Check if this is a button-based select
  const isButtonSelect =
    input.tagName === 'BUTTON' && (input.getAttribute('aria-haspopup') === 'listbox' || input.getAttribute('aria-haspopup') === 'true');

  console.log(`[AutoFeel Filler] isSearchableSelect: ${isSearchableSelect}, isButtonSelect: ${isButtonSelect}`);

  if (isSearchableSelect) {
    console.log(`[AutoFeel Filler] Calling fillSearchableSelect with answer: "${answer}"`);
    await fillSearchableSelect(input, answer);
  } else if (isButtonSelect) {
    console.log(`[AutoFeel Filler] Calling fillButtonSelect with answer: "${answer}"`);
    await fillButtonSelect(input, answer);
  } else if (fieldType === 'select') {
    console.log(`[AutoFeel Filler] Calling fillSelectField with answer: "${answer}"`);
    await fillSelectField(input, answer);
  } else if (inputType === 'checkbox') {
    console.log(`[AutoFeel Filler] Calling fillCheckboxField with answer: "${answer}"`);
    await fillCheckboxField(input, answer);
  } else if (inputType === 'radio') {
    console.log(`[AutoFeel Filler] Calling fillRadioField with answer: "${answer}"`);
    await fillRadioField(input, answer);
  } else {
    console.log(`[AutoFeel Filler] Calling fillFieldWithAnimation with answer: "${answer}"`);
    // Text input, textarea, etc.
    await fillFieldWithAnimation(input, answer);
  }

  console.log(`[AutoFeel Filler] Finished fillSingleField for ${fieldId}`);
}

async function showEmptyFieldHint(input, _fieldId, explanation) {

  // Scroll to field
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Add a hint below the field
  const hint = document.createElement('div');
  hint.className = 'autofeel-empty-hint';

  // For radio/checkbox, find a wider container for hint placement
  let containerForHint = input.parentElement;
  if (input.type === 'radio' || input.type === 'checkbox') {
    // Try to find fieldset or form-group container
    const fieldset = input.closest('fieldset');
    const formGroup = input.closest('.form-group, [role="group"], [role="radiogroup"]');
    containerForHint = fieldset || formGroup || input.parentElement;
  }

  // Get input's computed styles to match alignment
  const inputStyles = window.getComputedStyle(input);
  const inputMarginLeft = inputStyles.marginLeft;

  hint.style.cssText = `
    margin-top: 24px;
    margin-left: calc(${inputMarginLeft} - 0px);
    min-width: 500px;
    max-width: 800px;
    padding: 2px 7px;
    background-color: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    color: #856404;
    font-size: 13px;
    line-height: 1.5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    animation: autofeel-hint-fadein 0.3s ease;
    box-sizing: border-box;
    display: block;
    width: fit-content;
  `;

  // Use LLM's explanation if available
  const explanationText = explanation ||
    'No relevant information found in your saved context. Please fill manually or use Alt+C to save more information.';

  hint.innerHTML = `
    <strong>💡 AutoFeel:</strong> ${explanationText}
  `;

  // Add CSS animations
  if (!document.getElementById('autofeel-hint-styles')) {
    const style = document.createElement('style');
    style.id = 'autofeel-hint-styles';
    style.textContent = `
      @keyframes autofeel-hint-fadein {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes autofeel-hint-fadeout {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
      }
    `;
    document.head.appendChild(style);
  }

  // Insert hint after the input (or after container for radio/checkbox)
  if (containerForHint === input.parentElement) {
    // Normal case - insert after input
    input.parentElement.insertBefore(hint, input.nextSibling);
  } else {
    // Radio/checkbox case - insert at end of container
    containerForHint.appendChild(hint);
  }

  // Remove hint after 8 seconds or when user focuses the field
  const removeHint = () => {
    hint.style.animation = 'autofeel-hint-fadeout 0.3s ease';
    setTimeout(() => hint.remove(), 300);
  };

  setTimeout(removeHint, 8000);
  input.addEventListener('focus', removeHint, { once: true });
}

async function fillFieldWithAnimation(input, answer) {
  // Scroll to field
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Add outline animation with background
  input.style.transition = 'all 0.3s ease';
  input.style.outline = '2px solid #4CAF50';
  input.style.outlineOffset = '0px';
  input.style.boxShadow = 'inset 0 0 0 100px rgba(76, 175, 80, 0.1)';

  await new Promise(resolve => setTimeout(resolve, 200));

  // Typing animation with events only at the end
  if (answer.length > 0) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

    // Type character by character for short answers (visual effect only)
    if (answer.length < 30) {
      nativeInputValueSetter.call(input, '');

      for (let charIndex = 0; charIndex < answer.length; charIndex++) {
        nativeInputValueSetter.call(input, answer.substring(0, charIndex + 1));
        // NO events during typing to avoid form validation conflicts
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    } else {
      // For long answers, just set directly
      nativeInputValueSetter.call(input, answer);
    }

    // Trigger events ONLY after all characters are typed
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Success animation
  input.style.outline = '2px solid #4CAF50';
  input.style.outlineOffset = '0px';
  input.style.boxShadow = 'inset 0 0 0 100px rgba(76, 175, 80, 0.1)';

  await new Promise(resolve => setTimeout(resolve, 400));

  // Fade out animation
  input.style.outline = '';
  input.style.boxShadow = '';
}

async function fillSearchableSelect(input, answer) {
  // Parse answer - support hierarchical paths like "Government > Federal > Defense"
  const answerPath = answer.split('>').map(s => s.trim());

  // Scroll to field
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Start recursive selection
  const result = await selectFromDropdown(input, answerPath, 0);

  if (!result) {
    console.warn(`[AutoFeel] Failed to select: "${answer}"`);
  }
}

async function fillButtonSelect(button, answer) {
  // Parse answer - support hierarchical paths like "Government > Federal > Defense"
  const answerPath = answer.split('>').map(s => s.trim());

  // Scroll to button
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Start recursive selection using the button as trigger
  const result = await selectFromDropdown(button, answerPath, 0);

  if (!result) {
    console.warn(`[AutoFeel] Failed to select: "${answer}"`);
  }
}

/**
 * Recursively select options from dropdown menus
 * @param {Element} trigger - The input or option that triggers the dropdown
 * @param {string[]} answerPath - Array of answer segments (e.g., ["Government", "Federal"])
 * @param {number} depth - Current depth in the path
 * @returns {Promise<boolean>} - Whether selection was successful
 */
async function selectFromDropdown(trigger, answerPath, depth = 0) {
  if (depth >= answerPath.length) {
    return true; // Reached end of path
  }

  const currentAnswer = answerPath[depth];
  console.log(`[AutoFeel] Level ${depth}: Looking for "${currentAnswer}"`);

  // Check if dropdown is already open (from option detection)
  let isAlreadyOpen = false;
  let preCheckOptions = Array.from(document.querySelectorAll('div[data-automation-id="promptOption"], [role="option"]'));
  preCheckOptions = preCheckOptions.filter(opt => {
    const style = window.getComputedStyle(opt);
    return style.display !== 'none' && style.visibility !== 'hidden' && opt.offsetParent !== null;
  });

  if (preCheckOptions.length > 0 && depth === 0) {
    isAlreadyOpen = true;
    console.log(`[AutoFeel] Dropdown already open with ${preCheckOptions.length} visible options`);
  }

  // Strategy 1: Use search box to filter (works even if dropdown is already open)
  if (trigger.tagName === 'INPUT' && depth === 0) {
    console.log(`[AutoFeel] Strategy 1: Using search box to filter options for "${currentAnswer}"`);

    // Focus and click to ensure dropdown is open
    trigger.focus();
    trigger.click();

    // Clear any existing search text first
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (trigger.value && trigger.value.trim().length > 0) {
      console.log(`[AutoFeel] Clearing existing search text: "${trigger.value}"`);
      nativeInputValueSetter.call(trigger, '');
      trigger.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    console.log(`[AutoFeel] Typing search text: "${currentAnswer}"`);

    // Set the full search text at once
    nativeInputValueSetter.call(trigger, currentAnswer);
    trigger.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 200));

    // Press Enter to trigger search (critical for non-real-time filtering)
    console.log(`[AutoFeel] Pressing Enter to trigger search...`);
    trigger.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
    trigger.dispatchEvent(new KeyboardEvent('keypress', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
    trigger.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));

    // Wait for search results to appear
    console.log(`[AutoFeel] Waiting for search results...`);
    await new Promise(resolve => setTimeout(resolve, 800));

    console.log(`[AutoFeel] Search complete. Current input value: "${trigger.value}"`);

    // Check if Enter already selected the option
    // Signs of successful selection:
    // 1. Dropdown closed
    // 2. Input value changed to something else (not the search text)
    // 3. Input value cleared (empty string) - this often means selection succeeded
    // 4. An option is marked as selected (aria-selected="true")

    const dropdownOptions = document.querySelectorAll('[role="listbox"], [role="option"]');
    const dropdownStillOpen = dropdownOptions.length > 0;
    const inputCleared = trigger.value === '';
    const inputValueChanged = trigger.value !== currentAnswer && trigger.value.trim().length > 0;
    const hasSelectedOption = Array.from(document.querySelectorAll('[role="option"]'))
      .some(opt => opt.getAttribute('aria-selected') === 'true');

    if (!dropdownStillOpen || inputValueChanged || (inputCleared && hasSelectedOption)) {
      console.log(`[AutoFeel] ✅ Selection completed by Enter key (dropdown closed: ${!dropdownStillOpen}, value changed: ${inputValueChanged}, has selected: ${hasSelectedOption})`);
      return true; // Successfully selected, no need to click
    }

    // Additional check: if input was cleared but we're not sure about selection, wait a bit more
    if (inputCleared) {
      console.log(`[AutoFeel] Input cleared after Enter, waiting to see if dropdown closes...`);
      await new Promise(resolve => setTimeout(resolve, 600));

      const dropdownStillOpenAfterWait = document.querySelectorAll('[role="listbox"], [role="option"]').length > 0;
      if (!dropdownStillOpenAfterWait) {
        console.log(`[AutoFeel] ✅ Dropdown closed after waiting, selection successful`);
        return true;
      }
    }

    console.log(`[AutoFeel] Dropdown still open and no selection detected, proceeding to click option...`);
  } else if (!isAlreadyOpen) {
    // Strategy 2: Open dropdown without search (for buttons or nested menus)
    if (trigger.tagName === 'BUTTON') {
      trigger.focus();
      trigger.click();
      trigger.dispatchEvent(new Event('click', { bubbles: true }));
    } else {
      trigger.click();
    }

    // Wait for dropdown to appear
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Find visible options - try multiple selectors to support different implementations
  let options = [];

  // Try Workday-style options first
  options = Array.from(document.querySelectorAll('div[data-automation-id="promptOption"]'));

  // If no Workday options found, try standard ARIA listbox pattern
  if (options.length === 0) {
    options = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] > div, [role="listbox"] > li'));
  }

  // Filter to visible options only
  options = options.filter(opt => {
    const style = window.getComputedStyle(opt);
    return style.display !== 'none' && style.visibility !== 'hidden' && opt.offsetParent !== null;
  });

  console.log(`[AutoFeel] Found ${options.length} visible options after filtering`);

  // Log first few options to debug filtering
  if (options.length > 0 && trigger.tagName === 'INPUT' && depth === 0) {
    console.log(`[AutoFeel] First 5 filtered options:`, options.slice(0, 5).map(o => o.textContent.trim()));
  }

  if (options.length === 0) {
    console.warn(`[AutoFeel] No visible options found at level ${depth}`);
    return false;
  }

  // Find matching option
  let matchedOption = findMatchingOption(options, currentAnswer);

  // If no match and we used search, the search might not have worked
  if (!matchedOption && trigger.tagName === 'INPUT' && depth === 0) {
    console.warn(`[AutoFeel] ⚠️ Search box didn't filter correctly. Options visible: ${options.length}, but none match "${currentAnswer}"`);
  }

  // Strategy 2: If no match found after search filtering, clear search and try browsing all options
  if (!matchedOption && trigger.tagName === 'INPUT' && depth === 0) {
    console.log(`[AutoFeel] Strategy 2: Search filtering didn't find match, clearing search box and loading all options...`);

    // Clear search box
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(trigger, '');
    trigger.dispatchEvent(new Event('input', { bubbles: true }));
    trigger.dispatchEvent(new Event('change', { bubbles: true }));

    // Wait for all options to reload
    await new Promise(resolve => setTimeout(resolve, 800));

    // Find the listbox container for scrolling
    const listbox = document.querySelector('[role="listbox"]');

    if (listbox) {
      // Collect all unique options by progressive scrolling
      const allOptions = new Map();

      // Helper function to collect currently visible options
      function collectVisibleOptions() {
        let optionEls = Array.from(document.querySelectorAll('div[data-automation-id="promptOption"], [role="option"]'));
        optionEls = optionEls.filter(opt => {
          const style = window.getComputedStyle(opt);
          return style.display !== 'none' && style.visibility !== 'hidden' && opt.offsetParent !== null;
        });

        optionEls.forEach(opt => {
          const text = opt.textContent.trim();
          if (text && !allOptions.has(text)) {
            allOptions.set(text, opt);
          }
        });

        return optionEls.length;
      }

      // Collect initial visible options
      collectVisibleOptions();
      const initialCount = allOptions.size;
      console.log(`[AutoFeel] Initial options after clearing search: ${initialCount}`);

      // Progressive scrolling to load all options
      const scrollHeight = listbox.scrollHeight;
      const clientHeight = listbox.clientHeight;

      if (scrollHeight > clientHeight) {
        console.log(`[AutoFeel] Scrolling to load all options (virtual scrolling detected)...`);

        const scrollStep = clientHeight * 0.8;
        let currentScroll = 0;
        let stableCount = 0;

        while (currentScroll < scrollHeight && stableCount < 3) {
          const previousCount = allOptions.size;

          currentScroll += scrollStep;
          listbox.scrollTop = currentScroll;

          await new Promise(resolve => setTimeout(resolve, 200));

          const visibleCount = collectVisibleOptions();
          const newCount = allOptions.size;

          console.log(`[AutoFeel] Scrolled to ${currentScroll}px: ${newCount} total options (${visibleCount} visible)`);

          if (newCount === previousCount) {
            stableCount++;
          } else {
            stableCount = 0;
          }

          if (listbox.scrollHeight !== scrollHeight) {
            break;
          }
        }

        // Scroll back to top
        listbox.scrollTop = 0;
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`[AutoFeel] Scrolling complete. Found ${allOptions.size} total options (initial: ${initialCount})`);
      }

      // Update options array with all collected options
      options = Array.from(allOptions.values());

      // Try to find match again
      matchedOption = findMatchingOption(options, currentAnswer);

      if (matchedOption) {
        console.log(`[AutoFeel] ✅ Found match after loading all options!`);
      } else {
        console.warn(`[AutoFeel] ❌ Still no match found even after loading all ${options.length} options`);
      }
    }
  }

  if (!matchedOption) {
    console.warn(`[AutoFeel] No match found for "${currentAnswer}" in ${options.length} options`);
    return false;
  }

  // Highlight the matched option
  matchedOption.style.transition = 'all 0.2s ease';
  matchedOption.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
  matchedOption.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  await new Promise(resolve => setTimeout(resolve, 200));

  // Store original options before clicking
  const originalOptionTexts = options.map(o => o.textContent.trim());

  // Click the option - prioritize clicking radio/checkbox inside if present
  const radioOrCheckbox = matchedOption.querySelector('input[type="radio"], input[type="checkbox"]');
  if (radioOrCheckbox) {
    console.log(`[AutoFeel] Clicking radio/checkbox inside option`);
    radioOrCheckbox.focus();
    radioOrCheckbox.click();
    radioOrCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    console.log(`[AutoFeel] Clicking option directly`);
    matchedOption.click();
  }

  // Wait for potential submenu to appear
  await new Promise(resolve => setTimeout(resolve, 800));

  // Check if new options appeared (submenu)
  const optionsAfterClick = Array.from(document.querySelectorAll('[role="option"]'))
    .filter(opt => {
      const style = window.getComputedStyle(opt);
      return style.display !== 'none' && style.visibility !== 'hidden' && opt.offsetParent !== null;
    });

  const originalTexts = new Set(originalOptionTexts);
  const newOptions = optionsAfterClick.filter(opt => !originalTexts.has(opt.textContent.trim()));

  // If submenu appeared, ask LLM to select from it
  if (newOptions.length > 0) {
    // Ask LLM for sub-selection
    let submenuResult;
    try {
      submenuResult = await chrome.runtime.sendMessage({
        type: 'SELECT_FROM_SUBMENU',
        parentOption: currentAnswer,
        submenuOptions: newOptions.map(opt => opt.textContent.trim()),
        fieldContext: `After selecting "${currentAnswer}", choose from:`
      });
    } catch (error) {
      console.error(`[AutoFeel] Error getting submenu selection:`, error);
      return false;
    }

    if (submenuResult?.success && submenuResult.answer) {
      const submenuOption = findMatchingOption(newOptions, submenuResult.answer);
      if (!submenuOption) {
        console.warn(`[AutoFeel] Could not find submenu option: "${submenuResult.answer}"`);
        return false;
      }

      // Highlight and scroll to option
      submenuOption.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
      submenuOption.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      await new Promise(resolve => setTimeout(resolve, 300));

      // Find and click radio/checkbox inside the option
      const clickable = submenuOption.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');

      if (clickable) {
        clickable.focus();
        clickable.click();
        clickable.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        submenuOption.focus();
        submenuOption.click();
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } else {
      console.warn(`[AutoFeel] Failed to get LLM submenu selection`);
      return false;
    }
  } else {
    // No submenu appeared
    return true;
  }
}

/**
 * Find matching option from a list of options
 */
function findMatchingOption(options, targetText) {
  const targetLower = targetText.toLowerCase().trim();

  // Helper function to get all relevant text from an option
  function getOptionTexts(option) {
    return {
      text: option.textContent.trim().toLowerCase(),
      dataLabel: option.getAttribute('data-automation-label')?.toLowerCase() || '',
      ariaLabel: option.getAttribute('aria-label')?.toLowerCase() || '',
      value: option.getAttribute('value')?.toLowerCase() || ''
    };
  }

  // 1. Exact match (text or any label)
  for (const option of options) {
    const texts = getOptionTexts(option);
    if (texts.text === targetLower ||
        texts.dataLabel === targetLower ||
        texts.ariaLabel === targetLower ||
        texts.value === targetLower) {
      return option;
    }
  }

  // 2. Starts with match
  for (const option of options) {
    const texts = getOptionTexts(option);
    if (texts.text.startsWith(targetLower) ||
        texts.dataLabel.startsWith(targetLower) ||
        texts.ariaLabel.startsWith(targetLower) ||
        texts.value.startsWith(targetLower)) {
      return option;
    }
  }

  // 3. Contains match
  for (const option of options) {
    const texts = getOptionTexts(option);
    if (texts.text.includes(targetLower) || targetLower.includes(texts.text) ||
        texts.dataLabel.includes(targetLower) || targetLower.includes(texts.dataLabel) ||
        texts.ariaLabel.includes(targetLower) || targetLower.includes(texts.ariaLabel) ||
        texts.value.includes(targetLower) || targetLower.includes(texts.value)) {
      return option;
    }
  }

  return null;
}

async function fillSelectField(select, answer) {
  // Scroll to field
  select.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Highlight animation
  select.style.transition = 'all 0.3s ease';
  select.style.outline = '2px solid #4CAF50';
  select.style.outlineOffset = '0px';
  select.style.boxShadow = 'inset 0 0 0 100px rgba(76, 175, 80, 0.1)';

  await new Promise(resolve => setTimeout(resolve, 200));

  // Try to find matching option - ONLY accept numeric index
  const options = Array.from(select.options);
  const answerTrimmed = answer.trim();

  let matchedOption = null;

  // ONLY accept number (option index) - no text matching fallback
  const answerNum = parseInt(answerTrimmed);
  if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= options.length) {
    matchedOption = options[answerNum - 1]; // Convert 1-based to 0-based index
  } else {
    console.error(`[AutoFeel] Invalid answer "${answerTrimmed}" - expected number 1-${options.length}`);
  }

  if (matchedOption) {
    select.value = matchedOption.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    console.warn(`[AutoFeel] No matching option found for: "${answer}"`);
  }

  await new Promise(resolve => setTimeout(resolve, 400));

  // Fade out animation
  select.style.outline = '';
  select.style.boxShadow = '';
}

async function fillCheckboxField(checkbox, answer) {
  // Scroll to field
  checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Determine if should be checked based on answer
  const shouldCheck = ['yes', 'true', '1', 'checked', 'check', 'select'].includes(answer.toLowerCase().trim());

  // Highlight animation
  checkbox.parentElement.style.transition = 'all 0.3s ease';
  checkbox.parentElement.style.outline = '2px solid #4CAF50';
  checkbox.parentElement.style.outlineOffset = '2px';

  await new Promise(resolve => setTimeout(resolve, 200));

  if (checkbox.checked !== shouldCheck) {
    checkbox.checked = shouldCheck;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
  }

  await new Promise(resolve => setTimeout(resolve, 400));

  // Fade out animation
  checkbox.parentElement.style.outline = '';
}

async function fillRadioField(radio, answer) {
  // For radio buttons, find the group and select the matching one
  const radioGroup = document.querySelectorAll(`input[name="${radio.name}"]`);

  // Scroll to first radio
  if (radioGroup.length > 0) {
    radioGroup[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const answerTrimmed = answer.trim();
  let matchedRadio = null;

  // ONLY accept number (option index) - no text matching fallback
  const answerNum = parseInt(answerTrimmed);
  if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= radioGroup.length) {
    matchedRadio = radioGroup[answerNum - 1]; // Convert 1-based to 0-based index
  } else {
    console.error(`[AutoFeel] Invalid answer "${answerTrimmed}" - expected number 1-${radioGroup.length}`);
  }

  if (matchedRadio) {
    // Highlight animation on parent element
    matchedRadio.parentElement.style.transition = 'all 0.3s ease';
    matchedRadio.parentElement.style.outline = '2px solid #4CAF50';
    matchedRadio.parentElement.style.outlineOffset = '2px';

    await new Promise(resolve => setTimeout(resolve, 200));

    // For custom radio components (like Workday), we need to simulate a real click
    // First, try clicking the associated label (more reliable for custom components)
    const label = matchedRadio.id
      ? document.querySelector(`label[for="${matchedRadio.id}"]`)
      : matchedRadio.closest('label');

    if (label) {
      // Click the label (this triggers the custom UI)
      label.click();
    } else {
      // Fallback: click the radio directly
      matchedRadio.click();
    }

    // Also set checked property and dispatch events as backup
    matchedRadio.checked = true;
    matchedRadio.dispatchEvent(new Event('change', { bubbles: true }));
    matchedRadio.dispatchEvent(new Event('input', { bubbles: true }));
    matchedRadio.dispatchEvent(new Event('click', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 400));

    // Fade out animation
    matchedRadio.parentElement.style.outline = '';
  } else {
    console.warn(`[AutoFeel] No matching radio found for: "${answer}"`);
  }
}
