/**
 * Field Detector Module
 * Detects form fields on the page and tracks filled fields
 * This file is loaded as part of the content script bundle
 */

// Track filled fields by composite key: label||name||type (survives DOM recreation)
// Using composite key to handle multiple fields with same label
const filledFieldKeys = new Set();
function detectFormFields(excludeFieldIds = [], afterFieldId = null, onlyUnfilled = false) {
  const fields = [];
  const processedRadioGroups = new Set(); // Track processed radio groups
  const excludeSet = new Set(excludeFieldIds); // Convert to Set for fast lookup

  // Find all form fields (text inputs, textareas, selects, checkboxes, radios, button-based selects)
  let inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="date"], input[type="checkbox"], input[type="radio"], input:not([type]), textarea, select, button[aria-haspopup="listbox"], button[aria-haspopup="true"]'));

  // If afterFieldId is specified, only include fields that come after that field in DOM order
  if (afterFieldId) {
    const afterElement = document.querySelector(`[data-autofeel-id="${afterFieldId}"]`);
    if (afterElement) {
      // Filter to only include elements that come after the reference element
      inputs = inputs.filter(input => {
        // Compare positions in the DOM
        const position = afterElement.compareDocumentPosition(input);
        // DOCUMENT_POSITION_FOLLOWING (4) means the input comes after afterElement
        return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
    }
  }

  // Find the highest existing field ID to avoid conflicts
  let maxFieldIndex = 0;
  inputs.forEach(input => {
    if (input.dataset.autofeelId) {
      const match = input.dataset.autofeelId.match(/^field_(\d+)$/);
      if (match) {
        maxFieldIndex = Math.max(maxFieldIndex, parseInt(match[1]) + 1);
      }
    }
  });

  let validFieldIndex = maxFieldIndex; // Start from next available index

  inputs.forEach((input) => {
    // Skip hidden or disabled fields
    if (input.offsetParent === null || input.disabled || input.readOnly) {
      return;
    }

    // Skip already filled fields (if onlyUnfilled mode)
    if (onlyUnfilled && input.dataset.autofeelFilled === 'true') {
      return;
    }

    // Skip fields that are inside navigation/header elements (not real form fields)
    const isInNavigation = input.closest('nav, header, [role="navigation"], [role="banner"], [role="menubar"]');
    if (isInNavigation) {
      return;
    }

    // Special handling for radio buttons - group them by name
    if (input.type === 'radio' && input.name) {
      if (processedRadioGroups.has(input.name)) {
        return;
      }
      processedRadioGroups.add(input.name);
    }

    // Try to find the label for this input
    let label = '';
    let placeholder = input.placeholder || '';

    // Special Method for Radio/Checkbox groups: Find fieldset legend or group label
    if ((input.type === 'radio' || input.type === 'checkbox') && !label) {
      const fieldset = input.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) {
          label = legend.textContent.trim();
        }
      }

      // Also try to find a common parent with role="group" or class containing "group"
      if (!label) {
        const groupParent = input.closest('[role="group"], [role="radiogroup"], .form-group, .question-group');
        if (groupParent) {
          // Find the first heading or label-like element in the group
          const groupLabel = groupParent.querySelector('h1, h2, h3, h4, h5, h6, legend, .question, .label');
          if (groupLabel && !groupLabel.contains(input)) {
            label = groupLabel.textContent.trim();
          }
        }
      }
    }

    // Method 0: Use aria-labelledby (for Google Forms and accessible forms)
    if (!label && input.getAttribute('aria-labelledby')) {
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      const labelIds = ariaLabelledBy.split(/\s+/);
      const labelTexts = labelIds
        .map(id => document.getElementById(id)?.textContent?.trim())
        .filter(text => text && text !== 'Your answer');

      if (labelTexts.length > 0) {
        label = labelTexts.join(' ');
      }
    }

    // Method 1: Find associated label element by 'for' attribute
    if (!label && input.id) {
      const labelElement = document.querySelector(`label[for="${input.id}"]`);
      if (labelElement) {
        label = labelElement.textContent.trim();
      }
    }

    // Method 2: Find parent label
    if (!label) {
      const parentLabel = input.closest('label');
      if (parentLabel) {
        // Remove the input's own value from the label text
        const clone = parentLabel.cloneNode(true);
        Array.from(clone.querySelectorAll('input, textarea, select')).forEach(el => el.remove());
        label = clone.textContent.trim();
      }
    }

    // Method 3: Look for nearby text (previous sibling)
    if (!label) {
      let prev = input.previousElementSibling;
      if (prev && prev.tagName.match(/^(LABEL|DIV|SPAN|P|H1|H2|H3|H4|H5|H6)$/)) {
        label = prev.textContent.trim();
      }
    }

    // Method 4: Look for parent's previous sibling
    if (!label) {
      const parent = input.parentElement;
      if (parent && parent.previousElementSibling) {
        const prevParent = parent.previousElementSibling;
        if (prevParent.tagName.match(/^(LABEL|DIV|SPAN|P|H1|H2|H3|H4|H5|H6)$/)) {
          label = prevParent.textContent.trim();
        }
      }
    }

    // Method 5: Use aria-label
    if (!label && input.getAttribute('aria-label')) {
      label = input.getAttribute('aria-label');
    }

    // Method 6: Use title attribute
    if (!label && input.getAttribute('title')) {
      label = input.getAttribute('title');
    }

    // Method 7: Use name attribute as fallback
    if (!label && input.name) {
      label = input.name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    }

    // Special handling for button-based selects
    let buttonCurrentValue = '';
    if (input.tagName === 'BUTTON' && (input.getAttribute('aria-haspopup') === 'listbox' || input.getAttribute('aria-haspopup') === 'true')) {
      // Extract current selection from button text
      buttonCurrentValue = input.textContent.trim();

      // For button selects, if no label found through standard methods,
      // look for a label-like element before the button
      if (!label) {
        const container = input.closest('[data-automation-id*="container"], .form-field, .field-wrapper, div[class*="field"]');
        if (container) {
          const labelElement = container.querySelector('label, .label, [class*="label"]');
          if (labelElement && !labelElement.contains(input)) {
            label = labelElement.textContent.trim();
          }
        }
      }
    }

    // Check if this field was already detected (has autofeel-id)
    let fieldId;
    let isNewField = false;

    if (input.dataset.autofeelId) {
      // Field already has an ID from previous detection
      fieldId = input.dataset.autofeelId;

      // Skip ONLY if this field is in the exclude list (already processed)
      if (excludeSet.has(fieldId)) {
        return;
      }

      isNewField = false;
    } else {
      // New field, assign a new sequential ID
      fieldId = `field_${validFieldIndex}`;
      input.dataset.autofeelId = fieldId;
      isNewField = true;
    }

    // Determine field type
    let fieldType;
    if (input.tagName === 'BUTTON' && (input.getAttribute('aria-haspopup') === 'listbox' || input.getAttribute('aria-haspopup') === 'true')) {
      fieldType = 'button-select';
    } else {
      fieldType = input.type || input.tagName.toLowerCase();
    }

    const fieldInfo = {
      id: fieldId,
      label: label,
      placeholder: placeholder,
      type: fieldType,
      value: input.value || buttonCurrentValue,  // For buttons, use button text as current value
      name: input.name
    };

    // CRITICAL: Skip fields already filled (check by composite key, survives DOM recreation)
    if (onlyUnfilled && label) {
      // Create composite key to uniquely identify field (handles duplicate labels)
      const fieldKey = `${label}||${input.name || ''}||${fieldType}`;
      if (filledFieldKeys.has(fieldKey)) {
        return;
      }
    }

    // For radio buttons, collect all options in the group
    if (input.type === 'radio' && input.name) {
      const radioGroup = document.querySelectorAll(`input[type="radio"][name="${input.name}"]`);
      const options = [];

      radioGroup.forEach((radio) => {
        // Try to find label for each radio option
        const optionLabel = findLabelForInput(radio);
        const optionValue = radio.value || optionLabel;
        if (optionLabel) {
          options.push({ label: optionLabel, value: optionValue });
        }
      });

      if (options.length > 0) {
        fieldInfo.options = options;
      }
    }

    // For select dropdowns, collect all options
    if (input.tagName.toLowerCase() === 'select') {
      const selectOptions = Array.from(input.options);
      const options = selectOptions
        .filter(opt => opt.value && opt.text) // Skip empty options
        .map(opt => ({ label: opt.text.trim(), value: opt.value }));

      if (options.length > 0) {
        fieldInfo.options = options;
      }
    }

    // For searchable selects and button-based selects, try to detect options
    // This requires opening the dropdown temporarily
    if (fieldInfo.type === 'button-select' ||
        input.dataset.uxiWidgetType === 'selectinput' ||
        (input.getAttribute('placeholder') === 'Search' && input.getAttribute('autocomplete') === 'off')) {

      // Note: We mark this field as needing dynamic option detection
      // Options will be detected when needed (to avoid slowing down initial detection)
      fieldInfo.isDynamicDropdown = true;
    }

    // Skip button-based selects without a meaningful label (likely navigation/action buttons, not form controls)
    if (fieldInfo.type === 'button-select' && (!label || label.length === 0)) {
      return;
    }

    // Skip fields with suspiciously long labels (likely navigation/header elements, not form fields)
    // Real form field labels are typically under 200 characters
    if (label && label.length > 200) {
      return;
    }

    // CRITICAL: Skip fields without labels (likely UI elements, not real form fields)
    // Exception: Allow text inputs without labels if they have placeholder or name
    if (!label || label.trim().length === 0) {
      const hasPlaceholder = placeholder && placeholder.trim().length > 0;
      const hasName = input.name && input.name.trim().length > 0;
      const isTextInput = fieldType === 'text' || fieldType === 'email' || fieldType === 'tel' ||
                         fieldType === 'url' || fieldType === 'number' || fieldType === 'textarea';

      // Allow text inputs with placeholder or name, but reject all others
      if (!(isTextInput && (hasPlaceholder || hasName))) {
        console.log(`[AutoFeel] Skipping field without label: type=${fieldType}, name=${input.name}, placeholder=${placeholder}`);
        return;
      }
    }

    // Skip radio buttons without name attribute (likely UI decorations, not form fields)
    if (input.type === 'radio' && (!input.name || input.name.trim().length === 0)) {
      console.log(`[AutoFeel] Skipping radio without name attribute (likely decoration)`);
      return;
    }

    fields.push(fieldInfo);

    // Only increment counter if we assigned a NEW ID
    if (isNewField) {
      validFieldIndex++;
    }
  });

  console.log(`[AutoFeel] Detected ${fields.length} fields (${onlyUnfilled ? 'unfilled only' : 'all'})`);
  return fields;
}
function findLabelForInput(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.textContent.trim();
  }

  const parentLabel = input.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  return '';
}

