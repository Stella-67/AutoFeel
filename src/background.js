chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'send-to-llm') {
    await handleSendToLLM();
  } else if (command === 'auto-fill-form') {
    await handleAutoFillForm();
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
      // Save the page content and LLM response for auto-fill
      await chrome.storage.local.set({
        savedContext: {
          pageContent: pageContent,
          llmAnalysis: llmResponse.data.content,
          timestamp: new Date().toISOString(),
          sourceUrl: pageContent.metadata.url
        }
      });

      await showResult(tab.id, pageContent, llmResponse.data, config);

      // Build success message with token usage
      let successMessage = 'LLM response received! Press Alt+V on a form to auto-fill.';
      if (llmResponse.data.tokenUsage) {
        successMessage += ` (Used ${llmResponse.data.tokenUsage.totalTokens.toLocaleString()} tokens: ${llmResponse.data.tokenUsage.inputTokens.toLocaleString()} in, ${llmResponse.data.tokenUsage.outputTokens.toLocaleString()} out)`;
      }

      await notifyTab(tab.id, successMessage, 'success');
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

async function handleAutoFillForm() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('No active tab found');
      return;
    }

    await notifyTab(tab.id, 'Detecting form fields...', 'loading');

    // Get saved context from previous LLM analysis
    const { savedContext } = await chrome.storage.local.get(['savedContext']);

    if (!savedContext) {
      await notifyTab(tab.id, 'No saved context found. Please use Alt+C first to analyze a page.', 'error');
      return;
    }

    // Get form fields from the current page
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM_FIELDS' });

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to detect form fields', 'error');
      return;
    }

    const formFields = response.fields;

    if (formFields.length === 0) {
      await notifyTab(tab.id, 'No form fields found on this page', 'error');
      return;
    }

    await notifyTab(tab.id, `Found ${formFields.length} fields. Generating answers...`, 'loading');

    // Get LLM configuration
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // Generate answers for form fields
    const answers = await generateFormAnswers(formFields, savedContext, config);

    if (answers.success) {
      // Send answers back to content script to fill the form
      await chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_FORM',
        answers: answers.data
      });

      // Build success message with token usage
      let successMessage = 'Form filled successfully!';
      if (answers.tokenUsage) {
        successMessage += ` (Used ${answers.tokenUsage.totalTokens.toLocaleString()} tokens: ${answers.tokenUsage.inputTokens.toLocaleString()} in, ${answers.tokenUsage.outputTokens.toLocaleString()} out)`;
      }

      await notifyTab(tab.id, successMessage, 'success');
    } else {
      await notifyTab(tab.id, `Failed to generate answers: ${answers.error}`, 'error');
    }
  } catch (error) {
    console.error('Error in handleAutoFillForm:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
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

    // Extract and save token usage
    const tokenUsage = extractTokenUsage(llmProvider, data);
    if (tokenUsage) {
      await updateTokenUsage(llmProvider, tokenUsage);
    }

    return {
      success: true,
      data: {
        content: content,
        raw: data,
        tokenUsage: tokenUsage
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

function extractTokenUsage(provider, data) {
  try {
    if (provider === 'openai' || provider === 'custom') {
      // OpenAI format: { usage: { prompt_tokens, completion_tokens, total_tokens } }
      const usage = data.usage;
      if (usage) {
        return {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        };
      }
    } else if (provider === 'anthropic') {
      // Anthropic format: { usage: { input_tokens, output_tokens } }
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
    console.error('[AutoFeel] Failed to extract token usage:', error);
  }
  return null;
}

async function updateTokenUsage(provider, usage) {
  try {
    // Get current token usage stats
    const { tokenUsage } = await chrome.storage.local.get(['tokenUsage']);

    // Initialize if not exists
    const stats = tokenUsage || {
      total: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      },
      byProvider: {
        openai: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        anthropic: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        custom: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
      },
      lastUpdated: null
    };

    // Update total
    stats.total.inputTokens += usage.inputTokens;
    stats.total.outputTokens += usage.outputTokens;
    stats.total.totalTokens += usage.totalTokens;

    // Update by provider
    if (stats.byProvider[provider]) {
      stats.byProvider[provider].inputTokens += usage.inputTokens;
      stats.byProvider[provider].outputTokens += usage.outputTokens;
      stats.byProvider[provider].totalTokens += usage.totalTokens;
      stats.byProvider[provider].requestCount += 1;
    }

    stats.lastUpdated = new Date().toISOString();

    // Save updated stats
    await chrome.storage.local.set({ tokenUsage: stats });

    console.log('[AutoFeel] Token usage updated:', usage);
  } catch (error) {
    console.error('[AutoFeel] Failed to update token usage:', error);
  }
}

async function generateFormAnswers(formFields, savedContext, config) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    // Build prompt for form filling
    const systemPrompt = `You are an AI assistant that helps fill out forms based on provided information.
You will receive:
1. Information from a previous page (the user's background, resume, or other context)
2. A list of form fields with their questions/labels

Your task is to generate appropriate answers for each form field based on the provided context.
Respond ONLY with a JSON object where keys are field IDs and values are the answers.

Example response format:
{
  "field_0": "answer for first field",
  "field_1": "answer for second field"
}`;

    const userPrompt = `Context from previous page:
${savedContext.pageContent.text}

Previous LLM Analysis:
${savedContext.llmAnalysis}

Form fields to fill:
${formFields.map((field, index) =>
  `Field ${index} (ID: field_${index}):
  Label: ${field.label}
  Placeholder: ${field.placeholder}
  Type: ${field.type}
  Current Value: ${field.value}
`).join('\n')}

Please generate appropriate answers for each field based on the context provided. Return ONLY a JSON object.`;

    const requestBody = buildFormFillingRequest(llmProvider, systemPrompt, userPrompt, modelName);
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

    // Extract and save token usage
    const tokenUsage = extractTokenUsage(llmProvider, data);
    if (tokenUsage) {
      await updateTokenUsage(llmProvider, tokenUsage);
    }

    // Parse JSON response
    console.log('[AutoFeel] LLM raw response:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AutoFeel] No JSON found in LLM response');
      return {
        success: false,
        error: 'LLM did not return valid JSON'
      };
    }

    const answers = JSON.parse(jsonMatch[0]);
    console.log('[AutoFeel] Parsed answers:', JSON.stringify(answers, null, 2));
    console.log(`[AutoFeel] Number of answers: ${Object.keys(answers).length}`);

    return {
      success: true,
      data: answers,
      tokenUsage: tokenUsage
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function buildFormFillingRequest(provider, systemPrompt, userPrompt, modelName) {
  if (provider === 'openai' || provider === 'custom') {
    return {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    };
  } else if (provider === 'anthropic') {
    return {
      model: modelName,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    };
  }

  return {
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 2000
  };
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
  } else if (request.type === 'RESET_TOKEN_USAGE') {
    resetTokenUsage().then(sendResponse);
    return true;
  }
});

async function resetTokenUsage() {
  try {
    await chrome.storage.local.set({
      tokenUsage: {
        total: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        },
        byProvider: {
          openai: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
          anthropic: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
          custom: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
        },
        lastUpdated: new Date().toISOString()
      }
    });
    console.log('[AutoFeel] Token usage reset');
    return { success: true };
  } catch (error) {
    console.error('[AutoFeel] Failed to reset token usage:', error);
    return { success: false, error: error.message };
  }
}
