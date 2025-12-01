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
  return {
    title: document.title,
    url: window.location.href,
    timestamp: new Date().toISOString()
  };
}

async function getPageContent() {
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

  return {
    text: visibleText,
    html: structuredContent.html,
    markdown: structuredContent.markdown,
    metadata: metadata,
    wordCount: visibleText.split(/\s+/).length
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
