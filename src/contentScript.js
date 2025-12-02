// Track filled fields by composite key: label||name||type (survives DOM recreation)
// Using composite key to handle multiple fields with same label
const filledFieldKeys = new Set();

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

function detectFormFields(excludeFieldIds = [], afterFieldId = null, onlyUnfilled = false) {
  const fields = [];
  const processedRadioGroups = new Set(); // Track processed radio groups
  const excludeSet = new Set(excludeFieldIds); // Convert to Set for fast lookup

  console.log('[AutoFeel Field Detection] Mode:', onlyUnfilled ? 'Only unfilled fields' : 'All fields');

  // Find all form fields (text inputs, textareas, selects, checkboxes, radios, button-based selects)
  let inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="date"], input[type="checkbox"], input[type="radio"], input:not([type]), textarea, select, button[aria-haspopup="listbox"], button[aria-haspopup="true"]'));

  // If afterFieldId is specified, only include fields that come after that field in DOM order
  if (afterFieldId) {
    const afterElement = document.querySelector(`[data-autofeel-id="${afterFieldId}"]`);
    if (afterElement) {
      console.log(`[AutoFeel Field Detection] 🔍 Detecting only fields after: ${afterFieldId}`);

      // Filter to only include elements that come after the reference element
      inputs = inputs.filter(input => {
        // Compare positions in the DOM
        const position = afterElement.compareDocumentPosition(input);
        // DOCUMENT_POSITION_FOLLOWING (4) means the input comes after afterElement
        return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
    }
  }

  console.log('='.repeat(80));
  console.log('[AutoFeel Field Detection] 🔍 STARTING FIELD DETECTION');
  if (afterFieldId) {
    console.log(`[AutoFeel Field Detection] 🔽 Only detecting fields BELOW: ${afterFieldId}`);
  }
  if (excludeFieldIds.length > 0) {
    console.log(`[AutoFeel Field Detection] 🔍 Excluding ${excludeFieldIds.length} already processed fields`);
  }
  console.log('='.repeat(80));
  console.log(`[AutoFeel Field Detection] Found ${inputs.length} total input elements`);
  console.log('');

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

  inputs.forEach((input, index) => {
    console.log(`[AutoFeel Field Detection] --- Processing input ${index} ---`);
    console.log('[AutoFeel Field Detection] Element:', input.tagName, input.type);
    console.log('[AutoFeel Field Detection] ID:', input.id || '(none)');
    console.log('[AutoFeel Field Detection] Name:', input.name || '(none)');
    console.log('[AutoFeel Field Detection] Placeholder:', input.placeholder || '(none)');

    // Skip hidden or disabled fields
    if (input.offsetParent === null || input.disabled || input.readOnly) {
      console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: hidden/disabled/readonly`);
      console.log('');
      return;
    }

    // Skip already filled fields (if onlyUnfilled mode)
    if (onlyUnfilled && input.dataset.autofeelFilled === 'true') {
      console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: already filled`);
      console.log('');
      return;
    }

    // Skip fields that are inside navigation/header elements (not real form fields)
    const isInNavigation = input.closest('nav, header, [role="navigation"], [role="banner"], [role="menubar"]');
    if (isInNavigation) {
      console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: field is inside navigation/header element`);
      console.log('');
      return;
    }

    // Special handling for radio buttons - group them by name
    if (input.type === 'radio' && input.name) {
      if (processedRadioGroups.has(input.name)) {
        console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: radio group "${input.name}" already processed`);
        console.log('');
        return;
      }
      processedRadioGroups.add(input.name);
      console.log(`[AutoFeel Field Detection] 📻 Processing radio group: ${input.name}`);
    }

    // Try to find the label for this input
    let label = '';
    let placeholder = input.placeholder || '';
    const debugMethods = [];

    // Special Method for Radio/Checkbox groups: Find fieldset legend or group label
    if ((input.type === 'radio' || input.type === 'checkbox') && !label) {
      const fieldset = input.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) {
          label = legend.textContent.trim();
          debugMethods.push(`Method Radio/Checkbox (fieldset > legend): "${label}"`);
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
            debugMethods.push(`Method Radio/Checkbox (group label): "${label}"`);
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
        debugMethods.push(`Method 0 (aria-labelledby="${ariaLabelledBy}"): "${label}"`);
      }
    }

    // Method 1: Find associated label element by 'for' attribute
    if (!label && input.id) {
      const labelElement = document.querySelector(`label[for="${input.id}"]`);
      if (labelElement) {
        label = labelElement.textContent.trim();
        debugMethods.push(`Method 1 (label[for="${input.id}"]): "${label}"`);
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
        debugMethods.push(`Method 2 (parent label): "${label}"`);
      }
    }

    // Method 3: Look for nearby text (previous sibling)
    if (!label) {
      let prev = input.previousElementSibling;
      if (prev && prev.tagName.match(/^(LABEL|DIV|SPAN|P|H1|H2|H3|H4|H5|H6)$/)) {
        label = prev.textContent.trim();
        debugMethods.push(`Method 3 (prev sibling ${prev.tagName}): "${label}"`);
      }
    }

    // Method 4: Look for parent's previous sibling
    if (!label) {
      const parent = input.parentElement;
      if (parent && parent.previousElementSibling) {
        const prevParent = parent.previousElementSibling;
        if (prevParent.tagName.match(/^(LABEL|DIV|SPAN|P|H1|H2|H3|H4|H5|H6)$/)) {
          label = prevParent.textContent.trim();
          debugMethods.push(`Method 4 (parent's prev sibling ${prevParent.tagName}): "${label}"`);
        }
      }
    }

    // Method 5: Use aria-label
    if (!label && input.getAttribute('aria-label')) {
      label = input.getAttribute('aria-label');
      debugMethods.push(`Method 5 (aria-label): "${label}"`);
    }

    // Method 6: Use title attribute
    if (!label && input.getAttribute('title')) {
      label = input.getAttribute('title');
      debugMethods.push(`Method 6 (title): "${label}"`);
    }

    // Method 7: Use name attribute as fallback
    if (!label && input.name) {
      label = input.name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
      debugMethods.push(`Method 7 (name attribute): "${label}"`);
    }

    // Special handling for button-based selects
    let buttonCurrentValue = '';
    if (input.tagName === 'BUTTON' && (input.getAttribute('aria-haspopup') === 'listbox' || input.getAttribute('aria-haspopup') === 'true')) {
      // Extract current selection from button text
      buttonCurrentValue = input.textContent.trim();
      debugMethods.push(`Button-based select detected, current value: "${buttonCurrentValue}"`);

      // For button selects, if no label found through standard methods,
      // look for a label-like element before the button
      if (!label) {
        const container = input.closest('[data-automation-id*="container"], .form-field, .field-wrapper, div[class*="field"]');
        if (container) {
          const labelElement = container.querySelector('label, .label, [class*="label"]');
          if (labelElement && !labelElement.contains(input)) {
            label = labelElement.textContent.trim();
            debugMethods.push(`Method Button (container label): "${label}"`);
          }
        }
      }
    }

    console.log('[AutoFeel Field Detection] Label detection methods tried:');
    if (debugMethods.length > 0) {
      debugMethods.forEach(method => console.log('  ✓', method));
    } else {
      console.log('  ✗ No label found by any method');
      console.log('');
      console.log('[AutoFeel Field Detection] 🔍 HTML STRUCTURE DEBUG:');

      // Show the input's parent hierarchy
      let parent = input.parentElement;
      let depth = 0;
      console.log('  Parent hierarchy:');
      while (parent && depth < 3) {
        const parentInfo = {
          tag: parent.tagName,
          id: parent.id || '(none)',
          class: parent.className || '(none)',
          text: parent.textContent?.substring(0, 100).trim() || '(none)'
        };
        console.log(`    Level ${depth + 1}:`, parentInfo);
        parent = parent.parentElement;
        depth++;
      }

      // Show siblings
      console.log('  Siblings:');
      const siblings = Array.from(input.parentElement?.children || []);
      siblings.forEach((sibling, idx) => {
        if (sibling === input) {
          console.log(`    [${idx}] >>> THIS INPUT <<<`);
        } else {
          console.log(`    [${idx}] ${sibling.tagName}:`, sibling.textContent?.substring(0, 50).trim() || '(empty)');
        }
      });

      // Show the actual HTML around this input
      console.log('  HTML snippet (parent element):');
      const parentHTML = input.parentElement?.outerHTML.substring(0, 500) || '(none)';
      console.log(`    ${parentHTML}...`);
    }

    // Check if this field was already detected (has autofeel-id)
    let fieldId;
    let isNewField = false;

    if (input.dataset.autofeelId) {
      // Field already has an ID from previous detection
      fieldId = input.dataset.autofeelId;

      // Skip ONLY if this field is in the exclude list (already processed)
      if (excludeSet.has(fieldId)) {
        console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: already processed (${fieldId})`);
        console.log('');
        return;
      }

      // Field has ID but not processed yet - include it in detection
      console.log(`[AutoFeel Field Detection] ✓ Field with existing ID: ${fieldId}`);
      isNewField = false;
    } else {
      // New field, assign a new sequential ID
      fieldId = `field_${validFieldIndex}`;
      input.dataset.autofeelId = fieldId;
      isNewField = true;
      console.log(`[AutoFeel Field Detection] 🆕 New field detected: ${fieldId}`);
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
      console.log(`[AutoFeel CS] 🔍 Checking if field is filled. Key: "${fieldKey}", filledFieldKeys size: ${filledFieldKeys.size}`);
      if (filledFieldKeys.has(fieldKey)) {
        console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: "${label}" (${fieldType}, name: ${input.name || 'none'}) already filled`);
        console.log('');
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
        console.log(`[AutoFeel Field Detection] 📻 Radio group has ${options.length} options:`, options.map(o => o.label).join(', '));
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
        console.log(`[AutoFeel Field Detection] 📋 Select has ${options.length} options:`, options.map(o => o.label).join(', '));
      }
    }

    // For searchable select (Workday-style), try to extract options
    const isSearchableSelect =
      input.dataset.uxiWidgetType === 'selectinput' ||
      (input.getAttribute('placeholder') === 'Search' && input.getAttribute('autocomplete') === 'off');

    if (isSearchableSelect) {
      console.log('[AutoFeel Field Detection] 🔍 Detected searchable select, attempting to extract options...');

      // Check if options are already visible (previously opened)
      let optionElements = Array.from(document.querySelectorAll('[data-automation-id="promptOption"]'));

      if (optionElements.length > 0) {
        const options = optionElements
          .map(opt => ({
            label: opt.textContent.trim(),
            value: opt.getAttribute('data-automation-label') || opt.textContent.trim()
          }))
          .filter(opt => opt.label.length > 0);

        if (options.length > 0) {
          fieldInfo.options = options;
          console.log(`[AutoFeel Field Detection] 📋 Searchable select has ${options.length} visible options:`, options.map(o => o.label).join(', '));
        }
      } else {
        console.log('[AutoFeel Field Detection] ⚠️ No visible options found for searchable select (may need to click to expand)');
        console.log('[AutoFeel Field Detection] Note: This field will be treated as text input without option constraints');
      }
    }

    // Skip button-based selects without a meaningful label (likely navigation/action buttons, not form controls)
    if (fieldInfo.type === 'button-select' && (!label || label.length === 0)) {
      console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: button-based select without label (likely not a form field)`);
      console.log('');
      return;
    }

    // Skip fields with suspiciously long labels (likely navigation/header elements, not form fields)
    // Real form field labels are typically under 200 characters
    if (label && label.length > 200) {
      console.log(`[AutoFeel Field Detection] ⏭️ SKIPPED: label too long (${label.length} chars, likely not a form field)`);
      console.log(`[AutoFeel Field Detection] Label preview: "${label.substring(0, 100)}..."`);
      console.log('');
      return;
    }

    fields.push(fieldInfo);

    console.log(`[AutoFeel Field Detection] ✅ FIELD ADDED as ${fieldId}`);
    console.log(`[AutoFeel Field Detection] Final field info:`, {
      label: label || '(empty)',
      placeholder: placeholder || '(empty)',
      type: fieldInfo.type,
      name: input.name || '(empty)'
    });
    console.log('');

    // Only increment counter if we assigned a NEW ID
    if (isNewField) {
      validFieldIndex++;
    }
  });

  console.log('='.repeat(80));
  console.log(`[AutoFeel Field Detection] ✅ DETECTION COMPLETE: ${fields.length} fields found`);
  console.log('='.repeat(80));
  console.log('[AutoFeel Field Detection] Summary:');
  fields.forEach((field) => {
    const question = field.label || field.placeholder || field.name || '(NO QUESTION FOUND!)';
    console.log(`  ${field.id}: "${question}"`);
  });
  console.log('');
  return fields;
}

async function fillSingleField(fieldId, fieldData) {
  console.log(`[AutoFeel] 🚀🚀🚀 fillSingleField CALLED for ${fieldId} 🚀🚀🚀`);
  console.log(`[AutoFeel] fieldData:`, fieldData);

  const input = document.querySelector(`[data-autofeel-id="${fieldId}"]`);

  if (!input) {
    console.warn(`[AutoFeel] ❌ Field ${fieldId} not found in DOM`);
    return;
  }

  console.log(`[AutoFeel] ✓ Found input element:`, input.tagName, input.type);

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

async function showEmptyFieldHint(input, fieldId, explanation) {
  console.log(`[AutoFeel] Showing hint for ${fieldId} (empty answer)`);

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

  console.log(`[AutoFeel] ✓ Filled field with: "${answer.substring(0, 50)}${answer.length > 50 ? '...' : ''}"`);
}

async function fillSearchableSelect(input, answer) {
  console.log(`[AutoFeel] Filling searchable select with: "${answer}"`);

  // Parse answer - support hierarchical paths like "Government > Federal > Defense"
  const answerPath = answer.split('>').map(s => s.trim());
  console.log(`[AutoFeel] Answer path:`, answerPath);

  // Scroll to field
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Start recursive selection
  const result = await selectFromDropdown(input, answerPath, 0);

  if (result) {
    console.log(`[AutoFeel] ✓ Successfully selected: "${answer}"`);
  } else {
    console.warn(`[AutoFeel] ⚠️ Failed to select: "${answer}"`);
  }
}

async function fillButtonSelect(button, answer) {
  console.log(`[AutoFeel] Filling button-based select with: "${answer}"`);

  // Parse answer - support hierarchical paths like "Government > Federal > Defense"
  const answerPath = answer.split('>').map(s => s.trim());
  console.log(`[AutoFeel] Answer path:`, answerPath);

  // Scroll to button
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Start recursive selection using the button as trigger
  const result = await selectFromDropdown(button, answerPath, 0);

  if (result) {
    console.log(`[AutoFeel] ✓ Successfully selected: "${answer}"`);
  } else {
    console.warn(`[AutoFeel] ⚠️ Failed to select: "${answer}"`);
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

  // Try to find matching option
  const options = Array.from(select.options);
  const answerTrimmed = answer.trim();
  const answerLower = answerTrimmed.toLowerCase();

  let matchedOption = null;
  let matchMethod = '';

  // Priority 1: Check if answer is a number (option index) - THIS SHOULD BE THE PRIMARY METHOD
  const answerNum = parseInt(answerTrimmed);
  if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= options.length) {
    matchedOption = options[answerNum - 1]; // Convert 1-based to 0-based index
    matchMethod = `index ${answerNum}`;
    console.log(`[AutoFeel] ✓ Matched by ${matchMethod}: "${matchedOption.text}"`);
  }

  // Priority 2: Try exact text match (fallback for old data or manual input)
  if (!matchedOption) {
    matchedOption = options.find(opt => opt.text.toLowerCase().trim() === answerLower);
    if (matchedOption) {
      matchMethod = 'exact text match';
      console.log(`[AutoFeel] ✓ Matched by ${matchMethod}: "${matchedOption.text}"`);
    }
  }

  // Priority 3: Try partial match (fallback for fuzzy matching)
  if (!matchedOption) {
    matchedOption = options.find(opt =>
      opt.text.toLowerCase().includes(answerLower) ||
      answerLower.includes(opt.text.toLowerCase().trim())
    );
    if (matchedOption) {
      matchMethod = 'partial text match';
      console.log(`[AutoFeel] ⚠️ Matched by ${matchMethod}: "${matchedOption.text}" (LLM should return index instead)`);
    }
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
  const answerLower = answerTrimmed.toLowerCase();
  let matchedRadio = null;
  let matchMethod = '';

  // Priority 1: Check if answer is a number (option index) - THIS SHOULD BE THE PRIMARY METHOD
  const answerNum = parseInt(answerTrimmed);
  if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= radioGroup.length) {
    matchedRadio = radioGroup[answerNum - 1]; // Convert 1-based to 0-based index
    const label = findLabelForInput(matchedRadio);
    matchMethod = `index ${answerNum}`;
    console.log(`[AutoFeel] ✓ Matched radio by ${matchMethod}: "${label || matchedRadio.value}"`);
  }

  // Priority 2: Try to find matching radio by label text (fallback)
  if (!matchedRadio) {
    for (const r of radioGroup) {
      const label = findLabelForInput(r);
      if (label && label.toLowerCase().includes(answerLower)) {
        matchedRadio = r;
        matchMethod = 'label text match';
        console.log(`[AutoFeel] ⚠️ Matched radio by ${matchMethod}: "${label}" (LLM should return index instead)`);
        break;
      }
    }
  }

  // Priority 3: If no match by label, try by value (fallback)
  if (!matchedRadio) {
    matchedRadio = Array.from(radioGroup).find(r =>
      r.value.toLowerCase() === answerLower
    );
    if (matchedRadio) {
      matchMethod = 'value match';
      console.log(`[AutoFeel] ⚠️ Matched radio by ${matchMethod}: "${matchedRadio.value}" (LLM should return index instead)`);
    }
  }

  if (!matchedRadio) {
    console.warn(`[AutoFeel] ⚠️ No matching radio found for: "${answer}"`);
    console.warn(`[AutoFeel] Available radio options (${radioGroup.length}):`,
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

// Helper function to find label text for an input
function findLabelForInput(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.textContent.trim();
  }

  const parentLabel = input.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  return '';
}

async function fillFormFields(answers) {
  console.log('[AutoFeel] Starting sequential form filling with animations...');
  console.log('[AutoFeel] Answers to fill:', JSON.stringify(answers, null, 2));
  console.log(`[AutoFeel] Number of fields to fill: ${Object.keys(answers).length}`);

  let filledCount = 0;
  let notFoundCount = 0;

  const fieldIds = Object.keys(answers);

  // Fill fields one by one with animation
  for (let i = 0; i < fieldIds.length; i++) {
    const fieldId = fieldIds[i];
    const input = document.querySelector(`[data-autofeel-id="${fieldId}"]`);

    if (!input) {
      console.warn(`[AutoFeel] ✗ Field ${fieldId} not found in DOM`);
      notFoundCount++;
      continue;
    }

    // Handle both old format (string) and new format (object with answer and explanation)
    const fieldData = answers[fieldId];
    const answer = typeof fieldData === 'string' ? fieldData : fieldData.answer;
    const explanation = typeof fieldData === 'object' ? fieldData.explanation : null;

    // Handle empty answers with a hint
    if (!answer || answer.trim() === '') {
      console.log(`[AutoFeel] ⏭️ Skipping ${fieldId} (empty answer, showing hint)`);

      // Use the dedicated function to show hint
      await showEmptyFieldHint(input, fieldId, explanation);

      // Brief pause before next field
      if (i < fieldIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }

      continue;
    }

    console.log(`[AutoFeel] [${i + 1}/${fieldIds.length}] Filling ${fieldId} with: "${answer.substring(0, 50)}${answer.length > 50 ? '...' : ''}"`);

    // Scroll to field
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll
    await new Promise(resolve => setTimeout(resolve, 300));

    // Add focus ring animation
    input.style.transition = 'all 0.3s ease';
    input.style.outline = '3px solid #4CAF50';
    input.style.outlineOffset = '2px';
    input.focus();

    await new Promise(resolve => setTimeout(resolve, 200));

    // Typing animation effect
    if (answer.length > 0) {
      input.value = '';

      // Type character by character for short answers (< 20 chars)
      if (answer.length < 20) {
        for (let charIndex = 0; charIndex < answer.length; charIndex++) {
          input.value += answer[charIndex];
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 20)); // 20ms per character
        }
      } else {
        // For long answers, just set directly
        input.value = answer;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // Trigger change events
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    // Success animation
    input.style.outline = '3px solid #4CAF50';
    input.style.backgroundColor = '#e8f5e9';

    await new Promise(resolve => setTimeout(resolve, 400));

    // Fade out animation
    input.style.outline = 'none';
    input.style.backgroundColor = '';

    filledCount++;

    // Brief pause before next field
    if (i < fieldIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('='.repeat(80));
  console.log(`[AutoFeel] ✅ Form filling complete!`);
  console.log(`[AutoFeel] Summary: ${filledCount} fields filled, ${notFoundCount} fields not found`);
  console.log('='.repeat(80));
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

  if (request.type === 'FILL_FORM') {
    // Handle async form filling with animations (batch mode)
    (async () => {
      try {
        await fillFormFields(request.answers);
        sendResponse({ success: true });
      } catch (error) {
        console.error('[AutoFeel] Error filling form:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
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
});

function showNotification(message, status = 'info') {
  const existing = document.getElementById('autofeel-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'autofeel-notification';
  notification.textContent = message;

  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '15px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: '2147483647',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '400px',
    animation: 'slideIn 0.3s ease-out'
  });

  const colors = {
    info: { bg: '#2196F3', text: '#fff' },
    success: { bg: '#4CAF50', text: '#fff' },
    error: { bg: '#f44336', text: '#fff' },
    loading: { bg: '#FF9800', text: '#fff' }
  };

  const color = colors[status] || colors.info;
  notification.style.backgroundColor = color.bg;
  notification.style.color = color.text;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

if (!document.getElementById('autofeel-notification-styles')) {
  const style = document.createElement('style');
  style.id = 'autofeel-notification-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
