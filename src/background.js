chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'send-to-llm') {
    await handleSendToLLM();
  }
});

async function handleSendToLLM() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('No active tab found');
      return;
    }

    await notifyTab(tab.id, 'Fetching page content...', 'loading');

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' });

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to get page content', 'error');
      return;
    }

    const pageContent = response.content;
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName', 'systemPrompt']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    await notifyTab(tab.id, 'Sending to LLM...', 'loading');

    const llmResponse = await sendToLLM(pageContent, config);

    if (llmResponse.success) {
      await showResult(tab.id, pageContent, llmResponse.data, config);
      await notifyTab(tab.id, 'LLM response received!', 'success');
    } else {
      await notifyTab(tab.id, `LLM request failed: ${llmResponse.error}`, 'error');
    }
  } catch (error) {
    console.error('Error in handleSendToLLM:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Processing error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('Failed to show error notification:', e);
    }
  }
}

async function notifyTab(tabId, message, status) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_NOTIFICATION',
      message: message,
      status: status
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

async function sendToLLM(pageContent, config) {
  const { llmProvider, apiKey, apiEndpoint, modelName, systemPrompt } = config;

  try {
    const requestBody = buildLLMRequest(llmProvider, pageContent, modelName, systemPrompt);
    const headers = buildLLMHeaders(llmProvider, apiKey);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API request failed (${response.status}): ${errorText}`
      };
    }

    const data = await response.json();
    const content = extractLLMResponse(llmProvider, data);

    return {
      success: true,
      data: {
        content: content,
        raw: data
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function buildLLMRequest(provider, pageContent, modelName, systemPrompt) {
  const defaultPrompt = 'Please analyze the following webpage content and provide a brief summary and key information:';

  // Use markdown format if available, otherwise fall back to plain text
  const contentFormat = pageContent.markdown ? 'Markdown' : 'Plain Text';
  let contentToAnalyze = pageContent.markdown || pageContent.text;

  // Smart content filtering to extract valuable information
  const MAX_CHARS = 12000;  // Reduced to avoid rate limits
  const needsFiltering = contentToAnalyze.length > MAX_CHARS;

  if (needsFiltering) {
    contentToAnalyze = filterImportantContent(contentToAnalyze, MAX_CHARS);
  }

  const userPrompt = `${defaultPrompt}

Page Title: ${pageContent.metadata.title}
Page URL: ${pageContent.metadata.url}
Content Format: ${contentFormat}
Original Word Count: ${pageContent.wordCount}${needsFiltering ? ' (filtered for key content)' : ''}

Page Content:
${contentToAnalyze}`;

  if (provider === 'openai' || provider === 'custom') {
    const messages = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    messages.push({
      role: 'user',
      content: userPrompt
    });

    return {
      model: modelName,
      messages: messages,
      max_tokens: 1500,  // Reduced to avoid rate limits
      temperature: 0.7
    };
  } else if (provider === 'anthropic') {
    return {
      model: modelName,
      max_tokens: 1500,  // Reduced to avoid rate limits
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      ...(systemPrompt && { system: systemPrompt })
    };
  }

  return {
    model: modelName,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 1500  // Reduced to avoid rate limits
  };
}

function filterImportantContent(content, maxChars) {
  // Split content into sections
  const lines = content.split('\n');
  const sections = [];
  let currentSection = { type: 'paragraph', content: '', priority: 0 };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentSection.content) {
        sections.push(currentSection);
        currentSection = { type: 'paragraph', content: '', priority: 0 };
      }
      continue;
    }

    // Detect section type and priority
    if (trimmed.startsWith('# ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'h1', content: trimmed, priority: 100 };
    } else if (trimmed.startsWith('## ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'h2', content: trimmed, priority: 90 };
    } else if (trimmed.startsWith('### ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'h3', content: trimmed, priority: 80 };
    } else if (trimmed.startsWith('#### ') || trimmed.startsWith('##### ') || trimmed.startsWith('###### ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'heading', content: trimmed, priority: 70 };
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\./.test(trimmed)) {
      currentSection.content += (currentSection.content ? '\n' : '') + trimmed;
      currentSection.type = 'list';
      currentSection.priority = Math.max(currentSection.priority, 60);
    } else if (trimmed.startsWith('```')) {
      currentSection.content += (currentSection.content ? '\n' : '') + trimmed;
      currentSection.type = 'code';
      currentSection.priority = Math.max(currentSection.priority, 50);
    } else {
      currentSection.content += (currentSection.content ? '\n' : '') + trimmed;

      // Calculate priority based on content quality
      const wordCount = trimmed.split(/\s+/).length;

      // Longer paragraphs are often more informative
      if (wordCount > 20) {
        currentSection.priority = Math.max(currentSection.priority, 40);
      }

      // Keywords that indicate important content
      const importantKeywords = ['summary', 'conclusion', 'key', 'important', 'main', 'result', 'finding', 'objective', 'goal', 'purpose'];
      const hasImportantKeyword = importantKeywords.some(keyword =>
        trimmed.toLowerCase().includes(keyword)
      );

      if (hasImportantKeyword) {
        currentSection.priority = Math.max(currentSection.priority, 50);
      }
    }
  }

  if (currentSection.content) {
    sections.push(currentSection);
  }

  // Remove duplicate sections
  const uniqueSections = [];
  const seenContent = new Set();

  for (const section of sections) {
    const normalized = section.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seenContent.has(normalized) || section.priority > 70) {
      uniqueSections.push(section);
      seenContent.add(normalized);
    }
  }

  // Sort by priority
  uniqueSections.sort((a, b) => b.priority - a.priority);

  // Build filtered content
  let filteredContent = '';
  let currentLength = 0;

  // Always include all headings first
  for (const section of uniqueSections) {
    if (section.type.startsWith('h') || section.type === 'heading') {
      filteredContent += section.content + '\n\n';
      currentLength += section.content.length + 2;
    }
  }

  // Add other important sections
  for (const section of uniqueSections) {
    if (section.type.startsWith('h') || section.type === 'heading') {
      continue; // Already added
    }

    const sectionLength = section.content.length + 2;
    if (currentLength + sectionLength <= maxChars) {
      filteredContent += section.content + '\n\n';
      currentLength += sectionLength;
    } else if (currentLength < maxChars * 0.9) {
      // Add partial content if we have room
      const remainingSpace = maxChars - currentLength - 50;
      if (remainingSpace > 100) {
        const partial = section.content.substring(0, remainingSpace);
        const lastPeriod = partial.lastIndexOf('.');
        if (lastPeriod > remainingSpace * 0.8) {
          filteredContent += partial.substring(0, lastPeriod + 1) + '\n\n';
        }
      }
      break;
    } else {
      break;
    }
  }

  filteredContent += '\n[Note: Content filtered to extract key information]\n';

  return filteredContent.trim();
}

