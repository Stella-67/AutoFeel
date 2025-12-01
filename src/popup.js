const elements = {
  llmProvider: document.getElementById('llm-provider'),
  apiKey: document.getElementById('api-key'),
  toggleKey: document.getElementById('toggle-key'),
  apiEndpoint: document.getElementById('api-endpoint'),
  modelName: document.getElementById('model-name'),
  systemPrompt: document.getElementById('system-prompt'),
  testBtn: document.getElementById('test-btn'),
  saveBtn: document.getElementById('save-btn'),
  statusMessage: document.getElementById('status-message'),
  apiKeySection: document.getElementById('api-key-section'),
  customEndpointSection: document.getElementById('custom-endpoint-section'),
  modelSection: document.getElementById('model-section'),
  promptSection: document.getElementById('prompt-section'),
  // Token usage elements
  resetStatsBtn: document.getElementById('reset-stats-btn'),
  totalInput: document.getElementById('total-input'),
  totalOutput: document.getElementById('total-output'),
  totalTokens: document.getElementById('total-tokens'),
  openaiTokens: document.getElementById('openai-tokens'),
  openaiRequests: document.getElementById('openai-requests'),
  anthropicTokens: document.getElementById('anthropic-tokens'),
  anthropicRequests: document.getElementById('anthropic-requests'),
  customTokens: document.getElementById('custom-tokens'),
  customRequests: document.getElementById('custom-requests'),
  lastUpdated: document.getElementById('last-updated')
};

async function loadSettings() {
  const settings = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName', 'systemPrompt']);

  if (settings.llmProvider) {
    elements.llmProvider.value = settings.llmProvider;
    updateFormVisibility();
    fillDefaultValues(settings.llmProvider);
  }

  if (settings.apiKey) {
    elements.apiKey.value = settings.apiKey;
  }

  if (settings.apiEndpoint) {
    elements.apiEndpoint.value = settings.apiEndpoint;
  }

  if (settings.modelName) {
    elements.modelName.value = settings.modelName;
  }

  if (settings.systemPrompt) {
    elements.systemPrompt.value = settings.systemPrompt;
  }
}

function fillDefaultValues(provider) {
  const defaults = {
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4'
    },
    anthropic: {
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-5-sonnet-20241022'
    },
    custom: {
      endpoint: '',
      model: ''
    }
  };

  const config = defaults[provider];
  if (config) {
    if (!elements.apiEndpoint.value) {
      elements.apiEndpoint.value = config.endpoint;
    }
    if (!elements.modelName.value) {
      elements.modelName.value = config.model;
    }
  }
}

function updateFormVisibility() {
  const provider = elements.llmProvider.value;
  const show = provider !== '';

  elements.apiKeySection.style.display = show ? 'block' : 'none';
  elements.customEndpointSection.style.display = show ? 'block' : 'none';
  elements.modelSection.style.display = show ? 'block' : 'none';
  elements.promptSection.style.display = show ? 'block' : 'none';

  elements.testBtn.disabled = !show;
  elements.saveBtn.disabled = !show;
}

