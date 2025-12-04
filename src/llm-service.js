// ==================== LLM Service ====================
// Unified LLM API calling service

/**
 * Build LLM request body based on provider
 */
function buildLLMRequestBody(provider, modelName, userPrompt, systemPrompt = null, options = {}) {
  const { maxTokens = 1500, temperature = 0.7, screenshots = [] } = options;

  // Check if we have screenshots (multi-modal request)
  const hasImages = screenshots && screenshots.length > 0;

  if (provider === 'openai' || provider === 'deepseek' || provider === 'custom') {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    // Build user message content
    if (hasImages) {
      // Multi-modal: array of text and images
      const content = [{ type: 'text', text: userPrompt }];
      screenshots.forEach(screenshot => {
        content.push({
          type: 'image_url',
          image_url: { url: screenshot } // screenshot is already data:image/png;base64,...
        });
      });
      messages.push({ role: 'user', content });
    } else {
      // Text only
      messages.push({ role: 'user', content: userPrompt });
    }

    return { model: modelName, messages, max_tokens: maxTokens, temperature };
  } else if (provider === 'anthropic') {
    const body = {
      model: modelName,
      max_tokens: maxTokens
    };

    // Build user message content
    if (hasImages) {
      // Multi-modal: array of text and images
      const content = [{ type: 'text', text: userPrompt }];
      screenshots.forEach(screenshot => {
        // Extract base64 data from data URL
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: base64Data
          }
        });
      });
      body.messages = [{ role: 'user', content }];
    } else {
      // Text only
      body.messages = [{ role: 'user', content: userPrompt }];
    }

    if (systemPrompt) body.system = systemPrompt;
    return body;
  }

  // Fallback for unknown providers
  const messages = [];
  if (hasImages) {
    const content = [{ type: 'text', text: userPrompt }];
    screenshots.forEach(screenshot => {
      content.push({
        type: 'image_url',
        image_url: { url: screenshot }
      });
    });
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }
  return { model: modelName, messages, max_tokens: maxTokens };
}

/**
 * Build LLM request headers
 */
function buildLLMHeaders(provider, apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}

/**
 * Extract LLM response content
 */
function extractLLMResponse(provider, data) {
  if (provider === 'anthropic') {
    return data.content[0].text;
  } else if (provider === 'openai' || provider === 'deepseek' || provider === 'custom') {
    return data.choices[0].message.content;
  }
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Extract token usage from LLM response
 */
function extractTokenUsage(provider, data) {
  try {
    if (provider === 'openai' || provider === 'deepseek' || provider === 'custom') {
      const usage = data.usage;
      if (usage) {
        return {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        };
      }
    } else if (provider === 'anthropic') {
      const usage = data.usage;
      if (usage) {
        return {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
        };
      }
    }
  } catch (error) {
    console.error('[AutoFeel LLM] Failed to extract token usage:', error);
  }
  return null;
}

/**
 * Update token usage statistics
 */
async function updateTokenUsage(provider, usage) {
  try {
    const { tokenUsage } = await chrome.storage.local.get(['tokenUsage']);

    const stats = tokenUsage || {
      total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      byProvider: {
        openai: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        anthropic: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        deepseek: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        custom: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
      },
      lastUpdated: null
    };

    stats.total.inputTokens += usage.inputTokens;
    stats.total.outputTokens += usage.outputTokens;
    stats.total.totalTokens += usage.totalTokens;

    if (stats.byProvider[provider]) {
      stats.byProvider[provider].inputTokens += usage.inputTokens;
      stats.byProvider[provider].outputTokens += usage.outputTokens;
      stats.byProvider[provider].totalTokens += usage.totalTokens;
      stats.byProvider[provider].requestCount += 1;
    }

    stats.lastUpdated = new Date().toISOString();
    await chrome.storage.local.set({ tokenUsage: stats });

    console.log('[AutoFeel LLM] Token usage updated:', usage);
  } catch (error) {
    console.error('[AutoFeel LLM] Failed to update token usage:', error);
  }
}

/**
 * Reset token usage statistics
 */
async function resetTokenUsage() {
  try {
    await chrome.storage.local.set({
      tokenUsage: {
        total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        byProvider: {
          openai: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
          anthropic: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
          deepseek: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
          custom: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
        },
        lastUpdated: new Date().toISOString()
      }
    });
    console.log('[AutoFeel LLM] Token usage reset');
    return { success: true };
  } catch (error) {
    console.error('[AutoFeel LLM] Failed to reset token usage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test API connection
 */
async function testAPIConnection(config) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    const systemPrompt = `You are a form-filling assistant that helps users auto-fill forms based on their saved context.`;

    const testPrompt = `Context: John Smith, software engineer at TechCorp, email: john@example.com, phone: 555-0123

Question: What is your full name?

Return only the answer in JSON format: {"answer": "your answer"}`;

    const requestBody = buildLLMRequestBody(llmProvider, modelName, testPrompt, systemPrompt, {
      maxTokens: 100,
      temperature: 0
    });

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: buildLLMHeaders(llmProvider, apiKey),
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }

    const data = await response.json();
    const content = extractLLMResponse(llmProvider, data);

    return {
      success: true,
      message: content,
      provider: llmProvider,
      model: modelName
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
