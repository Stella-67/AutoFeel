// Field tracking state and detectFormFields function now in src/content/field-detector.js

function getVisibleText() {
  // Special handling for different platforms
  const hostname = window.location.hostname;

  if (hostname.includes('docs.google.com')) {
    return getGoogleDocsText();
  }

  if (hostname.includes('notion.so') || hostname.includes('notion.site')) {
    return getNotionText();
  }

  if (hostname.includes('medium.com')) {
    return getMediumText();
  }

  const excludeTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'];

  function extractText(element) {
    if (excludeTags.includes(element.tagName)) {
      return '';
    }

    if (element.offsetParent === null && element.tagName !== 'BODY') {
      return '';
    }

    let text = '';

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent.trim();
        if (nodeText) {
          text += nodeText + ' ';
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        text += extractText(node);
      }
    }

    return text;
  }

  let fullText = extractText(document.body);
  fullText = fullText.replace(/\s+/g, ' ').trim();

  return fullText;
}

// Wait for Google Docs to load content
async function waitForGoogleDocsContent(timeout = 15000) {
  const startTime = Date.now();

  // Check if content exists with various methods
  const checkContent = () => {
    // Priority 1: Check if internal data is available (fastest!)
    if (typeof window.DOCS_modelChunk !== 'undefined' && window.DOCS_modelChunk) {
      console.log('[AutoFeel] Found DOCS_modelChunk - content ready!');
      return true;
    }

    // Priority 2: Check for scripts with DOCS_modelChunk
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      if (script.textContent && script.textContent.includes('DOCS_modelChunk')) {
        console.log('[AutoFeel] Found script with DOCS_modelChunk - content ready!');
        return true;
      }
    }

    // Priority 3: Check DOM selectors (for older Google Docs)
    const contentSelectors = [
      '.kix-paragraphrenderer',
      '.kix-page-content-wrapper',
      '.kix-paginateddocumentplugin'
    ];

    for (const selector of contentSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const hasContent = Array.from(elements).some(el => {
          const text = el.textContent.trim();
          return text.length > 50;
        });
        if (hasContent) {
          console.log(`[AutoFeel] Content found with selector: ${selector}`);
          return true;
        }
      }
    }

    return false;
  };

  // Check if content already exists
  if (checkContent()) {
    return true;
  }

  console.log('[AutoFeel] Waiting for Google Docs content to load...');

  // Wait for content to appear using MutationObserver
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (checkContent()) {
        observer.disconnect();
        resolve(true);
        return;
      }

      // Timeout check
      if (Date.now() - startTime > timeout) {
        console.log('[AutoFeel] Timeout waiting for Google Docs content');
        observer.disconnect();
        resolve(false);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Also set a timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeout);
  });
}

function getGoogleDocsText() {
  console.log('[AutoFeel] Extracting Google Docs content...');

  // Method 1: Access Google Docs internal data (works with Canvas rendering)
  try {
    // Try window.DOCS_modelChunk (available after page load)
    if (typeof window.DOCS_modelChunk !== 'undefined' && window.DOCS_modelChunk) {
      const chunk = window.DOCS_modelChunk;
      if (chunk && chunk.chunk) {
        let text = '';
        chunk.chunk.forEach(item => {
          if (item.ty === 'is' && item.s) {
            text += item.s + '\n';
          }
        });
        if (text.length > 100) {
          console.log(`[AutoFeel] Extracted ${text.length} characters from internal data`);
          return text.trim();
        }
      }
    }

    // Try extracting from script tags (fallback)
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent;
      if (content && content.includes('DOCS_modelChunk')) {
        const match = content.match(/DOCS_modelChunk\s*=\s*(\{[\s\S]*?\});/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            if (data && data.chunk) {
              let text = '';
              data.chunk.forEach(item => {
                if (item.ty === 'is' && item.s) {
                  text += item.s + '\n';
                }
              });
              if (text.length > 100) {
                console.log(`[AutoFeel] Extracted ${text.length} characters from script data`);
                return text.trim();
              }
            }
          } catch (e) {
            console.log('[AutoFeel] Failed to parse script data:', e.message);
          }
        }
      }
    }
  } catch (e) {
    console.log('[AutoFeel] Internal data extraction failed:', e.message);
  }

  // Method 2: Try DOM-based extraction (for older Google Docs without Canvas)
  const paragraphs = document.querySelectorAll('.kix-paragraphrenderer');
  if (paragraphs.length > 0) {
    let text = Array.from(paragraphs)
      .map(p => {
        const lineBlocks = p.querySelectorAll('.kix-lineview-text-block');
        if (lineBlocks.length > 0) {
          return Array.from(lineBlocks).map(block => block.textContent || '').join('');
        }
        return p.textContent || '';
      })
      .filter(t => t.trim().length > 0)
      .join('\n')
      .trim();

    if (text.length > 100) {
      console.log(`[AutoFeel] Extracted ${text.length} characters from DOM elements`);
      return text;
    }
  }

  console.log('[AutoFeel] Unable to extract Google Docs content');
  return 'Unable to extract Google Docs content. Please try again.';
}