/**
 * Detect options from dynamic dropdown (searchable select, button-based select)
 * This function temporarily opens the dropdown to collect options
 * @param {string} fieldId - The field ID
 * @returns {Promise<Array>} - Array of {label, value} options
 */
async function detectDynamicDropdownOptions(fieldId) {
  const input = document.querySelector(`[data-autofeel-id="${fieldId}"]`);

  if (!input) {
    console.error(`[AutoFeel] Field ${fieldId} not found`);
    return [];
  }

  console.log(`[AutoFeel] Detecting options for dynamic dropdown: ${fieldId}`);

  try {
    // CRITICAL: Close ALL open dropdowns first to avoid detecting wrong options
    console.log(`[AutoFeel] Closing all open dropdowns before detecting options for ${fieldId}...`);

    // Method 1: Press Escape multiple times
    for (let i = 0; i < 3; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true
      }));
    }

    // Method 2: Click on document body to close any open menus
    document.body.click();

    // Method 3: Remove focus from any active element
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

    // Wait longer for dropdowns to close completely
    await new Promise(resolve => setTimeout(resolve, 600));

    // Verify no dropdowns are open
    const openMenus = document.querySelectorAll('[role="listbox"], [role="menu"]');
    console.log(`[AutoFeel] After cleanup: ${openMenus.length} dropdown(s) still visible`);

    // Open the dropdown
    if (input.tagName === 'INPUT') {
      input.focus();
      input.click();
      // Trigger events that might load options
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('focus', { bubbles: true }));
      input.dispatchEvent(new Event('click', { bubbles: true }));
    } else if (input.tagName === 'BUTTON') {
      input.focus();
      input.click();
      input.dispatchEvent(new Event('click', { bubbles: true }));
    }

    // Wait for dropdown to appear and options to load
    await new Promise(resolve => setTimeout(resolve, 800));

    // Find the listbox container for scrolling
    const listbox = document.querySelector('[role="listbox"]');

    // Collect all unique options (for virtual scrolling)
    const allOptions = new Map(); // Use Map to track unique options by text

    // Helper function to collect currently visible options
    function collectVisibleOptions() {
      let optionEls = [];

      // Try Workday-style options first
      optionEls = Array.from(document.querySelectorAll('div[data-automation-id="promptOption"]'));

      // If no Workday options found, try standard ARIA listbox pattern
      if (optionEls.length === 0) {
        optionEls = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] > div, [role="listbox"] > li'));
      }

      // Filter to visible options only
      optionEls = optionEls.filter(opt => {
        const style = window.getComputedStyle(opt);
        return style.display !== 'none' && style.visibility !== 'hidden' && opt.offsetParent !== null;
      });

      // Add to allOptions map (deduplicate by text)
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
    console.log(`[AutoFeel] Initial options: ${initialCount}`);

    // Progressive scrolling to load all options (for virtual scrolling)
    if (listbox) {
      const scrollHeight = listbox.scrollHeight;
      const clientHeight = listbox.clientHeight;

      if (scrollHeight > clientHeight) {
        console.log(`[AutoFeel] Progressive scrolling to load all options...`);

        const scrollStep = clientHeight * 0.8; // Scroll 80% of visible height each time
        let currentScroll = 0;
        let stableCount = 0; // Track how many times count didn't change

        while (currentScroll < scrollHeight && stableCount < 3) {
          const previousCount = allOptions.size;

          // Scroll down
          currentScroll += scrollStep;
          listbox.scrollTop = currentScroll;

          // Wait for new options to render
          await new Promise(resolve => setTimeout(resolve, 200));

          // Collect newly visible options
          const visibleCount = collectVisibleOptions();
          const newCount = allOptions.size;

          console.log(`[AutoFeel] Scrolled to ${currentScroll}px: ${newCount} total options (${visibleCount} visible)`);

          // Check if we found new options
          if (newCount === previousCount) {
            stableCount++;
          } else {
            stableCount = 0; // Reset if we found new options
          }

          // Update scrollHeight in case it changed
          if (listbox.scrollHeight !== scrollHeight) {
            break; // Scroll height changed, likely loaded all
          }
        }

        // Scroll back to top
        listbox.scrollTop = 0;
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`[AutoFeel] Scrolling complete. Found ${allOptions.size} unique options (initial: ${initialCount})`);
      }
    }

    // Convert Map to array of elements
    const optionElements = Array.from(allOptions.values());

    // Extract option data with hierarchical structure
    const options = [];

    for (let index = 0; index < optionElements.length; index++) {
      const opt = optionElements[index];
      const label = opt.textContent.trim() ||
                    opt.getAttribute('data-automation-label') ||
                    opt.getAttribute('aria-label') ||
                    opt.getAttribute('value') ||
                    `Option ${index + 1}`;

      const value = opt.getAttribute('value') || label;

      const optionData = { label, value };

      // ALWAYS try to detect children by hovering, regardless of ARIA attributes
      // This is more reliable for complex dropdown systems
      try {
        // Store initial option count
        const initialOptionCount = allOptions.size;

        // Hover over the option to potentially reveal submenu
        opt.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        opt.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        // Wait for submenu to appear (if any)
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check if new options appeared (indicating a submenu)
        const currentOptions = Array.from(document.querySelectorAll('[role="option"]'))
          .filter(subOpt => {
            const style = window.getComputedStyle(subOpt);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   subOpt.offsetParent !== null &&
                   !allOptions.has(subOpt.textContent.trim()); // Exclude parent options
          });

        // If new options appeared, they're children of this option
        if (currentOptions.length > initialOptionCount) {
          const children = currentOptions
            .filter(subOpt => !allOptions.has(subOpt.textContent.trim()))
            .map(subOpt => ({
              label: subOpt.textContent.trim(),
              value: subOpt.getAttribute('value') || subOpt.textContent.trim()
            }));

          if (children.length > 0) {
            optionData.children = children;
            console.log(`[AutoFeel] ✨ Found ${children.length} submenu options under "${label}":`,
                        children.map(c => c.label).join(', '));
          }
        }

        // Move mouse away to close submenu
        opt.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (subError) {
        console.warn(`[AutoFeel] Error detecting submenu for "${label}":`, subError);
      }

      options.push(optionData);
    }

    console.log(`[AutoFeel] Found ${options.length} options for ${fieldId} (including hierarchical)`);

    // Log hierarchical structure
    const hierarchicalCount = options.filter(o => o.children).length;
    if (hierarchicalCount > 0) {
      console.log(`[AutoFeel] ${hierarchicalCount} options have submenus`);
    }

    // ✨ Keep dropdown open - don't close it
    // The dropdown will be used immediately for filling, so no need to close and reopen
    console.log(`[AutoFeel] Keeping dropdown open for immediate filling`);

    return options;

  } catch (error) {
    console.error(`[AutoFeel] Error detecting dropdown options:`, error);

    // Try to close dropdown anyway
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      input.blur();
    } catch (e) {
      // Ignore
    }

    return [];
  }
}