function buildLLMHeaders(provider, apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (provider === 'openai' || provider === 'custom') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  return headers;
}

function extractLLMResponse(provider, data) {
  if (provider === 'openai' || provider === 'custom') {
    return data.choices?.[0]?.message?.content || 'Unable to get response content';
  } else if (provider === 'anthropic') {
    return data.content?.[0]?.text || 'Unable to get response content';
  }

  return 'Unable to parse response content';
}

async function showResult(tabId, pageContent, llmResponse, config) {
  await chrome.storage.local.set({
    lastResult: {
      pageContent: pageContent,
      llmResponse: llmResponse,
      config: config,
      timestamp: new Date().toISOString()
    }
  });

  await chrome.tabs.create({
    url: chrome.runtime.getURL('result.html'),
    index: (await chrome.tabs.get(tabId)).index + 1
  });
}

async function testAPIConnection(config) {
  const { provider, apiKey, endpoint, model } = config;

  try {
    const testContent = {
      text: 'Hello, this is a test message.',
      metadata: {
        title: 'Test',
        url: 'https://test.com'
      }
    };

    const requestBody = buildLLMRequest(provider, testContent, model, '');
    if (requestBody.max_tokens) {
      requestBody.max_tokens = 50;
    }

    const headers = buildLLMHeaders(provider, apiKey);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API returned error (${response.status}): ${errorText}`
      };
    }

    await response.json();

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TEST_API') {
    testAPIConnection(request.config).then(sendResponse);
    return true;
  }
});