function getNotionText() {
  const mainContent = document.querySelector('.notion-page-content, [data-block-id]');
  if (mainContent) {
    return (mainContent.innerText || mainContent.textContent || '').replace(/\s+/g, ' ').trim();
  }

  return removeUIElements(document.body, [
    '.notion-topbar',
    '.notion-sidebar',
    '[role="navigation"]'
  ]);
}

function getMediumText() {
  const article = document.querySelector('article, .meteredContent, [role="main"]');
  if (article) {
    return (article.innerText || article.textContent || '').replace(/\s+/g, ' ').trim();
  }

  return removeUIElements(document.body, [
    'header',
    'nav',
    'footer',
    '[role="navigation"]'
  ]);
}

function removeUIElements(element, selectors) {
  const clone = element.cloneNode(true);

  selectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  let text = clone.textContent || '';
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

function getPageMetadata() {
  // Enhanced metadata collection for Perception Agent
  const inputs = document.querySelectorAll('input, textarea, select');
  const textareas = document.querySelectorAll('textarea');
  const editableElements = document.querySelectorAll('[contenteditable="true"]');
  const codeBlocks = document.querySelectorAll('pre, code, .highlight');

  return {
    title: document.title,
    url: window.location.href,
    timestamp: new Date().toISOString(),

    // Form detection
    formFieldCount: inputs.length,
    hasTextarea: textareas.length > 0,
    textareaCount: textareas.length,

    // Editing detection
    isContentEditable: editableElements.length > 0,
    editableElementCount: editableElements.length,
    isEditable: textareas.length > 0 || editableElements.length > 0,

    // Content type indicators
    hasCodeBlocks: codeBlocks.length > 0,
    codeBlockCount: codeBlocks.length,

    // Page structure
    headingCount: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
    linkCount: document.querySelectorAll('a').length,
    imageCount: document.querySelectorAll('img').length,

    // Word count estimate (will be updated with actual content)
    word_count: 0 // Will be set by caller
  };
}

async function getPageContent() {
  // Check if user has selected text
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText && selectedText.length > 0) {
    // User has selected text, use that instead
    console.log('[AutoFeel] Using user selection:', selectedText.length, 'characters');

    const metadata = getPageMetadata();
    const wordCount = selectedText.split(/\s+/).length;
    metadata.source = 'selection';
    metadata.selectionLength = selectedText.length;
    metadata.word_count = wordCount;

    return {
      text: selectedText,
      html: '',
      markdown: selectedText,
      metadata: metadata,
      wordCount: wordCount,
      source: 'selection'
    };
  }

  // No selection, get full page content
  console.log('[AutoFeel] No selection, getting full page content');

  // Wait for Google Docs content to load if on Google Docs
  const hostname = window.location.hostname;
  if (hostname.includes('docs.google.com')) {
    const loaded = await waitForGoogleDocsContent();
    if (!loaded) {
      console.warn('Google Docs content did not load within timeout');
    }
  }

  const visibleText = getVisibleText();
  const structuredContent = getStructuredContent();
  const metadata = getPageMetadata();
  const wordCount = visibleText.split(/\s+/).length;
  metadata.source = 'full_page';
  metadata.word_count = wordCount;

  return {
    text: visibleText,
    html: structuredContent.html,
    markdown: structuredContent.markdown,
    metadata: metadata,
    wordCount: wordCount,
    source: 'full_page'
  };
}

function getStructuredContent() {
  const hostname = window.location.hostname;

  // Special handling for different platforms
  if (hostname.includes('docs.google.com')) {
    return getGoogleDocsStructured();
  }

  if (hostname.includes('notion.so') || hostname.includes('notion.site')) {
    return getNotionStructured();
  }

  // General structured content extraction
  return getGeneralStructured();
}