function showStatus(message, type = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`;
  elements.statusMessage.style.display = 'block';

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      elements.statusMessage.style.display = 'none';
    }, 3000);
  }
}

async function testAPI() {
  const provider = elements.llmProvider.value;
  const apiKey = elements.apiKey.value;
  const endpoint = elements.apiEndpoint.value;
  const model = elements.modelName.value;

  if (!apiKey) {
    showStatus('Please enter API Key', 'error');
    return;
  }

  if (!endpoint) {
    showStatus('Please enter API endpoint', 'error');
    return;
  }

  if (!model) {
    showStatus('Please enter model name', 'error');
    return;
  }

  showStatus('Testing connection...', 'info');
  elements.testBtn.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'TEST_API',
      config: {
        provider,
        apiKey,
        endpoint,
        model
      }
    });

    if (result.success) {
      showStatus('Connection successful! API is configured correctly', 'success');
    } else {
      showStatus(`Connection failed: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Test error: ${error.message}`, 'error');
  } finally {
    elements.testBtn.disabled = false;
  }
}

async function saveSettings() {
  const provider = elements.llmProvider.value;
  const apiKey = elements.apiKey.value;
  const endpoint = elements.apiEndpoint.value;
  const model = elements.modelName.value;
  const systemPrompt = elements.systemPrompt.value;

  if (!apiKey) {
    showStatus('Please enter API Key', 'error');
    return;
  }

  if (!endpoint) {
    showStatus('Please enter API endpoint', 'error');
    return;
  }

  if (!model) {
    showStatus('Please enter model name', 'error');
    return;
  }

  showStatus('Saving...', 'info');

  try {
    await chrome.storage.sync.set({
      llmProvider: provider,
      apiKey: apiKey,
      apiEndpoint: endpoint,
      modelName: model,
      systemPrompt: systemPrompt
    });

    showStatus('Settings saved!', 'success');
  } catch (error) {
    showStatus(`Save failed: ${error.message}`, 'error');
  }
}

function toggleApiKey() {
  const isPassword = elements.apiKey.type === 'password';
  elements.apiKey.type = isPassword ? 'text' : 'password';
  elements.toggleKey.textContent = isPassword ? 'Hide' : 'Show';
}

async function loadTokenUsage() {
  const { tokenUsage } = await chrome.storage.local.get(['tokenUsage']);

  if (!tokenUsage) {
    // No data yet
    return;
  }

  // Update total stats
  elements.totalInput.textContent = tokenUsage.total.inputTokens.toLocaleString();
  elements.totalOutput.textContent = tokenUsage.total.outputTokens.toLocaleString();
  elements.totalTokens.textContent = tokenUsage.total.totalTokens.toLocaleString();

  // Update provider stats
  if (tokenUsage.byProvider) {
    elements.openaiTokens.textContent = tokenUsage.byProvider.openai.totalTokens.toLocaleString();
    elements.openaiRequests.textContent = tokenUsage.byProvider.openai.requestCount;

    elements.anthropicTokens.textContent = tokenUsage.byProvider.anthropic.totalTokens.toLocaleString();
    elements.anthropicRequests.textContent = tokenUsage.byProvider.anthropic.requestCount;

    elements.customTokens.textContent = tokenUsage.byProvider.custom.totalTokens.toLocaleString();
    elements.customRequests.textContent = tokenUsage.byProvider.custom.requestCount;
  }

  // Update last updated time
  if (tokenUsage.lastUpdated) {
    const date = new Date(tokenUsage.lastUpdated);
    elements.lastUpdated.textContent = date.toLocaleString();
  }
}

async function resetTokenUsage() {
  if (!confirm('Are you sure you want to reset all token usage statistics?')) {
    return;
  }

  showStatus('Resetting statistics...', 'info');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'RESET_TOKEN_USAGE' });

    if (result.success) {
      showStatus('Statistics reset successfully!', 'success');
      await loadTokenUsage();
    } else {
      showStatus(`Failed to reset: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Reset error: ${error.message}`, 'error');
  }
}

elements.llmProvider.addEventListener('change', () => {
  updateFormVisibility();
  fillDefaultValues(elements.llmProvider.value);
});

elements.toggleKey.addEventListener('click', toggleApiKey);
elements.testBtn.addEventListener('click', testAPI);
elements.saveBtn.addEventListener('click', saveSettings);
elements.resetStatsBtn.addEventListener('click', resetTokenUsage);

// Listen for storage changes to update stats in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.tokenUsage) {
    loadTokenUsage();
  }
});

// ==================== Memory Search Functions ====================

async function loadMemoryStats() {
  try {
    await memoryDB.init();
    const stats = await memoryDB.getStats();

    document.getElementById('memory-doc-count').textContent = stats.totalDocuments.toLocaleString();
    document.getElementById('memory-chunk-count').textContent = stats.totalChunks.toLocaleString();
  } catch (error) {
    console.error('[AutoFeel] Failed to load memory stats:', error);
  }
}

async function performSearch() {
  const query = document.getElementById('memory-search').value.trim();
  const searchType = document.querySelector('input[name="search-type"]:checked').value;
  const resultsContainer = document.getElementById('search-results');

  if (!query) {
    resultsContainer.innerHTML = '<p class="no-results">Please enter a search query</p>';
    return;
  }

  resultsContainer.innerHTML = '<p class="loading">Searching...</p>';

  try {
    await memoryDB.init();

    let results;
    if (searchType === 'fuzzy') {
      // Fuzzy search
      results = await memoryDB.searchDocuments(query);
      displayFuzzyResults(results);
    } else {
      // Semantic search
      await performSemanticSearch(query);
    }
  } catch (error) {
    console.error('[AutoFeel] Search error:', error);
    resultsContainer.innerHTML = `<p class="error">Search failed: ${error.message}</p>`;
  }
}

function displayFuzzyResults(documents) {
  const resultsContainer = document.getElementById('search-results');

  if (!documents || documents.length === 0) {
    resultsContainer.innerHTML = '<p class="no-results">No results found</p>';
    return;
  }

  const html = documents.map(doc => `
    <div class="result-item">
      <div class="result-title">${escapeHtml(doc.title)}</div>
      <div class="result-url"><a href="${doc.url}" target="_blank">${doc.url}</a></div>
      <div class="result-meta">
        ${new Date(doc.captured_at).toLocaleDateString()} |
        ${doc.metadata.word_count} words |
        ${doc.metadata.chunk_count} chunks
      </div>
      <div class="result-actions">
        <button class="btn-small" onclick="viewDocument('${doc.doc_id}')">View</button>
        <button class="btn-small btn-danger" onclick="deleteDocument('${doc.doc_id}')">Delete</button>
      </div>
    </div>
  `).join('');

  resultsContainer.innerHTML = html;
}

async function performSemanticSearch(query) {
  const resultsContainer = document.getElementById('search-results');

  try {
    // Get API config
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint']);

    if (config.llmProvider !== 'openai' && config.llmProvider !== 'custom') {
      resultsContainer.innerHTML = '<p class="error">Semantic search only available for OpenAI provider</p>';
      return;
    }

    // Generate embedding for query
    resultsContainer.innerHTML = '<p class="loading">Generating query embedding...</p>';

    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_EMBEDDING',
      text: query,
      config: config
    });

    if (!response || !response.success || !response.embedding) {
      resultsContainer.innerHTML = '<p class="error">Failed to generate query embedding</p>';
      return;
    }

    // Search using embedding
    resultsContainer.innerHTML = '<p class="loading">Searching for similar chunks...</p>';

    const results = await memoryDB.semanticSearch(response.embedding, 10);

    if (!results || results.length === 0) {
      resultsContainer.innerHTML = '<p class="no-results">No results found</p>';
      return;
    }

    // Display semantic results
    displaySemanticResults(results);
  } catch (error) {
    console.error('[AutoFeel] Semantic search error:', error);
    resultsContainer.innerHTML = `<p class="error">Semantic search failed: ${error.message}</p>`;
  }
}

function displaySemanticResults(chunks) {
  const resultsContainer = document.getElementById('search-results');

  const html = chunks.map(chunk => `
    <div class="result-item">
      <div class="result-similarity">Similarity: ${(chunk.similarity * 100).toFixed(1)}%</div>
      <div class="result-text">${escapeHtml(chunk.text.substring(0, 200))}...</div>
      <div class="result-meta">
        From: <strong>${escapeHtml(chunk.source.title)}</strong> |
        ${chunk.metadata.word_count} words |
        Importance: ${(chunk.importance * 100).toFixed(0)}%
      </div>
      <div class="result-actions">
        <button class="btn-small" onclick="viewDocument('${chunk.doc_id}')">View Document</button>
      </div>
    </div>
  `).join('');

  resultsContainer.innerHTML = html;
}

async function viewAllDocuments() {
  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = '<p class="loading">Loading documents...</p>';

  try {
    await memoryDB.init();
    const documents = await memoryDB.getAllDocuments({ limit: 50 });

    displayFuzzyResults(documents);
  } catch (error) {
    console.error('[AutoFeel] Failed to load documents:', error);
    resultsContainer.innerHTML = `<p class="error">Failed to load documents: ${error.message}</p>`;
  }
}

async function viewDocument(docId) {
  try {
    await memoryDB.init();
    const doc = await memoryDB.getDocument(docId);
    const chunks = await memoryDB.getChunksByDocId(docId);

    // Create a temporary result page
    const resultData = {
      documentSchema: doc,
      chunkSchemas: chunks
    };

    // Store in chrome.storage.local temporarily
    await chrome.storage.local.set({ viewDocument: resultData });

    // Open result.html to view
    chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
  } catch (error) {
    console.error('[AutoFeel] Failed to view document:', error);
    alert(`Failed to view document: ${error.message}`);
  }
}

async function deleteDocument(docId) {
  if (!confirm('Are you sure you want to delete this document?')) {
    return;
  }

  try {
    await memoryDB.init();
    await memoryDB.deleteDocument(docId);

    // Reload stats and refresh search
    await loadMemoryStats();
    await performSearch();

    showStatus('Document deleted successfully', 'success');
  } catch (error) {
    console.error('[AutoFeel] Failed to delete document:', error);
    showStatus(`Failed to delete document: ${error.message}`, 'error');
  }
}

async function exportAllMemory() {
  try {
    await memoryDB.init();
    const documents = await memoryDB.getAllDocuments({ limit: 10000 });

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalDocuments: documents.length,
      documents: documents
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autofeel-memory-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showStatus('Memory exported successfully', 'success');
  } catch (error) {
    console.error('[AutoFeel] Failed to export memory:', error);
    showStatus(`Failed to export memory: ${error.message}`, 'error');
  }
}

async function clearAllMemory() {
  if (!confirm('Are you sure you want to clear ALL memory? This cannot be undone!')) {
    return;
  }

  if (!confirm('This will permanently delete all saved documents and chunks. Are you ABSOLUTELY sure?')) {
    return;
  }

  try {
    await memoryDB.init();
    await memoryDB.clearAll();

    await loadMemoryStats();
    document.getElementById('search-results').innerHTML = '';

    showStatus('All memory cleared', 'success');
  } catch (error) {
    console.error('[AutoFeel] Failed to clear memory:', error);
    showStatus(`Failed to clear memory: ${error.message}`, 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add event listeners for memory search
document.getElementById('open-manager-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
});
document.getElementById('search-btn').addEventListener('click', performSearch);
document.getElementById('memory-search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') performSearch();
});
document.getElementById('view-all-btn').addEventListener('click', viewAllDocuments);
document.getElementById('export-memory-btn').addEventListener('click', exportAllMemory);
document.getElementById('clear-memory-btn').addEventListener('click', clearAllMemory);

// Add message listener for embedding generation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MEMORY_UPDATED') {
    loadMemoryStats();
  }
});

loadSettings();
loadTokenUsage();
loadMemoryStats();
