const elements = {
  pageTitle: document.getElementById('page-title'),
  pageUrl: document.getElementById('page-url'),
  wordCount: document.getElementById('word-count'),
  timestamp: document.getElementById('timestamp'),
  llmResponse: document.getElementById('llm-response'),
  originalContent: document.getElementById('original-content'),
  toggleContentBtn: document.getElementById('toggle-content'),
  copyBtn: document.getElementById('copy-btn'),
  closeBtn: document.getElementById('close-btn')
};

let currentResult = null;

async function loadResult() {
  try {
    const data = await chrome.storage.local.get(['lastResult']);

    if (!data.lastResult) {
      elements.llmResponse.textContent = 'No result data found';
      return;
    }

    currentResult = data.lastResult;
    displayResult(currentResult);
  } catch (error) {
    console.error('Failed to load result:', error);
    elements.llmResponse.textContent = `Failed to load result: ${error.message}`;
  }
}

function displayResult(result) {
  const { pageContent, llmResponse, timestamp } = result;

  elements.pageTitle.textContent = pageContent.metadata.title || 'Untitled';
  elements.pageUrl.textContent = pageContent.metadata.url;
  elements.pageUrl.href = pageContent.metadata.url;
  elements.wordCount.textContent = pageContent.wordCount.toLocaleString();
  elements.timestamp.textContent = formatTimestamp(timestamp);

  displayLLMResponse(llmResponse.content);

  // Display structured content if available, otherwise show plain text
  if (pageContent.markdown) {
    elements.originalContent.innerHTML = '<pre style="white-space: pre-wrap; font-family: inherit;">' +
      escapeHtml(pageContent.markdown) + '</pre>';
  } else {
    elements.originalContent.textContent = pageContent.text;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function displayLLMResponse(content) {
  let html = content;

  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  elements.llmResponse.innerHTML = html;
}

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function toggleContent() {
  const isCollapsed = elements.originalContent.classList.contains('collapsed');
  const icon = elements.toggleContentBtn.querySelector('.toggle-icon');

  if (isCollapsed) {
    elements.originalContent.classList.remove('collapsed');
    icon.textContent = '▼';
  } else {
    elements.originalContent.classList.add('collapsed');
    icon.textContent = '▶';
  }
}

async function copyResponse() {
  if (!currentResult) return;

  try {
    await navigator.clipboard.writeText(currentResult.llmResponse.content);

    const originalText = elements.copyBtn.textContent;
    elements.copyBtn.textContent = 'Copied!';
    elements.copyBtn.disabled = true;

    setTimeout(() => {
      elements.copyBtn.textContent = originalText;
      elements.copyBtn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy:', error);
    alert('Copy failed: ' + error.message);
  }
}

function closeTab() {
  window.close();
}

elements.toggleContentBtn.addEventListener('click', toggleContent);
elements.copyBtn.addEventListener('click', copyResponse);
elements.closeBtn.addEventListener('click', closeTab);

loadResult();
