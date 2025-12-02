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

function detectFormFields() {
  const fields = [];

  // Find all text-based input fields
  const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="date"], input:not([type]), textarea, select');

  console.log('='.repeat(80));
  console.log('[AutoFeel Field Detection] 🔍 STARTING FIELD DETECTION');
  console.log('='.repeat(80));
  console.log(`[AutoFeel Field Detection] Found ${inputs.length} total input elements`);
  console.log('');

  let validFieldIndex = 0; // Counter for valid (non-hidden) fields

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

    // Try to find the label for this input
    let label = '';
    let placeholder = input.placeholder || '';
    const debugMethods = [];

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

    // Use sequential numbering for valid fields only
    const fieldId = `field_${validFieldIndex}`;
    input.dataset.autofeelId = fieldId;

    const fieldInfo = {
      id: fieldId,
      label: label,
      placeholder: placeholder,
      type: input.type || input.tagName.toLowerCase(),
      value: input.value,
      name: input.name
    };

    fields.push(fieldInfo);

    console.log(`[AutoFeel Field Detection] ✅ FIELD ADDED as ${fieldId}`);
    console.log(`[AutoFeel Field Detection] Final field info:`, {
      label: label || '(empty)',
      placeholder: placeholder || '(empty)',
      type: fieldInfo.type,
      name: input.name || '(empty)'
    });
    console.log('');

    validFieldIndex++; // Increment only for valid fields
  });

  console.log('='.repeat(80));
  console.log(`[AutoFeel Field Detection] ✅ DETECTION COMPLETE: ${fields.length} fields found`);
  console.log('='.repeat(80));
  console.log('[AutoFeel Field Detection] Summary:');
  fields.forEach((field, index) => {
    const question = field.label || field.placeholder || field.name || '(NO QUESTION FOUND!)';
    console.log(`  ${field.id}: "${question}"`);
  });
  console.log('');
  return fields;
}

async function fillSingleField(fieldId, fieldData) {
  console.log(`[AutoFeel] Filling single field: ${fieldId}`);

  const input = document.querySelector(`[data-autofeel-id="${fieldId}"]`);

  if (!input) {
    console.warn(`[AutoFeel] Field ${fieldId} not found in DOM`);
    return;
  }

  // Extract answer and explanation
  const answer = typeof fieldData === 'string' ? fieldData : fieldData.answer;
  const explanation = typeof fieldData === 'object' ? fieldData.explanation : null;

  // Handle empty answers with hint
  if (!answer || answer.trim() === '') {
    await showEmptyFieldHint(input, fieldId, explanation);
    return;
  }

  // Fill the field with animation
  await fillFieldWithAnimation(input, answer);
}

async function showEmptyFieldHint(input, fieldId, explanation) {
  console.log(`[AutoFeel] Showing hint for ${fieldId} (empty answer)`);

  // Scroll to field
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 300));

  // Add a hint below the field
  const hint = document.createElement('div');
  hint.className = 'autofeel-empty-hint';

  // Get input's computed styles to match alignment
  const inputStyles = window.getComputedStyle(input);
  const inputMarginLeft = inputStyles.marginLeft;

  hint.style.cssText = `
    margin-top: 24px;
    margin-left: ${inputMarginLeft};
    min-width: 500px;
    max-width: 800px;
    padding: 2px 8px;
    background-color: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    color: #856404;
    font-size: 13px;
    line-height: 1.5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    animation: autofeel-hint-fadein 0.3s ease;
    box-sizing: border-box;
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

  // Insert hint after the input
  input.parentElement.insertBefore(hint, input.nextSibling);

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

  // Typing animation effect
  if (answer.length > 0) {
    input.value = '';

    // Type character by character for short answers
    if (answer.length < 20) {
      for (let charIndex = 0; charIndex < answer.length; charIndex++) {
        input.value += answer[charIndex];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 20));
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
  input.style.outline = '2px solid #4CAF50';
  input.style.outlineOffset = '0px';
  input.style.boxShadow = 'inset 0 0 0 100px rgba(76, 175, 80, 0.1)';

  await new Promise(resolve => setTimeout(resolve, 400));

  // Fade out animation
  input.style.outline = '';
  input.style.boxShadow = '';

  console.log(`[AutoFeel] ✓ Filled field with: "${answer.substring(0, 50)}${answer.length > 50 ? '...' : ''}"`);
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
      const fields = detectFormFields();
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
