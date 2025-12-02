const elements = {
  llmProvider: document.getElementById('llm-provider'),
  apiKey: document.getElementById('api-key'),
  toggleKey: document.getElementById('toggle-key'),
  apiEndpoint: document.getElementById('api-endpoint'),
  modelName: document.getElementById('model-name'),
  customModelName: document.getElementById('custom-model-name'),
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
  deepseekTokens: document.getElementById('deepseek-tokens'),
  deepseekRequests: document.getElementById('deepseek-requests'),
  customTokens: document.getElementById('custom-tokens'),
  customRequests: document.getElementById('custom-requests'),
  lastUpdated: document.getElementById('last-updated')
};

// Model lists for different providers
const modelOptions = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (Latest, Recommended)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, Cheaper)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Cheapest)' }
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest, Recommended)' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Faster, Cheaper)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Most Capable)' },
    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Cheapest)' }
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat (Recommended)' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder' }
  ],
  custom: [
    { value: 'custom', label: 'Custom Model (Enter below)' }
  ]
};

// Update model dropdown based on provider
function updateModelOptions(provider) {
  const modelSelect = elements.modelName;
  const customInput = elements.customModelName;

  // Clear existing options
  modelSelect.innerHTML = '<option value="">-- Select Model --</option>';

  if (!provider) {
    customInput.style.display = 'none';
    return;
  }

  // Add models for selected provider
  const models = modelOptions[provider] || [];
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.value;
    option.textContent = model.label;
    modelSelect.appendChild(option);
  });

  // Show/hide custom input for custom provider
  if (provider === 'custom') {
    customInput.style.display = 'block';
  } else {
    customInput.style.display = 'none';
  }
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName', 'systemPrompt']);

  if (settings.llmProvider) {
    elements.llmProvider.value = settings.llmProvider;
    updateFormVisibility();
    updateModelOptions(settings.llmProvider);
    fillDefaultValues(settings.llmProvider);
  }

  if (settings.apiKey) {
    elements.apiKey.value = settings.apiKey;
  }

  if (settings.apiEndpoint) {
    elements.apiEndpoint.value = settings.apiEndpoint;
  }

  if (settings.modelName) {
    // Check if it's a custom model
    const isCustomModel = settings.llmProvider === 'custom' ||
                         !Array.from(elements.modelName.options).some(opt => opt.value === settings.modelName);

    if (isCustomModel && settings.llmProvider === 'custom') {
      elements.modelName.value = 'custom';
      elements.customModelName.value = settings.modelName;
    } else {
      elements.modelName.value = settings.modelName;
    }
  }

  if (settings.systemPrompt) {
    elements.systemPrompt.value = settings.systemPrompt;
  }
}

function fillDefaultValues(provider) {
  const defaults = {
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o'
    },
    anthropic: {
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-5-sonnet-20241022'
    },
    deepseek: {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat'
    },
    custom: {
      endpoint: '',
      model: 'custom'
    }
  };

  const config = defaults[provider];
  if (config) {
    if (!elements.apiEndpoint.value) {
      elements.apiEndpoint.value = config.endpoint;
    }
    if (!elements.modelName.value || elements.modelName.value === '-- Select Model --') {
      elements.modelName.value = config.model;
    }
  }
}

// Get actual model name (handles custom model input)
function getActualModelName() {
  const selectedModel = elements.modelName.value;
  if (selectedModel === 'custom' && elements.customModelName.value) {
    return elements.customModelName.value.trim();
  }
  return selectedModel;
}

function updateFormVisibility() {
  const provider = elements.llmProvider.value;
  const show = provider !== '';

  elements.apiKeySection.style.display = show ? 'block' : 'none';
  // Only show endpoint input for custom provider
  elements.customEndpointSection.style.display = (provider === 'custom') ? 'block' : 'none';
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
  const model = getActualModelName();

  // Get endpoint: use preset for OpenAI/Anthropic/DeepSeek, or custom input
  let endpoint;
  if (provider === 'openai') {
    endpoint = 'https://api.openai.com/v1/chat/completions';
  } else if (provider === 'anthropic') {
    endpoint = 'https://api.anthropic.com/v1/messages';
  } else if (provider === 'deepseek') {
    endpoint = 'https://api.deepseek.com/v1/chat/completions';
  } else {
    endpoint = elements.apiEndpoint.value;
  }

  if (!apiKey) {
    showStatus('Please enter API Key', 'error');
    return;
  }

  if (!endpoint) {
    showStatus('Please enter API endpoint', 'error');
    return;
  }

  if (!model) {
    showStatus('Please select a model or enter a custom model name', 'error');
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
  const model = getActualModelName();
  const systemPrompt = elements.systemPrompt.value;

  // Get endpoint: use preset for OpenAI/Anthropic/DeepSeek, or custom input
  let endpoint;
  if (provider === 'openai') {
    endpoint = 'https://api.openai.com/v1/chat/completions';
  } else if (provider === 'anthropic') {
    endpoint = 'https://api.anthropic.com/v1/messages';
  } else if (provider === 'deepseek') {
    endpoint = 'https://api.deepseek.com/v1/chat/completions';
  } else {
    endpoint = elements.apiEndpoint.value;
  }

  if (!apiKey) {
    showStatus('Please enter API Key', 'error');
    return;
  }

  if (!endpoint) {
    showStatus('Please enter API endpoint', 'error');
    return;
  }

  if (!model) {
    showStatus('Please select a model or enter a custom model name', 'error');
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

  // Update provider stats with defaults for missing providers
  if (tokenUsage.byProvider) {
    const defaultProviderStats = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 };

    const openai = tokenUsage.byProvider.openai || defaultProviderStats;
    elements.openaiTokens.textContent = openai.totalTokens.toLocaleString();
    elements.openaiRequests.textContent = openai.requestCount;

    const anthropic = tokenUsage.byProvider.anthropic || defaultProviderStats;
    elements.anthropicTokens.textContent = anthropic.totalTokens.toLocaleString();
    elements.anthropicRequests.textContent = anthropic.requestCount;

    const deepseek = tokenUsage.byProvider.deepseek || defaultProviderStats;
    elements.deepseekTokens.textContent = deepseek.totalTokens.toLocaleString();
    elements.deepseekRequests.textContent = deepseek.requestCount;

    const custom = tokenUsage.byProvider.custom || defaultProviderStats;
    elements.customTokens.textContent = custom.totalTokens.toLocaleString();
    elements.customRequests.textContent = custom.requestCount;
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
  const provider = elements.llmProvider.value;
  updateFormVisibility();
  updateModelOptions(provider);
  fillDefaultValues(provider);
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
      <div class="result-title">${Utils.escapeHtml(doc.title)}</div>
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
      <div class="result-text">${Utils.escapeHtml(chunk.text.substring(0, 200))}...</div>
      <div class="result-meta">
        From: <strong>${Utils.escapeHtml(chunk.source.title)}</strong> |
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