function getGoogleDocsStructured() {
  // Try to get paragraph renderers which contain the actual document content
  const paragraphs = document.querySelectorAll('.kix-paragraphrenderer');

  if (paragraphs.length === 0) {
    return { html: '', markdown: '' };
  }

  let html = '';
  let markdown = '';

  paragraphs.forEach(para => {
    // Get text from line blocks to avoid script content
    const lineBlocks = para.querySelectorAll('.kix-lineview-text-block');
    let text = '';

    if (lineBlocks.length > 0) {
      text = Array.from(lineBlocks)
        .map(block => block.textContent || '')
        .join('')
        .trim();
    } else {
      text = para.textContent.trim();
    }

    if (text) {
      // Try to detect heading level based on font size or style
      const computedStyle = window.getComputedStyle(para);
      const fontSize = parseFloat(computedStyle.fontSize);
      const fontWeight = computedStyle.fontWeight;

      // Detect headings by size and weight
      if (fontSize > 20 || (fontSize > 18 && fontWeight === 'bold')) {
        html += `<h1>${text}</h1>\n`;
        markdown += `# ${text}\n\n`;
      } else if (fontSize > 16 || (fontSize > 14 && fontWeight === 'bold')) {
        html += `<h2>${text}</h2>\n`;
        markdown += `## ${text}\n\n`;
      } else {
        html += `<p>${text}</p>\n`;
        markdown += `${text}\n\n`;
      }
    }
  });

  return { html, markdown };
}

function getNotionStructured() {
  const mainContent = document.querySelector('.notion-page-content');

  if (!mainContent) {
    return { html: '', markdown: '' };
  }

  const clone = mainContent.cloneNode(true);

  // Remove UI elements
  const uiElements = clone.querySelectorAll('.notion-topbar, .notion-sidebar, [role="navigation"]');
  uiElements.forEach(el => el.remove());

  return {
    html: clone.innerHTML,
    markdown: htmlToMarkdown(clone)
  };
}

function getGeneralStructured() {
  // Find main content area
  const mainContent = findMainContent();

  if (!mainContent) {
    return { html: '', markdown: '' };
  }

  const clone = mainContent.cloneNode(true);

  // Remove common UI elements
  const uiSelectors = [
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
    '.sidebar', '.menu', '.navigation', '.advertisement', '.ad'
  ];

  uiSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  // Clean up scripts and styles
  const excludeElements = clone.querySelectorAll('script, style, noscript, iframe');
  excludeElements.forEach(el => el.remove());

  return {
    html: clone.innerHTML,
    markdown: htmlToMarkdown(clone)
  };
}

function findMainContent() {
  // Try to find the main content container
  const candidates = [
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.querySelector('article'),
    document.querySelector('.main-content'),
    document.querySelector('#main-content'),
    document.querySelector('.content'),
    document.querySelector('#content')
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.textContent.trim().length > 100) {
      return candidate;
    }
  }

  // Fallback to body
  return document.body;
}

function htmlToMarkdown(element) {
  let markdown = '';

  function traverse(node, indent = '') {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        markdown += text + ' ';
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = node.tagName.toLowerCase();

    switch (tag) {
      case 'h1':
        markdown += '\n# ' + node.textContent.trim() + '\n\n';
        break;
      case 'h2':
        markdown += '\n## ' + node.textContent.trim() + '\n\n';
        break;
      case 'h3':
        markdown += '\n### ' + node.textContent.trim() + '\n\n';
        break;
      case 'h4':
        markdown += '\n#### ' + node.textContent.trim() + '\n\n';
        break;
      case 'h5':
        markdown += '\n##### ' + node.textContent.trim() + '\n\n';
        break;
      case 'h6':
        markdown += '\n###### ' + node.textContent.trim() + '\n\n';
        break;
      case 'p':
        markdown += node.textContent.trim() + '\n\n';
        break;
      case 'br':
        markdown += '\n';
        break;
      case 'strong':
      case 'b':
        markdown += '**' + node.textContent.trim() + '**';
        break;
      case 'em':
      case 'i':
        markdown += '*' + node.textContent.trim() + '*';
        break;
      case 'code':
        markdown += '`' + node.textContent.trim() + '`';
        break;
      case 'pre':
        markdown += '\n```\n' + node.textContent.trim() + '\n```\n\n';
        break;
      case 'a':
        const href = node.getAttribute('href');
        markdown += '[' + node.textContent.trim() + '](' + href + ')';
        break;
      case 'ul':
      case 'ol':
        node.childNodes.forEach((child, index) => {
          if (child.tagName && child.tagName.toLowerCase() === 'li') {
            const prefix = tag === 'ul' ? '-' : `${index + 1}.`;
            markdown += `${indent}${prefix} ${child.textContent.trim()}\n`;
          }
        });
        markdown += '\n';
        break;
      case 'blockquote':
        const lines = node.textContent.trim().split('\n');
        lines.forEach(line => {
          markdown += '> ' + line + '\n';
        });
        markdown += '\n';
        break;
      default:
        node.childNodes.forEach(child => traverse(child, indent));
        break;
    }
  }

  traverse(element);
  return markdown.trim();
}

