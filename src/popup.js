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

loadSettings();
loadTokenUsage();