// detectFormFields and findLabelForInput are now in src/content/field-detector.js

async function fillSingleField(fieldId, fieldData) {
  const input = document.querySelector(`[data-autofeel-id="${fieldId}"]`);

  if (!input) {
    console.error(`[AutoFeel] Field ${fieldId} not found`);
    return;
  }

  // Extract answer and explanation
  const answer = typeof fieldData === 'string' ? fieldData : fieldData.answer;
  const explanation = typeof fieldData === 'object' ? fieldData.explanation : null;

  // Get field type info first
  const fieldType = input.tagName.toLowerCase();
  const inputType = input.type ? input.type.toLowerCase() : '';

  // Mark field as filled IMMEDIATELY to prevent re-detection
  input.dataset.autofeelFilled = 'true';
  if (inputType === 'radio' && input.name) {
    const radioGroup = document.querySelectorAll(`input[type="radio"][name="${input.name}"]`);
    radioGroup.forEach(radio => radio.dataset.autofeelFilled = 'true');
  }
  console.log(`[AutoFeel] ✅ Marked field ${fieldId} as filled (before filling)`);

  // Handle empty answers with hint
  if (!answer || answer.trim() === '') {
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

  if (isSearchableSelect) {
    await fillSearchableSelect(input, answer);
  } else if (isButtonSelect) {
    await fillButtonSelect(input, answer);
  } else if (fieldType === 'select') {
    await fillSelectField(input, answer);
  } else if (inputType === 'checkbox') {
    await fillCheckboxField(input, answer);
  } else if (inputType === 'radio') {
    await fillRadioField(input, answer);
  } else {
    // Text input, textarea, etc.
    await fillFieldWithAnimation(input, answer);
  }
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
  console.log(`[AutoFeel] 🔍 Level ${depth}: Looking for "${currentAnswer}"`);

  // Focus and click the trigger to open dropdown
  if (trigger.tagName === 'INPUT') {
    trigger.focus();
    trigger.click();

    // Type search text for input-based dropdowns
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(trigger, currentAnswer);

    // Trigger events
    trigger.dispatchEvent(new Event('input', { bubbles: true }));
    trigger.dispatchEvent(new Event('change', { bubbles: true }));
    trigger.dispatchEvent(new Event('keydown', { bubbles: true }));
    trigger.dispatchEvent(new Event('keyup', { bubbles: true }));
  } else if (trigger.tagName === 'BUTTON') {
    // For button-based selects, just focus and click (no typing)
    trigger.focus();
    trigger.click();
    trigger.dispatchEvent(new Event('click', { bubbles: true }));
  } else {
    // For option elements (nested menus)
    trigger.click();
  }

  // Wait for dropdown to appear
  await new Promise(resolve => setTimeout(resolve, 500));

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

  if (options.length === 0) {
    console.warn(`[AutoFeel] ⚠️ No visible options found at level ${depth}`);
    return false;
  }

  console.log(`[AutoFeel] Found ${options.length} visible options`);

  // Find matching option
  const matchedOption = findMatchingOption(options, currentAnswer);

  if (!matchedOption) {
    console.warn(`[AutoFeel] ⚠️ No match found for "${currentAnswer}"`);
    return false;
  }

  // Highlight the matched option
  matchedOption.style.transition = 'all 0.2s ease';
  matchedOption.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
  matchedOption.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  await new Promise(resolve => setTimeout(resolve, 200));

  console.log(`[AutoFeel] ✓ Level ${depth}: Matched "${matchedOption.textContent.trim()}"`);

  // Check if this option has a submenu (indicated by aria attributes or structure)
  const hasSubmenu =
    matchedOption.getAttribute('aria-haspopup') === 'true' ||
    matchedOption.getAttribute('aria-expanded') !== null ||
    matchedOption.querySelector('[aria-haspopup="true"]') !== null;

  const isLastInPath = depth === answerPath.length - 1;

  if (hasSubmenu && !isLastInPath) {
    // This is a parent option with submenu, and we have more path segments
    console.log(`[AutoFeel] 📂 Has submenu, continuing to level ${depth + 1}`);

    // Hover or click to expand submenu (don't finalize selection yet)
    matchedOption.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 300));

    // Recursively select from submenu
    return await selectFromDropdown(matchedOption, answerPath, depth + 1);
  } else {
    // This is a leaf option or the last in our path, finalize selection
    console.log(`[AutoFeel] 🎯 Leaf option or end of path, finalizing selection`);

    matchedOption.click();
    await new Promise(resolve => setTimeout(resolve, 300));

    // If we haven't reached the end of path but there's no submenu,
    // the remaining segments might be in a cascading dropdown (handled by dynamic detection)
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
    console.log(`[AutoFeel] ✓ Selected option ${answerNum}: "${matchedOption.text}"`);
  } else {
    console.error(`[AutoFeel] ❌ Invalid answer "${answerTrimmed}" - expected number 1-${options.length}`);
  }

  if (matchedOption) {
    select.value = matchedOption.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`[AutoFeel] ✓ Selected option value: "${matchedOption.value}"`);
  } else {
    console.warn(`[AutoFeel] ⚠️ No matching option found for: "${answer}"`);
    console.warn(`[AutoFeel] Available options (${options.length}):`, options.map((o, i) => `${i+1}. ${o.text}`).join(', '));
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

  console.log(`[AutoFeel] ✓ Checkbox ${shouldCheck ? 'checked' : 'unchecked'}`);

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
    const label = findLabelForInput(matchedRadio);
    console.log(`[AutoFeel] ✓ Selected radio option ${answerNum}: "${label || matchedRadio.value}"`);
  } else {
    console.error(`[AutoFeel] ❌ Invalid answer "${answerTrimmed}" - expected number 1-${radioGroup.length}`);
    console.error(`[AutoFeel] Available radio options (${radioGroup.length}):`,
      Array.from(radioGroup).map((r, i) => `${i+1}. ${findLabelForInput(r) || r.value}`).join(', '));
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

    console.log(`[AutoFeel] ✓ Selected radio: "${answer}"`);

    await new Promise(resolve => setTimeout(resolve, 400));

    // Fade out animation
    matchedRadio.parentElement.style.outline = '';
  } else {
    console.warn(`[AutoFeel] ⚠️ No matching radio found for: "${answer}"`);
  }
}

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
    console.log('[AutoFeel CS] 🗑️🗑️🗑️ CLEAR_FILLED_FIELDS received 🗑️🗑️🗑️');
    filledFieldKeys.clear();
    console.log('[AutoFeel CS] ✓ Cleared filled field tracking, size now:', filledFieldKeys.size);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'MARK_AS_FILLED') {
    // Mark field as filled to prevent re-detection
    console.log(`[AutoFeel CS] 🔵 MARK_AS_FILLED received:`, request.fieldId, 'label:', request.fieldLabel, 'name:', request.fieldName, 'type:', request.fieldType);

    // CRITICAL: Track by composite key (survives DOM recreation, handles duplicate labels)
    if (request.fieldLabel) {
      const fieldKey = `${request.fieldLabel}||${request.fieldName || ''}||${request.fieldType}`;
      filledFieldKeys.add(fieldKey);
      console.log(`[AutoFeel CS] ✅✅✅ MARKED "${request.fieldLabel}" (${request.fieldType}, name: ${request.fieldName || 'none'}) AS FILLED ✅✅✅`);
      console.log(`[AutoFeel CS] Key: "${fieldKey}"`);
      console.log(`[AutoFeel CS] filledFieldKeys now has ${filledFieldKeys.size} items:`, Array.from(filledFieldKeys));
    } else {
      console.error(`[AutoFeel CS] ❌ NO LABEL PROVIDED for ${request.fieldId}`);
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
      console.log(`[AutoFeel] ✓ Also marked DOM element ${request.fieldId}`);
    } else {
      console.warn(`[AutoFeel] ⚠️ Field ${request.fieldId} not found in DOM (but label tracked)`);
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

// Notification function is now defined in src/content/notifications.js
